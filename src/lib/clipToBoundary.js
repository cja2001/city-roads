/**
 * Keeps only the ways that have at least one node inside a GeoJSON Polygon or
 * MultiPolygon, and the nodes those ways use. This gives the same result as an
 * Overpass area query, but works with a cheap bounding box query on any server.
 */
export default function clipToBoundary(elements, boundary) {
  let rings = getRings(boundary);
  if (!rings.length) return elements;

  let nodes = new Map();
  elements.forEach(el => {
    if (el.type === 'node') nodes.set(el.id, el);
  });

  let usedNodes = new Set();
  let ways = elements.filter(el => {
    if (el.type !== 'way') return false;
    let inside = el.nodes.some(id => {
      let node = nodes.get(id);
      return node && isInside(node.lon, node.lat, rings);
    });
    if (inside) el.nodes.forEach(id => usedNodes.add(id));
    return inside;
  });

  let result = [];
  nodes.forEach((node, id) => {
    if (usedNodes.has(id)) result.push(node);
  });
  return result.concat(ways);
}

function getRings(boundary) {
  if (!boundary) return [];
  let polygons = boundary.type === 'Polygon' ? [boundary.coordinates] :
    boundary.type === 'MultiPolygon' ? boundary.coordinates : [];
  let rings = [];
  polygons.forEach(polygon => polygon.forEach(points => {
    if (points.length < 3) return;
    let ring = {points, minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity};
    points.forEach(([x, y]) => {
      if (x < ring.minX) ring.minX = x;
      if (x > ring.maxX) ring.maxX = x;
      if (y < ring.minY) ring.minY = y;
      if (y > ring.maxY) ring.maxY = y;
    });
    rings.push(ring);
  }));
  return rings;
}

// Even-odd rule over all rings, so holes and separate parts both work.
function isInside(x, y, rings) {
  let inside = false;
  for (let ring of rings) {
    if (x < ring.minX || x > ring.maxX || y < ring.minY || y > ring.maxY) continue;
    let points = ring.points;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      let [xi, yi] = points[i];
      let [xj, yj] = points[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}
