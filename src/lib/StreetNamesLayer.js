import postData from './postData.js';
import Progress from './Progress.js';
import bus from './bus.js';
import tinycolor from 'tinycolor2';

/**
 * Only roads that people usually refer to by name. Footways, service roads and
 * tracks are skipped: they add a lot of noise and rarely have names anyway.
 */
const NAMED_ROADS = 'way[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)(_link)?$"][name]';

const NAMED_HIGHWAY = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|pedestrian)(_link)?$/;

const RANK = {
  motorway: 6, trunk: 6, primary: 5, secondary: 4, tertiary: 3,
  unclassified: 2, residential: 2, living_street: 1, pedestrian: 1
};

// How far (in meters) a street may bend before we start a new straight label run.
const BEND_TOLERANCE = 8;
const MIN_RUN_LENGTH = 25;
const MAX_LABELS = 500;
const CELL_SIZE = 6;

/**
 * Downloads street names for the area of a grid and draws them on a 2d canvas
 * that sits on top of the WebGL scene. Labels are placed along the straightest
 * part of each street and follow the camera when the map is panned, zoomed or rotated.
 */
export default class StreetNamesLayer {
  constructor(scene, grid, options = {}) {
    this.scene = scene;
    this.grid = grid;
    this.candidates = [];
    this.labels = [];
    this.hidden = false;
    this.status = 'idle';
    this.onStatus = options.onStatus || Function.prototype;
    this._color = tinycolor(options.color || '#161616');
    this.textWidthCache = new Map();
    this.pendingFrame = 0;
    this.progress = null;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'street-names';
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none'
    });
    let cityCanvas = document.querySelector('#canvas');
    cityCanvas.parentNode.insertBefore(this.canvas, cityCanvas.nextSibling);
    this.ctx = this.canvas.getContext('2d');

    this.requestRender = this.requestRender.bind(this);
    bus.on('scene-transform', this.requestRender);
    bus.on('background-color', this.requestRender);
    window.addEventListener('resize', this.requestRender);
  }

  get color() {
    return this._color;
  }

  set color(newColor) {
    this._color = tinycolor(newColor);
    this.requestRender();
  }

  load() {
    // Roads downloaded straight from OpenStreetMap already carry their tags, so
    // the names are there and no second request is needed. Cached cities only
    // have geometry and need to ask Overpass for names.
    if (this.grid.elements.some(element => element.type === 'way' && element.tags)) {
      this.setWays(this.grid.elements);
      this.setStatus(this.candidates.length ? 'ready' : 'empty');
      return Promise.resolve();
    }

    this.setStatus('loading');
    this.progress = new Progress();
    return postData(this.getQuery(), this.progress).then(response => {
      if (!response || !response.elements) throw new Error('Invalid response from OpenStreetMap');
      this.setWays(response.elements);
      this.setStatus(this.candidates.length ? 'ready' : 'empty');
    }).catch(err => {
      if (err.cancelled) return;
      console.error('Could not load street names', err);
      this.setStatus('error');
    });
  }

  getQuery() {
    let grid = this.grid;
    if (grid.isArea && grid.id) {
      return `[timeout:180][out:json];
area(${grid.id})->.a;
${NAMED_ROADS}(area.a);
out body;`;
    }
    if (grid.bboxString) {
      return `[timeout:180][out:json][bbox:${grid.bboxString}];
${NAMED_ROADS};
out body;`;
    }
    throw new Error('Cannot figure out the area of this grid');
  }

  /**
   * Turns OSM ways into straight label candidates. Node positions are taken from
   * the grid, so the names line up exactly with the roads that are drawn.
   */
  setWays(elements) {
    let project = this.grid.getProjector();
    let nodes = this.grid.nodes;
    let candidates = [];

    let namedWays = elements.filter(way => way.type === 'way' && way.nodes &&
      way.tags && way.tags.name && NAMED_HIGHWAY.test(way.tags.highway || ''));

    joinWaysByName(namedWays).forEach(street => {
      let points = [];
      street.nodes.forEach(id => {
        let node = nodes.get(id);
        if (node) points.push(project(node));
      });
      if (points.length < 2) return;

      splitIntoStraightRuns(points).forEach(run => {
        candidates.push({name: street.name, rank: street.rank, ...run});
      });
    });

    candidates.sort((a, b) => (b.rank - a.rank) || (b.length - a.length));
    this.candidates = candidates;
    this.requestRender();
  }

  setStatus(status) {
    this.status = status;
    this.onStatus(status);
  }

  hide() {
    this.hidden = true;
    this.canvas.style.display = 'none';
  }

  show() {
    this.hidden = false;
    this.canvas.style.display = '';
    this.requestRender();
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
    if (!cityCanvas) return;

    // Match the WebGL canvas pixel size so exports can simply copy this canvas.
    if (canvas.width !== cityCanvas.width) canvas.width = cityCanvas.width;
    if (canvas.height !== cityCanvas.height) canvas.height = cityCanvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.labels = [];
    if (this.hidden || !this.candidates.length) return;

    let cssWidth = cityCanvas.clientWidth;
    let cssHeight = cityCanvas.clientHeight;
    let pixelRatio = canvas.width / cssWidth;

    // The camera only pans, zooms and rotates around z, so the mapping from
    // scene coordinates to the screen is affine. Three points are enough.
    let renderer = this.scene.getRenderer();
    let o = renderer.getClientCoordinate(0, 0);
    let ex = renderer.getClientCoordinate(1, 0);
    let ey = renderer.getClientCoordinate(0, 1);
    let a = ex.x - o.x, b = ex.y - o.y, c = ey.x - o.x, d = ey.y - o.y;
    let pixelsPerMeter = Math.hypot(a, b);

    let cols = Math.ceil(cssWidth / CELL_SIZE), rows = Math.ceil(cssHeight / CELL_SIZE);
    let occupied = new Uint8Array(cols * rows);
    let placedCenters = new Map();
    let labels = this.labels;

    for (let i = 0; i < this.candidates.length && labels.length < MAX_LABELS; ++i) {
      let candidate = this.candidates[i];
      if (candidate.length * pixelsPerMeter < 30) continue;

      let fontSize = candidate.rank >= 5 ? 13 : 11;
      let textWidth = this.measure(candidate.name, fontSize);
      let half = candidate.length / 2;
      let x1 = candidate.cx - candidate.dx * half, y1 = candidate.cy - candidate.dy * half;
      let x2 = candidate.cx + candidate.dx * half, y2 = candidate.cy + candidate.dy * half;
      let visible = clipToRect(
        o.x + a * x1 + c * y1, o.y + b * x1 + d * y1,
        o.x + a * x2 + c * y2, o.y + b * x2 + d * y2,
        cssWidth, cssHeight
      );
      if (!visible) continue;

      let vx = visible[2] - visible[0], vy = visible[3] - visible[1];
      let visibleLength = Math.hypot(vx, vy);
      if (textWidth + 10 > visibleLength) continue;

      let angle = Math.atan2(vy, vx);
      // Keep text readable: never upside down.
      if (angle > Math.PI / 2) angle -= Math.PI;
      else if (angle < -Math.PI / 2) angle += Math.PI;

      // Long streets get a label every `spacing` pixels, starting from the middle
      // of their visible part.
      let spacing = Math.max(300, textWidth * 4);
      let room = (visibleLength - textWidth - 10) / 2;
      let offsets = [0];
      for (let k = spacing; k <= room; k += spacing) offsets.push(k, -k);

      let sameName = placedCenters.get(candidate.name);
      if (!sameName) placedCenters.set(candidate.name, sameName = []);

      offsets.forEach(offset => {
        let t = 0.5 + offset / visibleLength;
        let cx = visible[0] + vx * t;
        let cy = visible[1] + vy * t;
        if (sameName.some(p => Math.hypot(p.x - cx, p.y - cy) < spacing)) return;

        let cells = collectCells(cx, cy, angle, textWidth + 8, fontSize + 4, cols, rows);
        if (!cells || cells.some(cell => occupied[cell])) return;
        cells.forEach(cell => occupied[cell] = 1);

        sameName.push({x: cx, y: cy});
        labels.push({text: candidate.name, x: cx, y: cy, angle, fontSize});
      });
    }

    let halo = tinycolor(this.scene.background).clone().setAlpha(0.85).toRgbString();
    let fill = this._color.toRgbString();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    labels.forEach(label => {
      ctx.save();
      ctx.translate(label.x, label.y);
      ctx.rotate(label.angle);
      ctx.font = getFont(label.fontSize);
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(label.text, 0, 0);
      ctx.fillStyle = fill;
      ctx.fillText(label.text, 0, 0);
      ctx.restore();
    });
  }

  measure(text, fontSize) {
    let key = fontSize + '|' + text;
    let width = this.textWidthCache.get(key);
    if (width === undefined) {
      this.ctx.font = getFont(fontSize);
      width = this.ctx.measureText(text).width;
      this.textWidthCache.set(key, width);
    }
    return width;
  }

  /**
   * Returns the labels that are currently visible as svg <text> elements, in
   * the same pixel coordinates the svg export uses.
   */
  toSVG() {
    if (this.hidden || !this.labels.length) return '';
    let pixelRatio = this.canvas.width / this.canvas.clientWidth || 1;
    let fill = this._color.toRgbString();
    let halo = tinycolor(this.scene.background).toRgbString();
    let texts = this.labels.map(label => {
      let x = (label.x * pixelRatio).toFixed(1);
      let y = (label.y * pixelRatio).toFixed(1);
      let degrees = (label.angle * 180 / Math.PI).toFixed(2);
      return `<text x="${x}" y="${y}" transform="rotate(${degrees} ${x} ${y})" font-size="${label.fontSize * pixelRatio}">${escapeXML(label.text)}</text>`;
    }).join('\n');
    return `<g font-family="Helvetica, Arial, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${fill}" stroke="${halo}" stroke-width="${3 * pixelRatio}" paint-order="stroke" stroke-linejoin="round">
${texts}
</g>`;
  }

  dispose() {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    if (this.progress) this.progress.cancel();
    bus.off('scene-transform', this.requestRender);
    bus.off('background-color', this.requestRender);
    window.removeEventListener('resize', this.requestRender);
    this.canvas.remove();
  }
}

function getFont(fontSize) {
  return fontSize + 'px Helvetica, Arial, sans-serif';
}

/**
 * OpenStreetMap splits streets into many short ways (often one per block).
 * Joins ways that share a name and an end node into longer chains, so long
 * streets get labels along their whole length instead of only on long blocks.
 */
function joinWaysByName(ways) {
  let byName = new Map();
  ways.forEach(way => {
    let group = byName.get(way.tags.name);
    if (!group) byName.set(way.tags.name, group = []);
    group.push(way);
  });

  let streets = [];
  byName.forEach((group, name) => {
    let used = new Array(group.length).fill(false);
    let byEndpoint = new Map();
    group.forEach((way, index) => {
      [way.nodes[0], way.nodes[way.nodes.length - 1]].forEach(id => {
        let list = byEndpoint.get(id);
        if (!list) byEndpoint.set(id, list = []);
        list.push(index);
      });
    });

    let takeNext = (endpoint) => {
      let candidates = byEndpoint.get(endpoint) || [];
      for (let i = 0; i < candidates.length; ++i) {
        let index = candidates[i];
        if (used[index]) continue;
        used[index] = true;
        let wayNodes = group[index].nodes;
        return wayNodes[0] === endpoint ? wayNodes : wayNodes.slice().reverse();
      }
    };

    group.forEach((way, index) => {
      if (used[index]) return;
      used[index] = true;
      let chain = way.nodes.slice();
      let rank = getRank(way);
      let next;
      while ((next = takeNext(chain[chain.length - 1]))) chain.push(...next.slice(1));
      while ((next = takeNext(chain[0]))) chain.unshift(...next.slice().reverse().slice(0, -1));
      streets.push({name, rank, nodes: chain});
    });
  });
  return streets;
}

function getRank(way) {
  return RANK[way.tags.highway.replace(/_link$/, '')] || 1;
}

/**
 * Greedily splits a polyline into runs that are almost straight, and returns
 * the center, half-direction and length of every run that is long enough.
 */
function splitIntoStraightRuns(points) {
  let runs = [];
  let start = 0;
  while (start < points.length - 1) {
    let end = start + 1;
    while (end + 1 < points.length && isStraight(points, start, end + 1)) end += 1;

    let from = points[start], to = points[end];
    let length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length >= MIN_RUN_LENGTH) {
      runs.push({
        cx: (from.x + to.x) / 2,
        cy: (from.y + to.y) / 2,
        dx: (to.x - from.x) / length,
        dy: (to.y - from.y) / length,
        length
      });
    }
    start = end;
  }
  return runs;
}

function isStraight(points, start, end) {
  let from = points[start], to = points[end];
  let length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length === 0) return false;
  for (let i = start + 1; i < end; ++i) {
    let p = points[i];
    let distance = Math.abs((to.x - from.x) * (from.y - p.y) - (from.x - p.x) * (to.y - from.y)) / length;
    if (distance > BEND_TOLERANCE) return false;
  }
  return true;
}

/**
 * Collects occupancy grid cells covered by a rotated label box. Returns null
 * when part of the label is outside of the screen.
 */
function collectCells(cx, cy, angle, width, height, cols, rows) {
  let cos = Math.cos(angle), sin = Math.sin(angle);
  let cells = new Set();
  let step = CELL_SIZE / 2;
  for (let u = -width / 2; u <= width / 2; u += step) {
    for (let v = -height / 2; v <= height / 2; v += step) {
      let x = cx + u * cos - v * sin;
      let y = cy + u * sin + v * cos;
      let col = Math.floor(x / CELL_SIZE), row = Math.floor(y / CELL_SIZE);
      if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
      cells.add(row * cols + col);
    }
  }
  return Array.from(cells);
}

/**
 * Liang-Barsky clipping of a segment to the [0, width] x [0, height] rectangle.
 * Returns the clipped segment as [x1, y1, x2, y2], or null if it is outside.
 */
function clipToRect(x1, y1, x2, y2, width, height) {
  let t0 = 0, t1 = 1;
  let dx = x2 - x1, dy = y2 - y1;
  let p = [-dx, dx, -dy, dy];
  let q = [x1, width - x1, y1, height - y1];
  for (let i = 0; i < 4; ++i) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
      continue;
    }
    let r = q[i] / p[i];
    if (p[i] < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [x1 + t0 * dx, y1 + t0 * dy, x1 + t1 * dx, y1 + t1 * dy];
}

function escapeXML(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
