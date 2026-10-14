/**
 * Reads streets from Overture Maps (https://overturemaps.org), the
 * transportation/segment theme.
 *
 * Overture has no query API: each release is ~128 GeoParquet files of about
 * 450 MB on a public S3 bucket. Every file is split into ~128 row groups, each
 * covering a small region, and the file footer stores the bounding box of
 * every row group. So:
 *
 *  1. `buildIndex()` reads all footers once per release and keeps only the
 *     bounding box of each row group (a few hundred KB). The footers add up to
 *     ~250 MB, which is too much for a browser but quick inside a data center.
 *  2. `readSegments()` reads the few columns we need from one row group
 *     (a couple of MB) and returns the streets inside a bounding box.
 *
 * Responses use a compact format (see `encodeSegments`) that the web app and
 * the QGIS plugin turn into OpenStreetMap-like nodes and ways.
 */
import { parquetMetadata, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';

export const S3 = 'https://overturemaps-us-west-2.s3.amazonaws.com/';
const SEGMENT_PATH = 'theme=transportation/type=segment/';
const RELEASE_PATTERN = /^\d{4}-\d{2}-\d{2}\.\d+$/;
const COORDINATE_SCALE = 1e6; // ~0.1 m

let fetchImpl = (...args) => fetch(...args);
/** Lets tests replace the network. */
export function setFetch(f) { fetchImpl = f; }

export function isRelease(release) {
  return typeof release === 'string' && RELEASE_PATTERN.test(release);
}

async function listBucket(params) {
  let all = [];
  let token;
  do {
    let query = new URLSearchParams(Object.assign({'list-type': '2'}, params));
    if (token) query.set('continuation-token', token);
    let response = await fetchImpl(S3 + '?' + query.toString());
    if (!response.ok) throw new Error('Overture bucket listing failed: ' + response.status);
    let xml = await response.text();
    all.push(xml);
    let truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
    token = truncated ? (xml.match(/<NextContinuationToken>([^<]+)</) || [])[1] : undefined;
  } while (token);
  return all.join('\n');
}

/** Newest release that has street segments, e.g. "2026-09-23.1". */
export async function latestRelease() {
  let xml = await listBucket({prefix: 'release/', delimiter: '/'});
  let releases = [...xml.matchAll(/<Prefix>release\/([^/<]+)\/<\/Prefix>/g)]
    .map(m => m[1])
    .filter(isRelease)
    .sort();
  for (let i = releases.length - 1; i >= 0; --i) {
    let files = await listSegmentFiles(releases[i]);
    if (files.length) return releases[i];
  }
  throw new Error('No Overture release found');
}

/** [[key, size], ...] of the segment files of a release, in file order. */
export async function listSegmentFiles(release) {
  if (!isRelease(release)) throw new Error('Invalid release ' + release);
  let xml = await listBucket({prefix: `release/${release}/${SEGMENT_PATH}`});
  let files = [];
  for (let m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
    let key = (m[1].match(/<Key>([^<]+)</) || [])[1];
    let size = Number((m[1].match(/<Size>(\d+)</) || [])[1]);
    if (key && key.endsWith('.parquet') && size > 0) files.push([key, size]);
  }
  files.sort((a, b) => a[0] < b[0] ? -1 : 1);
  return files;
}

async function fetchRange(key, start, end) {
  let response = await fetchImpl(S3 + key, {headers: {Range: `bytes=${start}-${end}`}});
  if (!response.ok) throw new Error(`Could not read ${key}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** Thrift-encoded footer of a parquet file (without the trailing length and magic). */
export async function readFooter(key, size) {
  let tail = await fetchRange(key, size - 8, size - 1);
  let length = new DataView(tail.buffer, tail.byteOffset, 8).getInt32(0, true);
  let footer = await fetchRange(key, size - 8 - length, size - 9);
  return footer;
}

/**
 * Row groups of a footer: [{numRows, bbox: [xmin, ymin, xmax, ymax]}].
 * hyparquet would parse the statistics of ~100 columns per row group, which
 * takes ~150 ms per footer; this walks the thrift bytes and only keeps the
 * row counts and the statistics of the bbox.* columns.
 */
export function skimRowGroups(bytes) {
  let r = new ThriftReader(bytes);
  let groups = [];
  r.struct(id => {
    if (id !== 4) return false; // FileMetaData.row_groups
    r.list(() => groups.push(readRowGroup(r)));
    return true;
  });
  return groups;
}

function readRowGroup(r) {
  let group = {numRows: 0, bbox: [Infinity, Infinity, -Infinity, -Infinity]};
  r.struct((id, type) => {
    if (id === 1) { // columns: list<ColumnChunk>
      r.list(() => r.struct(id => {
        if (id !== 3) return false; // ColumnChunk.meta_data
        readColumnMetaData(r, group.bbox);
        return true;
      }));
      return true;
    }
    if (id === 3 && type === 6) { group.numRows = r.varint(); return true; }
    return false;
  });
  return group;
}

const BBOX_SLOT = {'bbox.xmin': [0, 'min'], 'bbox.ymin': [1, 'min'], 'bbox.xmax': [2, 'max'], 'bbox.ymax': [3, 'max']};

function readColumnMetaData(r, bbox) {
  let path = '';
  let stats = {};
  let physicalType = 0;
  r.struct((id, type) => {
    if (id === 1 && type === 5) { physicalType = r.varint(); return true; }
    if (id === 3) { // path_in_schema
      let parts = [];
      r.list(() => parts.push(r.string()));
      path = parts.join('.');
      return true;
    }
    if (id === 12 && BBOX_SLOT[path]) { // statistics
      r.struct((id, type) => {
        if (type !== 8) return false;
        let value = r.binary();
        // 1 max, 2 min (deprecated), 5 max_value, 6 min_value
        if (id === 1 || id === 5) stats.max = decodeNumber(value, physicalType);
        else if (id === 2 || id === 6) stats.min = decodeNumber(value, physicalType);
        return true;
      });
      return true;
    }
    return false;
  });
  let slot = BBOX_SLOT[path];
  if (slot && stats[slot[1]] !== undefined) {
    let v = stats[slot[1]];
    bbox[slot[0]] = slot[1] === 'min' ? Math.min(bbox[slot[0]], v) : Math.max(bbox[slot[0]], v);
  }
}

function decodeNumber(bytes, physicalType) {
  let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (physicalType === 4 && bytes.length === 4) return view.getFloat32(0, true); // FLOAT
  if (physicalType === 5 && bytes.length === 8) return view.getFloat64(0, true); // DOUBLE
  return undefined;
}

const textDecoder = new TextDecoder();

/** Minimal reader for the thrift compact protocol used by parquet footers. */
class ThriftReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.pos = 0;
  }

  byte() { return this.bytes[this.pos++]; }

  uvarint() {
    let result = 0;
    let multiplier = 1;
    let b;
    do {
      b = this.bytes[this.pos++];
      result += (b & 0x7f) * multiplier;
      multiplier *= 128;
    } while (b & 0x80);
    return result;
  }

  varint() { // zigzag
    let n = this.uvarint();
    return n % 2 ? -(n + 1) / 2 : n / 2;
  }

  binary() {
    let length = this.uvarint();
    let value = this.bytes.subarray(this.pos, this.pos + length);
    this.pos += length;
    return value;
  }

  string() { return textDecoder.decode(this.binary()); }

  /** Calls onField(id, type) for each field; it returns false to skip the field. */
  struct(onField) {
    let lastId = 0;
    for (;;) {
      let header = this.byte();
      let type = header & 0x0f;
      if (type === 0) return;
      let delta = header >> 4;
      let id = delta ? lastId + delta : this.varint();
      lastId = id;
      if (type === 1 || type === 2) continue; // booleans carry their value in the type
      if (!onField(id, type)) this.skip(type);
    }
  }

  list(onItem) {
    let header = this.byte();
    let size = header >> 4;
    if (size === 15) size = this.uvarint();
    let type = header & 0x0f;
    for (let i = 0; i < size; ++i) {
      if (onItem) onItem(type); else this.skip(type);
    }
  }

  skip(type) {
    switch (type) {
      case 1: case 2: return; // bool inside a struct
      case 3: this.pos += 1; return;
      case 4: case 5: case 6: this.uvarint(); return;
      case 7: this.pos += 8; return;
      case 8: { let length = this.uvarint(); this.pos += length; return; }
      case 9: case 10: {
        let header = this.byte();
        let size = header >> 4;
        if (size === 15) size = this.uvarint();
        let itemType = header & 0x0f;
        for (let i = 0; i < size; ++i) {
          if (itemType === 1 || itemType === 2) this.pos += 1; else this.skip(itemType);
        }
        return;
      }
      case 11: {
        let size = this.uvarint();
        if (!size) return;
        let types = this.byte();
        for (let i = 0; i < size; ++i) {
          this.skip(types >> 4);
          this.skip(types & 0x0f);
        }
        return;
      }
      case 12: this.struct(() => false); return;
      default: throw new Error('Unknown thrift type ' + type);
    }
  }
}

async function mapLimit(items, limit, fn) {
  let results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      let i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, worker));
  return results;
}

const DEGREE_STEP = 1e4;
const floor4 = x => Math.floor(x * DEGREE_STEP) / DEGREE_STEP;
const ceil4 = x => Math.ceil(x * DEGREE_STEP) / DEGREE_STEP;

/**
 * Index of a release:
 * {release, files: [[key, size]], groups: [[file, group, xmin, ymin, xmax, ymax]]}
 * Boxes are rounded outwards to 4 decimals.
 */
export async function buildIndex(release) {
  let files = await listSegmentFiles(release);
  if (!files.length) throw new Error('No street files in Overture release ' + release);
  let perFile = await mapLimit(files, 16, async ([key, size]) => skimRowGroups(await readFooter(key, size)));
  let groups = [];
  perFile.forEach((rowGroups, file) => {
    rowGroups.forEach((group, index) => {
      let [xmin, ymin, xmax, ymax] = group.bbox;
      if (!Number.isFinite(xmin + ymin + xmax + ymax)) return;
      groups.push([file, index, floor4(xmin), floor4(ymin), ceil4(xmax), ceil4(ymax)]);
    });
  });
  return {release, files, groups};
}

const metadataCache = new Map();

async function fileMetadata(key, size) {
  if (metadataCache.has(key)) return metadataCache.get(key);
  let promise = readFooter(key, size).then(footer => {
    // parquetMetadata wants the footer as it sits at the end of the file.
    let buffer = new ArrayBuffer(footer.length + 8);
    let bytes = new Uint8Array(buffer);
    bytes.set(footer);
    new DataView(buffer).setInt32(footer.length, footer.length, true);
    bytes.set([80, 65, 82, 49], footer.length + 4); // PAR1
    return parquetMetadata(buffer);
  });
  metadataCache.set(key, promise);
  promise.catch(() => metadataCache.delete(key));
  if (metadataCache.size > 8) metadataCache.delete(metadataCache.keys().next().value);
  return promise;
}

function rangeFile(key, size) {
  return {
    byteLength: size,
    slice: (start, end) => fetchRange(key, start, (end === undefined ? size : end) - 1)
      .then(bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  };
}

/**
 * Road segments of one row group that touch `bbox` ([west, south, east, north]).
 * Returns [{name, class, osm, coordinates: [[lon, lat], ...]}], where `osm` lists
 * the OpenStreetMap way ids the segment was made from (empty when it comes
 * from another source, such as TomTom). Clients use it to merge Overture
 * with OpenStreetMap without duplicates.
 */
export async function readSegments(key, size, group, bbox) {
  let metadata = await fileMetadata(key, size);
  let rowGroups = metadata.row_groups;
  if (!(group >= 0 && group < rowGroups.length)) throw new Error('Invalid row group ' + group);
  let rowStart = 0;
  for (let i = 0; i < group; ++i) rowStart += Number(rowGroups[i].num_rows);
  let rowEnd = rowStart + Number(rowGroups[group].num_rows);

  let rows = await parquetReadObjects({
    file: rangeFile(key, size),
    metadata,
    compressors,
    columns: ['names', 'subtype', 'class', 'geometry', 'bbox', 'sources'],
    rowStart,
    rowEnd,
  });

  let [west, south, east, north] = bbox;
  let segments = [];
  for (let row of rows) {
    if (row.subtype !== 'road') continue;
    let b = row.bbox;
    if (!b || b.xmax < west || b.xmin > east || b.ymax < south || b.ymin > north) continue;
    let geometry = row.geometry;
    let lines = geometry && geometry.type === 'LineString' ? [geometry.coordinates] :
      geometry && geometry.type === 'MultiLineString' ? geometry.coordinates : [];
    let name = row.names && row.names.primary || null;
    let osm = osmWayIds(row.sources);
    for (let coordinates of lines) {
      if (coordinates.length > 1) segments.push({name, class: row.class || 'unknown', osm, coordinates});
    }
  }
  return segments;
}

/** OpenStreetMap way ids in Overture `sources` (record ids look like "w123@4"). */
export function osmWayIds(sources) {
  let ids = [];
  (sources || []).forEach(source => {
    if (!source || source.dataset !== 'OpenStreetMap') return;
    let match = /^w(\d+)/.exec(source.record_id || '');
    if (match && !ids.includes(Number(match[1]))) ids.push(Number(match[1]));
  });
  return ids;
}

/**
 * Compact form of segments: {segments: [[name, class, osmWayIds, x0, y0, dx1, dy1, ...]]}
 * with coordinates as integers in millionths of a degree, deltas after the
 * first point. About a third of the size of GeoJSON.
 */
export function encodeSegments(segments) {
  return segments.map(segment => {
    let out = [segment.name, segment.class, segment.osm || []];
    let px = 0, py = 0;
    segment.coordinates.forEach(([lon, lat], i) => {
      let x = Math.round(lon * COORDINATE_SCALE);
      let y = Math.round(lat * COORDINATE_SCALE);
      if (i === 0) out.push(x, y); else out.push(x - px, y - py);
      px = x; py = y;
    });
    return out;
  });
}
