"""Builds city_roads.zip, installable from QGIS: Complementos > Administrar e
instalar complementos > Instalar a partir de ZIP."""
import os
import sys
import zipfile

here = os.path.dirname(os.path.abspath(__file__))
source = os.path.join(here, '..', 'city_roads')
target = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, '..', 'city_roads.zip')

with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as zf:
    for folder, dirs, files in os.walk(source):
        dirs[:] = sorted(d for d in dirs if d != '__pycache__')
        for name in sorted(files):
            if name.endswith('.pyc'):
                continue
            path = os.path.join(folder, name)
            zf.write(path, os.path.join('city_roads', os.path.relpath(path, source)))
print(target)
