<template>
  <aside class='side-panel extract-panel' aria-labelledby='extract-title'>
    <header class='panel-header'>
      <div>
        <h2 id='extract-title' class='panel-title'>Extraer datos</h2>
        <p class='panel-subtitle'>Extrae. Analiza. Exporta.</p>
      </div>
      <button type='button' class='icon-btn panel-close' aria-label='Cerrar panel de extracción' @click='$emit("close")'>
        <x-icon :size='18'/>
      </button>
    </header>

    <div class='panel-body scroll-y'>
      <!-- Paso 1 -->
      <section class='step' :class='stepClass(1)' aria-labelledby='step-1'>
        <h3 id='step-1' class='step-title'>
          <span class='step-number' aria-hidden='true'><check-icon v-if='stepDone(1)' :size='13' :stroke-width='3'/><span v-else>1</span></span>
          Seleccionar área
        </h3>

        <div v-if='!place' class='step-content'>
          <place-search :initial-query='initialQuery' :disabled='phase === "loading"'
            @select='$emit("select-place", $event)' @query='$emit("query", $event)'/>
          <p class='hint'>Busca un lugar por su nombre. Se usará su límite administrativo como área de extracción.</p>
        </div>

        <div v-else class='step-content'>
          <div class='place-card'>
            <area-preview :boundary='place.boundary' :bbox='place.bbox'/>
            <div class='place-info'>
              <div class='place-name'>{{placeTitle}}</div>
              <div v-if='placeDetail' class='place-detail'>{{placeDetail}}</div>
              <div v-if='bboxText' class='place-coords'>{{bboxText}}</div>
            </div>
          </div>
          <button type='button' class='btn btn-sm btn-ghost change-area' :disabled='phase === "loading"' @click='$emit("change-area")'>
            <refresh-cw :size='14'/> Cambiar área
          </button>

          <div v-if='phase === "ready"' class='subsection'>
            <div class='subsection-title'>
              Área de exportación <span class='optional'>opcional</span>
            </div>
            <p class='hint'>Delimita una zona para recortar el KML y el PNG.</p>
            <div class='button-row'>
              <button type='button' class='btn btn-sm' :class='{"btn-active": drawing}' :aria-pressed='drawing' @click='$emit("draw-area")'>
                <square-dashed-mouse-pointer :size='15'/> {{drawing ? 'Dibujando...' : 'Dibujar rectángulo'}}
              </button>
              <button type='button' class='btn btn-sm' @click='$emit("use-view")'>
                <scan-icon :size='15'/> Usar vista actual
              </button>
            </div>
            <p v-if='drawing' class='hint hint-accent'>Arrastra sobre el mapa para dibujar el rectángulo. Pulsa Esc para cancelar.</p>
            <div v-if='area' class='area-card'>
              <div>
                <div class='area-size'>{{formatKm(area.widthKm)}} × {{formatKm(area.heightKm)}}</div>
                <div class='place-coords'>{{areaText}}</div>
              </div>
              <button type='button' class='icon-btn' aria-label='Quitar el área de exportación' data-tip='Quitar área' @click='$emit("clear-area")'>
                <trash-2 :size='16'/>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Paso 2 -->
      <section class='step' :class='stepClass(2)' aria-labelledby='step-2'>
        <h3 id='step-2' class='step-title'>
          <span class='step-number' aria-hidden='true'><check-icon v-if='stepDone(2)' :size='13' :stroke-width='3'/><span v-else>2</span></span>
          Elegir datos
        </h3>
        <div class='step-content'>
          <label class='field-label'>Fuente de las calles</label>
          <source-picker class='full-width' :model-value='source' @update:model-value='$emit("set-source", $event)'/>
          <div v-if='sourceChanged' class='notice notice-warning source-changed'>
            <triangle-alert :size='16'/>
            <span>Los datos del mapa son de {{sourceName(loadedSource)}}. <button type='button' class='link-btn' @click='$emit("extract")'>Volver a extraer</button> con {{sourceName(source)}}.</span>
          </div>

          <ul class='data-list'>
            <li class='data-row'>
              <span class='swatch swatch-line' aria-hidden='true'></span>
              <span class='data-text'>
                <span class='data-name'>Calles</span>
                <span class='data-meta'>Líneas · {{sourceName(phase === "ready" ? loadedSource : source)}}</span>
              </span>
              <input type='checkbox' class='switch' :checked='phase === "ready" ? layers.streets : true'
                :disabled='phase !== "ready"' aria-label='Mostrar calles' @change='$emit("toggle-layer", "streets", $event.target.checked)'>
            </li>
            <li class='data-row'>
              <span class='swatch swatch-polygon' aria-hidden='true'></span>
              <span class='data-text'>
                <span class='data-name'>Parcelas</span>
                <span class='data-meta'>Polígonos · edificios y usos del suelo de OpenStreetMap</span>
              </span>
              <input v-if='phase === "ready"' type='checkbox' class='switch' :checked='layers.parcels'
                aria-label='Mostrar parcelas' @change='$emit("toggle-layer", "parcels", $event.target.checked)'>
              <input v-else type='checkbox' class='switch' :checked='loadParcels' :disabled='phase === "loading"'
                aria-label='Extraer también las parcelas' @change='$emit("set-load-parcels", $event.target.checked)'>
            </li>
            <li v-if='phase === "ready" && layers.parcels && parcelsStatus !== "ready"' class='data-status'>
              <span v-if='parcelsStatus === "loading"'><loader-circle :size='13' class='spin'/> Cargando parcelas de OpenStreetMap...</span>
              <span v-else-if='parcelsStatus === "error"' class='text-error'>No se pudieron cargar las parcelas. <button type='button' class='link-btn' @click='$emit("retry-parcels")'>Reintentar</button></span>
              <span v-else-if='parcelsStatus === "empty"'>No hay parcelas ni edificios mapeados en esta zona.</span>
            </li>
            <li class='data-row'>
              <span class='swatch swatch-label' aria-hidden='true'>Aa</span>
              <span class='data-text'>
                <span class='data-name'>Nombres de calles</span>
                <span class='data-meta'>Etiquetas · solo las que existen en los datos</span>
              </span>
              <input type='checkbox' class='switch' :checked='layers.names' aria-label='Mostrar nombres de calles'
                @change='$emit("toggle-layer", "names", $event.target.checked)'>
            </li>
            <li v-if='phase === "ready" && layers.names && namesStatus !== "ready" && namesStatus !== "idle"' class='data-status'>
              <span v-if='namesStatus === "loading"'><loader-circle :size='13' class='spin'/> Cargando nombres de calles...</span>
              <span v-else-if='namesStatus === "error"' class='text-error'>No se pudieron cargar los nombres. <button type='button' class='link-btn' @click='$emit("retry-names")'>Reintentar</button></span>
              <span v-else-if='namesStatus === "empty"'>Los datos no incluyen calles con nombre en esta zona.</span>
            </li>
          </ul>
          <p v-if='phase !== "ready"' class='hint'>Las calles siempre se extraen; después puedes ocultarlas y exportar solo las parcelas.</p>
        </div>
      </section>

      <!-- Paso 3 -->
      <section class='step' :class='stepClass(3)' aria-labelledby='step-3'>
        <h3 id='step-3' class='step-title'>
          <span class='step-number' aria-hidden='true'>3</span>
          Configurar exportación
        </h3>
        <div class='step-content'>
          <label class='field-label' id='format-label'>Formato</label>
          <div class='segmented full-width' role='radiogroup' aria-labelledby='format-label'>
            <button v-for='f in formats' :key='f.key' type='button' role='radio' :aria-checked='exportOptions.format === f.key'
              @click='setOption("format", f.key)'>{{f.label}}</button>
          </div>
          <p class='hint format-hint'>{{formatHint}}</p>

          <div class='options'>
            <template v-if='exportOptions.format === "kml"'>
              <label class='option'>
                <input type='checkbox' class='checkbox' :checked='exportOptions.kmlStreets' @change='setOption("kmlStreets", $event.target.checked)'>
                Calles con nombres y atributos
              </label>
              <label class='option' :class='{disabled: !parcelsReady}'>
                <input type='checkbox' class='checkbox' :checked='exportOptions.kmlParcels && parcelsReady' :disabled='!parcelsReady'
                  @change='setOption("kmlParcels", $event.target.checked)'>
                Parcelas <span v-if='!parcelsReady' class='option-note'>(actívalas en el paso 2)</span>
              </label>
            </template>
            <template v-else>
              <label class='option'>
                <input type='checkbox' class='checkbox' :checked='exportOptions.baseMap' @change='setOption("baseMap", $event.target.checked)'>
                Mapa base
              </label>
              <label class='option'>
                <input type='checkbox' class='checkbox' :checked='exportOptions.streetNames' @change='setOption("streetNames", $event.target.checked)'>
                Nombres de calles
              </label>
              <label class='option'>
                <input type='checkbox' class='checkbox' :checked='exportOptions.title' @change='setOption("title", $event.target.checked)'>
                Título del lugar
              </label>
              <div class='option-group'>
                <span class='field-label' id='map-style-label'>Fondo del mapa</span>
                <div class='segmented' role='radiogroup' aria-labelledby='map-style-label'>
                  <button type='button' role='radio' :aria-checked='mapStyle === "light"' @click='$emit("set-map-style", "light")'>Claro</button>
                  <button type='button' role='radio' :aria-checked='mapStyle === "dark"' @click='$emit("set-map-style", "dark")'>Oscuro</button>
                </div>
              </div>
            </template>
            <label v-if='exportOptions.format !== "svg"' class='option' :class='{disabled: !area}'>
              <input type='checkbox' class='checkbox' :checked='exportOptions.onlyArea && !!area' :disabled='!area'
                @change='setOption("onlyArea", $event.target.checked)'>
              Solo el área de exportación
            </label>
            <p v-if='!area && exportOptions.format !== "svg"' class='hint option-hint'>Dibuja un área en el paso 1 para recortar la exportación.</p>
          </div>
          <p v-if='exportOptions.format !== "kml"' class='hint'>
            La imagen usa la resolución de tu pantalla ({{resolutionText}}). Las credenciales de los datos se incluyen siempre.
          </p>
          <div v-if='fileName' class='file-name' :title='fileName'>
            <file-icon :size='14'/> <span>{{fileName}}</span>
          </div>
        </div>
      </section>

      <!-- Paso 4 -->
      <section class='step' :class='stepClass(4)' aria-labelledby='step-4'>
        <h3 id='step-4' class='step-title'>
          <span class='step-number' aria-hidden='true'>4</span>
          Extraer y descargar
        </h3>
        <div class='step-content'>
          <template v-if='phase === "loading"'>
            <div class='progress-card' role='status' aria-live='polite'>
              <div class='progress-head'>
                <loader-circle :size='16' class='spin'/>
                <span class='progress-message'>{{loading.message}}</span>
              </div>
              <div class='progress-track' :class='{indeterminate: loading.percent === undefined}'>
                <div class='progress-bar' :style='{width: loading.percent === undefined ? "35%" : Math.round(loading.percent * 100) + "%"}'></div>
              </div>
              <div class='progress-meta'>
                <span v-if='loading.loaded > 0'>{{formatBytes(loading.loaded)}} descargados</span>
                <span v-else-if='loading.loaded < 0'>Probando otro servidor...</span>
                <span v-else>Esperando respuesta del servidor...</span>
                <span v-if='loading.percent !== undefined'>{{Math.round(loading.percent * 100)}} %</span>
              </div>
              <p v-if='loading.still > 0' class='hint'>Sigue cargando. Las ciudades grandes pueden tardar varios minutos.</p>
            </div>
            <button type='button' class='btn btn-block' @click='$emit("cancel")'>Cancelar</button>
          </template>

          <template v-else-if='phase === "ready"'>
            <dl class='stats'>
              <div><dt>Tramos de calle</dt><dd>{{formatNumber(stats.ways)}}</dd></div>
              <div><dt>Calles con nombre</dt><dd>{{stats.namedStreets === null ? 'sin datos' : formatNumber(stats.namedStreets)}}</dd></div>
              <div><dt>Vértices</dt><dd>{{formatNumber(stats.points)}}</dd></div>
              <div><dt>Parcelas</dt><dd>{{parcelsReady ? formatNumber(parcelsCount) : '—'}}</dd></div>
            </dl>
            <button type='button' class='btn btn-primary btn-lg btn-block' :disabled='exporting' @click='$emit("download")'>
              <loader-circle v-if='exporting' :size='17' class='spin'/>
              <download-icon v-else :size='17'/>
              {{downloadLabel}}
            </button>
          </template>

          <template v-else>
            <div v-if='error' class='notice notice-error' role='alert'>
              <circle-alert :size='16'/>
              <div>
                <div v-if='errorIsServer'>Los servidores de {{sourceName(source)}} están ocupados o no responden. Normalmente se resuelve en unos minutos.</div>
                <div v-else>Algo salió mal al extraer los datos.</div>
                <div class='error-detail'>{{error.message || String(error)}}</div>
              </div>
            </div>
            <div v-if='noRoads' class='notice notice-warning'>
              <triangle-alert :size='16'/>
              <span>No se encontraron calles en esta área. Prueba con otro lugar u otra fuente.</span>
            </div>
            <p v-if='!place' class='hint'>Selecciona un área en el paso 1 para empezar.</p>
            <p v-else class='hint'>Las ciudades grandes pueden requerir más de 200 MB de datos y un equipo potente para dibujarlas.</p>
            <button type='button' class='btn btn-primary btn-lg btn-block' :disabled='!place' @click='$emit("extract")'>
              <play-icon :size='17'/> {{error || noRoads ? 'Reintentar extracción' : 'Extraer datos'}}
            </button>
          </template>
        </div>
      </section>
    </div>
  </aside>
</template>

<script>
import {
  X, Check, RefreshCw, SquareDashedMousePointer, Scan, Trash2, TriangleAlert, LoaderCircle,
  Download, CircleAlert, Play, File
} from 'lucide-vue-next';
import PlaceSearch from './PlaceSearch.vue';
import AreaPreview from './AreaPreview.vue';
import SourcePicker from './SourcePicker.vue';
import {SOURCES} from '../lib/extractRoads.js';
import {formatNumber, formatBytes, formatCoordinate} from '../lib/format.js';

/**
 * The «Extraer datos» panel: the extraction workflow in four steps.
 */
export default {
  name: 'ExtractPanel',
  components: {
    PlaceSearch, AreaPreview, SourcePicker, XIcon: X, CheckIcon: Check, RefreshCw, SquareDashedMousePointer,
    ScanIcon: Scan, Trash2, TriangleAlert, LoaderCircle, DownloadIcon: Download, CircleAlert, PlayIcon: Play,
    FileIcon: File
  },
  props: {
    place: Object,
    initialQuery: String,
    source: String,
    loadedSource: String,
    phase: String,
    loading: Object,
    error: [Object, Error, String],
    errorIsServer: Boolean,
    noRoads: Boolean,
    stats: Object,
    layers: Object,
    parcelsStatus: String,
    parcelsCount: Number,
    namesStatus: String,
    loadParcels: Boolean,
    area: Object,
    drawing: Boolean,
    exportOptions: Object,
    mapStyle: String,
    fileName: String,
    exporting: Boolean,
    resolution: Object
  },
  emits: [
    'close', 'select-place', 'query', 'change-area', 'draw-area', 'use-view', 'clear-area', 'set-source', 'extract',
    'cancel', 'toggle-layer', 'set-load-parcels', 'retry-parcels', 'retry-names', 'set-option', 'set-map-style', 'download'
  ],
  data() {
    return {
      formats: [
        {key: 'kml', label: 'KML'},
        {key: 'png', label: 'PNG'},
        {key: 'svg', label: 'SVG'}
      ]
    };
  },
  computed: {
    placeTitle() {
      return (this.place.name || '').split(',')[0] || 'Área guardada en el enlace';
    },
    placeDetail() {
      return (this.place.name || '').split(',').slice(1).join(',').trim();
    },
    bboxText() {
      let bbox = this.place.bbox;
      if (!bbox) return '';
      let [south, west, north, east] = bbox;
      return formatCoordinate(south, 'N', 'S') + ' … ' + formatCoordinate(north, 'N', 'S') + ' · ' +
        formatCoordinate(west, 'E', 'O') + ' … ' + formatCoordinate(east, 'E', 'O');
    },
    areaText() {
      let a = this.area;
      return formatCoordinate(a.south, 'N', 'S') + ' … ' + formatCoordinate(a.north, 'N', 'S') + ' · ' +
        formatCoordinate(a.west, 'E', 'O') + ' … ' + formatCoordinate(a.east, 'E', 'O');
    },
    sourceChanged() {
      return this.phase === 'ready' && this.loadedSource && this.loadedSource !== this.source;
    },
    parcelsReady() {
      return this.phase === 'ready' && this.parcelsStatus === 'ready';
    },
    formatHint() {
      return {
        kml: 'Geometrías en WGS 84 (lon, lat) para Google Earth, My Maps, QGIS y otros SIG.',
        png: 'Imagen de la vista actual del mapa. Verás una vista previa antes de descargarla.',
        svg: 'Imagen vectorial de la vista actual, editable en Illustrator o Inkscape.'
      }[this.exportOptions.format];
    },
    downloadLabel() {
      if (this.exporting) return 'Preparando archivo...';
      return {kml: 'Descargar KML', png: 'Vista previa y PNG', svg: 'Descargar SVG'}[this.exportOptions.format];
    },
    resolutionText() {
      let r = this.resolution;
      return r && r.width ? r.width + ' × ' + r.height + ' px' : 'pantalla completa';
    }
  },
  methods: {
    formatNumber,
    formatBytes,
    formatKm(km) {
      return km >= 1 ? km.toFixed(km >= 10 ? 0 : 1).replace('.', ',') + ' km' : Math.round(km * 1000) + ' m';
    },
    sourceName(source) {
      return (SOURCES[source] || SOURCES.osm).name;
    },
    setOption(key, value) {
      this.$emit('set-option', key, value);
    },
    stepDone(step) {
      if (step === 1) return Boolean(this.place);
      if (step === 2) return this.phase === 'ready';
      return false;
    },
    stepClass(step) {
      let current;
      if (!this.place) current = 1;
      else if (this.phase !== 'ready') current = this.phase === 'loading' ? 4 : 2;
      else current = 3;
      return {
        done: this.stepDone(step),
        current: step === current || (step === 4 && this.phase === 'ready'),
        pending: step > current && !(step === 4 && this.phase === 'ready')
      };
    }
  }
}
</script>

<style>
.side-panel {
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--text);
}
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 12px 10px 18px;
  border-bottom: 1px solid var(--border);
}
.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
}
.panel-subtitle {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}
.panel-close {
  margin-top: -4px;
}
.panel-body {
  flex: 1;
  min-height: 0;
  padding: 4px 0 24px;
}

.step {
  position: relative;
  padding: 14px 18px 16px 18px;
  border-bottom: 1px solid var(--border);
}
.step:last-child {
  border-bottom: 0;
}
.step-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
}
.step-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1.5px solid var(--border);
  background: var(--surface-2);
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 700;
}
.step.current .step-number {
  border-color: var(--accent);
  color: var(--accent-text);
  background: var(--accent-soft);
}
.step.done .step-number {
  border-color: var(--accent);
  background: var(--accent);
  color: var(--on-accent);
}
.step.pending .step-title {
  color: var(--text-muted);
}
.step-content > * + * {
  margin-top: 10px;
}

.hint {
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--text-muted);
}
.hint-accent {
  color: var(--accent-text);
  font-weight: 500;
}

.place-card {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--accent-border);
  border-radius: var(--radius);
  background: var(--accent-soft);
}
.place-info {
  min-width: 0;
}
.place-name {
  font-size: 15px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.place-detail {
  font-size: 12px;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.place-coords {
  margin-top: 3px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.change-area {
  margin-left: -8px;
  color: var(--accent-text);
}

.subsection {
  margin-top: 14px !important;
  padding-top: 12px;
  border-top: 1px dashed var(--border);
}
.subsection-title {
  font-size: 13px;
  font-weight: 700;
}
.optional {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
}
.button-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.btn-active {
  border-color: var(--accent-border);
  background: var(--accent-soft);
  color: var(--accent-text);
}
.area-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 6px 8px 12px;
  border: 1px dashed var(--accent-border);
  border-radius: var(--radius);
}
.area-size {
  font-weight: 700;
  font-size: 13px;
}

.full-width {
  display: flex;
  width: 100%;
}
.source-changed {
  margin-top: 10px;
}

.data-list {
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.data-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
}
.data-row + .data-row,
.data-status + .data-row {
  border-top: 1px solid var(--border);
}
.data-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.data-name {
  font-weight: 600;
}
.data-meta {
  font-size: 12px;
  color: var(--text-muted);
}
.data-status {
  padding: 0 12px 10px 46px;
  font-size: 12px;
  color: var(--text-muted);
}
.data-status svg {
  vertical-align: -2px;
}
.text-error {
  color: var(--danger);
}

.swatch {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.swatch-line {
  background:
    linear-gradient(135deg, transparent 45%, var(--text) 45%, var(--text) 57%, transparent 57%),
    var(--surface-2);
}
.swatch-polygon {
  background: rgba(217, 119, 6, 0.14);
  border: 1.5px solid rgba(217, 119, 6, 0.8);
}
.swatch-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text);
}

.format-hint {
  margin-top: 8px !important;
}
.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px !important;
}
.option {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 13.5px;
  cursor: pointer;
}
.option.disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}
.option-hint {
  margin: -4px 0 0 25px;
}
.option-note {
  font-size: 12px;
  color: var(--text-muted);
}
.option-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.option-group .field-label {
  margin: 0;
}
.file-name {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-muted);
}
.file-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.file-name svg {
  flex-shrink: 0;
}

.progress-card {
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
}
.progress-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.progress-head svg {
  color: var(--accent-text);
}
.progress-track {
  position: relative;
  height: 6px;
  margin-top: 10px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-3);
}
.progress-bar {
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 200ms ease-out;
}
.progress-track.indeterminate .progress-bar {
  position: absolute;
  animation: sd-indeterminate 1.4s ease-in-out infinite;
}
@keyframes sd-indeterminate {
  from { left: -35%; }
  to { left: 100%; }
}
.progress-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-muted);
}

.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin: 0 0 12px;
}
.stats div {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stats dt {
  font-size: 11.5px;
  color: var(--text-muted);
}
.stats dd {
  margin: 2px 0 0;
  font-size: 16px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.error-detail {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.85;
  word-break: break-word;
}
</style>
