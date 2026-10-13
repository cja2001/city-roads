import tinycolor from 'tinycolor2';

/**
 * Converts the roads of a grid to a KML document that opens in Google Earth,
 * Google My Maps and most GIS tools. Ways that share a street name become one
 * placemark, so the file stays small and every street is one clickable item.
 */
export default function kmlExport(grid, options = {}) {
  let nodes = grid.nodes;
  let streets = new Map();
  let unnamed = [];

  grid.forEachElement(element => {
    if (element.type !== 'way' || !element.nodes) return;
    let coordinates = [];
    element.nodes.forEach(id => {
      let node = nodes.get(id);
      if (node) coordinates.push(node.lon.toFixed(6) + ',' + node.lat.toFixed(6));
    });
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

  let title = escapeXML(options.name || grid.name || 'City roads');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${title}</name>
<description>Roads © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright</description>
<Style id="road"><LineStyle><color>${toKMLColor(options.color)}</color><width>${options.width || 2}</width></LineStyle></Style>
${placemarks.join('\n')}
</Document>
</kml>
`;
}

function placemark(name, highway, lines) {
  let description = highway ? `<description>${escapeXML(highway)}</description>` : '';
  return `<Placemark><name>${escapeXML(name)}</name>${description}<styleUrl>#road</styleUrl><MultiGeometry>${lines.join('')}</MultiGeometry></Placemark>`;
}

// KML colors are written as aabbggrr.
function toKMLColor(color) {
  let c = tinycolor(color || '#1a1a1a').toRgb();
  return [Math.round(c.a * 255), c.b, c.g, c.r]
    .map(v => v.toString(16).padStart(2, '0')).join('');
}

function escapeXML(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
