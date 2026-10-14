# City Roads para QGIS

Plugin de QGIS (3.22 o superior) con el buscador de calles de la web
[City Roads](https://github.com/cja2001/city-roads): busca una ciudad, descarga
sus calles de OpenStreetMap con sus nombres y las exporta a KML.

## Instalar

1. Descarga `city_roads.zip` (o créalo con `python3 tools/build_zip.py`).
2. En QGIS: **Complementos → Administrar e instalar complementos → Instalar a partir de ZIP**.
3. Aparece el botón **City Roads** en la barra de herramientas y en el menú **Web**.

## Usar

1. **Buscar ciudad**: escribe el nombre (por ejemplo `Soyapango, El Salvador`) y pulsa *Buscar*.
   Los resultados marcados con *(límite)* tienen contorno y las calles se recortan a él.
2. **Descargar calles**: elige el tipo de vías y pulsa *Descargar calles*. Se añaden dos capas:
   `Calles: <ciudad>` (líneas con `osm_id`, `name`, `highway`, `ref`, `oneway`, `maxspeed`,
   `lanes`, `surface`, con etiquetas de nombre) y `Límite: <ciudad>`.
   La descarga corre en segundo plano y se puede cancelar.
3. **Exportar a KML**: elige cualquier capa de líneas (la descargada u otra tuya), el campo
   con el nombre de la calle y pulsa *Exportar KML…*. El KML tiene una marca por nombre de
   calle, con todos sus tramos, igual que la exportación de la web, y se abre en Google Earth
   y Google My Maps. Se reproyecta a WGS 84 automáticamente.

## Cómo descarga

Igual que la web: Nominatim da el contorno de la ciudad, Overpass recibe una consulta por
rectángulo (o por área si la ciudad mide más de 1 grado cuadrado) y las calles se recortan al
contorno. Si un servidor de Overpass falla o devuelve un error, se prueba el siguiente
(overpass-api.de, private.coffee, kumi.systems, mail.ru). Las peticiones usan la
configuración de proxy de QGIS.

## Pruebas

```
python3 -m unittest discover -s tests          # lógica, sin QGIS
QT_QPA_PLATFORM=offscreen python3 tests/test_qgis.py   # dentro de QGIS, con servidores simulados
```

Datos © colaboradores de OpenStreetMap, ODbL 1.0.
