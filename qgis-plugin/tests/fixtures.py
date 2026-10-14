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
