"""Turns downloaded streets into QGIS layers, and QGIS layers into KML."""
from qgis.PyQt.QtCore import QVariant
from qgis.PyQt.QtGui import QColor, QFont
from qgis.core import (
    QgsCoordinateReferenceSystem, QgsCoordinateTransform, QgsFeature, QgsFeatureRequest,
    QgsField, QgsFillSymbol, QgsGeometry, QgsLineSymbol, QgsPalLayerSettings, QgsPointXY,
    QgsProject, QgsTextFormat, QgsVectorLayer, QgsVectorLayerSimpleLabeling, QgsWkbTypes,
)

from .core.osm import STREET_FIELDS, geojson_to_wkt

WGS84 = 'EPSG:4326'
OSM_ATTRIBUTION = '© colaboradores de OpenStreetMap, ODbL 1.0'
OVERTURE_ATTRIBUTION = 'Overture Maps Foundation; © colaboradores de OpenStreetMap, ODbL 1.0'


def streets_layer(streets, title, color='#1a1a1a', labels=True, attribution=OSM_ATTRIBUTION):
    layer = QgsVectorLayer('LineString?crs=%s' % WGS84, title, 'memory')
    provider = layer.dataProvider()
    fields = [QgsField('osm_id', QVariant.LongLong)] + [QgsField(name, QVariant.String) for name in STREET_FIELDS]
    # Streets that combine OpenStreetMap and Overture say where each one came from.
    with_source = any('source' in street for street in streets)
    if with_source:
        fields.append(QgsField('fuente', QVariant.String))
    provider.addAttributes(fields)
    layer.updateFields()

    features = []
    for street in streets:
        feature = QgsFeature(layer.fields())
        feature.setGeometry(QgsGeometry.fromPolylineXY([QgsPointXY(lon, lat) for lon, lat in street['coords']]))
        values = [street['osm_id']] + [street['tags'].get(name) for name in STREET_FIELDS]
        if with_source:
            values.append(street.get('source'))
        feature.setAttributes(values)
        features.append(feature)
    provider.addFeatures(features)
    layer.updateExtents()

    symbol = QgsLineSymbol.createSimple({'line_color': color, 'line_width': '0.35', 'capstyle': 'round'})
    layer.renderer().setSymbol(symbol)
    if labels:
        set_street_labels(layer)
    layer.setAttribution(attribution)
    return layer


def set_street_labels(layer):
    settings = QgsPalLayerSettings()
    settings.fieldName = 'name'
    try:
        from qgis.core import Qgis
        settings.placement = Qgis.LabelPlacement.Curved
    except AttributeError:  # QGIS < 3.26
        settings.placement = QgsPalLayerSettings.Curved
    text = QgsTextFormat()
    text.setFont(QFont('Sans Serif'))
    text.setSize(8)
    text.setColor(QColor('#333333'))
    buffer = text.buffer()
    buffer.setEnabled(True)
    buffer.setSize(0.8)
    buffer.setColor(QColor('white'))
    settings.setFormat(text)
    layer.setLabeling(QgsVectorLayerSimpleLabeling(settings))
    layer.setLabelsEnabled(True)


def boundary_layer(place, title):
    wkt = geojson_to_wkt(place.get('boundary'))
    if not wkt:
        return None
    layer = QgsVectorLayer('MultiPolygon?crs=%s' % WGS84, title, 'memory')
    layer.dataProvider().addAttributes([QgsField('name', QVariant.String)])
    layer.updateFields()
    feature = QgsFeature(layer.fields())
    geometry = QgsGeometry.fromWkt(wkt)
    geometry.convertToMultiType()
    feature.setGeometry(geometry)
    feature.setAttributes([place.get('display_name')])
    layer.dataProvider().addFeatures([feature])
    layer.updateExtents()
    symbol = QgsFillSymbol.createSimple({'color': '0,0,0,0', 'outline_color': '#3a7fe8',
                                         'outline_width': '0.6', 'outline_style': 'dash'})
    layer.renderer().setSymbol(symbol)
    return layer


def layer_to_streets(layer, name_field=None, type_field=None, selected_only=False):
    """Reads the lines of any line layer, in WGS 84, for kml.streets_to_kml."""
    transform = None
    target = QgsCoordinateReferenceSystem(WGS84)
    if layer.crs() != target:
        transform = QgsCoordinateTransform(layer.crs(), target, QgsProject.instance())

    if selected_only:
        features = layer.getSelectedFeatures()
    else:
        features = layer.getFeatures(QgsFeatureRequest())

    names = layer.fields().names()
    name_field = name_field if name_field in names else None
    type_field = type_field if type_field in names else None

    streets = []
    for feature in features:
        geometry = QgsGeometry(feature.geometry())
        if geometry.isEmpty() or geometry.type() != QgsWkbTypes.LineGeometry:
            continue
        if transform:
            geometry.transform(transform)
        if geometry.isMultipart():
            parts = geometry.asMultiPolyline()
        else:
            parts = [geometry.asPolyline()]
        lines = [[(p.x(), p.y()) for p in part] for part in parts]
        streets.append({
            'name': _text(feature[name_field]) if name_field else '',
            'highway': _text(feature[type_field]) if type_field else '',
            'lines': lines,
        })
    return streets


def _text(value):
    if value is None or (hasattr(value, 'isNull') and value.isNull()):
        return ''
    return str(value)
