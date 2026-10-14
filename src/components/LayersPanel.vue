<template>
  <aside class='side-panel layers-panel' aria-labelledby='layers-title'>
    <header class='panel-header'>
      <div>
        <h2 id='layers-title' class='panel-title'>Capas y datos</h2>
        <p class='panel-subtitle'>{{placeName}}</p>
      </div>
      <button type='button' class='icon-btn panel-close' aria-label='Cerrar capas y datos' @click='$emit("close")'>
        <x-icon :size='18'/>
      </button>
    </header>

    <div class='panel-body scroll-y'>
      <section class='layers-section' aria-label='Capas'>
        <h3 class='section-title'>Capas</h3>
        <ul class='layer-list'>
          <li class='layer' :class='{hidden: !layers.streets}'>
            <div class='layer-row'>
              <button type='button' class='icon-btn visibility' :aria-pressed='layers.streets'
                :aria-label='layers.streets ? "Ocultar calles" : "Mostrar calles"' :data-tip='layers.streets ? "Ocultar" : "Mostrar"'
                @click='$emit("toggle-layer", "streets", !layers.streets)'>
                <eye-icon v-if='layers.streets' :size='17'/><eye-off v-else :size='17'/>
              </button>
              <span class='layer-text'>
                <span class='layer-name'>Calles</span>
                <span class='layer-meta'>
                  <span class='badge' :class='"badge-source-" + (loadedSource === "overture" ? "overture" : "osm")'>{{sourceShort}}</span>
                  Línea · {{formatNumber(stats.ways)}} tramos
                </span>
              </span>
              <color-picker v-if='colors' :model-value='colors.roads' aria-label='Color de las calles' @change='$emit("set-color", "roads", $event)'/>
            </div>
            <div class='layer-style'>
              <label class='style-label' for='road-width'>Grosor</label>
              <input id='road-width' type='range' min='1' max='4' step='1' :value='roadWidth' class='range'
                @input='$emit("set-road-width", Number($event.target.value))'>
              <span class='style-value'>{{roadWidth}} px</span>
            </div>
          </li>

          <li class='layer' :class='{hidden: !layers.parcels}'>
            <div class='layer-row'>
              <button type='button' class='icon-btn visibility' :aria-pressed='layers.parcels'
                :aria-label='layers.parcels ? "Ocultar parcelas" : "Mostrar parcelas"' :data-tip='layers.parcels ? "Ocultar" : "Mostrar"'
                @click='$emit("toggle-layer", "parcels", !layers.parcels)'>
                <loader-circle v-if='parcelsStatus === "loading"' :size='17' class='spin'/>
                <eye-icon v-else-if='layers.parcels' :size='17'/><eye-off v-else :size='17'/>
              </button>
              <span class='layer-text'>
                <span class='layer-name'>Parcelas</span>
                <span class='layer-meta'>
                  <span class='badge badge-source-osm'>OSM</span>
                  Polígono · {{parcelsStatus === 'ready' ? formatNumber(parcelsCount) + ' elementos' : parcelsLabel}}
                </span>
              </span>
              <color-picker v-if='colors' :model-value='colors.parcels' aria-label='Color de las parcelas' @change='$emit("set-color", "parcels", $event)'/>
            </div>
          </li>

          <li class='layer' :class='{hidden: !layers.names}'>
            <div class='layer-row'>
              <button type='button' class='icon-btn visibility' :aria-pressed='layers.names'
                :aria-label='layers.names ? "Ocultar nombres" : "Mostrar nombres"' :data-tip='layers.names ? "Ocultar" : "Mostrar"'
                @click='$emit("toggle-layer", "names", !layers.names)'>
                <eye-icon v-if='layers.names' :size='17'/><eye-off v-else :size='17'/>
              </button>
              <span class='layer-text'>
                <span class='layer-name'>Nombres de calles</span>
                <span class='layer-meta'>Etiqueta · {{namesStatus === 'ready' ? formatNumber(namedCount) + ' calles con nombre' : namesLabel}}</span>
              </span>
              <color-picker v-if='colors' :model-value='colors.labels' aria-label='Color de los nombres' @change='$emit("set-color", "labels", $event)'/>
            </div>
          </li>

          <li class='layer'>
            <div class='layer-row'>
              <span class='layer-icon' aria-hidden='true'><map-icon :size='17'/></span>
              <span class='layer-text'>
                <label class='layer-name' for='base-map-select'>Mapa base</label>
                <span class='layer-meta'>Teselas ráster · {{baseMapAttribution || 'sin mapa base'}}</span>
              </span>
            </div>
            <div class='layer-style'>
              <select id='base-map-select' class='select select-sm' :value='baseMap' @change='$emit("set-base-map", $event.target.value)'>
                <option v-for='(style, key) in baseMaps' :key='key' :value='key'>{{style.name}}</option>
              </select>
            </div>
          </li>

          <li class='layer'>
            <div class='layer-row'>
              <span class='layer-icon' aria-hidden='true'><palette-icon :size='17'/></span>
              <span class='layer-text'>
                <span class='layer-name'>Fondo y título</span>
                <span class='layer-meta'>Colores del lienzo y del nombre del lugar</span>
              </span>
              <color-picker v-if='colors' :model-value='colors.background' aria-label='Color de fondo' @change='$emit("set-color", "background", $event)'/>
              <color-picker :model-value='titleColor' aria-label='Color del título' @change='$emit("set-title-color", $event)'/>
            </div>
          </li>
        </ul>
      </section>

      <section class='layers-section' aria-labelledby='props-title'>
        <div class='section-head'>
          <h3 id='props-title' class='section-title'>Propiedades</h3>
          <button v-if='feature' type='button' class='btn btn-sm btn-ghost' @click='$emit("clear-feature")'>Quitar selección</button>
        </div>
        <div v-if='!feature' class='empty-props'>
          <mouse-pointer-click :size='20'/>
          <span>Haz clic en una calle o parcela del mapa para resaltarla y ver sus atributos.</span>
        </div>
        <div v-else class='feature' aria-live='polite'>
          <div class='feature-head'>
            <span class='feature-kind'>{{feature.layer === 'roads' ? 'Calle' : 'Parcela'}}</span>
            <span class='badge' :class='"badge-source-" + feature.source'>{{feature.source === 'overture' ? 'Overture Maps' : 'OpenStreetMap'}}</span>
          </div>
          <div class='feature-name'>{{featureName}}</div>
          <dl class='props'>
            <div v-for='row in featureRows' :key='row.key'>
              <dt>{{row.label}}</dt>
              <dd>{{row.value}}</dd>
            </div>
          </dl>
          <p v-if='!feature.hasTags' class='hint'>Estos datos vienen de la caché de geometrías y no incluyen atributos.</p>
          <a v-if='osmUrl' class='osm-link' :href='osmUrl' target='_blank' rel='noopener'>
            Ver en OpenStreetMap <external-link :size='13'/>
          </a>
        </div>
      </section>
    </div>
  </aside>
</template>

<script>
import {X, Eye, EyeOff, LoaderCircle, Map, Palette, MousePointerClick, ExternalLink} from 'lucide-vue-next';
import ColorPicker from './ColorPicker.vue';
import {SOURCES} from '../lib/extractRoads.js';
import {formatNumber, formatDistance, formatArea} from '../lib/format.js';
import {haversine, ringArea} from '../lib/geometry.js';

const TAG_LABELS = {
  highway: 'Tipo de vía',
  ref: 'Referencia',
  oneway: 'Sentido único',
  maxspeed: 'Velocidad máxima',
  lanes: 'Carriles',
  surface: 'Superficie',
  lit: 'Iluminada',
  bridge: 'Puente',
  tunnel: 'Túnel',
  building: 'Edificio',
  landuse: 'Uso del suelo',
  'building:levels': 'Plantas',
  'addr:street': 'Calle (dirección)',
  'addr:housenumber': 'Número',
  'addr:city': 'Ciudad (dirección)',
  'addr:postcode': 'Código postal',
  amenity: 'Servicio',
  shop: 'Comercio'
};

/**
 * The «Capas y datos» panel: layer visibility and style, and the attributes
 * of the street or parcel the user clicked.
 */
export default {
  name: 'LayersPanel',
  components: {
    ColorPicker, XIcon: X, EyeIcon: Eye, EyeOff, LoaderCircle, MapIcon: Map, PaletteIcon: Palette,
    MousePointerClick, ExternalLink
  },
  props: {
    placeName: String,
    layers: Object,
    stats: Object,
    loadedSource: String,
    parcelsStatus: String,
    parcelsCount: Number,
    namesStatus: String,
    namedCount: Number,
    colors: Object,
    titleColor: Object,
    roadWidth: Number,
    baseMap: String,
    baseMaps: Object,
    baseMapAttribution: String,
    feature: Object
  },
  emits: ['close', 'toggle-layer', 'set-color', 'set-title-color', 'set-road-width', 'set-base-map', 'clear-feature'],
  computed: {
    sourceShort() {
      return (SOURCES[this.loadedSource] || SOURCES.osm).short;
    },
    parcelsLabel() {
      return {loading: 'cargando...', error: 'error al cargar', empty: 'sin datos en esta zona'}[this.parcelsStatus] || 'se cargan al activarlas';
    },
    namesLabel() {
      return {loading: 'cargando...', error: 'error al cargar', empty: 'sin nombres en los datos'}[this.namesStatus] || '';
    },
    featureName() {
      let tags = this.feature.tags;
      if (tags.name) return tags.name;
      if (tags['addr:housenumber']) return [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
      return this.feature.layer === 'roads' ? 'Calle sin nombre' : 'Parcela sin nombre';
    },
    featureRows() {
      let f = this.feature;
      let rows = [];
      Object.keys(TAG_LABELS).forEach(key => {
        if (f.tags[key] !== undefined) rows.push({key, label: TAG_LABELS[key], value: translate(f.tags[key])});
      });
      if (f.closed) {
        rows.push({key: '_area', label: 'Superficie aprox.', value: formatArea(ringArea(f.lonLats))});
      } else {
        let length = 0;
        for (let i = 1; i < f.lonLats.length; ++i) length += haversine(f.lonLats[i - 1], f.lonLats[i]);
        rows.push({key: '_length', label: 'Longitud del tramo', value: formatDistance(length)});
      }
      rows.push({key: '_points', label: 'Vértices', value: formatNumber(f.lonLats.length)});
      if (f.id > 0) rows.push({key: '_id', label: 'ID de OSM', value: 'way/' + f.id});
      // Any other attribute the source has, shown as is.
      Object.keys(f.tags).filter(key => !TAG_LABELS[key] && key !== 'name').sort().forEach(key => {
        rows.push({key, label: key, value: f.tags[key]});
      });
      return rows;
    },
    osmUrl() {
      let f = this.feature;
      return f && f.id > 0 && f.source === 'osm' ? 'https://www.openstreetmap.org/way/' + f.id : '';
    }
  },
  methods: {
    formatNumber
  }
}

function translate(value) {
  return {yes: 'sí', no: 'no'}[value] || value;
}
</script>

<style>
.layers-section {
  padding: 14px 16px 16px;
  border-bottom: 1px solid var(--border);
}
.layers-section:last-child {
  border-bottom: 0;
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title {
  margin: 0 0 10px;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--text-muted);
}
.section-head .section-title {
  margin: 0;
}
.layer-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.layer {
  padding: 8px 0;
}
.layer + .layer {
  border-top: 1px solid var(--border);
}
.layer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.layer.hidden .layer-name {
  color: var(--text-muted);
}
.visibility {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--accent-text);
}
.layer.hidden .visibility {
  color: var(--text-faint);
}
.layer-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  color: var(--text-muted);
}
.layer-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.layer-name {
  font-weight: 600;
}
.layer-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--text-muted);
}
.layer-style {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0 2px 40px;
}
.style-label {
  font-size: 12px;
  color: var(--text-muted);
}
.style-value {
  min-width: 34px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: right;
}
.range {
  flex: 1;
  accent-color: var(--accent-text);
}
.select-sm {
  height: 34px;
  font-size: 13px;
}

.empty-props {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-top: 10px;
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--text-muted);
}
.empty-props svg {
  flex-shrink: 0;
  color: var(--accent-text);
}
.feature {
  margin-top: 10px;
}
.feature-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.feature-kind {
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.feature-name {
  margin: 4px 0 10px;
  font-size: 16px;
  font-weight: 700;
  word-break: break-word;
}
.props {
  margin: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.props div {
  display: grid;
  grid-template-columns: 42% 1fr;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
}
.props div:nth-child(odd) {
  background: var(--surface-2);
}
.props dt {
  color: var(--text-muted);
  word-break: break-word;
}
.props dd {
  margin: 0;
  font-weight: 500;
  word-break: break-word;
}
.osm-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
}
</style>
