import request from './request.js';
import Progress from './Progress.js';

let backends = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.jp/api/interpreter'
]

// When a server is overloaded it may accept the request and never answer.
// After this long we give up on it and ask the next server.
const SERVER_TIMEOUT_MS = 60 * 1000;

export default function postData(data, progress) {
  progress = progress || new Progress();
  const postData = {
    method: 'POST',
    responseType: 'json',
    progress,
    headers: {
      'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    body: 'data=' + encodeURIComponent(data),
    responseTimeout: SERVER_TIMEOUT_MS
  };

  let serverIndex = 0;

  return fetchFrom(backends[serverIndex]);

  function fetchFrom(overpassUrl) {
    return request(overpassUrl, postData, 'POST')
      .then(rejectServerErrors)
      .catch(handleError);
  }

  function rejectServerErrors(response) {
    // Overpass reports timeouts and out-of-memory errors in a "remark" of an
    // otherwise successful response. Treat them as failures of this server.
    if (response && response.remark && /error/i.test(response.remark) &&
        (!response.elements || response.elements.length === 0)) {
      throw {
        statusError: 'remark',
        message: response.remark
      };
    }
    return response;
  }

  function handleError(err) {
    if (err.cancelled) throw err;

    if (serverIndex >= backends.length - 1) {
      // we can't do much anymore - all servers failed
      err.allServersFailed = true;
      err.serversAttempted = backends.length;
      throw err;
    }

    if (err.statusError || err.timedOut) {
      progress.notify({
        loaded: -1
      });
    }

    serverIndex += 1;
    return fetchFrom(backends[serverIndex])
  }
}