"""Tests for the parts of the plugin that don't need QGIS. Run with
`python3 -m unittest discover -s tests` from qgis-plugin/."""
import json
import os
import sys
import unittest
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))

from city_roads.core import osm, overture  # noqa: E402
from city_roads.core.kml import streets_to_kml, to_kml_color  # noqa: E402
import fixtures  # noqa: E402

KML = '{http://www.opengis.net/kml/2.2}'


class FakeHttp:
    def __init__(self, answers):
        self.answers = answers  # url prefix -> bytes or Exception
        self.calls = []

    def __call__(self, url, data=None, timeout=60, is_cancelled=None):
        self.calls.append((url, data))
        for prefix, answer in self.answers.items():
            if url.startswith(prefix):
                if isinstance(answer, Exception):
                    raise answer
                return answer
        raise IOError('no route to ' + url)


class SearchTest(unittest.TestCase):
    def test_parses_nominatim(self):
        http = FakeHttp({osm.NOMINATIM: fixtures.as_bytes(fixtures.NOMINATIM)})
        places = osm.search_places('Pueblo de Prueba', http)
        self.assertIn('q=Pueblo%20de%20Prueba', http.calls[0][0])
        self.assertIn('polygon_geojson=1', http.calls[0][0])
        self.assertEqual(places[0]['area_id'], 3600001234)
        self.assertEqual(places[0]['bbox'], [fixtures.S, fixtures.W, fixtures.N, fixtures.E])
        self.assertEqual(places[0]['boundary']['type'], 'Polygon')
        self.assertIsNone(places[1]['area_id'])
        self.assertIsNone(places[1]['boundary'])


class QueryTest(unittest.TestCase):
    def test_small_place_uses_bbox(self):
        place = {'area_id': 3600001234, 'bbox': [13.69, -89.2, 13.7, -89.19]}
        query, clip = osm.build_query(place, osm.ROAD_FILTERS['all'])
        self.assertTrue(clip)
        self.assertIn('way[highway](13.69,-89.2,13.7,-89.19); node(w);', query)
        self.assertIn('out body;', query)

    def test_large_place_uses_area(self):
        place = {'area_id': 3600001234, 'bbox': [10, -90, 14, -87]}
        query, clip = osm.build_query(place, osm.ROAD_FILTERS['basic'])
        self.assertFalse(clip)
        self.assertIn('area(3600001234);', query)

    def test_large_place_without_area_still_uses_bbox(self):
        query, clip = osm.build_query({'bbox': [10, -90, 14, -87]}, 'way[highway]')
        self.assertTrue(clip)


class OverpassTest(unittest.TestCase):
    servers = ['https://a/api', 'https://b/api', 'https://c/api']

    def test_fails_over(self):
        http = FakeHttp({
            'https://a/': IOError('timeout'),
            'https://b/': fixtures.as_bytes({'remark': 'runtime error: out of memory', 'elements': []}),
            'https://c/': fixtures.as_bytes(fixtures.OVERPASS),
        })
        statuses = []
        response = osm.run_overpass('q', http, self.servers, on_status=statuses.append)
        self.assertEqual(len(response['elements']), len(fixtures.OVERPASS['elements']))
        self.assertEqual([c[0] for c in http.calls], self.servers)
        self.assertEqual(len(statuses), 3)
        self.assertEqual(urllib.parse.unquote(http.calls[0][1].decode()[5:]), 'q')

    def test_rechecks_empty_once(self):
        http = FakeHttp({
            'https://a/': fixtures.as_bytes({'elements': []}),
            'https://b/': fixtures.as_bytes({'elements': []}),
            'https://c/': fixtures.as_bytes(fixtures.OVERPASS),
        })
        response = osm.run_overpass('q', http, self.servers)
        self.assertEqual(response['elements'], [])
        self.assertEqual(len(http.calls), 2)

    def test_all_fail(self):
        http = FakeHttp({})
        with self.assertRaises(osm.OverpassError):
            osm.run_overpass('q', http, self.servers)

    def test_cancel(self):
        with self.assertRaises(osm.Cancelled):
            osm.run_overpass('q', FakeHttp({}), self.servers, is_cancelled=lambda: True)


class DownloadTest(unittest.TestCase):
    def download(self, clip):
        http = FakeHttp({
            osm.NOMINATIM: fixtures.as_bytes(fixtures.NOMINATIM),
            'https://a/': fixtures.as_bytes(fixtures.OVERPASS),
        })
        place = osm.search_places('x', http)[0]
        return osm.download_streets(place, 'all', clip=clip, http=http, servers=['https://a/api'])

    def test_clips_to_boundary(self):
        streets = self.download(clip=True)
        self.assertEqual(sorted(s['osm_id'] for s in streets), [10, 11, 12, 14])
        edge = next(s for s in streets if s['osm_id'] == 14)
        self.assertEqual(len(edge['coords']), 2)  # keeps the node outside the edge

    def test_no_clip(self):
        self.assertEqual(len(self.download(clip=False)), 5)

    def test_wkt(self):
        wkt = osm.geojson_to_wkt(fixtures.NOMINATIM[0]['geojson'])
        self.assertTrue(wkt.startswith('POLYGON ((-89.2 13.69, -89.19 13.69'))
        multi = osm.geojson_to_wkt({'type': 'MultiPolygon', 'coordinates': [[[[0, 0], [1, 0], [1, 1], [0, 0]]]]})
        self.assertEqual(multi, 'MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)))')
        self.assertIsNone(osm.geojson_to_wkt(None))


def fake_overture_api(calls):
    def http(url, data=None, timeout=60, is_cancelled=None):
        calls.append(url)
        parsed = urllib.parse.urlparse(url)
        if parsed.query == 'index':
            return fixtures.as_bytes(fixtures.OVERTURE_INDEX)
        q = dict(urllib.parse.parse_qsl(parsed.query))
        assert q['release'] == fixtures.OVERTURE_RELEASE, q
        return fixtures.as_bytes({'segments': fixtures.OVERTURE_SEGMENTS[(int(q['file']), int(q['group']))]})
    return http


class OvertureTest(unittest.TestCase):
    place = {'bbox': [fixtures.S, fixtures.W, fixtures.N, fixtures.E],
             'boundary': fixtures.NOMINATIM[0]['geojson']}

    def test_downloads_overlapping_groups_and_clips(self):
        calls = []
        statuses = []
        streets = overture.download_streets(self.place, http=fake_overture_api(calls),
                                            api='https://example.com/api/overture/', on_status=statuses.append)
        self.assertEqual(calls[0], 'https://example.com/api/overture?index')
        self.assertEqual(len(calls), 3)  # index + the two groups that overlap the town
        self.assertIn('file=0&group=7&bbox=-89.2,13.69,-89.19,13.7', calls[1])
        self.assertIn('Descargando calles de Overture (2/2)', statuses)
        names = sorted(s['tags'].get('name', '') for s in streets)
        self.assertEqual(names, ['', 'Avenida España', 'Calle Arce', 'Calle Arce'])  # Camino Afuera clipped
        avenue = next(s for s in streets if s['tags'].get('name') == 'Avenida España')
        self.assertEqual(avenue['tags']['highway'], 'primary')
        self.assertIsNone(avenue['osm_id'])
        for (lon, lat), expected in zip(avenue['coords'], [(-89.195, 13.691), (-89.195, 13.695), (-89.195, 13.699)]):
            self.assertAlmostEqual(lon, expected[0], places=6)
            self.assertAlmostEqual(lat, expected[1], places=6)

    def test_shared_points_become_one_node(self):
        elements = overture.segments_to_elements(fixtures.OVERTURE_SEGMENTS[(0, 7)])
        nodes = [e for e in elements if e['type'] == 'node']
        ways = [e for e in elements if e['type'] == 'way']
        self.assertEqual(len(ways), 4)
        self.assertEqual(len(nodes), 7)  # (-89.195, 13.695) is shared by three segments
        self.assertEqual(ways[0]['nodes'][1], ways[1]['nodes'][0])

    def test_road_filter(self):
        streets = overture.download_streets(self.place, road_filter='strict', clip=False,
                                            http=fake_overture_api([]))
        classes = sorted(s['tags']['highway'] for s in streets)
        self.assertEqual(classes, ['primary', 'residential', 'residential', 'track'])

    def test_errors_are_readable(self):
        def broken(url, **kwargs):
            return b'<html>Not found</html>'
        with self.assertRaises(overture.OvertureError) as ctx:
            overture.download_streets(self.place, http=broken, api='https://example.com/api/overture')
        self.assertIn('example.com', str(ctx.exception))

        def failing(url, **kwargs):
            return fixtures.as_bytes({'error': 'Overture bucket listing failed: 503'})
        with self.assertRaises(overture.OvertureError) as ctx:
            overture.download_streets(self.place, http=failing)
        self.assertIn('503', str(ctx.exception))


class KmlTest(unittest.TestCase):
    def test_groups_by_name(self):
        streets = [
            {'name': 'Calle Arce', 'highway': 'residential', 'lines': [[(-89.1, 13.6), (-89.2, 13.7)]]},
            {'name': 'avenida España & <Co>', 'highway': 'primary', 'lines': [[(0, 0), (1, 1)], [(1, 1), (2, 2)]]},
            {'name': 'Calle Arce', 'highway': 'residential', 'lines': [[(-89.2, 13.7), (-89.3, 13.8)]]},
            {'name': '', 'lines': [[(5, 5), (6, 6)]]},
            {'name': 'Punto', 'lines': [[(5, 5)]]},  # too short, skipped
        ]
        text = streets_to_kml(streets, title='Prueba', color='#3a7fe8')
        root = ET.fromstring(text.encode('utf-8'))
        marks = root.findall('.//%sPlacemark' % KML)
        names = [m.find(KML + 'name').text for m in marks]
        self.assertEqual(names, ['avenida España & <Co>', 'Calle Arce', 'Calles sin nombre'])
        arce = marks[1].findall('.//%sLineString' % KML)
        self.assertEqual(len(arce), 2)
        self.assertEqual(arce[0].find(KML + 'coordinates').text, '-89.100000,13.600000 -89.200000,13.700000')
        self.assertEqual(marks[0].find(KML + 'description').text, 'primary')
        self.assertEqual(root.find('.//%sLineStyle/%scolor' % (KML, KML)).text, 'ffe87f3a')
        self.assertEqual(root.find('.//%sDocument/%sname' % (KML, KML)).text, 'Prueba')

    def test_color(self):
        self.assertEqual(to_kml_color('#ff8000'), 'ff0080ff')
        self.assertEqual(to_kml_color('#f80', 0.25), '400088ff')


if __name__ == '__main__':
    unittest.main()
