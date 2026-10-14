"""
Combines OpenStreetMap and Overture streets without duplicating roads. Same
rules as src/lib/mergeSources.js in the web app:

 - OpenStreetMap roads are all kept, with their tags.
 - Most Overture roads are OpenStreetMap ways (the api lists which). Those
   already downloaded are skipped, but their name fills in the OpenStreetMap
   way when it has none.
 - The remaining Overture roads (from TomTom, Microsoft..., or ways missing
   from the OpenStreetMap download) are added, unless they run along an
   OpenStreetMap road anyway, which catches ways that were split or redrawn.

No QGIS imports.
"""
import math

from . import osm, overture

# Overture roads closer than this to an OpenStreetMap road are the same road.
SAME_ROAD_METERS = 8
# Share of an Overture road's points that must lie on OpenStreetMap roads for
# it to count as a copy.
SAME_ROAD_SHARE = 0.8
# Points are checked along Overture roads at least this often.
SAMPLE_METERS = 10
CELL_DEGREES = 0.0005  # ~55 m
METERS_PER_DEGREE = 111320


def merge_sources(osm_elements, segments, class_filter=None):
    """Returns (elements, added, named)."""
    nodes = {el['id']: el for el in osm_elements if el.get('type') == 'node'}
    ways = {el['id']: el for el in osm_elements if el.get('type') == 'way'}

    named = 0
    candidates = []
    for segment in segments:
        known = [i for i in (segment[2] or []) if i in ways]
        if not known:
            candidates.append(segment)
            continue
        name = segment[0]
        if not name:
            continue
        for way_id in known:
            way = ways[way_id]
            if (way.get('tags') or {}).get('name'):
                continue
            way['tags'] = dict(way.get('tags') or {}, name=name)
            named += 1

    index = _SegmentIndex(ways.values(), nodes)
    extra = overture.segments_to_elements(candidates, class_filter)
    extra_nodes = {el['id']: el for el in extra if el['type'] == 'node'}
    added = []
    used = set()
    for el in extra:
        if el['type'] != 'way':
            continue
        if index.covers([extra_nodes[i] for i in el['nodes']]):
            continue
        added.append(el)
        used.update(el['nodes'])
    elements = list(osm_elements) + [n for i, n in extra_nodes.items() if i in used] + added
    return elements, len(added), named


def download_streets(place, road_filter='all', clip=True, http=osm.urllib_http, api=None,
                     servers=None, is_cancelled=None, on_status=None):
    """Streets of a place from OpenStreetMap plus what Overture adds. Each
    street gets a `source` of 'OpenStreetMap' or 'Overture'."""
    osm_elements = osm.download_elements(place, road_filter=road_filter, clip=clip, http=http, servers=servers,
                                         is_cancelled=is_cancelled, on_status=on_status)
    segments = overture.download_segments(place, http=http, api=api, is_cancelled=is_cancelled,
                                          on_status=on_status)
    elements, added, named = merge_sources(osm_elements, segments, overture.CLASS_FILTERS.get(road_filter))
    if clip and place.get('boundary'):
        elements = osm.clip_to_boundary(elements, place['boundary'])
    streets = osm.build_streets(elements)
    for street in streets:
        from_overture = street['osm_id'] < 0
        street['source'] = 'Overture' if from_overture else 'OpenStreetMap'
        if from_overture:
            street['osm_id'] = None
    if on_status:
        on_status('Overture añadió %d tramos y %d nombres' % (added, named))
    return streets


class _SegmentIndex:
    def __init__(self, ways, nodes):
        self.cells = {}
        for way in ways:
            ids = way.get('nodes') or []
            for i in range(1, len(ids)):
                a, b = nodes.get(ids[i - 1]), nodes.get(ids[i])
                if a and b:
                    self._add(a, b)

    def _add(self, a, b):
        pad = SAME_ROAD_METERS / METERS_PER_DEGREE / max(0.2, math.cos(math.radians(a['lat'])))
        x0, x1 = _cell(min(a['lon'], b['lon']) - pad), _cell(max(a['lon'], b['lon']) + pad)
        y0, y1 = _cell(min(a['lat'], b['lat']) - pad), _cell(max(a['lat'], b['lat']) + pad)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                self.cells.setdefault((x, y), []).append((a, b))

    def _near(self, lon, lat):
        pairs = self.cells.get((_cell(lon), _cell(lat)))
        if not pairs:
            return False
        kx = METERS_PER_DEGREE * math.cos(math.radians(lat))
        ky = METERS_PER_DEGREE
        for a, b in pairs:
            if _distance_to_segment(lon * kx, lat * ky, a['lon'] * kx, a['lat'] * ky,
                                    b['lon'] * kx, b['lat'] * ky) <= SAME_ROAD_METERS:
                return True
        return False

    def covers(self, points):
        """True when most of the line runs along roads already in the index."""
        samples = [(points[0]['lon'], points[0]['lat'])]
        for a, b in zip(points, points[1:]):
            meters = math.hypot((b['lon'] - a['lon']) * METERS_PER_DEGREE * math.cos(math.radians(a['lat'])),
                                (b['lat'] - a['lat']) * METERS_PER_DEGREE)
            steps = max(1, int(math.ceil(meters / SAMPLE_METERS)))
            for s in range(1, steps + 1):
                t = s / steps
                samples.append((a['lon'] + (b['lon'] - a['lon']) * t, a['lat'] + (b['lat'] - a['lat']) * t))
        near = sum(1 for lon, lat in samples if self._near(lon, lat))
        return near >= SAME_ROAD_SHARE * len(samples)


def _cell(degrees):
    return int(math.floor(degrees / CELL_DEGREES))


def _distance_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    length2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length2)) if length2 else 0.0
    return math.hypot(px - ax - t * dx, py - ay - t * dy)
