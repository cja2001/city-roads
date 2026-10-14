/**
 * Overture Maps streets for the web app and the QGIS plugin.
 *
 *   GET /api/overture?index
 *     Index of the newest release: {release, files: [[key, size]],
 *     groups: [[file, group, xmin, ymin, xmax, ymax]]}. Clients pick the row
 *     groups whose box overlaps their area.
 *
 *   GET /api/overture?release=R&file=F&group=G&bbox=west,south,east,north
 *     Roads of one row group that touch the box:
 *     {segments: [[name, class, x0, y0, dx1, dy1, ...]]}, coordinates in
 *     millionths of a degree, deltas after the first point.
 *
 * See _overture.mjs for how the files are read.
 */
import {buildIndex, latestRelease, listSegmentFiles, isRelease, readSegments, encodeSegments} from './_overture.mjs';

const LATEST_TTL_MS = 60 * 60 * 1000;
let latest = null; // {release, at}
const indexes = new Map(); // release -> Promise<index>
const fileLists = new Map(); // release -> Promise<[[key, size]]>

function cached(cache, release, build) {
  if (!cache.has(release)) {
    let promise = build(release);
    cache.set(release, promise);
    promise.catch(() => cache.delete(release));
    if (cache.size > 2) cache.delete(cache.keys().next().value);
  }
  return cache.get(release);
}

async function getLatestRelease() {
  if (latest && Date.now() - latest.at < LATEST_TTL_MS) return latest.release;
  let release = await latestRelease();
  latest = {release, at: Date.now()};
  return release;
}

function parseBBox(value) {
  let parts = String(value || '').split(',').map(Number);
  if (parts.length !== 4 || !parts.every(Number.isFinite)) return null;
  let [west, south, east, north] = parts;
  if (west > east || south > north || west < -180 || east > 180 || south < -90 || north > 90) return null;
  return parts;
}

function send(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cacheSeconds ?
    `public, max-age=${Math.min(cacheSeconds, 3600)}, s-maxage=${cacheSeconds}` : 'no-store');
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  let params = new URL(req.url, 'http://localhost').searchParams;
  try {
    if (params.has('index')) {
      let release = params.get('release') || await getLatestRelease();
      if (!isRelease(release)) return send(res, 400, {error: 'Invalid release'});
      let index = await cached(indexes, release, buildIndex);
      // A fixed release never changes. "Newest" is rechecked every hour.
      return send(res, 200, index, params.get('release') ? 30 * 24 * 3600 : 3600);
    }

    let release = params.get('release');
    let file = Number(params.get('file'));
    let group = Number(params.get('group'));
    let bbox = parseBBox(params.get('bbox'));
    if (!isRelease(release) || !Number.isInteger(file) || !Number.isInteger(group) || !bbox) {
      return send(res, 400, {error: 'Expected ?index or ?release=&file=&group=&bbox=west,south,east,north'});
    }
    let files = await cached(fileLists, release, listSegmentFiles);
    if (!files[file]) return send(res, 404, {error: 'Unknown file'});
    let [key, size] = files[file];
    let segments = await readSegments(key, size, group, bbox);
    return send(res, 200, {segments: encodeSegments(segments)}, 30 * 24 * 3600);
  } catch (err) {
    console.error(err);
    return send(res, 502, {error: String(err && err.message || err)});
  }
}
