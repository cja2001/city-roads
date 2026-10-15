import {PMTiles} from 'pmtiles';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

/**
 * Overture "base" theme (land, water, land cover, land use) drawn as a map.
 *
 * Overture publishes the theme as one PMTiles archive per release, with
 * vector tiles (MVT) up to zoom 13. Releases are deleted after about 60 days,
 * so the newest one is looked up in the bucket instead of being hardcoded.
 */
const BUCKET = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com';
const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const SOURCE_MAX_ZOOM = 13; // deeper zooms are drawn from the zoom 13 tile
const TILE_SIZE = 256;
const MAX_DECODED = 24;

let archive = null; // Promise<PMTiles>
const decoded = new Map(); // "z/x/y" -> Promise<VectorTile | null>

const BACKGROUND = '#f2efe9';

const LAND_COVER = {
  forest: '#cfe3be', grass: '#dcebc9', shrub: '#d8e6c2', crop: '#eeebcd', barren: '#ece3cb',
  snow: '#fbfcfd', wetland: '#cde6da', mangrove: '#c3dcc0', moss: '#d9e7cf', urban: '#e9e5de'
};

const LAND = {
  forest: '#cfe3be', tree: '#cfe3be', grass: '#dcebc9', shrub: '#d8e6c2', desert: '#efe5c8',
  sand: '#f0e6c8', rock: '#e4dfd6', glacier: '#fbfcfd', wetland: '#cde6da', reef: '#bfe0e6'
};

const LAND_USE = {
  park: '#cbe6bd', recreation: '#d3e8c4', golf: '#d3e8c4', protected: '#d6e6c8', campground: '#d3e8c4',
  cemetery: '#d4e3d0', agriculture: '#eef0d4', horticulture: '#e6efcc', education: '#efe9d3',
  entertainment: '#eadfe4', medical: '#f1dcd8', religious: '#e7e2d8', residential: '#ebe6df',
  developed: '#e8e3dc', construction: '#e1ddd2', resource_extraction: '#e2ddd3', landfill: '#e2ddd3',
  transportation: '#e5e2dc', pedestrian: '#f7f5f0', airport: '#e5e2dc'
};

const WATER = '#a9d3e6';
const INFRASTRUCTURE = '#dedad2';

// Bathymetry depth (meters) to color, shallow to deep.
const DEPTHS = [[10, '#b4d9ea'], [200, '#aed3e5'], [1000, '#a6cde0'], [4000, '#9ec6db'], [Infinity, '#97bfd5']];

/**
 * Draws one tile (z, x, y) of the base map and resolves with a canvas.
 * Resolves with a background-only canvas where Overture has no tile.
 */
export async function renderOvertureTile(z, x, y, retina) {
  let overzoom = Math.max(0, z - SOURCE_MAX_ZOOM);
  let sourceZoom = z - overzoom;
  let sx = x >> overzoom;
  let sy = y >> overzoom;
  let tile = await getVectorTile(sourceZoom, sx, sy);

  let size = TILE_SIZE * (retina ? 2 : 1);
  let canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  let ctx = canvas.getContext('2d');
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, size, size);
  if (!tile) return canvas;

  // Position of the requested tile inside the source tile, in output pixels.
  let offsetX = (x - (sx << overzoom)) * size;
  let offsetY = (y - (sy << overzoom)) * size;
  let zoomScale = 1 << overzoom;
  let pixel = size / TILE_SIZE;

  drawLayer(ctx, tile, 'bathymetry', feature => ({fill: depthColor(feature.properties.depth)}), {size, offsetX, offsetY, zoomScale});
  drawLayer(ctx, tile, 'land_cover', feature => ({fill: LAND_COVER[feature.properties.subtype]}), {size, offsetX, offsetY, zoomScale});
  drawLayer(ctx, tile, 'land', feature => ({fill: LAND[feature.properties.subtype] || LAND[feature.properties.class]}), {size, offsetX, offsetY, zoomScale});
  drawLayer(ctx, tile, 'land_use', feature => ({fill: LAND_USE[feature.properties.subtype] || LAND_USE[feature.properties.class]}), {size, offsetX, offsetY, zoomScale});
  drawLayer(ctx, tile, 'water', () => ({fill: WATER, stroke: WATER, lineWidth: riverWidth(z) * pixel}), {size, offsetX, offsetY, zoomScale});
  drawLayer(ctx, tile, 'infrastructure', () => ({fill: INFRASTRUCTURE}), {size, offsetX, offsetY, zoomScale});
  return canvas;
}

function drawLayer(ctx, tile, name, getStyle, {size, offsetX, offsetY, zoomScale}) {
  let layer = tile.layers[name];
  if (!layer) return;

  // MVT coordinates (0..extent) to canvas pixels of the requested tile.
  let k = size * zoomScale / layer.extent;
  for (let i = 0; i < layer.length; ++i) {
    let feature = layer.feature(i);
    if (feature.type === 1) continue; // points carry no area to paint

    let style = getStyle(feature);
    let isPolygon = feature.type === 3;
    if (isPolygon ? !style.fill : !style.stroke) continue;

    ctx.beginPath();
    for (let ring of feature.loadGeometry()) {
      for (let j = 0; j < ring.length; ++j) {
        let px = ring[j].x * k - offsetX;
        let py = ring[j].y * k - offsetY;
        if (j === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      if (isPolygon) ctx.closePath();
    }

    if (isPolygon) {
      ctx.fillStyle = style.fill;
      ctx.fill('evenodd');
    } else {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = style.lineWidth;
      ctx.lineJoin = ctx.lineCap = 'round';
      ctx.stroke();
    }
  }
}

function depthColor(depth) {
  for (let [limit, color] of DEPTHS) if (!(depth > limit)) return color;
  return DEPTHS[DEPTHS.length - 1][1];
}

function riverWidth(z) {
  return Math.max(0.6, Math.min(5, (z - 7) * 0.5));
}

function getVectorTile(z, x, y) {
  let key = z + '/' + x + '/' + y;
  if (decoded.has(key)) return decoded.get(key);

  let promise = loadArchive().then(async pmtiles => {
    let response = await pmtiles.getZxy(z, x, y);
    return response ? new VectorTile(new Pbf(new Uint8Array(response.data))) : null;
  });
  decoded.set(key, promise);
  // A failed request must not stay cached, or the tile would never retry.
  promise.catch(() => decoded.delete(key));
  if (decoded.size > MAX_DECODED) decoded.delete(decoded.keys().next().value);
  return promise;
}

function loadArchive() {
  if (!archive) {
    archive = openLatestArchive();
    archive.catch(() => { archive = null; });
  }
  return archive;
}

async function openLatestArchive() {
  let releases = await listReleases();
  let lastError = new Error('No Overture base tiles found');
  // The newest release can still be uploading, so fall back to older ones.
  for (let release of releases) {
    try {
      let pmtiles = new PMTiles(`${BUCKET}/tiles/${release}/base.pmtiles`);
      await pmtiles.getHeader();
      return pmtiles;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

async function listReleases() {
  let response = await fetch(`${BUCKET}/?list-type=2&prefix=tiles/&delimiter=/`);
  if (!response.ok) throw new Error(`Overture release listing failed (${response.status})`);
  let xml = await response.text();
  return [...xml.matchAll(/<Prefix>tiles\/([^/<]+)\/<\/Prefix>/g)]
    .map(match => match[1])
    .filter(name => RELEASE_PATTERN.test(name))
    .sort(compareReleases)
    .reverse();
}

// "2026-09-23.1" > "2026-09-23.0" > "2026-08-19.0", and ".10" > ".9".
function compareReleases(a, b) {
  let [dateA, buildA] = a.split('.');
  let [dateB, buildB] = b.split('.');
  return dateA === dateB ? Number(buildA) - Number(buildB) : (dateA < dateB ? -1 : 1);
}
