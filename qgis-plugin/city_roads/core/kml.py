"""
KML export, same format as the web app (src/lib/kmlExport.js): one placemark
per street name, holding every segment of that street, plus one placemark for
the unnamed streets. Opens in Google Earth, Google My Maps and most GIS tools.
"""
from xml.sax.saxutils import escape

ATTRIBUTION = 'Data © OpenStreetMap contributors, ODbL 1.0. https://osm.org/copyright'


def streets_to_kml(streets, title='City roads', color='#1a1a1a', width=2,
                   unnamed_label='Calles sin nombre', attribution=ATTRIBUTION):
    """`streets` is an iterable of dicts with 'name', 'highway' (optional) and
    'lines': a list of lines, each a list of (lon, lat) in WGS 84."""
    grouped = {}
    unnamed = []
    for street in streets:
        lines = [line for line in street.get('lines', []) if len(line) >= 2]
        if not lines:
            continue
        name = (street.get('name') or '').strip()
        if not name:
            unnamed.extend(lines)
            continue
        entry = grouped.setdefault(name, {'highway': street.get('highway') or '', 'lines': []})
        entry['lines'].extend(lines)

    placemarks = [_placemark(name, grouped[name]['highway'], grouped[name]['lines'])
                  for name in sorted(grouped, key=lambda n: n.casefold())]
    if unnamed:
        placemarks.append(_placemark(unnamed_label, '', unnamed))

    description = '<description>%s</description>\n' % escape(attribution) if attribution else ''
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<kml xmlns="http://www.opengis.net/kml/2.2">\n'
            '<Document>\n'
            '<name>%s</name>\n'
            '%s'
            '<Style id="road"><LineStyle><color>%s</color><width>%s</width></LineStyle></Style>\n'
            '<Folder><name>Streets</name>\n%s\n</Folder>\n'
            '</Document>\n'
            '</kml>\n') % (escape(title), description, to_kml_color(color), width, '\n'.join(placemarks))


def _placemark(name, highway, lines):
    description = '<description>%s</description>' % escape(highway) if highway else ''
    geometry = ''.join(
        '<LineString><tessellate>1</tessellate><coordinates>%s</coordinates></LineString>'
        % ' '.join('%.6f,%.6f' % (lon, lat) for lon, lat in line)
        for line in lines)
    return '<Placemark><name>%s</name>%s<styleUrl>#road</styleUrl><MultiGeometry>%s</MultiGeometry></Placemark>' % (
        escape(name), description, geometry)


def to_kml_color(color, alpha=1.0):
    """'#rrggbb' to KML's aabbggrr."""
    color = color.lstrip('#')
    if len(color) == 3:
        color = ''.join(c * 2 for c in color)
    r, g, b = color[0:2], color[2:4], color[4:6]
    return ('%02x' % round(alpha * 255)) + b + g + r
