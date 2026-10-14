"""Plugin window: search a city, download its streets, export a layer to KML."""
import os

from qgis.PyQt.QtCore import Qt, QSettings
from qgis.PyQt.QtGui import QColor
from qgis.PyQt.QtWidgets import (
    QCheckBox, QComboBox, QDialog, QFileDialog, QFormLayout, QGroupBox, QHBoxLayout,
    QLabel, QLineEdit, QPushButton, QVBoxLayout,
)
from qgis.core import Qgis, QgsApplication, QgsMapLayerProxyModel, QgsProject
from qgis.gui import QgsColorButton, QgsFieldComboBox, QgsMapLayerComboBox

from .core import osm, overture
from .core.kml import streets_to_kml
from .layers import OSM_ATTRIBUTION, OVERTURE_ATTRIBUTION, boundary_layer, layer_to_streets, streets_layer
from .network import BackgroundTask

SOURCE_CHOICES = [
    ('osm', 'OpenStreetMap'),
    ('overture', 'Overture Maps'),
]

ROAD_CHOICES = [
    ('strict', 'Calles (sin caminos peatonales ni áreas)'),
    ('all', 'Todas las vías (highway=*)'),
    ('basic', 'Solo vías principales y residenciales'),
]

NAME_FIELDS = ['name', 'nombre', 'NOMBRE', 'Name', 'NAME']
TYPE_FIELDS = ['highway', 'tipo', 'TIPO', 'type']


class CityRoadsDialog(QDialog):
    def __init__(self, iface, parent=None):
        super().__init__(parent or iface.mainWindow())
        self.iface = iface
        self.places = []
        self.task = None
        self.setWindowTitle('City Roads: calles de OpenStreetMap y Overture')
        self.setMinimumWidth(460)
        self.build_ui()

    def build_ui(self):
        layout = QVBoxLayout(self)

        search_box = QGroupBox('1. Buscar ciudad')
        search_layout = QVBoxLayout(search_box)
        row = QHBoxLayout()
        self.city_input = QLineEdit()
        self.city_input.setPlaceholderText('Ej.: Soyapango, El Salvador')
        self.city_input.returnPressed.connect(self.search)
        self.search_button = QPushButton('Buscar')
        self.search_button.clicked.connect(self.search)
        row.addWidget(self.city_input)
        row.addWidget(self.search_button)
        search_layout.addLayout(row)
        self.place_combo = QComboBox()
        self.place_combo.setEnabled(False)
        self.place_combo.currentIndexChanged.connect(self.update_buttons)
        search_layout.addWidget(self.place_combo)
        layout.addWidget(search_box)

        download_box = QGroupBox('2. Descargar calles')
        form = QFormLayout(download_box)
        settings = QSettings()
        self.source_combo = QComboBox()
        for key, label in SOURCE_CHOICES:
            self.source_combo.addItem(label, key)
        self.source_combo.setCurrentIndex(max(0, self.source_combo.findData(settings.value('city_roads/source', 'osm'))))
        self.source_combo.setItemData(1, 'OpenStreetMap combinado con datos de Microsoft, TomTom y Meta', Qt.ToolTipRole)
        self.source_combo.currentIndexChanged.connect(self.on_source_changed)
        form.addRow('Fuente', self.source_combo)
        self.overture_api_label = QLabel('Servidor de Overture')
        self.overture_api = QLineEdit(settings.value('city_roads/overture_api', overture.DEFAULT_API))
        self.overture_api.setToolTip('Dirección de /api/overture en la web de City Roads. '
                                     'Overture no tiene API propia; la web lee sus archivos por partes.')
        form.addRow(self.overture_api_label, self.overture_api)
        self.road_combo = QComboBox()
        for key, label in ROAD_CHOICES:
            self.road_combo.addItem(label, key)
        form.addRow('Tipo de vías', self.road_combo)
        self.clip_check = QCheckBox('Recortar al límite de la ciudad')
        self.clip_check.setChecked(True)
        form.addRow(self.clip_check)
        self.boundary_check = QCheckBox('Añadir capa con el límite de la ciudad')
        self.boundary_check.setChecked(True)
        form.addRow(self.boundary_check)
        self.labels_check = QCheckBox('Mostrar nombres de calles')
        self.labels_check.setChecked(True)
        form.addRow(self.labels_check)
        buttons = QHBoxLayout()
        self.download_button = QPushButton('Descargar calles')
        self.download_button.clicked.connect(self.download)
        self.cancel_button = QPushButton('Cancelar')
        self.cancel_button.clicked.connect(self.cancel_task)
        self.cancel_button.setVisible(False)
        buttons.addWidget(self.download_button)
        buttons.addWidget(self.cancel_button)
        form.addRow(buttons)
        layout.addWidget(download_box)

        export_box = QGroupBox('3. Exportar a KML')
        form = QFormLayout(export_box)
        self.layer_combo = QgsMapLayerComboBox()
        self.layer_combo.setFilters(QgsMapLayerProxyModel.LineLayer)
        self.layer_combo.layerChanged.connect(self.on_layer_changed)
        form.addRow('Capa', self.layer_combo)
        self.name_field = QgsFieldComboBox()
        self.name_field.setAllowEmptyFieldName(True)
        form.addRow('Campo de nombre', self.name_field)
        self.type_field = QgsFieldComboBox()
        self.type_field.setAllowEmptyFieldName(True)
        form.addRow('Campo de tipo', self.type_field)
        self.color_button = QgsColorButton()
        self.color_button.setColor(QColor('#1a1a1a'))
        form.addRow('Color de línea', self.color_button)
        self.selected_check = QCheckBox('Solo entidades seleccionadas')
        form.addRow(self.selected_check)
        self.export_button = QPushButton('Exportar KML…')
        self.export_button.clicked.connect(self.export_kml)
        form.addRow(self.export_button)
        layout.addWidget(export_box)

        self.status = QLabel('')
        self.status.setWordWrap(True)
        self.status.setTextInteractionFlags(Qt.TextSelectableByMouse)
        layout.addWidget(self.status)
        credit = QLabel('Datos © colaboradores de OpenStreetMap, ODbL 1.0 · Overture Maps Foundation')
        credit.setStyleSheet('color: gray; font-size: 10px')
        layout.addWidget(credit)

        self.on_layer_changed(self.layer_combo.currentLayer())
        self.on_source_changed()
        self.update_buttons()

    def source(self):
        return self.source_combo.currentData()

    def on_source_changed(self, *args):
        is_overture = self.source() == 'overture'
        self.overture_api_label.setVisible(is_overture)
        self.overture_api.setVisible(is_overture)
        QSettings().setValue('city_roads/source', self.source())

    # Search

    def search(self):
        name = self.city_input.text().strip()
        if not name or self.task:
            return
        self.set_status('Buscando "%s"…' % name)
        self.run_task('Buscando ciudad', lambda http, cancelled, status: osm.search_places(name, http), self.on_search_done)

    def on_search_done(self, places, error):
        self.place_combo.clear()
        if error:
            self.set_status('No se pudo buscar: %s' % error, error=True)
            return
        self.places = [p for p in places or [] if p['bbox']]
        for place in self.places:
            kind = ' (límite)' if place['boundary'] else ''
            self.place_combo.addItem(place['display_name'] + kind)
        if self.places:
            self.set_status('%d resultado(s). Elige uno y pulsa "Descargar calles".' % len(self.places))
        else:
            self.set_status('No se encontró ningún lugar con ese nombre.', error=True)
        self.update_buttons()

    # Download

    def download(self):
        index = self.place_combo.currentIndex()
        if self.task or index < 0 or index >= len(self.places):
            return
        place = self.places[index]
        road_filter = self.road_combo.currentData()
        clip = self.clip_check.isChecked()
        source = self.source()

        if source == 'overture':
            api = self.overture_api.text().strip() or overture.DEFAULT_API
            QSettings().setValue('city_roads/overture_api', api)

            def work(http, cancelled, status):
                return overture.download_streets(place, road_filter=road_filter, clip=clip, http=http,
                                                 api=api, is_cancelled=cancelled, on_status=status)
        else:
            def work(http, cancelled, status):
                return osm.download_streets(place, road_filter=road_filter, clip=clip, http=http,
                                            is_cancelled=cancelled, on_status=status)

        self.download_place = place
        self.download_source = source
        self.set_status('Descargando calles de %s…' % short_name(place))
        self.run_task('Descargando calles', work, self.on_download_done)

    def on_download_done(self, streets, error):
        if error:
            self.set_status('No se pudieron descargar las calles: %s' % error, error=True)
            return
        if streets is None:
            self.set_status('Descarga cancelada.')
            return
        place = self.download_place
        is_overture = self.download_source == 'overture'
        source_name = 'Overture Maps' if is_overture else 'OpenStreetMap'
        if not streets:
            self.set_status('%s no tiene calles para %s.' % (source_name, short_name(place)), error=True)
            return

        project = QgsProject.instance()
        name = short_name(place)
        if self.boundary_check.isChecked():
            outline = boundary_layer(place, 'Límite: %s' % name)
            if outline:
                project.addMapLayer(outline)
        title = ('Calles (Overture): %s' if is_overture else 'Calles: %s') % name
        layer = streets_layer(streets, title, labels=self.labels_check.isChecked(),
                              attribution=OVERTURE_ATTRIBUTION if is_overture else OSM_ATTRIBUTION)
        project.addMapLayer(layer)
        self.zoom_to(layer)
        self.layer_combo.setLayer(layer)

        named = len({s['tags'].get('name') for s in streets if s['tags'].get('name')})
        self.set_status('%d tramos descargados (%d calles con nombre). Ya puedes exportarlos a KML.'
                        % (len(streets), named))
        self.iface.messageBar().pushMessage('City Roads', 'Calles de %s añadidas' % name, Qgis.Success, 5)

    def zoom_to(self, layer):
        canvas = self.iface.mapCanvas()
        from qgis.core import QgsCoordinateTransform
        transform = QgsCoordinateTransform(layer.crs(), canvas.mapSettings().destinationCrs(), QgsProject.instance())
        try:
            canvas.setExtent(transform.transformBoundingBox(layer.extent()))
            canvas.refresh()
        except Exception:
            pass

    # Export

    def on_layer_changed(self, layer):
        self.name_field.setLayer(layer)
        self.type_field.setLayer(layer)
        names = layer.fields().names() if layer else []
        self.name_field.setField(next((f for f in NAME_FIELDS if f in names), ''))
        self.type_field.setField(next((f for f in TYPE_FIELDS if f in names), ''))
        self.update_buttons()

    def export_kml(self):
        layer = self.layer_combo.currentLayer()
        if not layer:
            return
        settings = QSettings()
        folder = settings.value('city_roads/last_folder', os.path.expanduser('~'))
        suggested = os.path.join(folder, safe_file_name(layer.name()) + '.kml')
        path, _ = QFileDialog.getSaveFileName(self, 'Exportar KML', suggested, 'KML (*.kml)')
        if not path:
            return
        if not path.lower().endswith('.kml'):
            path += '.kml'
        settings.setValue('city_roads/last_folder', os.path.dirname(path))

        streets = layer_to_streets(layer, self.name_field.currentField(), self.type_field.currentField(),
                                   self.selected_check.isChecked())
        if not streets:
            self.set_status('La capa no tiene líneas para exportar.', error=True)
            return
        kml = streets_to_kml(streets, title=layer.name(), color=self.color_button.color().name())
        with open(path, 'w', encoding='utf-8') as f:
            f.write(kml)
        self.set_status('KML guardado en %s' % path)
        self.iface.messageBar().pushMessage('City Roads', 'KML guardado en %s' % path, Qgis.Success, 8)

    # Helpers

    def run_task(self, description, work, done):
        def finished(result, error):
            self.task = None
            self.cancel_button.setVisible(False)
            self.update_buttons()
            done(result, error)

        self.task = BackgroundTask(description, work, finished)
        self.task.status.connect(self.set_status)
        self.cancel_button.setVisible(True)
        self.update_buttons()
        QgsApplication.taskManager().addTask(self.task)

    def cancel_task(self):
        if self.task:
            self.task.cancel()

    def update_buttons(self):
        busy = self.task is not None
        self.search_button.setEnabled(not busy)
        self.source_combo.setEnabled(not busy)
        self.place_combo.setEnabled(not busy and bool(self.places))
        self.download_button.setEnabled(not busy and self.place_combo.currentIndex() >= 0 and bool(self.places))
        self.export_button.setEnabled(self.layer_combo.currentLayer() is not None)

    def set_status(self, text, error=False):
        self.status.setStyleSheet('color: #b91c1c' if error else '')
        self.status.setText(text)

    def closeEvent(self, event):
        self.cancel_task()
        super().closeEvent(event)


def short_name(place):
    return (place.get('display_name') or 'ciudad').split(',')[0].strip()


def safe_file_name(name):
    return ''.join(c if c.isalnum() or c in ' -_' else '_' for c in name).strip() or 'calles'
