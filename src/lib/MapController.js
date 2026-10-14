import createScene from './createScene.js';
import GridLayer from './GridLayer.js';
import StreetNamesLayer from './StreetNamesLayer.js';
import ParcelsLayer from './ParcelsLayer.js';
import BaseMapLayer, {BASE_MAPS} from './BaseMapLayer.js';
import SelectionLayer from './SelectionLayer.js';
import FeatureIndex from './FeatureIndex.js';
import {toCounterClockwise} from './geometry.js';
import {toKML, toSVG, getPrintableCanvas, getCanvas} from './saveFile.js';
import config from '../config.js';
import bus from './bus.js';
import tinycolor from 'tinycolor2';

const PICK_TOLERANCE = 8; // css pixels

/**
 * Owns the map: the WebGL scene and every layer drawn with it (base map,
 * streets, parcels, street names and the selection). The Vue components only
 * talk to this class, so no heavy map object becomes reactive.
 */
export default class MapController {
  constructor(callbacks) {
    this.callbacks = Object.assign({
      onStreetNamesStatus() {},
      onParcelsStatus() {},
      onTransform() {},
      onPointer() {},
      onFeature() {}
    }, callbacks);
    this.scene = null;
    this.grid = null;
    this.indexes = new Map();
    this.area = null;
    this.onTransform = this.onTransform.bind(this);
  }

  get loaded() {
    return Boolean(this.scene);
  }

  load(grid, options) {
    this.dispose();
    let canvas = getCanvas();
    canvas.style.visibility = 'visible';

    this.grid = grid;
    this.scene = createScene(canvas);
    window.scene = this.scene; // console API, see API.md
    this.scene.background = config.getBackgroundColor();

    let roads = this.roadsLayer = new GridLayer();
    roads.id = 'lines';
    roads.color = config.getDefaultLineColor();
    roads.setGrid(grid);
    this.scene.add(roads);

    this.parcels = new ParcelsLayer(this.scene, grid, roads, status => {
      this.indexes.delete('parcels');
      this.callbacks.onParcelsStatus(status, this.getParcelsCount());
    });
    this.parcels.color = config.getParcelsColor();

    this.baseMapLayer = new BaseMapLayer(this.scene, grid);
    this.baseMapLayer.setStyle(options.baseMap);

    this.streetNames = new StreetNamesLayer(this.scene, grid, {
      color: config.getStreetNamesColor().toRgb(),
      onStatus: status => this.callbacks.onStreetNamesStatus(status, this.getNamedStreetsCount())
    });
    if (!options.showStreetNames) this.streetNames.hide();
    this.streetNames.load();

    this.selection = new SelectionLayer(this.scene);

    let renderer = this.scene.getRenderer();
    renderer.on('click', e => this.pick(e));
    renderer.on('mousemove', e => this.callbacks.onPointer(this.sceneToLonLat({x: e.x, y: e.y})));
    bus.on('scene-transform', this.onTransform);
    this.onTransform();
  }

  dispose() {
    bus.off('scene-transform', this.onTransform);
    this.indexes.clear();
    this.area = null;
    ['parcels', 'baseMapLayer', 'streetNames', 'selection'].forEach(key => {
      if (this[key]) {
        this[key].dispose();
        this[key] = null;
      }
    });
    this.roadsLayer = null;
    this.grid = null;
    if (this.scene) {
      this.scene.dispose();
      this.scene = null;
      window.scene = null;
    }
    let canvas = getCanvas();
    if (canvas) canvas.style.visibility = 'hidden';
  }

  // Statistics ---------------------------------------------------------------

  getStats() {
    let ways = 0;
    let points = 0;
    let names = new Set();
    let hasTags = false;
    this.grid.forEachElement(element => {
      if (element.type !== 'way') return;
      ways += 1;
      points += element.nodes.length;
      if (element.tags) {
        hasTags = true;
        if (element.tags.name) names.add(element.tags.name);
      }
    });
    let bounds = this.grid.bounds;
    return {
      ways,
      points,
      namedStreets: hasTags ? names.size : null,
      bbox: [bounds.left, bounds.bottom, bounds.right, bounds.top]
    };
  }

  getParcelsCount() {
    let grid = this.parcels && this.parcels.grid;
    if (!grid) return 0;
    return grid.elements.reduce((count, element) => count + (element.type === 'way' ? 1 : 0), 0);
  }

  getNamedStreetsCount() {
    if (!this.streetNames) return 0;
    return new Set(this.streetNames.candidates.map(c => c.name)).size;
  }

  // Layers -------------------------------------------------------------------

  setStreetsVisible(visible) {
    if (!this.roadsLayer) return;
    if (visible) this.roadsLayer.show();
    else this.roadsLayer.hide();
    this.scene.render();
  }

  setParcelsVisible(visible) {
    if (!this.parcels) return;
    if (visible) this.parcels.show();
    else this.parcels.hide();
    this.scene.render();
  }

  retryParcels() {
    if (this.parcels) this.parcels.load();
  }

  setStreetNamesVisible(visible) {
    if (!this.streetNames) return;
    if (visible) this.streetNames.show();
    else this.streetNames.hide();
  }

  retryStreetNames() {
    if (this.streetNames) this.streetNames.load();
  }

  setBaseMap(key) {
    if (this.baseMapLayer) this.baseMapLayer.setStyle(key);
  }

  getBaseMapAttribution(key) {
    let style = BASE_MAPS[key];
    return style && style.attribution;
  }

  getColors() {
    return {
      roads: this.roadsLayer.color.toRgb(),
      parcels: tinycolor(this.parcels.layer ? this.parcels.layer.color : this.parcels.color).toRgb(),
      labels: this.streetNames.color.toRgb(),
      background: this.scene.background.toRgb()
    };
  }

  setColor(layer, color) {
    if (!this.scene) return;
    if (layer === 'roads') {
      this.roadsLayer.color = color;
    } else if (layer === 'parcels') {
      this.parcels.color = color;
      if (this.parcels.layer) this.parcels.layer.color = color;
    } else if (layer === 'labels') {
      this.streetNames.color = color;
    } else if (layer === 'background') {
      this.scene.background = color;
    }
    this.scene.render();
  }

  setRoadWidth(width) {
    if (!this.roadsLayer) return;
    this.roadsLayer.lineWidth = width;
    this.scene.render();
  }

  // Camera -------------------------------------------------------------------

  zoomBy(scaleFactor) {
    let camera = this.scene && this.scene.getRenderer().getCameraController();
    if (!camera || !camera.zoomToClientCoordinates) return;
    let rect = getCanvas().getBoundingClientRect();
    camera.zoomToClientCoordinates(rect.left + rect.width / 2, rect.top + rect.height / 2, scaleFactor, true);
  }

  panBy(dx, dy) {
    let camera = this.scene && this.scene.getRenderer().getCameraController();
    if (camera && camera.panByAbsoluteOffset) camera.panByAbsoluteOffset(dx, dy);
  }

  fitToData() {
    if (!this.scene || !this.grid) return;
    let project = this.grid.getProjector();
    let b = this.grid.bounds;
    let sw = project({lon: b.left, lat: b.bottom});
    let ne = project({lon: b.right, lat: b.top});
    this.fitTo({left: sw.x, right: ne.x, top: ne.y, bottom: sw.y});
  }

  fitTo(box) {
    let canvas = getCanvas();
    let aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    let halfWidth = (box.right - box.left) / 2 * 1.08;
    let halfHeight = (box.top - box.bottom) / 2 * 1.08;
    // setViewBox fits the larger half extent vertically, so wide boxes need
    // to be expressed in vertical units.
    let half = Math.max(halfHeight, halfWidth / aspect);
    let cx = (box.left + box.right) / 2, cy = (box.top + box.bottom) / 2;
    this.scene.getRenderer().setViewBox({left: cx - half, right: cx + half, top: cy + half, bottom: cy - half});
    this.scene.render();
    bus.fire('scene-transform');
  }

  onTransform() {
    if (!this.scene) return;
    this.callbacks.onTransform(this.getViewInfo());
  }

  /**
   * Scale of the map (ground meters per css pixel) and the center of the view.
   */
  getViewInfo() {
    let renderer = this.scene.getRenderer();
    let o = renderer.getClientCoordinate(0, 0);
    let ex = renderer.getClientCoordinate(1, 0);
    let pixelsPerUnit = Math.hypot(ex.x - o.x, ex.y - o.y);
    let canvas = getCanvas();
    let center = this.screenToScene(canvas.clientWidth / 2, canvas.clientHeight / 2);
    let lonLat = this.sceneToLonLat(center);
    // Mercator scale factor: one scene unit is cos(latitude) meters on the ground.
    let metersPerPixel = pixelsPerUnit ? Math.cos(lonLat[1] * Math.PI / 180) / pixelsPerUnit : 0;
    return {metersPerPixel, center: lonLat};
  }

  screenToScene(x, y) {
    let rect = getCanvas().getBoundingClientRect();
    let p = this.scene.getRenderer().getSceneCoordinate(rect.left + x, rect.top + y);
    return {x: p[0], y: p[1]};
  }

  sceneToLonLat(point) {
    this.grid.getProjector();
    return this.grid.projector.invert([point.x, -point.y]);
  }

  // Selection ----------------------------------------------------------------

  pick(e) {
    let p = {x: e.x, y: e.y};
    let renderer = this.scene.getRenderer();
    let o = renderer.getClientCoordinate(0, 0);
    let ex = renderer.getClientCoordinate(1, 0);
    let tolerance = PICK_TOLERANCE / (Math.hypot(ex.x - o.x, ex.y - o.y) || 1);

    let found = null;
    if (!this.roadsLayer.hidden) {
      let way = this.getIndex('roads').nearest(p, tolerance);
      if (way) found = {layer: 'roads', way};
    }
    if (!found && this.parcels.layer && !this.parcels.layer.hidden) {
      let index = this.getIndex('parcels');
      let way = index.nearest(p, tolerance) || index.containing(p);
      if (way) found = {layer: 'parcels', way};
    }
    this.selectFeature(found);
  }

  getIndex(layer) {
    let index = this.indexes.get(layer);
    if (!index) {
      let grid = layer === 'roads' ? this.grid : this.parcels.grid;
      index = new FeatureIndex(grid);
      this.indexes.set(layer, index);
    }
    return index;
  }

  selectFeature(found) {
    if (!found) {
      this.selection.setFeature(null);
      this.callbacks.onFeature(null);
      return;
    }
    let element = found.way.element;
    let closed = element.nodes.length > 3 && element.nodes[0] === element.nodes[element.nodes.length - 1];
    this.selection.setFeature({points: found.way.points, closed});
    let grid = found.layer === 'roads' ? this.grid : this.parcels.grid;
    let lonLats = element.nodes.map(id => grid.nodes.get(id)).filter(Boolean).map(n => [n.lon, n.lat]);
    this.callbacks.onFeature({
      layer: found.layer,
      id: element.id,
      tags: Object.assign({}, element.tags),
      hasTags: Boolean(element.tags),
      closed,
      lonLats,
      source: this.getElementSource(found.layer, element)
    });
  }

  clearFeature() {
    if (this.selection) this.selection.setFeature(null);
    this.callbacks.onFeature(null);
  }

  getElementSource(layer, element) {
    if (layer === 'parcels') return 'osm';
    let source = this.grid.queryBounds && this.grid.queryBounds.source;
    if (source === 'both') return element.id < 0 ? 'overture' : 'osm';
    return source || 'osm';
  }

  /**
   * Sets the export area from a rectangle drawn on the map, in css pixels
   * relative to the map canvas.
   */
  setAreaFromScreenRect(rect) {
    let corners = [
      this.screenToScene(rect.x, rect.y),
      this.screenToScene(rect.x + rect.width, rect.y),
      this.screenToScene(rect.x + rect.width, rect.y + rect.height),
      this.screenToScene(rect.x, rect.y + rect.height)
    ];
    this.area = toCounterClockwise(corners);
    this.selection.setArea(this.area);
    return this.describeArea();
  }

  useViewAsArea() {
    let canvas = getCanvas();
    return this.setAreaFromScreenRect({x: 0, y: 0, width: canvas.clientWidth, height: canvas.clientHeight});
  }

  clearArea() {
    this.area = null;
    if (this.selection) this.selection.setArea(null);
  }

  setDraft(rect) {
    if (this.selection) this.selection.setDraft(rect);
  }

  describeArea() {
    if (!this.area) return null;
    let lonLats = this.area.map(p => this.sceneToLonLat(p));
    let lons = lonLats.map(p => p[0]), lats = lonLats.map(p => p[1]);
    let west = Math.min(...lons), east = Math.max(...lons);
    let south = Math.min(...lats), north = Math.max(...lats);
    let midLat = (south + north) / 2;
    let widthKm = (east - west) * 111.32 * Math.cos(midLat * Math.PI / 180);
    let heightKm = (north - south) * 110.57;
    return {west, south, east, north, widthKm, heightKm};
  }

  /**
   * Screen bounds (css pixels of the map canvas) of the export area.
   */
  getAreaScreenRect() {
    if (!this.area) return null;
    let renderer = this.scene.getRenderer();
    let points = this.area.map(p => renderer.getClientCoordinate(p.x, p.y));
    let xs = points.map(p => p.x), ys = points.map(p => p.y);
    let left = Math.min(...xs), top = Math.min(...ys);
    return {left, top, width: Math.max(...xs) - left, height: Math.max(...ys) - top};
  }

  // Exports ------------------------------------------------------------------

  exportKML(options) {
    let parcels = options.includeParcels && this.parcels.grid ? this.parcels : null;
    return toKML(options.includeStreets ? this.grid : null, {
      name: options.name,
      fileName: options.fileName,
      source: this.grid.queryBounds && this.grid.queryBounds.source,
      color: this.roadsLayer.color,
      parcels: parcels && parcels.grid,
      parcelsColor: parcels && parcels.layer && parcels.layer.color,
      area: options.onlyArea ? this.area : null
    });
  }

  renderImage(options) {
    return getPrintableCanvas(this.scene, {
      baseMap: options.baseMap,
      streetNames: options.streetNames,
      title: options.title,
      background: this.scene.background.toRgbString(),
      crop: options.onlyArea ? this.getAreaScreenRect() : null
    });
  }

  exportSVG(options) {
    return toSVG(this.scene, {
      name: options.name,
      fileName: options.fileName,
      title: options.title,
      source: this.grid.queryBounds && this.grid.queryBounds.source,
      underSVG: options.baseMap !== false && this.baseMapLayer ? this.baseMapLayer.toSVG() : '',
      extraSVG: options.streetNames !== false && this.streetNames ? this.streetNames.toSVG() : ''
    });
  }
}
