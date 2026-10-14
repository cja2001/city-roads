"""
Overture Maps streets for the plugin, through the same serverless function the
web app uses (api/overture.mjs in the repository).

Overture publishes each release as ~128 GeoParquet files of ~450 MB with no
query API. The function keeps an index of which part of which file covers
which area, and returns only the roads of the requested parts in a compact
JSON form. So the plugin needs no Parquet libraries and downloads a few MB
per city.

Like osm.py, this module has no QGIS imports; network calls go through the
`http` callable (see osm.urllib_http).
"""
import json
import math
import re
import urllib.parse

from .osm import Cancelled, clip_to_boundary, build_streets, urllib_http

# The City Roads web app on Vercel. Can be changed in the plugin window.
DEFAULT_API = 'https://city-roads-cja2001s-projects.vercel.app/api/overture'

COORDINATE_SCALE = 1e6
REQUEST_TIMEOUT_S = 90

# Same groups as ROAD_FILTERS in osm.py, by Overture road class (which uses
# the OpenStreetMap highway values; links are a subclass, not a class).
CLASS_FILTERS = {
    'all': None,
    'strict': re.compile(r'^(((motorway|trunk|primary|secondary|tertiary)(_link)?)'
                         r'|unclassified|residential|living_street|pedestrian|service|track)$'),
    'basic': re.compile(r'^(motorway|primary|secondary|tertiary)|residential'),
}


class OvertureError(Exception):
    pass


def _get_json(http, url, is_cancelled):
    try:
        raw = http(url, timeout=REQUEST_TIMEOUT_S, is_cancelled=is_cancelled)
    except Cancelled:
        raise
    except Exception as err:
        raise OvertureError('No se pudo conectar con %s: %s' % (urllib.parse.urlparse(url).netloc, err))
    try:
        data = json.loads(raw.decode('utf-8'))
    except ValueError:
        raise OvertureError('Respuesta no válida de %s. ¿Es correcta la dirección del servidor de Overture?'
                            % urllib.parse.urlparse(url).netloc)
    if isinstance(data, dict) and data.get('error'):
        raise OvertureError('El servidor de Overture respondió: %s' % data['error'])
    return data


def query_bbox(place):
    """[west, south, east, north] of a place from osm.search_places, rounded
    outwards to 4 decimals so repeated downloads hit the server cache."""
    south, west, north, east = place['bbox']
    return [_floor(west), _floor(south), _ceil(east), _ceil(north)]


def _floor(x):
    return math.floor(x * 1e4) / 1e4


def _ceil(x):
    return math.ceil(x * 1e4) / 1e4


def _format(x):
    return ('%.4f' % x).rstrip('0').rstrip('.')


def pick_groups(index, bbox):
    west, south, east, north = bbox
    return [g for g in index.get('groups', [])
            if g[2] <= east and g[4] >= west and g[3] <= north and g[5] >= south]


def segments_to_elements(segments, class_filter=None):
    """Compact segments ([name, class, osm_way_ids, x0, y0, dx1, dy1, ...]) to
    OpenStreetMap nodes and ways with `name` and `highway` tags. Points at the
    same position share a node. Ids count down from -1 so they never clash
    with OpenStreetMap ids when both sources are combined."""
    nodes = []
    ways = []
    node_ids = {}
    for segment in segments:
        name, road_class = segment[0], segment[1] or 'unknown'
        if class_filter is not None and not class_filter.search(road_class):
            continue
        way_nodes = []
        x = y = 0
        for i in range(3, len(segment) - 1, 2):
            x += segment[i]
            y += segment[i + 1]
            key = (x, y)
            node_id = node_ids.get(key)
            if node_id is None:
                node_id = -(len(nodes) + 1)
                node_ids[key] = node_id
                nodes.append({'type': 'node', 'id': node_id,
                              'lon': x / COORDINATE_SCALE, 'lat': y / COORDINATE_SCALE})
            if not way_nodes or way_nodes[-1] != node_id:
                way_nodes.append(node_id)
        if len(way_nodes) < 2:
            continue
        tags = {'highway': road_class if road_class != 'unknown' else 'road'}
        if name:
            tags['name'] = name
        ways.append({'type': 'way', 'id': -(len(ways) + 1), 'nodes': way_nodes, 'tags': tags})
    return nodes + ways


def download_segments(place, http=urllib_http, api=None, is_cancelled=None, on_status=None):
    """Compact Overture segments that touch the bounding box of a place."""
    api = (api or DEFAULT_API).rstrip('/')
    is_cancelled = is_cancelled or (lambda: False)
    on_status = on_status or (lambda message: None)
    if not place.get('bbox'):
        raise OvertureError('El lugar no tiene un rectángulo para buscar en Overture.')

    bbox = query_bbox(place)
    on_status('Consultando el índice de Overture…')
    index = _get_json(http, api + '?index', is_cancelled)
    groups = pick_groups(index, bbox)
    release = index.get('release')

    segments = []
    for number, group in enumerate(groups):
        if is_cancelled():
            raise Cancelled()
        on_status('Descargando calles de Overture (%d/%d)' % (number + 1, len(groups)))
        url = '%s?%s' % (api, urllib.parse.urlencode([
            ('release', release), ('file', group[0]), ('group', group[1]),
            ('bbox', ','.join(_format(v) for v in bbox))], safe=','))
        segments.extend(_get_json(http, url, is_cancelled).get('segments') or [])
    return segments


def download_streets(place, road_filter='all', clip=True, http=urllib_http, api=None,
                     is_cancelled=None, on_status=None):
    """Downloads the streets of a place found by osm.search_places from
    Overture. Returns the same list as osm.download_streets; `osm_id` is empty
    because Overture segments are not OpenStreetMap ways."""
    segments = download_segments(place, http=http, api=api, is_cancelled=is_cancelled, on_status=on_status)
    elements = segments_to_elements(segments, CLASS_FILTERS.get(road_filter))
    if clip and place.get('boundary'):
        elements = clip_to_boundary(elements, place['boundary'])
    streets = build_streets(elements)
    for street in streets:
        street['osm_id'] = None
    return streets
