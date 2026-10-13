import findBoundaryByName from "./findBoundaryByName.js";

// Bounding box queries are much cheaper for Overpass than area queries and do
// not depend on the server's area index, which is often missing or outdated
// on mirrors. Above this size (in square degrees) a box would pull in too many
// roads outside the place, so we fall back to the area query.
const MAX_BBOX_SQUARE_DEGREES = 1;

/**
 * For console API we allow a lot of flexibility to fetch data
 * This component normalizes input arguments and turns them into unified
 * options object
 */

export default class LoadOptions {
  static parse(scene, wayFilter, rawOptions) {
    let result = new LoadOptions();
    if (typeof rawOptions === 'string') {
      result.place = rawOptions;
    }

    if (wayFilter) {
      result.wayFilter = wayFilter;
    }

    if (!rawOptions) return result;

    Object.assign(result, rawOptions);

    let protoLayer = getProtoLayer(scene, rawOptions.layer);
    if (protoLayer) {
      result.projector = protoLayer.getGridProjector();
      let protoQueryBounds = protoLayer.getQueryBounds();
      if (protoQueryBounds && !result.place && !result.areaId && !result.bbox) {
        // use bounds of the parent layer unless we have our own override.
        result.place = protoQueryBounds.place;
        result.areaId = protoQueryBounds.areaId;
        result.bbox = protoQueryBounds.bbox;
      }
    }

    if (rawOptions.projector) {
      // user defined projection. See https://github.com/d3/d3-geo for the projector reference:
      result.projector = projector;
    }

    return result;
  }

  constructor(overrides) {
    /**
    * Query that should be translated to area id by nominatim;
    */
    this.place = undefined;

    /**
    * Which projector should be used to map lon/lat to layer's x/y
    */
    this.projector = undefined;
    this.wayFilter = undefined;
    /**
     * Optional GeoJSON outline of the place. Roads of a bounding box query are
     * clipped to it.
     */
    this.boundary = undefined;
    // Overpass servers are less likely to queue or reject queries that ask for
    // less time and memory. Large cities are usually served from the cache.
    this.timeout = 180;
    this.maxHeapByteSize = 536870912;
    this.outputMethod = 'skel'; // body
    Object.assign(this, overrides);
  }

  getQueryTemplate() {
    if (this.raw) {
      // I assume you know what you are doing.
      return Promise.resolve({
        queryString: this.raw
      });
    }

    if (!this.wayFilter) {
      throw new Error('Way filter is required');
    }

    return this.getBounds()
      .then(bounds => {
        let queryString;
        if (bounds.bbox && (!bounds.areaId || getBBoxSize(bounds.bbox) <= MAX_BBOX_SQUARE_DEGREES)) {
          // The box limits only the ways, so roads crossing its edge keep all their nodes.
          let bbox = serializeBBox(bounds.bbox);
          queryString = `[timeout:${this.timeout}][maxsize:${this.maxHeapByteSize}][out:json];
(${this.wayFilter}(${bbox}); node(w););
out ${this.outputMethod};`;
          bounds = Object.assign({}, bounds, {clipToBoundary: true});
        } else if (bounds.areaId) {
          queryString = `[timeout:${this.timeout}][maxsize:${this.maxHeapByteSize}][out:json];
area(${bounds.areaId});
(._; )->.area;
(${this.wayFilter}(area.area); node(w););
out ${this.outputMethod};`;
        }

        return {
          bounds,
          queryString
        }
      });
  }

  getBounds() {
    if (this.place) {
      return findBoundaryByName(this.place).then(x => x && x[0]);
    }
    if (this.areaId || this.bbox) {
      return Promise.resolve({ areaId: this.areaId, bbox: this.bbox, boundary: this.boundary });
    }

    throw new Error('Please specify bounding area for the query (place|areaId|bbox)');
  }
}

function getProtoLayer(scene, layerDefinition) {
  if (layerDefinition === undefined) return;

  if (typeof layerDefinition === 'number') {
    let layers = scene.queryLayerAll();
    return layers[layerDefinition];
  } else if (typeof layerDefinition === 'string') {
    return scene.queryLayer(layerDefinition);
  } else {
    // We assume it is a layer instance:
    return layerDefinition;
  }
}

function getBBoxSize(bbox) {
  return Math.abs((bbox[2] - bbox[0]) * (bbox[3] - bbox[1]));
}

function serializeBBox(bbox) {
  return bbox && bbox.join(',');
}