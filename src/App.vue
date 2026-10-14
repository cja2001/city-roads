<template>
  <find-place v-if='!placeFound' @loaded='onGridLoaded'></find-place>
  <div id="app">
    <div v-if='placeFound'>
      <div class='controls'>
        <a href="#" class='print-button' @click.prevent='toggleSettings'>Customize...</a>
        <a href="#" class='try-another' @click.prevent='startOver'>Try another city</a>
      </div>
      <div class='layer-toggles'>
        <a href='#' class='layer-toggle streets-toggle' :class='{active: showStreets}' @click.prevent='toggleStreets'>Streets</a>
        <a href='#' class='layer-toggle parcels-toggle' :class='{active: showParcels, loading: parcelsStatus === "loading"}' @click.prevent='toggleParcels'>
          <span v-if='parcelsStatus === "loading"'>Loading parcels...</span>
          <span v-else>Parcels</span>
        </a>
      </div>
      <div v-if='showParcels && (parcelsStatus === "error" || parcelsStatus === "empty")' class='layer-notice'>
        <span v-if='parcelsStatus === "error"'>Could not load parcels. <a href='#' @click.prevent='retryParcels'>Try again</a></span>
        <span v-else>No parcels or buildings are mapped in this area.</span>
      </div>
      <div v-if='showSettings' class='print-window'>
        <h3>Display</h3>
        <div class='row'>
          <div class='col'>Colors</div>
          <div class='col colors c-2'>
            <div v-for='layer in layers' :key='layer.name' class='color-container'>
              <color-picker v-model='layer.color' @change='layer.changeColor'></color-picker>
              <div class='color-label'>{{layer.name}}</div>
            </div>
          </div>
        </div>
        <div class='row'>
          <label class='col base-map-label' for='base-map-select'>Base map</label>
          <span class='col c-2'>
            <select id='base-map-select' class='select' v-model='baseMap' @change='changeBaseMap'>
              <option v-for='(style, key) in baseMaps' :key='key' :value='key'>{{style.name}}</option>
            </select>
          </span>
        </div>
        <div class='row'>
          <label class='col street-names-toggle'>
            <input type='checkbox' v-model='showStreetNames' @change='toggleStreetNames'> Street names
          </label>
          <span class='col c-2 street-names-status'>
            <span v-if='streetNamesStatus === "loading"'>Loading street names from OpenStreetMap...</span>
            <span v-else-if='streetNamesStatus === "error"'>Could not load street names. <a href='#' @click.prevent='loadStreetNames'>Try again</a></span>
            <span v-else-if='streetNamesStatus === "empty"'>No named streets found in this area.</span>
            <span v-else>Zoom in to see more names.</span>
          </span>
        </div>

        <h3>Export</h3>
        <div class='row'>
          <a href='#' @click.prevent='zazzleMugPrint()' class='col'>Onto a mug</a> 
          <span class='col c-2'>
            Print what you see onto a mug. <br/>Get a unique gift of your favorite city.
          </span>
        </div>
        <div class='preview-actions message' v-if='zazzleLink || generatingPreview'>
            <div v-if='zazzleLink' class='padded popup-help'>
              If your browser has blocked the new window, <br/>please <a :href='zazzleLink' target='_blank'>click here</a>
              to open it.
            </div>
            <div v-if='generatingPreview' class='loading-container'>
              <loading-icon></loading-icon>
              Generating preview url...
            </div>
        </div>
        <div class='row'>
          <a href='#'  @click.prevent='toPNGFile' class='col'>As an image (.png)</a> 
          <span class='col c-2'>
            Save the current screen as a raster image.
          </span>
        </div>
        
        <div class='row'>
          <a href='#'  @click.prevent='toSVGFile' class='col'>As a vector (.svg)</a> 
          <span class='col c-2'>
            Save the current screen as a vector image.
          </span>
        </div>
        <div class='row'>
          <a href='#'  @click.prevent='toKMLFile' class='col'>As a map file (.kml)</a> 
          <span class='col c-2'>
            Save the visible streets (with names) and parcels. Opens in Google Earth and Google My Maps.
          </span>
        </div>
        <div v-if='false' class='row'>
          <a href='#' @click.prevent='toProtobuf' class='col'>To a .PBF file</a> 
          <span class='col c-2'>
            Save the current data as a protobuf message. For developer use only.
          </span>
        </div>

        <h3>About</h3>
        <div>
          <p>This website was created by <a href='https://twitter.com/anvaka' target='_blank'>@anvaka</a>.
          It downloads roads from OpenStreetMap and renders them with WebGL.
          </p>
          <p>
           You can find the entire <a href='https://github.com/anvaka/city-roads'>source code here</a>. 
           If you love this website you can also <a href='https://www.paypal.com/paypalme2/anvakos/3'>buy me a coffee</a> or 
           <a href='https://www.patreon.com/anvaka'>support me on Patreon</a>, but you don't have to.
          </p>
        </div>
      </div>
    </div>
  </div>

  <editable-label v-if='placeFound' v-model='name' class='city-name' :printable='true' :style='{color: labelColorRGBA}' :overlay-manager='overlayManager'></editable-label>
  <div v-if='placeFound && showStreetNames && (streetNamesStatus === "loading" || streetNamesStatus === "error")' class='street-names-notice'>
    <span v-if='streetNamesStatus === "loading"'>Loading street names...</span>
    <span v-else>Could not load street names. <a href='#' @click.prevent='loadStreetNames'>Try again</a></span>
  </div>
  <div v-if='placeFound' class='license printable can-drag' :style='{color: labelColorRGBA}'>data <a href='https://www.openstreetmap.org/about/' target="_blank" :style='{color: labelColorRGBA}'>© OpenStreetMap</a><span v-if='baseMapAttribution'> · {{baseMapAttribution}}</span></div>
</template>

<script>
import FindPlace from './components/FindPlace.vue';
import LoadingIcon from './components/LoadingIcon.vue';
import EditableLabel from './components/EditableLabel.vue';
import ColorPicker from './components/ColorPicker.vue';
import createScene from './lib/createScene.js';
import GridLayer from './lib/GridLayer.js';
import StreetNamesLayer from './lib/StreetNamesLayer.js';
import ParcelsLayer from './lib/ParcelsLayer.js';
import BaseMapLayer, {BASE_MAPS} from './lib/BaseMapLayer.js';
import generateZazzleLink from './lib/getZazzleLink.js';
import appState from './lib/appState.js';
import {getPrintableCanvas, getCanvas, toKML} from './lib/saveFile.js';
import config from './config.js';
import './lib/canvas2BlobPolyfill.js';
import bus from './lib/bus.js';
import createOverlayManager from './createOverlayManager.js';
import tinycolor from 'tinycolor2';

class ColorLayer {
  constructor(name, color, callback) {
    this.name = name;
    this.changeColor = callback;
    this.color = color;
  }
}

export default {
  name: 'App',
  components: {
    FindPlace,
    LoadingIcon,
    EditableLabel,
    ColorPicker
  },
  data() {
    return {
      placeFound: false,
      name: '',
      zazzleLink: null,
      generatingPreview: false,
      showSettings: false,
      settingsOpen: false,
      labelColor: config.getLabelColor().toRgb(),
      backgroundColor: config.getBackgroundColor().toRgb(),
      streetNamesColor: config.getLabelColor().toRgb(),
      showStreetNames: true,
      baseMaps: BASE_MAPS,
      baseMap: BASE_MAPS[appState.get('base')] ? appState.get('base') : 'map',
      streetNamesStatus: 'idle',
      showStreets: true,
      showParcels: false,
      parcelsStatus: 'idle',
      layers: []
    }
  },
  computed: {
    labelColorRGBA() {
      return toRGBA(this.labelColor);
    },
    baseMapAttribution() {
      let style = BASE_MAPS[this.baseMap];
      return style && style.attribution;
    }
  },
  created() {
    bus.on('scene-transform', this.handleSceneTransform);
    bus.on('background-color', this.syncBackground);
    bus.on('line-color', this.syncLineColor);
    this.overlayManager = createOverlayManager();
  },
  beforeUnmount() {
    debugger;
    this.overlayManager.dispose();
    this.dispose();
    bus.off('scene-transform', this.handleSceneTransform);
    bus.off('background-color', this.syncBackground);
    bus.off('line-color', this.syncLineColor);
  },
  methods: {
    dispose() {
      this.grid = null;
      this.roadsLayer = null;
      if (this.parcels) {
        this.parcels.dispose();
        this.parcels = null;
      }
      if (this.baseMapLayer) {
        this.baseMapLayer.dispose();
        this.baseMapLayer = null;
      }
      if (this.streetNames) {
        this.streetNames.dispose();
        this.streetNames = null;
      }
      if (this.scene) {
        this.scene.dispose();
        window.scene = null;
      }
    },
    toggleSettings() {
      this.showSettings = !this.showSettings;
    },
    handleSceneTransform() {
      this.zazzleLink = null;
    },
    onGridLoaded(grid) {
      if (grid.isArea) {
        appState.set('areaId', grid.id);
        appState.unset('osm_id');
        appState.unset('bbox');
      } else if (grid.bboxString) {
        appState.unset('areaId');
        appState.set('osm_id', grid.id);
        appState.set('bbox', grid.bboxString);
      }
      this.placeFound = true;
      this.name = grid.name.split(',')[0];
      let canvas = getCanvas();
      canvas.style.visibility = 'visible';

      this.scene = createScene(canvas);
      this.scene.on('layer-added', this.updateLayers);
      this.scene.on('layer-removed', this.updateLayers);

      window.scene = this.scene;

      let gridLayer = new GridLayer();
      gridLayer.id = 'lines';
      gridLayer.setGrid(grid);
      this.scene.add(gridLayer)
      this.grid = grid;
      this.roadsLayer = gridLayer;
      this.showStreets = true;
      this.showParcels = false;
      this.parcelsStatus = 'idle';
      this.parcels = new ParcelsLayer(this.scene, grid, gridLayer, status => this.parcelsStatus = status);

      this.baseMapLayer = new BaseMapLayer(this.scene, grid);
      this.baseMapLayer.setStyle(this.baseMap);

      this.streetNames = new StreetNamesLayer(this.scene, grid, {
        color: this.streetNamesColor,
        onStatus: status => this.streetNamesStatus = status
      });
      if (!this.showStreetNames) this.streetNames.hide();
      this.loadStreetNames();
    },

    loadStreetNames() {
      if (this.streetNames) this.streetNames.load();
    },

    changeBaseMap() {
      this.zazzleLink = null;
      if (this.baseMap === 'map') appState.unset('base');
      else appState.set('base', this.baseMap);
      if (this.baseMapLayer) this.baseMapLayer.setStyle(this.baseMap);
    },

    toggleStreetNames() {
      this.zazzleLink = null;
      if (!this.streetNames) return;
      if (this.showStreetNames && this.showStreets) this.streetNames.show();
      else this.streetNames.hide();
    },

    toggleStreets() {
      this.zazzleLink = null;
      this.showStreets = !this.showStreets;
      if (this.roadsLayer) {
        if (this.showStreets) this.roadsLayer.show();
        else this.roadsLayer.hide();
      }
      this.toggleStreetNames();
      if (this.scene) this.scene.render();
    },

    toggleParcels() {
      this.zazzleLink = null;
      if (!this.parcels) return;
      this.showParcels = !this.showParcels;
      if (this.showParcels) this.parcels.show();
      else this.parcels.hide();
      if (this.scene) this.scene.render();
    },

    retryParcels() {
      if (this.parcels) this.parcels.load();
    },

    startOver() {
      appState.unset('areaId');
      appState.unsetPlace();
      appState.unset('q');
      appState.enableCache();

      this.dispose();
      this.placeFound = false;
      this.zazzleLink = null;
      this.showSettings = false;
      this.backgroundColor = config.getBackgroundColor().toRgb();
      this.labelColor = config.getLabelColor().toRgb();
      this.streetNamesColor = config.getLabelColor().toRgb();
      this.streetNamesStatus = 'idle';
      this.showStreets = true;
      this.showParcels = false;
      this.parcelsStatus = 'idle';

      document.body.style.backgroundColor = config.getBackgroundColor().toRgbString();
      getCanvas().style.visibility = 'hidden';
    },

    toPNGFile(e) {
      scene.saveToPNG(this.name)
    },

    toSVGFile(e) { 
      scene.saveToSVG(this.name, {
        underSVG: this.baseMapLayer ? this.baseMapLayer.toSVG() : '',
        extraSVG: this.streetNames ? this.streetNames.toSVG() : ''
      })
    },

    toKMLFile() {
      if (!this.grid) return;
      let parcels = this.parcels && this.showParcels && this.parcels.layer ? this.parcels : null;
      toKML(this.showStreets ? this.grid : null, {
        name: this.name,
        color: this.roadsLayer ? this.roadsLayer.color : this.scene.lineColor,
        parcels: parcels && parcels.grid,
        parcelsColor: parcels && parcels.layer.color
      });
    },

    updateLayers() {
      // TODO: This method likely doesn't belong here
      let newLayers = [];
      let lastLayer = 0;
      let renderer = this.scene.getRenderer();
      let root = renderer.getRoot();
      root.children.forEach(layer => {
        if (!layer.color) return;
        let name = layer.id;
        if (!name) {
          lastLayer += 1;
          name = 'lines ' + lastLayer;
        }
        let layerColor = tinycolor.fromRatio(layer.color);
        newLayers.push(new ColorLayer(name, layerColor, newColor => {
          this.zazzleLink = null;
          layer.color = toRatioColor(newColor);
          renderer.renderFrame();
          this.scene.fire('color-change', layer);
        }));
      });

      newLayers.push(
        new ColorLayer('background', this.backgroundColor, this.setBackgroundColor),
        new ColorLayer('labels', this.labelColor, newColor => this.labelColor = newColor),
        new ColorLayer('street names', this.streetNamesColor, newColor => {
          this.streetNamesColor = newColor;
          this.zazzleLink = null;
          if (this.streetNames) this.streetNames.color = newColor;
        })
      );

      this.layers = newLayers;

      function toRatioColor(c) {
        return {r: c.r/0xff, g: c.g/0xff, b: c.b/0xff, a: c.a}
      }
      this.zazzleLink = null;
    },

    syncLineColor() {
      this.updateLayers();
    },

    syncBackground(newBackground) {
      this.backgroundColor = newBackground.toRgb();
      this.updateLayers()
    },
    // TODO: I need two background methods?
    updateBackground() {
      this.setBackgroundColor(this.backgroundColor)
      this.zazzleLink = null;
    },
    setBackgroundColor(c) {
      this.scene.background = c;
      document.body.style.backgroundColor = toRGBA(c);
      this.zazzleLink = null;
    },

    zazzleMugPrint() {
      if (this.zazzleLink) {
        window.open(this.zazzleLink, '_blank');
        recordOpenClick(this.zazzleLink);
        return;
      }

      this.generatingPreview = true;
      getPrintableCanvas(this.scene).then(printableCanvas => {
        generateZazzleLink(printableCanvas).then(link => {
          this.zazzleLink = link;
          window.open(link, '_blank');
          recordOpenClick(link);
          this.generatingPreview = false;
        }).catch(e => {
          this.error = e;
          this.generatingPreview = false;
        });
      });
    }
  }
}

function toRGBA(c) {
    return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
}

function recordOpenClick(link) {
  if (typeof gtag === 'undefined') return;

  gtag('event', 'click', {
    'event_category': 'Outbound Link',
    'event_label': link
  });
}
</script>

<style lang='stylus'>
@import('./vars.styl');

#app {
  margin: 12px;
  max-height: 100vh;
  position: absolute;
  z-index: 1;
  font-family: ui-font;
  color: strong-text;
}

.can-drag {
  border: 1px solid transparent;
}

.drag-overlay {
  position: fixed;
  background: transparent;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
}

.overlay-active {
  border: 1px dashed highlight-color;
}
.overlay-active.exclusive {
  border-style: solid;
}

.controls {
  display: flex;
  flex-direction: row;
  gap: 8px;
  width: desktop-controls-width;

  a {
    flex: 1;
    height: 44px;
    margin: 0;
    border: 0;
    border-radius: 999px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: background 0.2s, box-shadow 0.2s, transform 0.1s;
    &:active {
      transform: scale(0.98);
    }
  }

  a.print-button {
    color: white;
    background: brand-gradient;
    box-shadow: brand-shadow;
    &:hover {
      background: brand-gradient-hover;
      box-shadow: 0 8px 26px rgba(74, 144, 255, 0.5);
    }
  }

  a.try-another {
    color: strong-text;
    background: card-background;
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
    &:hover {
      background: white;
    }
  }
}

.layer-toggles {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  padding: 4px;
  width: desktop-controls-width;
  box-sizing: border-box;
  background: card-background;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);

  a.layer-toggle {
    flex: 1;
    height: 36px;
    border-radius: 999px;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 14px;
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
    &.parcels-toggle.active {
      background: linear-gradient(90deg, #f97316 0%, #ea580c 100%);
      box-shadow: 0 6px 20px rgba(234, 88, 12, 0.35);
    }
    &.loading {
      opacity: 0.85;
    }
  }
}

.layer-notice {
  margin-top: 8px;
  padding: 10px 14px;
  width: desktop-controls-width;
  box-sizing: border-box;
  font-size: 13px;
  color: strong-text;
  background: card-background;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
  a {
    color: highlight-color;
  }
}

.col {
  display: flex;
  flex: 1;
  align-items: center;
}

.street-names-notice {
  position: fixed;
  left: 12px;
  bottom: 12px;
  z-index: 1;
  padding: 8px 14px;
  font-family: ui-font;
  font-size: 13px;
  font-weight: 500;
  color: strong-text;
  background: card-background;
  border-radius: 999px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.14);
}

.base-map-label {
  align-items: center;
}

.select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  padding: 8px 34px 8px 12px;
  font-family: ui-font;
  font-size: 14px;
  color: strong-text;
  border: 1px solid border-color;
  border-radius: 10px;
  background: white url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;
  cursor: pointer;
  &:focus {
    outline: none;
    border-color: highlight-color;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
  }
}

.street-names-toggle {
  white-space: nowrap;
  margin-right: 8px;
  cursor: pointer;
  gap: 10px;

  // A switch instead of the default checkbox.
  input {
    appearance: none;
    -webkit-appearance: none;
    position: relative;
    flex-shrink: 0;
    width: 38px;
    height: 22px;
    margin: 0;
    border-radius: 999px;
    background: #CBD5E1;
    cursor: pointer;
    transition: background 0.2s;
    &::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
      transition: transform 0.2s;
    }
    &:checked {
      background: highlight-color;
    }
    &:checked::after {
      transform: translateX(16px);
    }
    &:focus-visible {
      outline: 2px solid highlight-color;
      outline-offset: 2px;
    }
  }
}

.street-names-status {
  font-size: 13px;
  color: muted-text;
}

.row {
  margin-top: 8px;
  display: flex;
  flex-direction: row;
  align-items: center;
  min-height: 36px;
  font-size: 14px;
}

.colors {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 6px 0;

  .color-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 64px;
  }

  .color-label {
    margin-top: 4px;
    font-size: 11px;
    color: muted-text;
    text-align: center;
  }
}

a {
  border: 1px solid transparent;
  margin: -1px;
  text-decoration: none;
  color: highlight-color
}
a:focus {
  outline: none;
}
a:focus-visible {
  outline: 2px solid highlight-color;
  outline-offset: 2px;
}

.print-window {
  margin-top: 10px;
  max-height: calc(100vh - 136px);
  overflow-y: auto;
  width: desktop-controls-width;
  padding: 18px 20px 20px;
  background: card-background;
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: card-radius;
  box-shadow: card-shadow;
  animation: panelIn 0.3s cubic-bezier(.22, 1, .36, 1) both;

  h3 {
    margin: 20px 0 6px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-align: left;
    color: highlight-color;
  }
  h3:first-child {
    margin-top: 0;
  }

  // Export actions look like buttons.
  .row a.col {
    flex: 0 0 132px;
    justify-content: center;
    margin: 0 12px 0 0;
    padding: 9px 10px;
    font-size: 13px;
    font-weight: 600;
    color: strong-text;
    background: soft-background;
    border: 0;
    border-radius: 10px;
    transition: background 0.2s, color 0.2s;
    &:hover {
      color: white;
      background: brand-gradient;
    }
  }
  .row .c-2 {
    font-size: 13px;
    color: muted-text;
  }

  p {
    font-size: 13px;
    line-height: 1.5;
    color: muted-text;
  }
}

@keyframes panelIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message {
  background: soft-background;
  border-radius: 10px;
}

.preview-actions {
  display: flex;
  padding: 8px 0;
  margin-left: -8px;
  margin-bottom: 14px;
  margin-top: 1px;
  width: desktop-controls-width;
  flex-direction: column;
  align-items: stretch;
  font-size: 14px;
  align-items: center;
  display: flex;

  .popup-help {
    text-align: center;
  }
}

.city-name {
  position: absolute;
  right: 32px;
  bottom: 54px;
  font-size: 24px;
  color: #434343;
  input {
    font-size: 24px;
  }
}

.license {
  text-align: right;
  position: fixed;
  font-family: labels-font;
  right: 32px;
  bottom: 32px;
  font-size: 12px;
  padding-right: 8px;
  a {
    text-decoration: none;
    display: inline-block;
  }
}

.c-2 {
  flex: 2
}

@media (max-width: small-screen) {
  #app {
    width: calc(100% - 16px);
    margin: 8px;

    .preview-actions,.error,
    .controls, .print-window, .layer-toggles, .layer-notice {
      width: 100%;
    }
    .loading-container {
      font-size: 12px;
    }

    .print-window {
      font-size: 14px;
      max-height: calc(100vh - 128px);
      padding: 16px;
    }
    .print-window .row a.col {
      flex-basis: 112px;
    }

  }
  .city-name  {
    right: 8px;
    bottom: 24px;
  }
  .license  {
    right: 8px;
    bottom: 8px;
  }
}

</style>
