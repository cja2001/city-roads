import tinycolor from 'tinycolor2';
import {clipPolyline, clipPolygon, haversine, ringArea} from './geometry.js';

const SOURCE_NOTICES = {
  osm: 'Calles: © colaboradores de OpenStreetMap, ODbL 1.0 (https://osm.org/copyright).',
  overture: 'Calles: Overture Maps Foundation (https://overturemaps.org), ODbL 1.0; incluye datos © colaboradores de OpenStreetMap.',
  both: 'Calles: © colaboradores de OpenStreetMap y Overture Maps Foundation, ODbL 1.0 (https://osm.org/copyright, https://overturemaps.org).'
};
const PARCELS_NOTICE = 'Parcelas (edificios y usos del suelo): © colaboradores de OpenStreetMap, ODbL 1.0.';

/**
 * Converts the roads of a grid to a KML document that opens in Google Earth,
 * Google My Maps, QGIS and most GIS tools. Ways that share a street name
 * become one placemark, so every street is one clickable item. When
 * `options.parcels` holds a grid of parcels, they are added as polygons in
 * their own folder. `grid` can be null to export only the parcels.
 *
 * Coordinates are written as longitude,latitude in WGS 84 (EPSG:4326), the
 * only reference system KML supports.
 *
 * With `options.area` (a counter-clockwise polygon in scene coordinates) the
 * geometries are clipped to that area.
 *
 * Returns {kml, streets, segments, parcels}, the counts of what was written.
 */
export default function kmlExport(grid, options = {}) {
  let counts = {streets: 0, segments: 0, parcels: 0};
  let streetsFolder = grid ? streetsToKML(grid, options, counts) : '';
  let parcelsFolder = options.parcels ? parcelsToKML(options.parcels, options, counts) : '';

  let notices = [];
  if (grid) notices.push(SOURCE_NOTICES[options.source] || SOURCE_NOTICES.osm);
  if (options.parcels) notices.push(PARCELS_NOTICE);
  notices.push('Exportado con StreetData.');
  if (options.area) notices.push('Recortado al área seleccionada.');

  let title = escapeXML(options.name || (grid && grid.name) || 'Calles de la ciudad');
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${title}</name>
<description>${escapeXML(notices.join(' '))}</description>
<Style id="road"><LineStyle><color>${toKMLColor(options.color)}</color><width>${options.width || 2}</width></LineStyle></Style>
<Style id="parcel"><LineStyle><color>${toKMLColor(options.parcelsColor || '#d97706')}</color><width>1</width></LineStyle><PolyStyle><color>${toKMLColor(options.parcelsColor || '#d97706', 0.25)}</color></PolyStyle></Style>
${streetsFolder}
${parcelsFolder}
</Document>
</kml>
`;
  return Object.assign({kml}, counts);
}

function streetsToKML(grid, options, counts) {
  let streets = new Map();
  let unnamed = {highway: '', lines: [], length: 0};
  let source = options.source ? sourceLabel(options.source) : '';

  grid.forEachElement(element => {
    getLines(grid, element, options.area).forEach(coordinates => {
      if (coordinates.length < 2) return;
      let line = `<LineString><tessellate>1</tessellate><coordinates>${formatCoordinates(coordinates)}</coordinates></LineString>`;
      let length = lineLength(coordinates);
      let name = element.tags && element.tags.name;
      let street = unnamed;
      if (name) {
        street = streets.get(name);
        if (!street) streets.set(name, street = {highway: element.tags.highway, ref: element.tags.ref, lines: [], length: 0});
      }
      street.lines.push(line);
      street.length += length;
      counts.segments += 1;
    });
  });

  let placemarks = [];
  Array.from(streets.keys()).sort((a, b) => a.localeCompare(b)).forEach(name => {
    placemarks.push(streetPlacemark(name, streets.get(name), source));
  });
  counts.streets = streets.size;
  if (unnamed.lines.length) placemarks.push(streetPlacemark(options.unnamedLabel || 'Calles sin nombre', unnamed, source));

  return `<Folder><name>Calles</name>\n${placemarks.join('\n')}\n</Folder>`;
}

function parcelsToKML(grid, options, counts) {
  let placemarks = [];
  grid.forEachElement(element => {
    if (element.type !== 'way' || !element.nodes) return;
    let tags = element.tags || {};
    let kind = tags.building ? 'edificio' + (tags.building !== 'yes' ? ': ' + tags.building : '') :
      tags.landuse ? 'uso del suelo: ' + tags.landuse : '';
    let name = tags.name || tags['addr:housenumber'] && [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || kind || 'parcela';
    let closed = element.nodes.length > 3 && element.nodes[0] === element.nodes[element.nodes.length - 1];

    let geometries = [];
    if (closed) {
      let ring = getRing(grid, element, options.area);
      // A valid LinearRing has at least four positions, first = last.
      if (ring && ring.length >= 4) {
        geometries.push(`<Polygon><outerBoundaryIs><LinearRing><coordinates>${formatCoordinates(ring)}</coordinates></LinearRing></outerBoundaryIs></Polygon>`);
        tags = Object.assign({}, tags, {area_m2: Math.round(ringArea(ring))});
      }
    } else {
      getLines(grid, element, options.area).forEach(coordinates => {
        geometries.push(`<LineString><coordinates>${formatCoordinates(coordinates)}</coordinates></LineString>`);
      });
    }
    if (!geometries.length) return;
    let geometry = geometries.length === 1 ? geometries[0] : `<MultiGeometry>${geometries.join('')}</MultiGeometry>`;

    let data = {tipo: kind, fuente: 'OpenStreetMap', osm_id: element.id > 0 ? 'way/' + element.id : ''};
    if (tags.area_m2) data.area_m2 = tags.area_m2;
    ['addr:street', 'addr:housenumber', 'building:levels'].forEach(key => {
      if (tags[key]) data[key] = tags[key];
    });
    let description = kind ? `<description>${escapeXML(kind)}</description>` : '';
    placemarks.push(`<Placemark><name>${escapeXML(name)}</name>${description}<styleUrl>#parcel</styleUrl>${extendedData(data)}${geometry}</Placemark>`);
  });
  counts.parcels = placemarks.length;
  return `<Folder><name>Parcelas</name>\n${placemarks.join('\n')}\n</Folder>`;
}

/**
 * Returns the way as one or more lists of [lon, lat], clipped to `area` when given.
 */
function getLines(grid, element, area) {
  if (element.type !== 'way' || !element.nodes) return [];
  let nodes = [];
  element.nodes.forEach(id => {
    let node = grid.nodes.get(id);
    if (node) nodes.push(node);
  });
  if (nodes.length < 2) return [];
  if (!area) return [nodes.map(node => [node.lon, node.lat])];

  let project = grid.getProjector();
  return clipPolyline(nodes.map(project), area).map(piece => piece.map(p => toLonLat(grid, p)));
}

function getRing(grid, element, area) {
  let nodes = [];
  element.nodes.forEach(id => {
    let node = grid.nodes.get(id);
    if (node) nodes.push(node);
  });
  if (nodes.length < 4) return null;
  let first = nodes[0], last = nodes[nodes.length - 1];
  if (first !== last) return null; // a missing node broke the ring
  if (!area) return nodes.map(node => [node.lon, node.lat]);

  let project = grid.getProjector();
  let clipped = clipPolygon(nodes.slice(0, -1).map(project), area);
  if (clipped.length < 3) return null;
  let ring = clipped.map(p => toLonLat(grid, p));
  ring.push(ring[0]);
  return ring;
}

function toLonLat(grid, point) {
  // The scene's y axis points up; the d3 projection's y points down.
  return grid.projector.invert([point.x, -point.y]);
}

function formatCoordinates(coordinates) {
  return coordinates.map(([lon, lat]) => lon.toFixed(7) + ',' + lat.toFixed(7)).join(' ');
}

function lineLength(coordinates) {
  let length = 0;
  for (let i = 1; i < coordinates.length; ++i) length += haversine(coordinates[i - 1], coordinates[i]);
  return length;
}

function streetPlacemark(name, street, source) {
  let description = street.highway ? `<description>${escapeXML(street.highway)}</description>` : '';
  let data = {
    tipo: street.highway || '',
    ref: street.ref || '',
    fuente: source,
    tramos: street.lines.length,
    longitud_m: Math.round(street.length)
  };
  return `<Placemark><name>${escapeXML(name)}</name>${description}<styleUrl>#road</styleUrl>${extendedData(data)}<MultiGeometry>${street.lines.join('')}</MultiGeometry></Placemark>`;
}

function extendedData(data) {
  let fields = Object.keys(data)
    .filter(key => data[key] !== '' && data[key] !== undefined && data[key] !== null)
    .map(key => `<Data name="${escapeXML(key)}"><value>${escapeXML(data[key])}</value></Data>`);
  return fields.length ? `<ExtendedData>${fields.join('')}</ExtendedData>` : '';
}

function sourceLabel(source) {
  return source === 'overture' ? 'Overture Maps' : source === 'both' ? 'OpenStreetMap + Overture Maps' : 'OpenStreetMap';
}

// KML colors are written as aabbggrr.
function toKMLColor(color, alpha) {
  let c = tinycolor(color || '#1a1a1a').toRgb();
  return [Math.round((alpha === undefined ? c.a : alpha) * 255), c.b, c.g, c.r]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

function escapeXML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
