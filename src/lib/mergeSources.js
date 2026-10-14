import {segmentsToElements} from './overtureQuery.js';

// Overture roads closer than this to an OpenStreetMap road are the same road.
const SAME_ROAD_METERS = 8;
// Share of an Overture road's points that must lie on OpenStreetMap roads for
// it to count as a copy.
const SAME_ROAD_SHARE = 0.8;
// Points are checked along Overture roads at least this often.
const SAMPLE_METERS = 10;
const CELL_DEGREES = 0.0005; // ~55 m
const METERS_PER_DEGREE = 111320;

/**
 * Combines OpenStreetMap elements (from Overpass) with Overture segments
 * (from /api/overture) without duplicating roads:
 *
 *  - OpenStreetMap roads are all kept, with their tags.
 *  - Most Overture roads are OpenStreetMap ways (their `osmWayIds` say which).
 *    Those already downloaded are skipped, but their name fills in the
 *    OpenStreetMap way when it has none.
 *  - The remaining Overture roads (from TomTom, Microsoft..., or ways missing
 *    from the OpenStreetMap download) are added, unless they run along an
 *    OpenStreetMap road anyway, which catches ways that were split or redrawn.
 *
 * Returns {elements, added, named}.
 */
export default function mergeSources(osmElements, overtureSegments) {
  let osmNodes = new Map();
  let osmWays = new Map();
  osmElements.forEach(el => {
    if (el.type === 'node') osmNodes.set(el.id, el);
    else if (el.type === 'way') osmWays.set(el.id, el);
  });

  let named = 0;
  let candidates = [];
  overtureSegments.forEach(segment => {
    let ids = segment[2] || [];
    let known = ids.filter(id => osmWays.has(id));
    if (!known.length) {
      candidates.push(segment);
      return;
    }
    let name = segment[0];
    if (!name) return;
    known.forEach(id => {
      let way = osmWays.get(id);
      if (way.tags && way.tags.name) return;
      way.tags = Object.assign({}, way.tags, {name});
      named += 1;
    });
  });

  let index = new SegmentIndex(osmWays, osmNodes);
  let extra = segmentsToElements(candidates);
  let extraNodes = new Map();
  extra.forEach(el => { if (el.type === 'node') extraNodes.set(el.id, el); });

  let added = [];
  let usedNodes = new Set();
  extra.forEach(el => {
    if (el.type !== 'way') return;
    let points = el.nodes.map(id => extraNodes.get(id));
    if (index.covers(points)) return;
    added.push(el);
    el.nodes.forEach(id => usedNodes.add(id));
  });

  let elements = osmElements.slice();
  extraNodes.forEach((node, id) => { if (usedNodes.has(id)) elements.push(node); });
  return {elements: elements.concat(added), added: added.length, named};
}

class SegmentIndex {
  constructor(ways, nodes) {
    this.cells = new Map();
    ways.forEach(way => {
      for (let i = 1; i < way.nodes.length; ++i) {
        let a = nodes.get(way.nodes[i - 1]);
        let b = nodes.get(way.nodes[i]);
        if (a && b) this.add(a, b);
      }
    });
  }

  add(a, b) {
    let pad = SAME_ROAD_METERS / METERS_PER_DEGREE / Math.max(0.2, Math.cos(a.lat * Math.PI / 180));
    let x0 = cell(Math.min(a.lon, b.lon) - pad), x1 = cell(Math.max(a.lon, b.lon) + pad);
    let y0 = cell(Math.min(a.lat, b.lat) - pad), y1 = cell(Math.max(a.lat, b.lat) + pad);
    for (let x = x0; x <= x1; ++x) {
      for (let y = y0; y <= y1; ++y) {
        let key = x + ',' + y;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, list = []);
        list.push(a, b);
      }
    }
  }

  near(lon, lat) {
    let list = this.cells.get(cell(lon) + ',' + cell(lat));
    if (!list) return false;
    let kx = METERS_PER_DEGREE * Math.cos(lat * Math.PI / 180);
    let ky = METERS_PER_DEGREE;
    for (let i = 0; i < list.length; i += 2) {
      let a = list[i], b = list[i + 1];
      if (distanceToSegment(lon * kx, lat * ky, a.lon * kx, a.lat * ky, b.lon * kx, b.lat * ky) <= SAME_ROAD_METERS) {
        return true;
      }
    }
    return false;
  }

  /** True when most of the line runs along roads already in the index. */
  covers(points) {
    let total = 0;
    let near = 0;
    let check = (lon, lat) => {
      total += 1;
      if (this.near(lon, lat)) near += 1;
    };
    check(points[0].lon, points[0].lat);
    for (let i = 1; i < points.length; ++i) {
      let a = points[i - 1], b = points[i];
      let meters = Math.hypot((b.lon - a.lon) * METERS_PER_DEGREE * Math.cos(a.lat * Math.PI / 180),
        (b.lat - a.lat) * METERS_PER_DEGREE);
      let steps = Math.max(1, Math.ceil(meters / SAMPLE_METERS));
      for (let s = 1; s <= steps; ++s) {
        let t = s / steps;
        check(a.lon + (b.lon - a.lon) * t, a.lat + (b.lat - a.lat) * t);
      }
    }
    return near >= SAME_ROAD_SHARE * total;
  }
}

function cell(degrees) {
  return Math.floor(degrees / CELL_DEGREES);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  let dx = bx - ax, dy = by - ay;
  let length2 = dx * dx + dy * dy;
  let t = length2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
