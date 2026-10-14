<template>
<div class='find-place' :class='{centered: boxInTheMiddle }'>
  <div v-if='boxInTheMiddle'>
    <h3 class='site-header'>city roads</h3>
    <p class='description'>Este sitio dibuja todas las calles de una ciudad</p>
  </div>
  <form v-on:submit.prevent="onSubmit" class='search-box'>
      <input class='query-input' v-model='enteredInput' type='text' placeholder='Escribe el nombre de una ciudad' ref='input'>
      <a type='submit' class='search-submit' href='#' @click.prevent='onSubmit' v-if='enteredInput && !hideInput'>{{mainActionText}}</a>
  </form>
  <div class='source-picker' role='radiogroup' aria-label='Fuente de las calles'>
    <span class='source-label'>Calles de</span>
    <a href='#' role='radio' :aria-checked='source === "osm"' :class='{active: source === "osm"}' @click.prevent='setSource("osm")'>OpenStreetMap</a>
    <a href='#' role='radio' :aria-checked='source === "overture"' :class='{active: source === "overture"}' @click.prevent='setSource("overture")' title='Overture Maps: OpenStreetMap combinado con datos de Microsoft, TomTom y Meta'>Overture</a>
    <a href='#' role='radio' :aria-checked='source === "both"' :class='{active: source === "both"}' @click.prevent='setSource("both")' title='Todas las calles de OpenStreetMap, más las de Overture que le faltan. Las que están en ambas se guardan una sola vez.'>Ambas</a>
  </div>
  <div v-if='showWarning' class='prompt message note shadow'>
    Nota: las ciudades grandes pueden requerir más de 200 MB de datos y un equipo potente para dibujarlas.
  </div>
  <div class='results' v-if='!loading'>
    <div v-if='suggestionsLoaded && suggestions.length' class='suggestions shadow'>
      <div class='prompt message'>
        <div>Elige un límite para descargar todas sus calles</div>
        <div class='note'>las ciudades grandes pueden requerir más de 200 MB de datos y un equipo potente</div>
      </div>
      <ul>
        <li v-for='(suggestion, index) in suggestions' :key="index">
          <a @click.prevent='pickSuggestion(suggestion)' class='suggestion'
          href='#'>
          <span>
          {{suggestion.name}} <small>({{placeType(suggestion.type)}})</small>
          </span>
          </a>
        </li>
      </ul>
    </div>
    <div v-if='suggestionsLoaded && !suggestions.length && !loading && !error' class='no-results message shadow'>
      No se encontraron ciudades. ¿Pruebas con otro nombre?
    </div>
    <div v-if='noRoads' class='no-results message shadow'>
      No se encontraron calles. ¿Pruebas con otro nombre?
    </div>
  </div>
  <div v-if='error' class='error message shadow'>
    <div v-if='isServerError(error)'>
      <div>Los servidores de {{sourceName}} están ocupados o no disponibles por ahora.</div>
      <div class='error-note'>Probamos {{error.serversAttempted || 'varios'}} servidores y ninguno respondió a tiempo. Normalmente se resuelve en unos minutos.</div>
      <div class='error-actions'>
        <a href='#' @click.prevent="retry" class='retry-btn'>Reintentar</a>
      </div>
    </div>
    <div v-else>
      <div>Algo salió mal al cargar los datos.</div>
      <div class='error-note'>{{error.message || error.toString()}}</div>
      <div class='error-actions'>
        <a href='#' @click.prevent="retry" class='retry-btn'>Reintentar</a>
      </div>
      <div class='error-links'>
        <a href='https://twitter.com/anvaka/status/1218971717734789120' title='mira cómo debería funcionar' target="_blank">cómo debería funcionar</a>
        <a :href='getBugReportURL(error)' :title='"reportar error: " + error' target='_blank'>reportar este error</a>
      </div>
    </div>
  </div>
  <div v-if='loading' class='loading message shadow'>
    <loading-icon></loading-icon>
    <span>{{loading}}</span>
    <a href="#" @click.prevent='cancelRequest' class='cancel-request'>cancelar</a>
    <div class='load-padding' v-if='stillLoading > 0'>
      Sigue cargando...
    </div>
    <div class='load-padding' v-if='stillLoading > 1'>
      ¡Perdón por la espera!
    </div>
  </div>
</div>
</template>

<script>
import LoadingIcon from './LoadingIcon.vue';
import Query from '../lib/Query.js';
import request from '../lib/request.js';
import findBoundaryByName, {findBoundaryByAreaId} from '../lib/findBoundaryByName.js';
import appState from '../lib/appState.js';
import Grid from '../lib/Grid.js';
import queryState from '../lib/appState.js';
import config from '../config.js';
import Progress from '../lib/Progress.js'
import LoadOptions from '../lib/LoadOptions.js';
import loadOvertureGrid, {loadOvertureSegments} from '../lib/overtureQuery.js';
import mergeSources from '../lib/mergeSources.js';
import clipToBoundary from '../lib/clipToBoundary.js';
import Pbf from 'pbf';
import {place} from '../proto/place.js';

const FIND_TEXT = 'Buscar ciudad';

// Nominatim place types, as shown next to each search result.
const PLACE_TYPES = {
  administrative: 'administrativo',
  city: 'ciudad',
  town: 'pueblo',
  village: 'aldea',
  hamlet: 'caserío',
  suburb: 'barrio',
  neighbourhood: 'colonia',
  county: 'condado',
  state: 'estado',
  region: 'región',
  country: 'país',
  municipality: 'municipio',
  island: 'isla',
};

export default {
  name: 'FindPlace',
  components: {
    LoadingIcon
  },
  data () {
    const enteredInput = appState.get('q') || '';
    let hasValidArea = restoreStateFromQueryString();

    return {
      enteredInput,
      loading: null,
      lastCancel: null,
      suggestionsLoaded: false,
      boxInTheMiddle: true,
      stillLoading: 0,
      error: null,
      hideInput: false,
      noRoads: false,
      clicked: false,
      showWarning: hasValidArea, 
      mainActionText: hasValidArea ? 'Descargar zona' : FIND_TEXT,
      source: ['overture', 'both'].includes(appState.get('source')) ? appState.get('source') : 'osm',
      suggestions: []
    }
  },
  computed: {
    sourceName() {
      return this.source === 'overture' ? 'Overture Maps' :
        this.source === 'both' ? 'OpenStreetMap u Overture Maps' : 'OpenStreetMap';
    }
  },
  watch: {
    enteredInput() {
      // As soon as they change it, we need not to download:
      this.mainActionText = FIND_TEXT;
      this.showWarning = false;
      this.hideInput = false;
      appState.unsetPlace();
    }
  },
  mounted() {
    this.$refs.input.focus();
    if (queryState.get('auto')) {
      this.onSubmit();
    }
  },
  beforeUnmount() {
    if (this.lastCancel) this.lastCancel();
    clearInterval(this.notifyStillLoading);
  },
  methods: {
    setSource(source) {
      this.source = source;
      // OpenStreetMap is the default and keeps the url short.
      if (source !== 'osm') appState.set('source', source);
      else appState.unset('source');
    },

    onSubmit() {
      queryState.set('q', this.enteredInput);
      this.cancelRequest()
      this.suggestions = [];
      this.noRoads = false;
      this.error = false;
      this.showWarning = false;

      const restoredState = restoreStateFromQueryString(this.enteredInput);
      if (restoredState) {
        this.pickSuggestion(restoredState);
        return;
      }

      this.loading = 'Buscando ciudades...'
      findBoundaryByName(this.enteredInput)
        .then(suggestions => {
          this.loading = null;
          this.hideInput = suggestions && suggestions.length;
          if (this.boxInTheMiddle) {
            // let animation that moves input box proceed a bit
            this.boxInTheMiddle = false; // This triggers transition
            // wait for it and then set the suggestions:
            setTimeout(() => {
              this.suggestionsLoaded = true;
              this.suggestions = suggestions;
            }, 50)
          } else {
              this.suggestionsLoaded = true;
              this.suggestions = suggestions; 
          }
        });
    },

    placeType(type) {
      return PLACE_TYPES[type] || type;
    },

    isServerError(error) {
      if (!error) return false;
      // These are transient server issues, not bugs in our code
      return error.allServersFailed ||
             error.invalidResponse ||
             error.statusError ||
             error.timedOut ||
             (error.message && error.message.includes('No se pudo descargar')) ||
             (typeof error === 'string' && error.startsWith('No se pudo descargar'));
    },

    getBugReportURL(error) {
      let title = encodeURIComponent('OSM Error');
      let body = '';
      if (error) {
        body = 'Hello, an error occurred on the website:\n\n```\n' +
          error.toString() + '\n```\n\n Can you please help?';
      }

      return `https://github.com/anvaka/city-roads/issues/new?title=${title}&body=${encodeURIComponent(body)}`
    },

    updateProgress(status) {
      this.stillLoading = 0;
      clearInterval(this.notifyStillLoading);
      if (status.loaded < 0) {
        this.loading = 'Probando otro servidor'
        this.restartLoadingMonitor();
        return;
      }
      if (status.percent !== undefined) {
        this.loading = 'Cargado ' + Math.round(100 * status.percent) + '% (' + formatNumber(status.loaded) + ' bytes)...';
      } else {
        this.loading = 'Cargados ' + formatNumber(status.loaded) + ' bytes...';
      }
    },

    retry() {
      if (this.lastSuggestion) {
        this.pickSuggestion(this.lastSuggestion);
      }
    },

    pickSuggestion(suggestion) {
      this.lastSuggestion = suggestion;
      this.error = false;
      if (this.source === 'overture') {
        // The cache only has OpenStreetMap roads.
        this.useOverture(suggestion);
      } else if (this.source === 'both') {
        this.useBoth(suggestion);
      } else if (appState.isCacheEnabled() && suggestion.areaId) {
        this.checkCache(suggestion)
          .catch(error => {
            if (error.cancelled) return; // no need to do anything. They've cancelled

            // No Cache - fallback
            return this.useOSM(suggestion);
          });
      } else {
        // we don't have cache for nodes yet.
        this.useOSM(suggestion);
      }
    },

    restartLoadingMonitor() {
      clearInterval(this.notifyStillLoading);
      this.stillLoading = 0;
      this.notifyStillLoading = setInterval(() => {
        this.stillLoading++;
      }, 10000);
    },

    checkCache(suggestion) {
      this.loading = 'Revisando la caché...'
      let areaId = suggestion.areaId;

      return request(config.areaServer + '/' + areaId + '.pbf', {
        progress: this.generateNewProgressToken(),
        responseType: 'arraybuffer'
      }).then(arrayBuffer => {
        var byteArray = new Uint8Array(arrayBuffer);
        return byteArray;
      }).then(byteArray => {
        var pbf = new Pbf(byteArray);
        var obj = place.read(pbf);
        let grid = Grid.fromPBF(obj)
        this.$emit('loaded', grid);
      });
    },

    useOSM(suggestion) {
      this.loadRoads(suggestion, 'Conectando con OpenStreetMap...', loadOSMGrid);
    },

    useBoth(suggestion) {
      this.loadRoads(suggestion, 'Conectando con OpenStreetMap y Overture Maps...', (place, progress) =>
        Promise.all([loadOSMGrid(place, progress), loadOvertureSegments(place, progress)])
          .then(([osmGrid, segments]) => {
            let merged = mergeSources(osmGrid.elements, segments);
            let elements = place.boundary ? clipToBoundary(merged.elements, place.boundary) : merged.elements;
            let grid = Grid.fromOSMResponse(elements);
            grid.queryBounds = Object.assign({}, osmGrid.queryBounds, {source: 'both'});
            console.info(`Overture added ${merged.added} roads and ${merged.named} names to OpenStreetMap`);
            return grid;
          }));
    },

    useOverture(suggestion) {
      this.loadRoads(suggestion, 'Conectando con Overture Maps...', loadOvertureGrid);
    },

    loadRoads(suggestion, message, load) {
      this.loading = message;

      // it may take a while to load data.
      this.restartLoadingMonitor();
      let progress = this.generateNewProgressToken();
      withBoundary(suggestion)
      .then(place => {
        if (progress.isCancelled) throw {cancelled: true};
        return load(place, progress);
      })
      .then(grid => {
        this.loading = null;
        if (!grid.hasRoads()) {
          this.noRoads = true;
        } else {
          grid.setName(suggestion.name);
          grid.setId(suggestion.areaId || suggestion.osm_id);
          grid.setIsArea(suggestion.areaId); // osm nodes don't have area.
          grid.setBBox(serializeBBox(suggestion.bbox));
          this.$emit('loaded', grid);
        }
      }).catch(err => {
        if (err.cancelled) {
          this.loading = null;
          return;
        }
        console.error(err);
        this.error = err;
        this.loading = null;
        this.suggestions = [];
      })
      .finally(() => {
        clearInterval(this.notifyStillLoading);
        this.stillLoading = 0;
      });
    },

    cancelRequest() {
      if (this.progressToken) {
        this.progressToken.cancel();
        this.progressToken = null;
        this.loading = false;
      }
    },

    generateNewProgressToken() {
      if (this.progressToken) {
        this.progressToken.cancel();
        this.progressToken = null;
      }

      this.progressToken = new Progress(this.updateProgress);
      return this.progressToken;
    }
  }
}

/**
 * A place restored from the url only knows its area id. Look up its outline
 * so it can be loaded with a bounding box query like a searched place.
 */
function withBoundary(suggestion) {
  if (!suggestion.areaId || suggestion.bbox) return Promise.resolve(suggestion);

  return findBoundaryByAreaId(suggestion.areaId)
    .then(found => found ? Object.assign({}, suggestion, {bbox: found.bbox, boundary: found.boundary}) : suggestion)
    .catch(() => suggestion);
}

function loadOSMGrid(place, progress) {
  return Query.runFromOptions(new LoadOptions({
    wayFilter: Query.Road,
    // Include tags, so street names come with the roads in one request.
    outputMethod: 'body',
    areaId: place.areaId,
    bbox: place.bbox,
    boundary: place.boundary
  }), progress);
}

function serializeBBox(bbox) {
  return bbox && bbox.join(',');
}

function formatNumber(x) {
  if (!Number.isFinite(x)) return 'N/A';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function restoreStateFromQueryString(name) {
  let areaId = getCurrentAreaId();
  if (areaId) {
    return {name, areaId};
  }

  let nodeAndBox = getCurrentNodeAndBox();
  if (nodeAndBox) {
    return {
      name,
      osm_id: nodeAndBox.osm_id,
      bbox: nodeAndBox.bbox
    };
  }
}

function getCurrentAreaId() {
  let areaId = appState.get('areaId');
  if (!Number.isFinite(Number.parseInt(areaId, 10))) {
    areaId = null;
  }
  return areaId;
}

function getCurrentNodeAndBox() {
  let osm_id = appState.get('osm_id');
  if (!Number.isFinite(Number.parseInt(osm_id, 10))) return;

  let bbox = parseBBox(appState.get('bbox'));
  if (!bbox) return;

  return { osm_id, bbox };
}

function parseBBox(bboxStr) {
  if (!bboxStr) return null;

  let bbox = bboxStr.split(',').map(x => Number.parseFloat(x)).filter(x => Number.isFinite(x));
  return bbox.length === 4 ? bbox : null;
}

</script>

<style lang="stylus">
@import('../vars.styl');
.find-place  {
  width: desktop-controls-width;
  font-family: ui-font;
  color: strong-text;
}

h3.site-header {
  margin: 0;
  font-weight: 700;
  font-size: 34px;
  letter-spacing: -0.5px;
  text-align: center;
  color: strong-text;
}

input {
  border: none;
  flex: 1;
  font-family: ui-font;
  padding: 0;
  color: strong-text;
  background: transparent;
  height: 100%;
  font-size: 16px;
  &:focus {
    outline: none;
  }
  &::placeholder {
    color: #94A3B8;
  }
}

.search-box {
  position: relative;
  background-color: emphasis-background;
  padding: 0 6px 0 16px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
  height: 54px;
  display: flex;
  align-items: center;
  font-size: 16px;
  cursor: text;
  transition: box-shadow 0.2s;
  &:focus-within {
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12), 0 0 0 3px rgba(37, 99, 235, 0.18);
  }
  a {
    cursor: pointer;
  }
  span {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
}

.prompt {
  padding: 8px 12px;
  text-align: center;
  font-size: 12px;
  color: muted-text;
}

.search-submit {
  height: 42px;
  padding: 0 16px;
  align-items: center;
  text-decoration: none;
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  outline: none;
  z-index: 1;
  font-size: 14px;
  font-weight: 600;
  color: white;
  background: brand-gradient;
  border-radius: 10px;
  box-shadow: brand-shadow;
  &:hover {
    background: brand-gradient-hover;
  }
}

.suggestion {
  min-height: 56px
  align-items: center;
  border-bottom: 1px solid border-color
  display: flex
  padding: 0 16px;
  text-decoration: none
  color: strong-text
  font-weight: 500;
  transition: background 0.15s;
  &:hover {
    background: soft-background;
    color: highlight-color;
  }
  small {
    color: muted-text;
    font-weight: 400;
  }
}

.suggestions {
  position: relative;
  background: white
  .note {
    font-size: 11px;
    font-style: italic;
  }

  ul {
    list-style-type: none;
    margin: 0;
    padding: 0;
    max-height: calc(100vh - 140px);
    overflow-y: auto;
    overflow-x: hidden;
  }
  li:last-child .suggestion {
    border-bottom: 0;
  }
}

.message,
.loading {
  padding: 12px 16px;
  position: relative;
  font-size: 14px;
}
.loading svg {
  margin-right: 8px;
}

.shadow {
  margin-top: 10px;
  background: white;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.06);
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
}

.error {
  overflow-x: auto;
}

.source-picker {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  padding: 4px;
  align-self: center;
  background: card-background;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  font-size: 13px;
  .source-label {
    padding: 0 8px 0 10px;
    color: muted-text;
  }
  a {
    padding: 6px 12px;
    border-radius: 999px;
    font-weight: 600;
    text-decoration: none;
    color: muted-text;
    transition: background 0.2s, color 0.2s;
    &:hover {
      color: strong-text;
      background: soft-background;
    }
    &.active {
      color: white;
      background: brand-gradient;
      box-shadow: brand-shadow;
    }
  }
}

.find-place {
  position: absolute;
  display: flex;
  flex-direction: column;
  top: 12px;
  left: 50%;

  transform: translateX(-50%) translateY(0);
  transition-timing-function: ease-out;
  transition-property: top left transform;
  transition-duration: 0.2s;
}

.find-place.centered {
  top: 50%;
  left: 50%;
  transform: translateX(-50%) translateY(-143px);
}
.load-padding {
  padding-left: 24px;
  color: muted-text;
}
.description {
  padding: 8px 8px 20px;
  margin: 0;
  text-align: center;
  color: muted-text;
}

.cancel-request {
  position: absolute;
  right: 12px;
  top: 12px;
  font-size: 12px;
  font-weight: 600;
}
.error-note {
  font-size: 12px;
  color: muted-text;
  margin: 8px 0;
}
.error-actions {
  margin: 12px 0 8px 0;
}
.retry-btn {
  display: inline-block;
  padding: 9px 24px;
  background: brand-gradient;
  color: white;
  text-decoration: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  box-shadow: brand-shadow;
  &:hover {
    background: brand-gradient-hover;
  }
}
.error-links {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid border-color;
}

@media (max-width: small-screen) {
  .find-place {
    width: calc(100% - 16px);
  }
  .find-place.centered {
    top: 8px;
    left: 8px;
    transform: none;
  }
  .message {
    font-size: 12px;
  }
  .prompt {
    font-size: 12px;
    .note {
      font-size: 9px;
    }
  }
}

</style>
