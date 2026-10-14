import Query from './Query.js';
import request from './request.js';
import {findBoundaryByAreaId} from './findBoundaryByName.js';
import appState from './appState.js';
import Grid from './Grid.js';
import config from '../config.js';
import LoadOptions from './LoadOptions.js';
import loadOvertureGrid, {loadOvertureSegments} from './overtureQuery.js';
import mergeSources from './mergeSources.js';
import clipToBoundary from './clipToBoundary.js';
import Pbf from 'pbf';
import {place as placeProto} from '../proto/place.js';

/**
 * Data sources for the streets. OpenStreetMap is the default.
 */
export const SOURCES = {
  osm: {label: 'OpenStreetMap', short: 'OSM', name: 'OpenStreetMap'},
  overture: {label: 'Overture', short: 'Overture', name: 'Overture Maps'},
  both: {label: 'Ambas', short: 'OSM + Overture', name: 'OpenStreetMap y Overture Maps'}
};

export function getSavedSource() {
  let source = appState.get('source');
  return SOURCES[source] ? source : 'osm';
}

export function saveSource(source) {
  // OpenStreetMap is the default and keeps the url short.
  if (source !== 'osm') appState.set('source', source);
  else appState.unset('source');
}

/**
 * Downloads the streets of a place and resolves to a Grid with its name, id
 * and bounds set. `progress` receives {loaded, percent} updates and can be
 * cancelled. `onStage` receives short messages about what is happening.
 *
 * This is the extraction process the interface starts; it has no UI code.
 */
export default function extractRoads(place, source, progress, onStage) {
  onStage = onStage || Function.prototype;
  let load;
  if (source === 'overture') {
    onStage('Conectando con Overture Maps...');
    load = withBoundary(place).then(p => loadOvertureGrid(p, progress));
  } else if (source === 'both') {
    onStage('Conectando con OpenStreetMap y Overture Maps...');
    load = withBoundary(place).then(p => loadBoth(p, progress));
  } else if (appState.isCacheEnabled() && place.areaId) {
    onStage('Revisando la caché...');
    load = loadFromCache(place, progress).catch(error => {
      if (error && error.cancelled) throw error;
      // No cache for this place: ask OpenStreetMap.
      onStage('Conectando con OpenStreetMap...');
      return withBoundary(place).then(p => loadOSMGrid(p, progress));
    });
  } else {
    onStage('Conectando con OpenStreetMap...');
    load = withBoundary(place).then(p => loadOSMGrid(p, progress));
  }

  return load.then(grid => {
    if (progress && progress.isCancelled) throw {cancelled: true};
    if (!grid.queryBounds || !grid.queryBounds.source) {
      grid.queryBounds = Object.assign({}, grid.queryBounds, {source: 'osm'});
    }
    if (!grid.hasRoads()) return grid;
    grid.setName(place.name || grid.name);
    if (!grid.fromCache) {
      grid.setId(place.areaId || place.osm_id);
      grid.setIsArea(place.areaId); // osm nodes don't have area.
      grid.setBBox(place.bbox && place.bbox.join(','));
    }
    return grid;
  });
}

function loadFromCache(place, progress) {
  return request(config.areaServer + '/' + place.areaId + '.pbf', {
    progress,
    responseType: 'arraybuffer'
  }).then(arrayBuffer => {
    let pbf = new Pbf(new Uint8Array(arrayBuffer));
    let grid = Grid.fromPBF(placeProto.read(pbf));
    grid.fromCache = true;
    grid.setIsArea(true);
    grid.queryBounds = {areaId: place.areaId, source: 'osm', cached: true};
    return grid;
  });
}

function loadBoth(place, progress) {
  return Promise.all([loadOSMGrid(place, progress), loadOvertureSegments(place, progress)])
    .then(([osmGrid, segments]) => {
      let merged = mergeSources(osmGrid.elements, segments);
      let elements = place.boundary ? clipToBoundary(merged.elements, place.boundary) : merged.elements;
      let grid = Grid.fromOSMResponse(elements);
      grid.queryBounds = Object.assign({}, osmGrid.queryBounds, {source: 'both'});
      grid.mergeStats = {added: merged.added, named: merged.named};
      console.info(`Overture added ${merged.added} roads and ${merged.named} names to OpenStreetMap`);
      return grid;
    });
}

/**
 * A place restored from the url only knows its area id. Look up its outline
 * so it can be loaded with a bounding box query like a searched place.
 */
export function withBoundary(place) {
  if (!place.areaId || place.bbox) return Promise.resolve(place);

  return findBoundaryByAreaId(place.areaId)
    .then(found => found ? Object.assign({}, place, {bbox: found.bbox, boundary: found.boundary}) : place)
    .catch(() => place);
}

function loadOSMGrid(place, progress) {
  return Query.runFromOptions(new LoadOptions({
    wayFilter: Query.Road,
    // Include tags, so street names come with the roads in one request.
    outputMethod: 'body',
    areaId: place.areaId,
    bbox: place.bbox,
    boundary: place.boundary
  }), progress).then(grid => {
    grid.queryBounds = Object.assign({}, grid.queryBounds, {source: 'osm'});
    return grid;
  });
}

/**
 * Servers that are busy or down are not bugs in StreetData; the interface
 * shows a softer message with a retry button for them.
 */
export function isServerError(error) {
  if (!error) return false;
  return Boolean(error.allServersFailed ||
         error.invalidResponse ||
         error.statusError ||
         error.timedOut ||
         (error.message && error.message.includes('No se pudo descargar')) ||
         (typeof error === 'string' && error.startsWith('No se pudo descargar')));
}

/**
 * Restores the place stored in the url (?areaId= or ?osm_id=&bbox=), if any.
 */
export function restorePlaceFromUrl(name) {
  let areaId = appState.get('areaId');
  if (Number.isFinite(Number.parseInt(areaId, 10))) {
    return {name, areaId};
  }

  let osmId = appState.get('osm_id');
  if (!Number.isFinite(Number.parseInt(osmId, 10))) return;
  let bbox = parseBBox(appState.get('bbox'));
  if (!bbox) return;
  return {name, osm_id: osmId, bbox};
}

export function savePlaceToUrl(grid) {
  if (grid.isArea) {
    appState.set('areaId', grid.id);
    appState.unset('osm_id');
    appState.unset('bbox');
  } else if (grid.bboxString) {
    appState.unset('areaId');
    appState.set('osm_id', grid.id);
    appState.set('bbox', grid.bboxString);
  }
}

function parseBBox(bboxStr) {
  if (!bboxStr) return null;
  let bbox = String(bboxStr).split(',').map(x => Number.parseFloat(x)).filter(x => Number.isFinite(x));
  return bbox.length === 4 ? bbox : null;
}
