import bus from './bus.js';

const EARTH_RADIUS = 6371393; // Same scale that Grid uses for its mercator projection.
const TILE_SIZE = 256;
const MAX_TILES = 150;
const MAX_CACHED_TILES = 600;

/**
 * Raster tile providers. All of them allow cross-origin loading, so the tiles
 * can be copied into exported images.
 */
export const BASE_MAPS = {
  none: {
    name: 'Ninguno'
  },
  map: {
    name: 'Mapa',
    url: (z, x, y, retina) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${z}/${x}/${y}${retina ? '@2x' : ''}.png`,
    maxZoom: 20,
    attribution: '© CARTO'
  },
  dark: {
    name: 'Mapa oscuro',
    url: (z, x, y, retina) => `https://${'abcd'[(x + y) % 4]}.basemaps.cartocdn.com/rastertiles/dark_nolabels/${z}/${x}/${y}${retina ? '@2x' : ''}.png`,
    maxZoom: 20,
    attribution: '© CARTO'
  },
  osm: {
    name: 'OpenStreetMap',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    maxZoom: 19,
    // The data notice already credits OpenStreetMap; tiles are theirs too.
    attribution: 'Teselas © OpenStreetMap'
  },
  satellite: {
    name: 'Satélite',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    maxZoom: 19,
    attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics'
  }
};

/**
 * Draws web map tiles on a 2d canvas under the WebGL scene, so that roads
 * appear on top of a regular map. Tiles follow pan, zoom and rotation.
 */
export default class BaseMapLayer {
  constructor(scene, grid) {
    this.scene = scene;
    this.grid = grid;
    this.styleKey = 'none';
    this.tiles = new Map();
    this.pendingFrame = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'base-map';
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none', display: 'none'
    });
    let cityCanvas = document.querySelector('#canvas');
    cityCanvas.parentNode.insertBefore(this.canvas, cityCanvas);
    this.ctx = this.canvas.getContext('2d');

    this.requestRender = this.requestRender.bind(this);
    this.updateClearColor = this.updateClearColor.bind(this);
    bus.on('scene-transform', this.requestRender);
    bus.on('background-color', this.updateClearColor);
    window.addEventListener('resize', this.requestRender);
  }

  get style() {
    return BASE_MAPS[this.styleKey];
  }

  isVisible() {
    return this.styleKey !== 'none';
  }

  setStyle(styleKey) {
    if (!BASE_MAPS[styleKey]) styleKey = 'none';
    if (styleKey === this.styleKey) return;

    this.styleKey = styleKey;
    this.tiles.clear();
    this.canvas.style.display = this.isVisible() ? '' : 'none';
    this.updateClearColor();
    this.requestRender();
  }

  /**
   * The WebGL scene paints its background color over everything below it, so
   * it has to become transparent while a base map is shown.
   */
  updateClearColor() {
    let renderer = this.scene.getRenderer();
    if (this.isVisible()) {
      // The canvas uses premultiplied alpha, so transparent must be all zeros.
      renderer.setClearColor(0, 0, 0, 0);
    } else {
      let c = this.scene.background.toRgb();
      renderer.setClearColor(c.r / 0xff, c.g / 0xff, c.b / 0xff, c.a);
    }
    renderer.renderFrame(true);
  }

  requestRender() {
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.render();
    });
  }

  render() {
    let {canvas, ctx} = this;
    let cityCanvas = document.querySelector('#canvas');
    if (!cityCanvas || !this.isVisible()) return;

    if (canvas.width !== cityCanvas.width) canvas.width = cityCanvas.width;
    if (canvas.height !== cityCanvas.height) canvas.height = cityCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let cssWidth = cityCanvas.clientWidth;
    let cssHeight = cityCanvas.clientHeight;
    let pixelRatio = canvas.width / cssWidth;
    let t = getSceneToScreen(this.scene);
    let pixelsPerMeter = Math.hypot(t.a, t.b);
    if (!pixelsPerMeter) return;

    // Pick the zoom level where one tile is about TILE_SIZE css pixels on screen.
    let style = this.style;
    let z = Math.round(Math.log2(2 * Math.PI * EARTH_RADIUS * pixelsPerMeter / TILE_SIZE));
    z = Math.max(0, Math.min(style.maxZoom, z));

    let corners = [[0, 0], [cssWidth, 0], [0, cssHeight], [cssWidth, cssHeight]]
      .map(([x, y]) => this.toLonLat(screenToScene(t, x, y)));
    let range = getTileRange(corners, z);
    while (z > 0 && countTiles(range) > MAX_TILES) {
      z -= 1;
      range = getTileRange(corners, z);
    }

    ctx.setTransform(t.a * pixelRatio, t.b * pixelRatio, t.c * pixelRatio, t.d * pixelRatio, t.e * pixelRatio, t.f * pixelRatio);
    ctx.imageSmoothingEnabled = true;
    let retina = pixelRatio > 1.5;
    for (let x = range.minX; x <= range.maxX; ++x) {
      for (let y = range.minY; y <= range.maxY; ++y) {
        this.drawTile(z, x, y, retina);
      }
    }
  }

  drawTile(z, x, y, retina) {
    let tile = this.getTile(z, x, y, retina);
    if (tile.loaded) {
      this.drawImage(tile.image, z, x, y, 0, 0, tile.image.width, tile.image.height);
      return;
    }

    // While the tile is loading, show a cropped part of an already loaded parent.
    for (let up = 1; up <= 4 && z - up >= 0; ++up) {
      let scale = 1 << up;
      let parent = this.tiles.get(tileKey(z - up, x >> up, y >> up, retina));
      if (parent && parent.loaded) {
        let size = parent.image.width / scale;
        this.drawImage(parent.image, z, x, y, (x % scale) * size, (y % scale) * size, size, size);
        return;
      }
    }
  }

  drawImage(image, z, x, y, sx, sy, sw, sh) {
    let ctx = this.ctx;
    let northWest = this.project(tileToLonLat(x, y, z));
    let southEast = this.project(tileToLonLat(x + 1, y + 1, z));
    // Scene y axis points up, images go down: flip around the tile's top edge.
    let width = southEast.x - northWest.x;
    let height = northWest.y - southEast.y;
    let overlap = width / TILE_SIZE; // hides hairline seams between tiles
    ctx.save();
    ctx.transform(1, 0, 0, -1, 0, 0);
    ctx.drawImage(image, sx, sy, sw, sh, northWest.x, -northWest.y, width + overlap, height + overlap);
    ctx.restore();
  }

  getTile(z, x, y, retina) {
    let key = tileKey(z, x, y, retina);
    let tile = this.tiles.get(key);
    if (tile) return tile;

    let image = new Image();
    image.crossOrigin = 'anonymous';
    tile = {image, loaded: false};
    image.onload = () => {
      tile.loaded = true;
      this.requestRender();
    };
    image.src = this.style.url(z, x, y, retina);
    this.tiles.set(key, tile);

    if (this.tiles.size > MAX_CACHED_TILES) {
      // Maps keep insertion order, so the first key is the oldest tile.
      this.tiles.delete(this.tiles.keys().next().value);
    }
    return tile;
  }

  project(lonLat) {
    return this.grid.getProjector()({lon: lonLat[0], lat: lonLat[1]});
  }

  toLonLat(scenePoint) {
    this.grid.getProjector(); // makes sure the projector exists
    return this.grid.projector.invert([scenePoint.x, -scenePoint.y]);
  }

  /**
   * Returns the current base map as an svg <image>, in the pixel coordinates
   * of the svg export.
   */
  toSVG() {
    if (!this.isVisible()) return '';
    let {width, height} = this.canvas;
    return `<image x="0" y="0" width="${width}" height="${height}" href="${this.canvas.toDataURL('image/png')}" />`;
  }

  dispose() {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    bus.off('scene-transform', this.requestRender);
    bus.off('background-color', this.updateClearColor);
    window.removeEventListener('resize', this.requestRender);
    this.tiles.clear();
    this.canvas.remove();
  }
}

/**
 * The camera only pans, zooms and rotates around z, so the mapping from scene
 * coordinates to css pixels is affine: screen = (a*x + c*y + e, b*x + d*y + f).
 */
function getSceneToScreen(scene) {
  let renderer = scene.getRenderer();
  let o = renderer.getClientCoordinate(0, 0);
  let ex = renderer.getClientCoordinate(1, 0);
  let ey = renderer.getClientCoordinate(0, 1);
  return {a: ex.x - o.x, b: ex.y - o.y, c: ey.x - o.x, d: ey.y - o.y, e: o.x, f: o.y};
}

function screenToScene(t, x, y) {
  let det = t.a * t.d - t.b * t.c;
  let dx = x - t.e, dy = y - t.f;
  return {
    x: (t.d * dx - t.c * dy) / det,
    y: (t.a * dy - t.b * dx) / det
  };
}

function getTileRange(lonLats, z) {
  let n = 1 << z;
  let xs = lonLats.map(([lon]) => lonToTileX(lon, z));
  let ys = lonLats.map(([, lat]) => latToTileY(lat, z));
  return {
    minX: clamp(Math.floor(Math.min(...xs)), 0, n - 1),
    maxX: clamp(Math.floor(Math.max(...xs)), 0, n - 1),
    minY: clamp(Math.floor(Math.min(...ys)), 0, n - 1),
    maxY: clamp(Math.floor(Math.max(...ys)), 0, n - 1)
  };
}

function countTiles(range) {
  return (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
}

function lonToTileX(lon, z) {
  return (lon + 180) / 360 * (1 << z);
}

function latToTileY(lat, z) {
  lat = clamp(lat, -85.0511, 85.0511);
  let rad = lat * Math.PI / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * (1 << z);
}

function tileToLonLat(x, y, z) {
  let n = 1 << z;
  let lon = x / n * 360 - 180;
  let lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI;
  return [lon, lat];
}

function tileKey(z, x, y, retina) {
  return z + '/' + x + '/' + y + (retina ? '@2x' : '');
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
