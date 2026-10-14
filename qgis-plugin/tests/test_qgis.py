"""End-to-end test inside QGIS: the plugin window searches a city, downloads
its streets and exports them to KML, against a local fake of Nominatim and
Overpass. Needs the QGIS Python bindings:

    QT_QPA_PLATFORM=offscreen python3 tests/test_qgis.py
"""
import json
import os
import sys
import tempfile
import threading
import time
import unittest
import urllib.parse
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault('QT_QPA_PLATFORM', 'offscreen')
for var in ('HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy'):
    os.environ.pop(var, None)

from qgis.core import QgsApplication, QgsProject, QgsWkbTypes  # noqa: E402
from qgis.gui import QgsMapCanvas, QgsMessageBar  # noqa: E402
from qgis.PyQt.QtWidgets import QFileDialog, QMainWindow  # noqa: E402

import fixtures  # noqa: E402

APP = QgsApplication([], True)
APP.initQgis()

from city_roads import classFactory  # noqa: E402
from city_roads.core import osm  # noqa: E402
from city_roads import dialog as dialog_module  # noqa: E402

KML = '{http://www.opengis.net/kml/2.2}'


class FakeOSM(BaseHTTPRequestHandler):
    overpass_queries = []

    overture_requests = []

    def do_GET(self):
        if self.path.startswith('/overture/'):
            FakeOSM.overture_requests.append(self.path)
            query = dict(urllib.parse.parse_qsl(urllib.parse.urlparse(self.path).query, keep_blank_values=True))
            if 'index' in query:
                return self.answer(fixtures.OVERTURE_INDEX)
            key = (int(query['file']), int(query['group']))
            return self.answer({'segments': fixtures.OVERTURE_SEGMENTS[key]})
        self.answer(fixtures.NOMINATIM)

    def do_POST(self):
        body = self.rfile.read(int(self.headers['Content-Length']))
        FakeOSM.overpass_queries.append((self.path, body))
        if self.path.startswith('/down'):
            self.send_response(504)
            self.end_headers()
            return
        self.answer(fixtures.OVERPASS)

    def answer(self, value):
        data = json.dumps(value).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class FakeIface:
    def __init__(self):
        self.window = QMainWindow()
        self.canvas = QgsMapCanvas(self.window)
        self.bar = QgsMessageBar(self.window)
        self.toolbar_actions = []
        self.menu_actions = []

    def mainWindow(self):
        return self.window

    def mapCanvas(self):
        return self.canvas

    def messageBar(self):
        return self.bar

    def addToolBarIcon(self, action):
        self.toolbar_actions.append(action)

    def removeToolBarIcon(self, action):
        self.toolbar_actions.remove(action)

    def addPluginToWebMenu(self, menu, action):
        self.menu_actions.append(action)

    def removePluginWebMenu(self, menu, action):
        self.menu_actions.remove(action)


def wait_for(dialog, seconds=30):
    end = time.time() + seconds
    while dialog.task is not None and time.time() < end:
        APP.processEvents()
        time.sleep(0.02)
    APP.processEvents()
    if dialog.task is not None:
        raise AssertionError('task did not finish')


class PluginTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(('127.0.0.1', 0), FakeOSM)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        base = 'http://127.0.0.1:%d' % cls.server.server_port
        osm.NOMINATIM = base + '/nominatim'
        osm.OVERPASS_SERVERS[:] = [base + '/down/api/interpreter', base + '/ok/api/interpreter']

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_search_download_export(self):
        iface = FakeIface()
        plugin = classFactory(iface)
        plugin.initGui()
        self.assertEqual(len(iface.toolbar_actions), 1)
        plugin.action.trigger()
        dialog = plugin.dialog
        self.assertTrue(dialog.isVisible())

        dialog.city_input.setText('Pueblo de Prueba')
        dialog.search()
        wait_for(dialog)
        self.assertEqual(dialog.place_combo.count(), 2)
        self.assertIn('Pueblo de Prueba', dialog.place_combo.itemText(0))

        dialog.source_combo.setCurrentIndex(dialog.source_combo.findData('osm'))
        self.assertFalse(dialog.overture_api.isVisibleTo(dialog))
        dialog.road_combo.setCurrentIndex(dialog.road_combo.findData('all'))
        dialog.download()
        wait_for(dialog)
        self.assertIn('tramos descargados', dialog.status.text())
        # The first server failed with 504, the second one answered.
        self.assertEqual([q[0].split('/')[1] for q in FakeOSM.overpass_queries], ['down', 'ok'])
        self.assertIn(b'way%5Bhighway%5D%2813.69', FakeOSM.overpass_queries[-1][1])

        layers = {layer.name(): layer for layer in QgsProject.instance().mapLayers().values()}
        streets = layers['Calles: Pueblo de Prueba']
        outline = layers['Límite: Pueblo de Prueba']
        self.assertEqual(streets.featureCount(), 4)  # Camino Afuera was clipped
        self.assertEqual(outline.featureCount(), 1)
        self.assertEqual(outline.geometryType(), QgsWkbTypes.PolygonGeometry)
        self.assertTrue(streets.labelsEnabled())
        names = sorted(f['name'] or '' for f in streets.getFeatures())
        self.assertEqual(names, ['', 'Avenida España & Co <1>', 'Calle Arce', 'Calle Arce'])
        avenue = next(f for f in streets.getFeatures() if f['osm_id'] == 12)
        self.assertEqual(avenue['highway'], 'primary')
        self.assertEqual(avenue['ref'], 'RN-5')
        self.assertEqual(dialog.layer_combo.currentLayer(), streets)
        self.assertEqual(dialog.name_field.currentField(), 'name')
        self.assertEqual(dialog.type_field.currentField(), 'highway')

        out = os.path.join(tempfile.mkdtemp(), 'calles')
        dialog_module.QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, 'KML (*.kml)'))
        dialog.export_kml()
        self.assertTrue(os.path.exists(out + '.kml'))
        root = ET.parse(out + '.kml').getroot()
        marks = root.findall('.//%sPlacemark' % KML)
        self.assertEqual([m.find(KML + 'name').text for m in marks],
                         ['Avenida España & Co <1>', 'Calle Arce', 'Calles sin nombre'])
        self.assertEqual(len(marks[1].findall('.//%sLineString' % KML)), 2)

        if os.environ.get('SCREENSHOT'):
            dialog.grab().save(os.environ['SCREENSHOT'])

        plugin.unload()
        self.assertEqual(iface.toolbar_actions, [])

    def test_overture_download_export(self):
        iface = FakeIface()
        plugin = classFactory(iface)
        plugin.initGui()
        plugin.action.trigger()
        dialog = plugin.dialog

        dialog.source_combo.setCurrentIndex(dialog.source_combo.findData('overture'))
        self.assertTrue(dialog.overture_api.isVisibleTo(dialog))
        dialog.overture_api.setText('http://127.0.0.1:%d/overture/api/overture' % self.server.server_port)
        dialog.city_input.setText('Pueblo de Prueba')
        dialog.search()
        wait_for(dialog)
        dialog.road_combo.setCurrentIndex(dialog.road_combo.findData('all'))
        dialog.download()
        wait_for(dialog)
        self.assertIn('tramos descargados', dialog.status.text())
        self.assertEqual(FakeOSM.overture_requests[0], '/overture/api/overture?index')
        self.assertEqual(len(FakeOSM.overture_requests), 3)

        layers = {layer.name(): layer for layer in QgsProject.instance().mapLayers().values()}
        streets = layers['Calles (Overture): Pueblo de Prueba']
        self.assertIn('Overture', streets.attribution())
        names = sorted(f['name'] or '' for f in streets.getFeatures())
        self.assertEqual(names, ['', 'Avenida España', 'Calle Arce', 'Calle Arce'])
        avenue = next(f for f in streets.getFeatures() if f['name'] == 'Avenida España')
        self.assertEqual(avenue['highway'], 'primary')

        out = os.path.join(tempfile.mkdtemp(), 'overture.kml')
        dialog_module.QFileDialog.getSaveFileName = staticmethod(lambda *a, **k: (out, 'KML (*.kml)'))
        dialog.export_kml()
        marks = ET.parse(out).getroot().findall('.//%sPlacemark' % KML)
        self.assertEqual([m.find(KML + 'name').text for m in marks],
                         ['Avenida España', 'Calle Arce', 'Calles sin nombre'])

        if os.environ.get('SCREENSHOT_OVERTURE'):
            dialog.grab().save(os.environ['SCREENSHOT_OVERTURE'])
        plugin.unload()

    def test_export_reprojects(self):
        from qgis.core import QgsVectorLayer, QgsFeature, QgsGeometry, QgsPointXY
        from city_roads.layers import layer_to_streets
        layer = QgsVectorLayer('MultiLineString?crs=EPSG:3857&field=nombre:string', 'utm', 'memory')
        f = QgsFeature(layer.fields())
        f.setGeometry(QgsGeometry.fromMultiPolylineXY([[QgsPointXY(0, 0), QgsPointXY(111319.49, 0)],
                                                       [QgsPointXY(0, 0), QgsPointXY(0, 1)]]))
        f.setAttributes(['Calle Uno'])
        layer.dataProvider().addFeatures([f])
        streets = layer_to_streets(layer, 'nombre', '')
        self.assertEqual(streets[0]['name'], 'Calle Uno')
        self.assertEqual(len(streets[0]['lines']), 2)
        self.assertAlmostEqual(streets[0]['lines'][0][1][0], 1.0, places=4)


if __name__ == '__main__':
    unittest.main()
