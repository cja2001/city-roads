"""
OpenStreetMap access for the plugin: finds a city with Nominatim and downloads
its streets from Overpass. Same approach as the web app (src/lib/Query.js,
LoadOptions.js, postData.js and clipToBoundary.js): a cheap bounding box query
clipped to the city outline, with failover between Overpass servers.

This module has no QGIS imports so it can be tested on its own. Network calls
go through the `http` callable, see `urllib_http` for its signature.
"""
import json
import urllib.parse
import urllib.request

NOMINATIM = 'https://nominatim.openstreetmap.org'
# A simplified outline of each place, so streets can be clipped to it without
# relying on the area index of Overpass servers.
POLYGON_PARAMS = 'format=json&polygon_geojson=1&polygon_threshold=0.0003'

OVERPASS_SERVERS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

USER_AGENT = 'city-roads-qgis-plugin/1.0 (+https://github.com/cja2001/city-roads)'

# Which streets to download. Same filters as Query.js in the web app.
ROAD_FILTERS = {
    'all': 'way[highway]',
    'strict': 'way[highway~"^(((motorway|trunk|primary|secondary|tertiary)(_link)?)'
              '|unclassified|residential|living_street|pedestrian|service|track)$"][area!=yes]',
    'basic': 'way[highway~"^(motorway|primary|secondary|tertiary)|residential"]',
}

# Above this size (in square degrees) a box pulls in too many streets outside
# the place, so the area query is used instead.
MAX_BBOX_SQUARE_DEGREES = 1

QUERY_TIMEOUT_S = 180
QUERY_MAXSIZE = 536870912
SERVER_TIMEOUT_S = 150

# Tags copied to the layer as attributes, in this order.
STREET_FIELDS = ['name', 'highway', 'ref', 'oneway', 'maxspeed', 'lanes', 'surface']


class Cancelled(Exception):
    pass


class OverpassError(Exception):
    pass


def urllib_http(url, data=None, timeout=60, is_cancelled=None):
    """Plain urllib transport. Returns the response body as bytes.
    `data` (bytes) makes it a POST. The QGIS plugin passes its own transport,
    which honours the proxy configured in QGIS."""
    headers = {'User-Agent': USER_AGENT}
    if data is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
    request = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def search_places(name, http=urllib_http, limit=10):
    """Finds places by name. Returns a list of dicts with display_name, bbox
    (south, west, north, east), boundary (GeoJSON or None) and area_id."""
    url = '%s/search?%s&limit=%d&q=%s' % (NOMINATIM, POLYGON_PARAMS, limit, urllib.parse.quote(name))
    rows = json.loads(http(url, timeout=60).decode('utf-8'))
    return [_place_from_row(row) for row in rows]


def _place_from_row(row):
    area_id = None
    if row.get('osm_type') == 'relation':
        area_id = int(row['osm_id']) + 3600000000
    elif row.get('osm_type') == 'way':
        area_id = int(row['osm_id']) + 2400000000

    bbox = None
    if row.get('boundingbox'):
        # Nominatim gives [south, north, west, east].
        b = [float(v) for v in row['boundingbox']]
        bbox = [b[0], b[2], b[1], b[3]]

    geojson = row.get('geojson')
    boundary = geojson if geojson and geojson.get('type') in ('Polygon', 'MultiPolygon') else None
    return {
        'display_name': row.get('display_name', ''),
        'type': row.get('type', ''),
        'osm_type': row.get('osm_type'),
        'osm_id': row.get('osm_id'),
        'area_id': area_id,
        'bbox': bbox,
        'boundary': boundary,
    }


def build_query(place, way_filter):
    """Returns (query, clip). `clip` is True when the result must be clipped to
    the place outline because a bounding box query was used."""
    bbox = place.get('bbox')
    area_id = place.get('area_id')
    header = '[timeout:%d][maxsize:%d][out:json];' % (QUERY_TIMEOUT_S, QUERY_MAXSIZE)
    if bbox and (not area_id or _bbox_size(bbox) <= MAX_BBOX_SQUARE_DEGREES):
        # The box limits only the ways, so streets crossing its edge keep all their nodes.
        box = ','.join(repr(v) for v in bbox)
        return '%s\n(%s(%s); node(w););\nout body;' % (header, way_filter, box), True
    if area_id:
        return ('%s\narea(%d);\n(._; )->.area;\n(%s(area.area); node(w););\nout body;'
                % (header, area_id, way_filter)), False
    raise ValueError('The place has neither a bounding box nor an area id')


def _bbox_size(bbox):
    return abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]))


def run_overpass(query, http=urllib_http, servers=None, is_cancelled=None, on_status=None):
    """Sends the query to each server in turn until one answers with data.
    An empty answer is rechecked on one more server, because mirrors sometimes
    return nothing for places they don't index yet."""
    servers = servers or OVERPASS_SERVERS
    is_cancelled = is_cancelled or (lambda: False)
    on_status = on_status or (lambda message: None)
    body = ('data=' + urllib.parse.quote(query)).encode('utf-8')
    errors = []
    empty = None

    for index, url in enumerate(servers):
        if is_cancelled():
            raise Cancelled()
        on_status('Consultando %s (%d/%d)' % (urllib.parse.urlparse(url).netloc, index + 1, len(servers)))
        try:
            raw = http(url, data=body, timeout=SERVER_TIMEOUT_S, is_cancelled=is_cancelled)
            response = json.loads(raw.decode('utf-8'))
        except Cancelled:
            raise
        except Exception as err:  # network error, timeout, HTML error page...
            if is_cancelled():
                raise Cancelled()
            errors.append('%s: %s' % (url, err))
            continue

        elements = response.get('elements') or []
        remark = response.get('remark') or ''
        if not elements and 'error' in remark.lower():
            # Overpass reports timeouts and out-of-memory in a remark of an
            # otherwise successful response.
            errors.append('%s: %s' % (url, remark))
            continue
        if not elements:
            if empty is None and index + 1 < len(servers):
                empty = response
                continue
            return response
        return response

    if empty is not None:
        return empty
    raise OverpassError('Ningún servidor de Overpass respondió.\n' + '\n'.join(errors))


def clip_to_boundary(elements, boundary):
    """Keeps the ways with at least one node inside a GeoJSON Polygon or
    MultiPolygon, and the nodes those ways use."""
    rings = _get_rings(boundary)
    if not rings:
        return elements

    nodes = {el['id']: el for el in elements if el.get('type') == 'node'}
    used = set()
    ways = []
    for el in elements:
        if el.get('type') != 'way':
            continue
        inside = False
        for node_id in el.get('nodes', []):
            node = nodes.get(node_id)
            if node and _is_inside(node['lon'], node['lat'], rings):
                inside = True
                break
        if inside:
            used.update(el['nodes'])
            ways.append(el)
    return [node for node_id, node in nodes.items() if node_id in used] + ways


def _get_rings(boundary):
    if not boundary:
        return []
    if boundary.get('type') == 'Polygon':
        polygons = [boundary['coordinates']]
    elif boundary.get('type') == 'MultiPolygon':
        polygons = boundary['coordinates']
    else:
        return []
    rings = []
    for polygon in polygons:
        for points in polygon:
            if len(points) < 3:
                continue
            xs = [p[0] for p in points]
            ys = [p[1] for p in points]
            rings.append((points, min(xs), min(ys), max(xs), max(ys)))
    return rings


def _is_inside(x, y, rings):
    # Even-odd rule over all rings, so holes and separate parts both work.
    inside = False
    for points, min_x, min_y, max_x, max_y in rings:
        if x < min_x or x > max_x or y < min_y or y > max_y:
            continue
        j = len(points) - 1
        for i in range(len(points)):
            xi, yi = points[i][0], points[i][1]
            xj, yj = points[j][0], points[j][1]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
    return inside


def build_streets(elements):
    """Turns an Overpass response into a list of streets:
    {'osm_id', 'tags', 'coords': [(lon, lat), ...]}, one per OSM way."""
    nodes = {el['id']: (el['lon'], el['lat']) for el in elements if el.get('type') == 'node'}
    streets = []
    for el in elements:
        if el.get('type') != 'way':
            continue
        coords = [nodes[n] for n in el.get('nodes', []) if n in nodes]
        if len(coords) < 2:
            continue
        streets.append({'osm_id': el['id'], 'tags': el.get('tags') or {}, 'coords': coords})
    return streets


def download_elements(place, road_filter='all', clip=True, http=urllib_http,
                      servers=None, is_cancelled=None, on_status=None):
    """Nodes and ways of the streets of a place found by `search_places`."""
    way_filter = ROAD_FILTERS.get(road_filter, road_filter)
    query, needs_clip = build_query(place, way_filter)
    response = run_overpass(query, http=http, servers=servers,
                            is_cancelled=is_cancelled, on_status=on_status)
    elements = response.get('elements') or []
    if clip and needs_clip and place.get('boundary'):
        elements = clip_to_boundary(elements, place['boundary'])
    return elements


def download_streets(place, road_filter='all', clip=True, http=urllib_http,
                     servers=None, is_cancelled=None, on_status=None):
    """Downloads the streets of a place found by `search_places`."""
    return build_streets(download_elements(place, road_filter=road_filter, clip=clip, http=http, servers=servers,
                                           is_cancelled=is_cancelled, on_status=on_status))


def geojson_to_wkt(geojson):
    """WKT of a GeoJSON Polygon or MultiPolygon, for the city outline layer."""
    def ring(points):
        return '(%s)' % ', '.join('%r %r' % (p[0], p[1]) for p in points)

    def polygon(rings):
        return '(%s)' % ', '.join(ring(r) for r in rings)

    if not geojson:
        return None
    if geojson.get('type') == 'Polygon':
        return 'POLYGON ' + polygon(geojson['coordinates'])
    if geojson.get('type') == 'MultiPolygon':
        return 'MULTIPOLYGON (%s)' % ', '.join(polygon(p) for p in geojson['coordinates'])
    return None
