<template>
  <app-modal title='Ayuda de StreetData' size='lg' @close='$emit("close")'>
    <div class='help'>
      <p class='help-lead'>
        StreetData descarga las calles de un lugar, las dibuja en un mapa interactivo y las exporta para
        usarlas en sistemas de información geográfica o como imagen.
      </p>

      <h3>Cómo extraer datos</h3>
      <ol>
        <li><strong>Seleccionar área.</strong> Busca un lugar por su nombre y elige uno de los resultados. Se usa su límite administrativo de OpenStreetMap (Nominatim).</li>
        <li><strong>Elegir datos.</strong> Elige la fuente de las calles y si quieres parcelas y nombres de calles.</li>
        <li><strong>Configurar exportación.</strong> Elige KML, PNG o SVG y sus opciones. Puedes dibujar un rectángulo para recortar el KML y el PNG.</li>
        <li><strong>Extraer y descargar.</strong> Pulsa «Extraer datos», espera a que termine la descarga y descarga el archivo.</li>
      </ol>

      <h3>Fuentes de datos</h3>
      <dl class='help-sources'>
        <dt><span class='badge badge-source-osm'>OpenStreetMap</span></dt>
        <dd>Calles con sus atributos (nombre, tipo de vía...) mediante la API Overpass, parcelas (edificios y usos del suelo) y búsqueda de lugares (Nominatim). Las ciudades grandes se leen de una caché de geometrías sin atributos.</dd>
        <dt><span class='badge badge-source-overture'>Overture Maps</span></dt>
        <dd>Segmentos de calles de la capa de transporte de Overture Maps, leídos de sus archivos GeoParquet públicos por una función del servidor.</dd>
        <dt><span class='badge'>Ambas</span></dt>
        <dd>Todas las calles de OpenStreetMap más las de Overture que le faltan, sin duplicados.</dd>
      </dl>
      <p class='help-note'>Las parcelas no son catastro oficial: son edificios y usos del suelo mapeados en OpenStreetMap.</p>

      <h3>Mapa</h3>
      <ul>
        <li>Arrastra para moverte y usa la rueda del ratón o pellizca para acercar. Con el botón derecho (o dos dedos) se gira el mapa.</li>
        <li>Haz clic en una calle o parcela para resaltarla y ver sus atributos en «Capas y datos».</li>
        <li>Haz clic dos veces en el nombre del lugar para editarlo; arrástralo para moverlo. Aparece en las imágenes exportadas.</li>
      </ul>

      <h3>Atajos de teclado</h3>
      <dl class='help-keys'>
        <dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>Acercar y alejar (con el mapa enfocado)</dd>
        <dt><kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> <kbd>↓</kbd></dt><dd>Mover el mapa</dd>
        <dt><kbd>0</kbd></dt><dd>Ver toda el área extraída</dd>
        <dt><kbd>Esc</kbd></dt><dd>Cancelar el dibujo del área o cerrar ventanas</dd>
        <dt><kbd>Mayús</kbd> + rueda</dt><dd>Zoom lento y preciso</dd>
      </dl>

      <h3>Formatos de exportación</h3>
      <ul>
        <li><strong>KML</strong>: calles agrupadas por nombre (con tipo de vía, referencia, fuente y longitud) y parcelas como polígonos, en carpetas separadas. Coordenadas en WGS 84.</li>
        <li><strong>PNG</strong>: imagen de la vista del mapa con la resolución de tu pantalla, con vista previa.</li>
        <li><strong>SVG</strong>: imagen vectorial de la vista, editable.</li>
      </ul>

      <h3>Créditos y licencias</h3>
      <ul class='help-credits'>
        <li>Datos de calles, parcelas y búsqueda © <a href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener'>colaboradores de OpenStreetMap</a>, licencia ODbL.</li>
        <li>Datos de <a href='https://overturemaps.org' target='_blank' rel='noopener'>Overture Maps Foundation</a> (capa de transporte, ODbL).</li>
        <li>Mapas base: tierra y agua de Overture Maps Foundation, teselas de OpenStreetMap e imágenes de Esri, Maxar y Earthstar Geographics, según el mapa elegido.</li>
        <li>Basado en <a href='https://github.com/anvaka/city-roads' target='_blank' rel='noopener'>city-roads</a> de Andrei Kashcha (licencia MIT).</li>
        <li>Iconos: <a href='https://lucide.dev' target='_blank' rel='noopener'>Lucide</a> (licencia ISC).</li>
      </ul>
    </div>
  </app-modal>
</template>

<script>
import AppModal from './AppModal.vue';

export default {
  name: 'HelpDialog',
  components: {AppModal},
  emits: ['close']
}
</script>

<style>
.help {
  font-size: 14px;
  line-height: 1.55;
}
.help-lead {
  margin-top: 0;
  color: var(--text-muted);
}
.help h3 {
  margin: 20px 0 8px;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--accent-text);
}
.help ol,
.help ul {
  margin: 0;
  padding-left: 20px;
}
.help li + li {
  margin-top: 4px;
}
.help-sources dt {
  margin-top: 10px;
}
.help-sources dd {
  margin: 4px 0 0;
  color: var(--text-muted);
}
.help-note {
  font-size: 13px;
  color: var(--text-muted);
}
.help-keys {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
}
.help-keys dd {
  margin: 0;
  color: var(--text-muted);
}
kbd {
  display: inline-block;
  min-width: 22px;
  padding: 1px 6px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 5px;
  background: var(--surface-2);
  font-family: var(--font-ui);
  font-size: 12px;
  text-align: center;
}
.help-credits {
  font-size: 13px;
}
</style>
