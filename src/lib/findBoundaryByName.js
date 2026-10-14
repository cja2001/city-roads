import request from './request.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org';
// Ask for a simplified outline of each place, so roads can be clipped to it
// without relying on the area index of Overpass servers.
const POLYGON_PARAMS = 'format=json&polygon_geojson=1&polygon_threshold=0.0003&accept-language=es';

let cachedResults = new Map();

export default function findBoundaryByName(inputName) {
  let results = cachedResults.get(inputName);
  if (results) return Promise.resolve(results);

  let name = encodeURIComponent(inputName);
  return request(`${NOMINATIM}/search?${POLYGON_PARAMS}&limit=10&q=${name}`, {responseType: 'json'})
      .then(extractBoundaries)
      .then(x => {
        cachedResults.set(inputName, x);
        return x;
      });
}

/**
 * Finds the outline and bounding box of an Overpass area id (relation or way).
 * Resolves to undefined when the place cannot be found.
 */
export function findBoundaryByAreaId(areaId) {
  areaId = Number(areaId);
  let osmId;
  if (areaId >= 36e8) osmId = 'R' + (areaId - 36e8);
  else if (areaId >= 24e8) osmId = 'W' + (areaId - 24e8);
  else return Promise.resolve();

  return request(`${NOMINATIM}/lookup?${POLYGON_PARAMS}&osm_ids=${osmId}`, {responseType: 'json'})
    .then(rows => extractBoundaries(rows || [])[0]);
}

function extractBoundaries(x) {
  let areas = x.map(row => {
      let areaId, bbox;
      if (row.osm_type === 'relation') {
        // By convention the area id can be calculated from an existing 
        // OSM way by adding 2400000000 to its OSM id, or in case of a 
        // relation by adding 3600000000 respectively. So we are adding this
        // https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL#By_area_.28area.29
        // Note: we may want to do another case for osm_type = 'way'. Need to check
        // if it returns correct values.
        areaId = row.osm_id + 36e8;
      } else if (row.osm_type === 'way') {
        areaId = row.osm_id + 24e8;
      }
      if (row.boundingbox) {
        bbox = [
          Number.parseFloat(row.boundingbox[0]),
          Number.parseFloat(row.boundingbox[2]),
          Number.parseFloat(row.boundingbox[1]),
          Number.parseFloat(row.boundingbox[3]),
        ];
      }
      let geojson = row.geojson;
      let boundary = geojson && (geojson.type === 'Polygon' || geojson.type === 'MultiPolygon') ? geojson : undefined;

      return {
        areaId,
        bbox,
        boundary,
        lat: row.lat,
        lon: row.lon,
        osmId: row.osm_id,
        osmType: row.osm_type,
        name: row.display_name,
        type: row.type,
      };
    });

  return areas;
}
