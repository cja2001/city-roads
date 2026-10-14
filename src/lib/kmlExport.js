import tinycolor from 'tinycolor2';

/**
 * Converts the roads of a grid to a KML document that opens in Google Earth,
 * Google My Maps and most GIS tools. Ways that share a street name become one
 * placemark, so the file stays small and every street is one clickable item.
 * When `options.parcels` holds a grid of parcels, they are added as polygons
 * in their own folder. `grid` can be null to export only the parcels.
 */
export default function kmlExport(grid, options = {}) {
  let streetsFolder = grid ? streetsToKML(grid, options) : '';
  let parcelsFolder = options.parcels ? parcelsToKML(options.parcels) : '';

  let title = escapeXML(options.name || (grid && grid.name) || 'City roads');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${title}</name>
<description>Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright</description>
<Style id="road"><LineStyle><color>${toKMLColor(options.color)}</color><width>${options.width || 2}</width></LineStyle></Style>
<Style id="parcel"><LineStyle><color>${toKMLColor(options.parcelsColor || '#ea580c')}</color><width>1</width></LineStyle><PolyStyle><color>${toKMLColor(options.parcelsColor || '#ea580c', 0.25)}</color></PolyStyle></Style>
${streetsFolder}
${parcelsFolder}
</Document>
</kml>
`;
}

function streetsToKML(grid, options) {
  let streets = new Map();
  let unnamed = [];

  grid.forEachElement(element => {
    let coordinates = getCoordinates(grid, element);
    if (coordinates.length < 2) return;

    let line = `<LineString><tessellate>1</tessellate><coordinates>${coordinates.join(' ')}</coordinates></LineString>`;
    let name = element.tags && element.tags.name;
    if (!name) {
      unnamed.push(line);
      return;
    }
    let street = streets.get(name);
    if (!street) streets.set(name, street = {highway: element.tags.highway, lines: []});
    street.lines.push(line);
  });

  let placemarks = [];
  Array.from(streets.keys()).sort((a, b) => a.localeCompare(b)).forEach(name => {
    let street = streets.get(name);
    placemarks.push(placemark(name, street.highway, street.lines));
  });
  if (unnamed.length) placemarks.push(placemark(options.unnamedLabel || 'Unnamed roads', '', unnamed));

  return `<Folder><name>Streets</name>\n${placemarks.join('\n')}\n</Folder>`;
}

function parcelsToKML(grid) {
  let placemarks = [];
  grid.forEachElement(element => {
    let coordinates = getCoordinates(grid, element);
    if (coordinates.length < 2) return;
    let tags = element.tags || {};
    let kind = tags.building ? 'building' + (tags.building !== 'yes' ? ': ' + tags.building : '') :
      tags.landuse ? 'landuse: ' + tags.landuse : '';
    let name = tags.name || tags['addr:housenumber'] && [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || kind || 'parcel';
    let closed = element.nodes.length > 3 && element.nodes[0] === element.nodes[element.nodes.length - 1];
    let geometry = closed ?
      `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordinates.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>` :
      `<LineString><coordinates>${coordinates.join(' ')}</coordinates></LineString>`;
    let description = kind ? `<description>${escapeXML(kind)}</description>` : '';
    placemarks.push(`<Placemark><name>${escapeXML(name)}</name>${description}<styleUrl>#parcel</styleUrl>${geometry}</Placemark>`);
  });
  return `<Folder><name>Parcels</name>\n${placemarks.join('\n')}\n</Folder>`;
}

function getCoordinates(grid, element) {
  if (element.type !== 'way' || !element.nodes) return [];
  let coordinates = [];
  element.nodes.forEach(id => {
    let node = grid.nodes.get(id);
    if (node) coordinates.push(node.lon.toFixed(6) + ',' + node.lat.toFixed(6));
  });
  return coordinates;
}

function placemark(name, highway, lines) {
  let description = highway ? `<description>${escapeXML(highway)}</description>` : '';
  return `<Placemark><name>${escapeXML(name)}</name>${description}<styleUrl>#road</styleUrl><MultiGeometry>${lines.join('')}</MultiGeometry></Placemark>`;
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
