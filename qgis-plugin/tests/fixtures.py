"""Fake Nominatim and Overpass answers for a small made-up town."""
import json

# A square town of 0.01 x 0.01 degrees near San Salvador.
W, S, E, N = -89.20, 13.69, -89.19, 13.70

NOMINATIM = [{
    'osm_type': 'relation', 'osm_id': 1234, 'type': 'administrative',
    'display_name': 'Pueblo de Prueba, San Salvador, El Salvador',
    'boundingbox': [str(S), str(N), str(W), str(E)],
    'geojson': {'type': 'Polygon', 'coordinates': [[[W, S], [E, S], [E, N], [W, N], [W, S]]]},
}, {
    # A result without outline, like a node.
    'osm_type': 'node', 'osm_id': 99, 'type': 'city',
    'display_name': 'Pueblo de Prueba (nodo)',
    'boundingbox': [str(S), str(N), str(W), str(E)],
}]


def node(i, lon, lat):
    return {'type': 'node', 'id': i, 'lon': lon, 'lat': lat}


OVERPASS = {'elements': [
    node(1, -89.199, 13.695), node(2, -89.195, 13.695), node(3, -89.191, 13.695),
    node(4, -89.195, 13.691), node(5, -89.195, 13.699),
    node(6, -89.25, 13.60), node(7, -89.24, 13.61),          # outside the town
    node(8, -89.191, 13.699), node(9, -89.189, 13.699),       # crosses the edge
    {'type': 'way', 'id': 10, 'nodes': [1, 2], 'tags': {'highway': 'residential', 'name': 'Calle Arce'}},
    {'type': 'way', 'id': 11, 'nodes': [2, 3], 'tags': {'highway': 'residential', 'name': 'Calle Arce'}},
    {'type': 'way', 'id': 12, 'nodes': [4, 2, 5], 'tags': {'highway': 'primary', 'name': 'Avenida España & Co <1>', 'ref': 'RN-5'}},
    {'type': 'way', 'id': 13, 'nodes': [6, 7], 'tags': {'highway': 'track', 'name': 'Camino Afuera'}},
    {'type': 'way', 'id': 14, 'nodes': [8, 9], 'tags': {'highway': 'service'}},
]}


def as_bytes(value):
    return json.dumps(value).encode('utf-8')


# Fake answers of the City Roads /api/overture function for the same town.
OVERTURE_RELEASE = '2026-09-23.1'
OVERTURE_INDEX = {
    'release': OVERTURE_RELEASE,
    'files': [['release/x/part-0.parquet', 100], ['release/x/part-1.parquet', 100]],
    'groups': [
        [0, 7, -89.21, 13.68, -89.18, 13.71],   # covers the town
        [1, 3, -89.26, 13.59, -89.199, 13.70],  # overlaps it
        [1, 4, 10.0, 50.0, 11.0, 51.0],          # far away
    ],
}


def encode_segment(name, road_class, points, osm=()):
    out = [name, road_class, list(osm)]
    px = py = 0
    for i, (lon, lat) in enumerate(points):
        x, y = round(lon * 1e6), round(lat * 1e6)
        out += [x, y] if i == 0 else [x - px, y - py]
        px, py = x, y
    return out


OVERTURE_SEGMENTS = {
    (0, 7): [
        encode_segment('Calle Arce', 'residential', [(-89.199, 13.695), (-89.195, 13.695)], osm=[10]),
        encode_segment('Calle Arce', 'residential', [(-89.195, 13.695), (-89.191, 13.695)], osm=[11]),
        encode_segment('Avenida España', 'primary', [(-89.195, 13.691), (-89.195, 13.695), (-89.195, 13.699)], osm=[12]),
        # Only in Overture (e.g. from TomTom): a new path.
        encode_segment(None, 'footway', [(-89.192, 13.692), (-89.193, 13.693)]),
        # The same way as OpenStreetMap way 14, which has no name there.
        encode_segment('Pasaje Nuevo', 'service', [(-89.191, 13.699), (-89.189, 13.699)], osm=[14]),
        # Calle Arce again from another source, 3 m off: a duplicate.
        encode_segment(None, 'residential', [(-89.19899, 13.69503), (-89.19501, 13.69503)]),
    ],
    (1, 3): [
        encode_segment('Camino Afuera', 'track', [(-89.25, 13.60), (-89.24, 13.61)], osm=[13]),  # outside the town
    ],
}
