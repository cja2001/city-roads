/**
 * Small planar geometry helpers. Everything works in scene coordinates (the
 * Mercator meters the map is drawn in), where the selection rectangle is a
 * true convex polygon.
 */

/** Signed area; positive when the polygon is counter-clockwise. */
export function signedArea(points) {
  let sum = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    sum += (points[j].x * points[i].y) - (points[i].x * points[j].y);
  }
  return sum / 2;
}

/** Makes a convex polygon counter-clockwise, so "inside" is on the left of every edge. */
export function toCounterClockwise(points) {
  return signedArea(points) < 0 ? points.slice().reverse() : points.slice();
}

function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

/** True when `p` is inside (or on the border of) a counter-clockwise convex polygon. */
export function insideConvex(p, poly) {
  for (let i = 0; i < poly.length; ++i) {
    let a = poly[i], b = poly[(i + 1) % poly.length];
    if (cross(b.x - a.x, b.y - a.y, p.x - a.x, p.y - a.y) < 0) return false;
  }
  return true;
}

/** Ray casting point-in-polygon test, for any simple polygon. */
export function insidePolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    let a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Cyrus-Beck clipping of the segment a-b to a counter-clockwise convex
 * polygon. Returns [t0, t1] (the part of the segment that is inside) or null.
 */
function clipSegment(a, b, poly) {
  let t0 = 0, t1 = 1;
  let dx = b.x - a.x, dy = b.y - a.y;
  for (let i = 0; i < poly.length; ++i) {
    let p = poly[i], q = poly[(i + 1) % poly.length];
    let ex = q.x - p.x, ey = q.y - p.y;
    // Positive values are inside (left of the edge).
    let start = cross(ex, ey, a.x - p.x, a.y - p.y);
    let change = cross(ex, ey, dx, dy);
    if (change === 0) {
      if (start < 0) return null;
      continue;
    }
    let t = -start / change;
    if (change > 0) {
      if (t > t0) t0 = t; // entering
    } else if (t < t1) {
      t1 = t; // leaving
    }
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

function lerp(a, b, t) {
  if (t === 0) return a;
  if (t === 1) return b;
  return {x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t};
}

/**
 * Clips a polyline to a convex polygon. A line that leaves and re-enters the
 * polygon becomes several pieces. Returns an array of polylines with at least
 * two points each.
 */
export function clipPolyline(points, poly) {
  let pieces = [];
  let current = null;
  for (let i = 0; i + 1 < points.length; ++i) {
    let a = points[i], b = points[i + 1];
    let range = clipSegment(a, b, poly);
    if (!range) {
      if (current) pieces.push(current);
      current = null;
      continue;
    }
    let [t0, t1] = range;
    if (current && t0 === 0) {
      current.push(lerp(a, b, t1));
    } else {
      if (current) pieces.push(current);
      current = [lerp(a, b, t0), lerp(a, b, t1)];
    }
    if (t1 < 1) {
      pieces.push(current);
      current = null;
    }
  }
  if (current) pieces.push(current);
  return pieces.filter(piece => piece.length > 1 && !isDegenerate(piece));
}

function isDegenerate(piece) {
  let first = piece[0];
  return piece.every(p => p.x === first.x && p.y === first.y);
}

/**
 * Sutherland-Hodgman clipping of a polygon ring (first point not repeated) to
 * a counter-clockwise convex polygon. Returns the clipped ring, which may be
 * empty.
 */
export function clipPolygon(ring, poly) {
  let output = ring;
  for (let i = 0; i < poly.length && output.length; ++i) {
    let p = poly[i], q = poly[(i + 1) % poly.length];
    let ex = q.x - p.x, ey = q.y - p.y;
    let input = output;
    output = [];
    for (let j = 0; j < input.length; ++j) {
      let current = input[j];
      let previous = input[(j + input.length - 1) % input.length];
      let currentSide = cross(ex, ey, current.x - p.x, current.y - p.y);
      let previousSide = cross(ex, ey, previous.x - p.x, previous.y - p.y);
      if (currentSide >= 0) {
        if (previousSide < 0) output.push(intersect(previous, current, previousSide, currentSide));
        output.push(current);
      } else if (previousSide >= 0) {
        output.push(intersect(previous, current, previousSide, currentSide));
      }
    }
  }
  return output;
}

function intersect(a, b, sideA, sideB) {
  return lerp(a, b, sideA / (sideA - sideB));
}

/** Distance from point p to segment a-b. */
export function distanceToSegment(p, ax, ay, bx, by) {
  let dx = bx - ax, dy = by - ay;
  let lengthSquared = dx * dx + dy * dy;
  let t = lengthSquared ? ((p.x - ax) * dx + (p.y - ay) * dy) / lengthSquared : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

/**
 * Great-circle distance between two [lon, lat] points in meters.
 */
export function haversine(a, b) {
  let R = 6371008.8;
  let toRad = Math.PI / 180;
  let dLat = (b[1] - a[1]) * toRad;
  let dLon = (b[0] - a[0]) * toRad;
  let s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Approximate area in square meters of a ring of [lon, lat] points, using an
 * equirectangular projection around its first point (good for parcels).
 */
export function ringArea(lonLats) {
  if (lonLats.length < 3) return 0;
  let toRad = Math.PI / 180;
  let R = 6371008.8;
  let cos = Math.cos(lonLats[0][1] * toRad);
  let points = lonLats.map(([lon, lat]) => ({x: lon * toRad * R * cos, y: lat * toRad * R}));
  return Math.abs(signedArea(points));
}
