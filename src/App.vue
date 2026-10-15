<template>
  <top-bar :theme='theme' :source='source' :has-data='phase === "ready"' :extract-open='extractOpen' :layers-open='layersOpen'
    @toggle-theme='toggleTheme' @open-help='helpOpen = true' @set-source='setSource'
    @toggle-extract='togglePanel("extract")' @toggle-layers='togglePanel("layers")'
    @export='exportFromMenu' @new-extraction='changeArea'/>

  <extract-panel v-show='extractOpen' class='panel-left'
    :place='place' :initial-query='initialQuery' :source='source' :loaded-source='loadedSource' :phase='phase'
    :loading='loading' :error='error' :error-is-server='errorIsServer' :no-roads='noRoads' :stats='stats'
    :layers='layers' :parcels-status='parcelsStatus' :parcels-count='parcelsCount' :names-status='namesStatus'
    :load-parcels='loadParcels' :area='area' :drawing='drawing' :export-options='exportOptions' :map-style='mapStyle'
    :file-name='phase === "ready" ? fileName : ""' :exporting='exporting' :resolution='resolution'
    @close='extractOpen = false' @select-place='selectPlace' @query='saveQuery' @change-area='changeArea'
    @draw-area='toggleDrawing' @use-view='useViewAsArea' @clear-area='clearArea' @set-source='setSource'
    @extract='extract' @cancel='cancelExtraction' @toggle-layer='toggleLayer' @set-load-parcels='loadParcels = $event'
    @retry-parcels='map.retryParcels()' @retry-names='map.retryStreetNames()' @set-option='setExportOption'
    @set-map-style='applyMapStyle' @download='download'/>

  <layers-panel v-if='phase === "ready"' v-show='layersOpen' class='panel-right'
    :place-name='name' :layers='layers' :stats='stats' :loaded-source='loadedSource' :parcels-status='parcelsStatus'
    :parcels-count='parcelsCount' :names-status='namesStatus' :named-count='namedCount' :colors='colors'
    :title-color='titleColor' :road-width='roadWidth' :base-map='baseMap' :base-maps='baseMaps'
    :base-map-attribution='baseMapAttribution' :feature='feature'
    @close='layersOpen = false' @toggle-layer='toggleLayer' @set-color='setColor' @set-title-color='titleColor = $event'
    @set-road-width='setRoadWidth' @set-base-map='setBaseMap' @clear-feature='map.clearFeature()'/>

  <div v-if='narrow && (extractOpen || (layersOpen && phase === "ready"))' class='panel-scrim' @click='closePanels'></div>

  <teleport to='#map-stage'>
    <empty-state v-if='phase !== "ready"' @start='extractOpen = true'/>
    <div v-if='phase === "loading"' class='map-loading' role='status'>
      <loader-circle :size='16' class='spin'/> {{loading.message}}
    </div>
    <template v-if='phase === "ready"'>
      <map-controls :drawing='drawing' @zoom='map.zoomBy($event)' @fit='map.fitToData()' @draw='toggleDrawing'/>
      <div class='map-bottom-left'>
        <map-legend :layers='layers' :colors='legendColors' :parcels-ready='parcelsStatus === "ready"'
          :names-ready='namesStatus === "ready"' :has-area='!!area' :has-feature='!!feature'/>
        <map-status :meters-per-pixel='view.metersPerPixel' :center='view.center' :pointer='pointer'/>
      </div>
      <div v-if='drawing' class='draw-surface' @pointerdown='startDraw' @pointermove='moveDraw' @pointerup='endDraw'
        @pointercancel='cancelDraw' aria-label='Arrastra para dibujar el área de exportación'>
        <div class='draw-hint'>Arrastra para dibujar el área · Esc para cancelar</div>
      </div>
    </template>
  </teleport>

  <editable-label v-if='phase === "ready"' v-model='name' class='city-name' :printable='true' :style='{color: titleColorCSS}'
    :overlay-manager='overlayManager'></editable-label>
  <div v-if='phase === "ready"' class='license printable can-drag' :style='{color: titleColorCSS}'>datos <a
    href='https://www.openstreetmap.org/copyright' target='_blank' rel='noopener' :style='{color: titleColorCSS}'>© OpenStreetMap</a><span
    v-if='loadedSource !== "osm"'> · <a href='https://overturemaps.org/' target='_blank' rel='noopener' :style='{color: titleColorCSS}'>Overture Maps</a></span><span
    v-if='baseMapAttribution'> · {{baseMapAttribution}}</span></div>

  <toast-host/>
  <install-banner/>
  <install-help-dialog v-if='pwa.helpOpen'/>
  <help-dialog v-if='helpOpen' @close='helpOpen = false'/>
  <confirm-dialog v-if='confirm' :title='confirm.title' :message='confirm.message' :confirm-label='confirm.label'
    @confirm='runConfirmed' @cancel='confirm = null'/>
  <png-preview-dialog v-if='preview' :url='preview.url' :width='preview.width' :height='preview.height'
    :file-name='preview.fileName' @close='closePreview' @download='downloadPreview'/>
</template>

<script>
import {LoaderCircle} from 'lucide-vue-next';
import TopBar from './components/TopBar.vue';
import ExtractPanel from './components/ExtractPanel.vue';
import LayersPanel from './components/LayersPanel.vue';
import EmptyState from './components/EmptyState.vue';
import MapControls from './components/MapControls.vue';
import MapLegend from './components/MapLegend.vue';
import MapStatus from './components/MapStatus.vue';
import EditableLabel from './components/EditableLabel.vue';
import ToastHost from './components/ToastHost.vue';
import InstallBanner from './components/InstallBanner.vue';
import InstallHelpDialog from './components/InstallHelpDialog.vue';
import {pwa} from './lib/pwa.js';
import HelpDialog from './components/HelpDialog.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import PngPreviewDialog from './components/PngPreviewDialog.vue';
import MapController from './lib/MapController.js';
import {BASE_MAPS} from './lib/BaseMapLayer.js';
import extractRoads, {
  SOURCES, getSavedSource, saveSource, isServerError, restorePlaceFromUrl, savePlaceToUrl
} from './lib/extractRoads.js';
import appState from './lib/appState.js';
import Progress from './lib/Progress.js';
import {getInitialTheme, applyTheme} from './lib/theme.js';
import {getMapStyle, setMapStyle} from './lib/mapStyles.js';
import {makeFileName, canvasToPNG, explainCanvasError} from './lib/saveFile.js';
import {notify} from './lib/toasts.js';
import {formatNumber, formatBytes} from './lib/format.js';
import createOverlayManager from './createOverlayManager.js';
import './lib/canvas2BlobPolyfill.js';
import tinycolor from 'tinycolor2';

const NARROW = 1024;

export default {
  name: 'App',
  components: {
    TopBar, ExtractPanel, LayersPanel, EmptyState, MapControls, MapLegend, MapStatus, EditableLabel,
    ToastHost, InstallBanner, InstallHelpDialog, HelpDialog, ConfirmDialog, PngPreviewDialog, LoaderCircle
  },
  data() {
    let theme = getInitialTheme();
    let initialQuery = appState.get('q') || '';
    return {
      pwa,
      theme,
      mapStyle: theme,
      source: getSavedSource(),
      loadedSource: 'osm',
      initialQuery,
      place: restorePlaceFromUrl(initialQuery) || null,
      phase: 'idle',
      loading: {message: '', percent: undefined, loaded: 0, still: 0},
      error: null,
      errorIsServer: false,
      noRoads: false,
      stats: null,
      name: '',
      layers: {streets: true, parcels: false, names: true},
      loadParcels: false,
      parcelsStatus: 'idle',
      parcelsCount: 0,
      namesStatus: 'idle',
      namedCount: 0,
      colors: null,
      titleColor: tinycolor(getMapStyle(theme).title).toRgb(),
      roadWidth: 1,
      baseMaps: BASE_MAPS,
      baseMap: BASE_MAPS[appState.get('base')] ? appState.get('base') : getMapStyle(theme).baseMap,
      area: null,
      drawing: false,
      feature: null,
      view: {metersPerPixel: 0, center: null},
      pointer: null,
      resolution: null,
      exportOptions: {
        format: 'kml',
        kmlStreets: true,
        kmlParcels: true,
        baseMap: true,
        streetNames: true,
        title: true,
        onlyArea: true
      },
      exporting: false,
      helpOpen: false,
      confirm: null,
      preview: null,
      extractOpen: true,
      layersOpen: false,
      narrow: window.innerWidth < NARROW
    };
  },
  computed: {
    titleColorCSS() {
      let c = this.titleColor;
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a === undefined ? 1 : c.a})`;
    },
    baseMapAttribution() {
      let style = BASE_MAPS[this.baseMap];
      return style && style.attribution;
    },
    legendColors() {
      let toCSS = c => c ? tinycolor(c).toRgbString() : 'currentColor';
      let colors = this.colors || {};
      return {roads: toCSS(colors.roads), parcels: toCSS(colors.parcels), labels: toCSS(colors.labels)};
    },
    fileName() {
      let o = this.exportOptions;
      let onlyArea = o.onlyArea && this.area && o.format !== 'svg';
      let parts;
      if (o.format === 'kml') {
        parts = [];
        if (o.kmlStreets) parts.push('calles');
        if (o.kmlParcels && this.parcelsStatus === 'ready') parts.push('parcelas');
      } else {
        parts = ['mapa'];
      }
      if (onlyArea) parts.push('recorte');
      return makeFileName(this.name, parts, '.' + o.format);
    }
  },
  watch: {
    extractOpen: 'syncLayout',
    layersOpen: 'syncLayout',
    phase: 'syncLayout'
  },
  created() {
    applyTheme(this.theme);
    setMapStyle(this.mapStyle);
    this.overlayManager = createOverlayManager();
    this.map = new MapController({
      onStreetNamesStatus: (status, count) => {
        this.namesStatus = status;
        this.namedCount = count;
      },
      onParcelsStatus: (status, count) => {
        let wasLoading = this.parcelsStatus === 'loading';
        this.parcelsStatus = status;
        this.parcelsCount = count;
        if (wasLoading && status === 'ready') notify('Parcelas cargadas', {kind: 'success', detail: formatNumber(count) + ' elementos de OpenStreetMap'});
        if (status === 'error') notify('No se pudieron cargar las parcelas', {kind: 'error', detail: 'Los servidores de OpenStreetMap no respondieron. Puedes reintentarlo desde el paso 2.'});
      },
      onTransform: view => {
        this.view = view;
        let canvas = document.querySelector('#canvas');
        this.resolution = {width: canvas.width, height: canvas.height};
      },
      onPointer: lonLat => {
        this.pointer = lonLat;
      },
      onFeature: feature => {
        this.feature = feature;
        if (feature && !this.layersOpen) this.openPanel('layers');
      }
    });
  },
  mounted() {
    window.addEventListener('resize', this.onWindowResize);
    document.addEventListener('keydown', this.onKeyDown);
    let stage = document.querySelector('#map-stage');
    stage.addEventListener('keydown', this.onMapKey);
    stage.addEventListener('mouseleave', this.onMapLeave);
    // w-gl and the overlay canvases follow window resizes; the map also
    // changes size when a panel opens or closes.
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => window.dispatchEvent(new Event('resize')));
      this.resizeObserver.observe(stage);
    }
    this.syncLayout();
    if (this.place && appState.get('auto')) this.extract();
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.onWindowResize);
    document.removeEventListener('keydown', this.onKeyDown);
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.overlayManager.dispose();
    this.map.dispose();
  },
  methods: {
    // Layout ---------------------------------------------------------------
    syncLayout() {
      let body = document.body.classList;
      body.toggle('extract-open', this.extractOpen);
      body.toggle('layers-open', this.layersOpen && this.phase === 'ready');
    },
    onWindowResize() {
      let narrow = window.innerWidth < NARROW;
      if (narrow && !this.narrow && this.extractOpen && this.layersOpen) this.layersOpen = false;
      this.narrow = narrow;
    },
    openPanel(which) {
      if (which === 'extract') this.extractOpen = true;
      else this.layersOpen = true;
      // On small screens panels cover the map, so only one is open at a time.
      if (this.narrow) {
        if (which === 'extract') this.layersOpen = false;
        else this.extractOpen = false;
      }
    },
    togglePanel(which) {
      let open = which === 'extract' ? this.extractOpen : this.layersOpen;
      if (open) {
        if (which === 'extract') this.extractOpen = false;
        else this.layersOpen = false;
      } else {
        this.openPanel(which);
      }
    },
    closePanels() {
      this.extractOpen = false;
      this.layersOpen = false;
    },

    // Theme ----------------------------------------------------------------
    toggleTheme() {
      this.theme = this.theme === 'dark' ? 'light' : 'dark';
      applyTheme(this.theme);
      this.applyMapStyle(this.theme);
    },
    applyMapStyle(name) {
      // The base map follows the theme only while it is still the previous theme's default.
      let followsTheme = this.baseMap === getMapStyle(this.mapStyle).baseMap;
      this.mapStyle = name;
      setMapStyle(name);
      let style = getMapStyle(name);
      this.titleColor = tinycolor(style.title).toRgb();
      if (followsTheme) this.setBaseMap(style.baseMap);
      if (!this.map.loaded) return;
      this.map.setColor('background', style.background);
      this.map.setColor('roads', style.roads);
      this.map.setColor('parcels', style.parcels);
      this.map.setColor('labels', style.labels);
      this.colors = this.map.getColors();
    },

    // Extraction -----------------------------------------------------------
    setSource(source) {
      this.source = source;
      saveSource(source);
    },
    saveQuery(query) {
      appState.set('q', query);
    },
    selectPlace(place) {
      this.place = place;
      this.error = null;
      this.noRoads = false;
      appState.unsetPlace();
    },
    changeArea() {
      if (this.phase === 'ready') {
        this.askConfirm({
          title: '¿Descartar los datos extraídos?',
          message: 'Se quitarán del mapa las calles, parcelas y la selección actuales de ' + this.name + '. Podrás extraerlas de nuevo.',
          label: 'Descartar y cambiar área',
          action: () => this.resetAll()
        });
      } else if (this.phase === 'loading') {
        this.cancelExtraction();
        this.resetAll();
      } else {
        this.resetAll();
      }
    },
    resetAll() {
      this.discardMap();
      this.place = null;
      this.error = null;
      this.noRoads = false;
      appState.unsetPlace();
      appState.enableCache();
      this.openPanel('extract');
    },
    discardMap() {
      this.map.dispose();
      this.overlayManager.clear();
      this.phase = 'idle';
      this.stats = null;
      this.area = null;
      this.feature = null;
      this.drawing = false;
      this.colors = null;
      this.layersOpen = false;
      this.parcelsStatus = 'idle';
      this.namesStatus = 'idle';
      this.layers.parcels = false;
      this.layers.streets = true;
    },
    extract() {
      if (!this.place) return;
      if (this.phase === 'ready') {
        this.askConfirm({
          title: '¿Volver a extraer?',
          message: 'Se descargarán de nuevo las calles de ' + this.name + ' desde ' + SOURCES[this.source].name +
            ' y se reemplazarán los datos actuales del mapa.',
          label: 'Volver a extraer',
          action: () => {
            this.discardMap();
            this.runExtraction();
          }
        });
        return;
      }
      this.runExtraction();
    },
    runExtraction() {
      this.phase = 'loading';
      this.error = null;
      this.errorIsServer = false;
      this.noRoads = false;
      this.loading = {message: 'Preparando la extracción...', percent: undefined, loaded: 0, still: 0};
      let progress = this.progress = new Progress(status => this.updateProgress(status));
      this.restartStillLoading();

      extractRoads(this.place, this.source, progress, message => {
        this.loading.message = message;
      }).then(grid => {
        if (progress !== this.progress) return;
        if (!grid.hasRoads()) {
          this.phase = 'idle';
          this.noRoads = true;
          return;
        }
        this.showGrid(grid);
      }).catch(err => {
        if (progress !== this.progress) return;
        this.phase = 'idle';
        if (err && err.cancelled) return;
        console.error(err);
        this.error = err instanceof Error ? err : new Error(err && err.message || String(err));
        this.errorIsServer = isServerError(err);
        notify('La extracción falló', {kind: 'error', detail: this.errorIsServer ? 'Los servidores no respondieron. Inténtalo de nuevo.' : this.error.message});
      }).finally(() => {
        if (progress === this.progress) clearInterval(this.stillTimer);
      });
    },
    updateProgress(status) {
      this.restartStillLoading();
      if (status.loaded < 0) {
        this.loading.message = 'Probando otro servidor...';
        this.loading.loaded = -1;
        return;
      }
      this.loading.loaded = status.loaded;
      this.loading.percent = status.percent;
      if (status.loaded > 0 && !/Descargando/.test(this.loading.message)) this.loading.message = 'Descargando calles...';
    },
    restartStillLoading() {
      clearInterval(this.stillTimer);
      this.loading.still = 0;
      this.stillTimer = setInterval(() => {
        this.loading.still += 1;
      }, 10000);
    },
    cancelExtraction() {
      if (this.progress) this.progress.cancel();
      this.progress = null;
      clearInterval(this.stillTimer);
      this.phase = 'idle';
      notify('Extracción cancelada');
    },
    showGrid(grid) {
      savePlaceToUrl(grid);
      if (this.place.name) appState.set('q', this.place.name.split(',')[0]);
      this.name = (this.place.name || grid.name || '').split(',')[0];
      this.loadedSource = grid.queryBounds && grid.queryBounds.source || 'osm';
      this.layers.streets = true;
      this.phase = 'ready';
      this.map.load(grid, {baseMap: this.baseMap, showStreetNames: this.layers.names});
      this.stats = this.map.getStats();
      this.colors = this.map.getColors();
      if (this.roadWidth !== 1) this.map.setRoadWidth(this.roadWidth);
      if (this.loadParcels) {
        this.layers.parcels = true;
        this.map.setParcelsVisible(true);
      }
      this.$nextTick(() => this.map.fitToData());

      let detail = formatNumber(this.stats.ways) + ' tramos de calle de ' + SOURCES[this.loadedSource].name;
      if (grid.mergeStats) detail += ' (Overture añadió ' + formatNumber(grid.mergeStats.added) + ')';
      notify('Extracción completada', {kind: 'success', detail});

      if (this.narrow) this.extractOpen = false;
      else if (window.innerWidth >= 1280) this.layersOpen = true;
    },

    // Layers ---------------------------------------------------------------
    toggleLayer(layer, visible) {
      this.layers[layer] = visible;
      if (layer === 'streets') {
        this.map.setStreetsVisible(visible);
        this.map.setStreetNamesVisible(visible && this.layers.names);
      } else if (layer === 'parcels') {
        this.map.setParcelsVisible(visible);
      } else if (layer === 'names') {
        this.map.setStreetNamesVisible(visible && this.layers.streets);
      }
      if (!visible && this.feature && (layer === 'streets' && this.feature.layer === 'roads' || layer === 'parcels' && this.feature.layer === 'parcels')) {
        this.map.clearFeature();
      }
    },
    setColor(layer, color) {
      this.map.setColor(layer, color);
      this.colors = this.map.getColors();
    },
    setRoadWidth(width) {
      this.roadWidth = width;
      this.map.setRoadWidth(width);
    },
    setBaseMap(key) {
      this.baseMap = key;
      if (key === getMapStyle(this.mapStyle).baseMap) appState.unset('base');
      else appState.set('base', key);
      this.map.setBaseMap(key);
    },

    // Export area ----------------------------------------------------------
    toggleDrawing() {
      this.drawing = !this.drawing;
      if (this.drawing && this.narrow) this.closePanels();
      if (!this.drawing) this.map.setDraft(null);
    },
    startDraw(e) {
      let rect = e.currentTarget.getBoundingClientRect();
      this.drawStart = {x: e.clientX - rect.left, y: e.clientY - rect.top};
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    moveDraw(e) {
      if (!this.drawStart) return;
      let rect = e.currentTarget.getBoundingClientRect();
      this.map.setDraft(makeRect(this.drawStart, {x: e.clientX - rect.left, y: e.clientY - rect.top}));
    },
    endDraw(e) {
      if (!this.drawStart) return;
      let rect = e.currentTarget.getBoundingClientRect();
      let box = makeRect(this.drawStart, {x: e.clientX - rect.left, y: e.clientY - rect.top});
      this.drawStart = null;
      this.map.setDraft(null);
      if (box.width < 8 || box.height < 8) {
        notify('El rectángulo es demasiado pequeño', {detail: 'Arrastra sobre el mapa para dibujarlo.'});
        return;
      }
      this.drawing = false;
      this.area = this.map.setAreaFromScreenRect(box);
      this.exportOptions.onlyArea = true;
      notify('Área de exportación definida', {kind: 'success', detail: 'El KML y el PNG se recortarán a esta zona.'});
    },
    cancelDraw() {
      this.drawStart = null;
      this.map.setDraft(null);
    },
    useViewAsArea() {
      this.drawing = false;
      this.area = this.map.useViewAsArea();
      this.exportOptions.onlyArea = true;
      notify('Área de exportación definida', {kind: 'success', detail: 'Se usó la vista actual del mapa.'});
    },
    clearArea() {
      this.area = null;
      this.map.clearArea();
    },

    // Export ---------------------------------------------------------------
    setExportOption(key, value) {
      this.exportOptions[key] = value;
    },
    exportFromMenu(format) {
      this.exportOptions.format = format;
      this.download();
    },
    download() {
      if (this.phase !== 'ready' || this.exporting) return;
      let o = this.exportOptions;
      let onlyArea = Boolean(o.onlyArea && this.area);
      let fileName = this.fileName;
      if (o.format === 'kml') {
        let includeParcels = o.kmlParcels && this.parcelsStatus === 'ready';
        if (!o.kmlStreets && !includeParcels) {
          notify('No hay nada que exportar', {kind: 'error', detail: 'Activa las calles o las parcelas en las opciones del KML.'});
          return;
        }
        this.exporting = true;
        // Let the button show its busy state before the (synchronous) export.
        setTimeout(() => {
          this.map.exportKML({name: this.name, fileName, includeStreets: o.kmlStreets, includeParcels, onlyArea})
            .then(result => {
              let parts = [];
              if (o.kmlStreets) parts.push(formatNumber(result.streets) + ' calles con nombre, ' + formatNumber(result.segments) + ' tramos');
              if (includeParcels) parts.push(formatNumber(result.parcels) + ' parcelas');
              notify('KML descargado', {kind: 'success', detail: parts.join(' · ') + ' · ' + formatBytes(result.bytes)});
            })
            .catch(err => notify('No se pudo exportar el KML', {kind: 'error', detail: err.message}))
            .finally(() => {
              this.exporting = false;
            });
        }, 30);
      } else if (o.format === 'png') {
        this.exporting = true;
        this.map.renderImage({baseMap: o.baseMap, streetNames: o.streetNames, title: o.title, onlyArea})
          .then(canvas => {
            let url;
            try {
              url = canvas.toDataURL('image/png');
            } catch (e) {
              throw explainCanvasError(e);
            }
            this.preview = {url, width: canvas.width, height: canvas.height, fileName, canvas};
          })
          .catch(err => notify('No se pudo crear la imagen', {kind: 'error', detail: err.message}))
          .finally(() => {
            this.exporting = false;
          });
      } else {
        try {
          let result = this.map.exportSVG({name: this.name, fileName, baseMap: o.baseMap, streetNames: o.streetNames, title: o.title});
          notify('SVG descargado', {kind: 'success', detail: formatBytes(result.bytes)});
        } catch (e) {
          notify('No se pudo exportar el SVG', {kind: 'error', detail: explainCanvasError(e).message});
        }
      }
    },
    downloadPreview() {
      let {canvas, fileName} = this.preview;
      canvasToPNG(canvas, fileName)
        .then(result => notify('PNG descargado', {kind: 'success', detail: result.width + ' × ' + result.height + ' px · ' + formatBytes(result.bytes)}))
        .catch(err => notify('No se pudo descargar el PNG', {kind: 'error', detail: err.message}));
      this.closePreview();
    },
    closePreview() {
      this.preview = null;
    },

    // Dialogs and keyboard -------------------------------------------------
    askConfirm(confirm) {
      this.confirm = confirm;
    },
    runConfirmed() {
      let action = this.confirm.action;
      this.confirm = null;
      action();
    },
    onKeyDown(e) {
      if (e.key !== 'Escape' || this.helpOpen || this.confirm || this.preview) return;
      if (this.drawing) {
        this.drawing = false;
        this.cancelDraw();
      } else if (this.narrow && (this.extractOpen || this.layersOpen)) {
        this.closePanels();
      }
    },
    onMapKey(e) {
      if (this.phase !== 'ready' || e.target !== e.currentTarget) return;
      let step = 80;
      let handled = true;
      switch (e.key) {
        case '+': case '=': this.map.zoomBy(0.5); break;
        case '-': case '_': this.map.zoomBy(-1); break;
        case '0': this.map.fitToData(); break;
        case 'ArrowLeft': this.map.panBy(step, 0); break;
        case 'ArrowRight': this.map.panBy(-step, 0); break;
        case 'ArrowUp': this.map.panBy(0, step); break;
        case 'ArrowDown': this.map.panBy(0, -step); break;
        default: handled = false;
      }
      if (handled) e.preventDefault();
    },
    onMapLeave() {
      this.pointer = null;
    }
  }
}

function makeRect(a, b) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y)
  };
}
</script>

<style>
/* Workspace layout: top bar, «Extraer datos» on the left, the map in the
   middle and «Capas y datos» on the right. */
body {
  --stage-left: 0px;
  --stage-right: 0px;
}

#map-stage {
  position: fixed;
  top: var(--topbar-height);
  left: var(--stage-left);
  right: var(--stage-right);
  bottom: 0;
  overflow: hidden;
  background: var(--app-bg);
}
#map-stage:focus-visible {
  box-shadow: inset 0 0 0 3px var(--sd-cyan);
}
#canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  visibility: hidden;
}

.panel-left,
.panel-right {
  position: fixed;
  top: var(--topbar-height);
  bottom: 0;
  z-index: 30;
}
.panel-left {
  left: 0;
  width: var(--panel-width);
  border-right: 1px solid var(--border);
}
.panel-right {
  right: 0;
  width: var(--layers-width);
  border-left: 1px solid var(--border);
}

@media (min-width: 1024px) {
  body.extract-open {
    --stage-left: var(--panel-width);
  }
  body.layers-open {
    --stage-right: var(--layers-width);
  }
}

.panel-scrim {
  display: none;
}

/* Tablets: panels slide over the map instead of pushing it. */
@media (max-width: 1023px) {
  .panel-left,
  .panel-right {
    width: min(380px, calc(100vw - 48px));
    box-shadow: var(--shadow-lg);
    animation: sd-slide-in 160ms ease-out;
  }
  .panel-scrim {
    display: block;
    position: fixed;
    inset: var(--topbar-height) 0 0 0;
    z-index: 25;
    background: var(--scrim);
    animation: sd-fade 120ms ease-out;
  }
}

/* Phones: panels become bottom sheets and leave the top of the map visible. */
@media (max-width: 720px) {
  .panel-left,
  .panel-right {
    top: auto;
    left: 0;
    right: 0;
    width: auto;
    max-height: calc(100% - var(--topbar-height) - 64px);
    height: 78vh;
    border: 0;
    border-top: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    animation: sd-sheet-in 180ms ease-out;
  }
  .panel-left .panel-header::before,
  .panel-right .panel-header::before {
    content: '';
    position: absolute;
    top: 6px;
    left: 50%;
    width: 36px;
    height: 4px;
    margin-left: -18px;
    border-radius: 2px;
    background: var(--surface-3);
  }
  .panel-header {
    position: relative;
    padding-top: 18px;
  }
  .panel-scrim {
    background: rgba(11, 20, 36, 0.25);
  }
}
@media (min-width: 1024px) {
  .panel-close {
    display: none !important;
  }
}

@keyframes sd-slide-in {
  from { opacity: 0; transform: translateX(-12px); }
}
@keyframes sd-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
}

.map-bottom-left {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100% - 24px);
}
.map-loading {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 6;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}
.map-loading svg {
  color: var(--accent-text);
}
.draw-surface {
  position: absolute;
  inset: 0;
  z-index: 4;
  cursor: crosshair;
  touch-action: none;
}
.draw-hint {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--sd-navy);
  color: var(--sd-white);
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: var(--shadow);
}

/* Place name and data credits: drawn on the map and copied into exports. */
.city-name {
  position: fixed;
  z-index: 3;
  right: calc(var(--stage-right) + 28px);
  bottom: 52px;
  font-size: 24px;
}
.city-name input {
  font-size: 24px;
}
.license {
  position: fixed;
  z-index: 3;
  right: calc(var(--stage-right) + 28px);
  bottom: 24px;
  padding-right: 8px;
  font-family: 'Roboto', var(--font-ui);
  font-size: 12px;
  text-align: right;
}
.license a {
  display: inline-block;
  text-decoration: none;
}
.can-drag {
  border: 1px solid transparent;
}
.drag-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: transparent;
}
.overlay-active {
  border: 1px dashed var(--sd-cyan);
}
.overlay-active.exclusive {
  border-style: solid;
}
@media (max-width: 720px) {
  .city-name {
    right: 8px;
    bottom: 34px;
    font-size: 18px;
  }
  .city-name input {
    font-size: 18px;
  }
  .license {
    right: 8px;
    bottom: 10px;
    font-size: 10px;
  }
  .map-bottom-left {
    bottom: 64px;
  }
}
</style>
