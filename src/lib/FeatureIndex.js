import {distanceToSegment, insidePolygon} from './geometry.js';

/**
 * Spatial hash of the segments of a grid, in scene coordinates, so a click on
 * the map can find the street or parcel under the cursor without scanning a
 * whole city. It is built lazily, on the first click.
 */
export default class FeatureIndex {
  constructor(grid) {
    this.grid = grid;
    this.cells = new Map();
    this.ways = [];

    let project = grid.getProjector();
    let rect = grid.getProjectedRect();
    // About 256 cells across the longest side keeps buckets small.
    this.cellSize = Math.max(20, Math.max(rect.width, rect.height) / 256);

    grid.forEachElement(element => {
      if (element.type !== 'way' || !element.nodes) return;
      let points = [];
      element.nodes.forEach(id => {
        let node = grid.nodes.get(id);
        if (node) points.push(project(node));
      });
      if (points.length < 2) return;
      let index = this.ways.length;
      this.ways.push({element, points});
      for (let i = 0; i + 1 < points.length; ++i) this.addSegment(index, points[i], points[i + 1]);
    });
  }

  key(cx, cy) {
    return cx * 1048576 + cy;
  }

  addSegment(wayIndex, a, b) {
    let size = this.cellSize;
    let minX = Math.floor(Math.min(a.x, b.x) / size), maxX = Math.floor(Math.max(a.x, b.x) / size);
    let minY = Math.floor(Math.min(a.y, b.y) / size), maxY = Math.floor(Math.max(a.y, b.y) / size);
    for (let cx = minX; cx <= maxX; ++cx) {
      for (let cy = minY; cy <= maxY; ++cy) {
        let key = this.key(cx, cy);
        let bucket = this.cells.get(key);
        if (!bucket) this.cells.set(key, bucket = new Set());
        bucket.add(wayIndex);
      }
    }
  }

  candidates(p, radius) {
    let size = this.cellSize;
    let found = new Set();
    let minX = Math.floor((p.x - radius) / size), maxX = Math.floor((p.x + radius) / size);
    let minY = Math.floor((p.y - radius) / size), maxY = Math.floor((p.y + radius) / size);
    for (let cx = minX; cx <= maxX; ++cx) {
      for (let cy = minY; cy <= maxY; ++cy) {
        let bucket = this.cells.get(this.key(cx, cy));
        if (bucket) bucket.forEach(i => found.add(i));
      }
    }
    return found;
  }

  /**
   * Closest way to `p` within `radius` scene units, or null.
   */
  nearest(p, radius) {
    let best = null;
    let bestDistance = radius;
    this.candidates(p, radius).forEach(i => {
      let {points} = this.ways[i];
      for (let k = 0; k + 1 < points.length; ++k) {
        let d = distanceToSegment(p, points[k].x, points[k].y, points[k + 1].x, points[k + 1].y);
        if (d <= bestDistance) {
          bestDistance = d;
          best = this.ways[i];
        }
      }
    });
    return best;
  }

  /**
   * Smallest closed way that contains `p`, or null. Used for parcels.
   */
  containing(p) {
    let best = null;
    let bestSize = Infinity;
    // A polygon contains p only if one of its edges crosses p's row; checking
    // the buckets of a wide row would be slow, so look at nearby cells and
    // grow the radius a few times.
    for (let radius = this.cellSize; radius <= this.cellSize * 8 && !best; radius *= 2) {
      this.candidates(p, radius).forEach(i => {
        let way = this.ways[i];
        let nodes = way.element.nodes;
        if (nodes.length < 4 || nodes[0] !== nodes[nodes.length - 1]) return;
        if (!insidePolygon(p, way.points)) return;
        let size = boundsSize(way.points);
        if (size < bestSize) {
          bestSize = size;
          best = way;
        }
      });
    }
    return best;
  }
}

function boundsSize(points) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  points.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  return (maxX - minX) * (maxY - minY);
}
