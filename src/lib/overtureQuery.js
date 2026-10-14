import request from './request.js';
import Progress from './Progress.js';
import Grid from './Grid.js';
import clipToBoundary from './clipToBoundary.js';
import config from '../config.js';

// Row groups are downloaded a few at a time.
const PARALLEL_REQUESTS = 4;
const COORDINATE_SCALE = 1e6;

/**
 * Loads the roads of a place from Overture Maps through /api/overture (see
 * api/overture.mjs) and returns them as a Grid, like Query.run() does for
 * OpenStreetMap.
 *
 * Overture segments become OpenStreetMap-like nodes and ways, with the road
 * class as the `highway` tag and the primary name as `name`, so street names,
 * KML export and the rest of the app work the same for both sources.
 *
 * @param {{bbox: number[], boundary?: object}} place - bbox is [south, west, north, east]
 *   as returned by findBoundaryByName.
 */
export default function loadOvertureGrid(place, progress) {
  progress = progress || new Progress();
  if (!place.bbox) {
    return Promise.reject(new Error('Overture needs the bounding box of the place. Please search for it again.'));
  }
  let [south, west, north, east] = place.bbox;
  // Rounded outwards so the same city always asks for the same urls, which
  // lets the server cache answer.
  let bbox = [floor(west), floor(south), ceil(east), ceil(north)];

  return get(config.overtureApi + '?index', progress).then(index => {
    let groups = index.groups.filter(([, , xmin, ymin, xmax, ymax]) =>
      xmin <= bbox[2] && xmax >= bbox[0] && ymin <= bbox[3] && ymax >= bbox[1]);
    let loadedBytes = 0;
    let done = 0;
    return mapLimit(groups, PARALLEL_REQUESTS, ([file, group]) => {
      let url = config.overtureApi + '?release=' + encodeURIComponent(index.release) +
        '&file=' + file + '&group=' + group + '&bbox=' + bbox.join(',');
      return get(url, progress).then(response => {
        done += 1;
        loadedBytes += response.bytes;
        progress.notify({loaded: loadedBytes, percent: done / groups.length});
        return response.segments;
      });
    });
  }).then(parts => {
    let elements = segmentsToElements([].concat(...parts));
    if (place.boundary) elements = clipToBoundary(elements, place.boundary);
    let grid = Grid.fromOSMResponse(elements);
    grid.queryBounds = {areaId: place.areaId, bbox: place.bbox, boundary: place.boundary, source: 'overture'};
    return grid;
  });
}

/**
 * Turns the compact segments of the api ([name, class, x0, y0, dx1, dy1, ...])
 * into OpenStreetMap nodes and ways. Points at the same position share a
 * node, so crossings are connected like in OpenStreetMap.
 */
export function segmentsToElements(segments) {
  let nodes = [];
  let ways = [];
  let nodeIds = new Map();

  segments.forEach(segment => {
    let name = segment[0];
    let roadClass = segment[1];
    let wayNodes = [];
    let x = 0, y = 0;
    for (let i = 2; i + 1 < segment.length; i += 2) {
      x += segment[i];
      y += segment[i + 1];
      let key = x + ',' + y;
      let id = nodeIds.get(key);
      if (id === undefined) {
        id = nodes.length + 1;
        nodeIds.set(key, id);
        nodes.push({type: 'node', id, lon: x / COORDINATE_SCALE, lat: y / COORDINATE_SCALE});
      }
      if (wayNodes[wayNodes.length - 1] !== id) wayNodes.push(id);
    }
    if (wayNodes.length < 2) return;
    let tags = {highway: roadClass && roadClass !== 'unknown' ? roadClass : 'road'};
    if (name) tags.name = name;
    ways.push({type: 'way', id: ways.length + 1, nodes: wayNodes, tags});
  });

  return nodes.concat(ways);
}

function get(url, parentProgress) {
  // Each request gets its own progress token, so the byte counts of parallel
  // downloads don't overwrite each other. Cancelling the parent cancels them all.
  let own = new Progress();
  let cancel = () => own.cancel();
  parentProgress.onCancel(cancel);
  return request(url, {progress: own, responseType: 'text'})
    .then(text => {
      let json = JSON.parse(text);
      json.bytes = text.length;
      return json;
    })
    .finally(() => parentProgress.offCancel(cancel));
}

function mapLimit(items, limit, fn) {
  let results = new Array(items.length);
  let next = 0;
  function worker() {
    if (next >= items.length) return Promise.resolve();
    let i = next++;
    return fn(items[i]).then(result => {
      results[i] = result;
      return worker();
    });
  }
  let workers = [];
  for (let i = 0; i < Math.min(limit, items.length); ++i) workers.push(worker());
  return Promise.all(workers).then(() => results);
}

function floor(x) {
  return Math.floor(x * 1e4) / 1e4;
}

function ceil(x) {
  return Math.ceil(x * 1e4) / 1e4;
}
