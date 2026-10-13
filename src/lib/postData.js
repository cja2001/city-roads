import request from './request.js';
import Progress from './Progress.js';

let backends = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
]

// When a server is overloaded it may accept the request and never answer.
// After this long we give up on it.
const SERVER_TIMEOUT_MS = 90 * 1000;

// If a server has not started answering after this long, the same query is
// also sent to the next server. Whichever answers first wins and the other
// requests are cancelled.
const HEDGE_DELAY_MS = 20 * 1000;

export default function postData(data, progress) {
  progress = progress || new Progress();

  return new Promise((resolve, reject) => {
    let nextServer = 0;
    let attempts = new Set();
    let hedgeTimer = 0;
    let finished = false;
    let lastError;
    let emptyResponses = 0;

    progress.onCancel(onCancel);
    tryNextServer();

    function tryNextServer() {
      clearTimeout(hedgeTimer);
      if (finished) return;
      if (nextServer >= backends.length) {
        if (attempts.size === 0) fail();
        return;
      }

      if (nextServer > 0) progress.notify({loaded: -1});
      let url = backends[nextServer];
      nextServer += 1;

      let attempt = new Progress(status => {
        if (attempt.isLeader) progress.notify(status);
      });
      attempts.add(attempt);

      request(url, {
        method: 'POST',
        responseType: 'json',
        progress: attempt,
        headers: {
          'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body: 'data=' + encodeURIComponent(data),
        responseTimeout: SERVER_TIMEOUT_MS,
        onResponseStart(status) {
          if (status !== 200) return; // an error page, the next server may still succeed
          // This server finished the query and is sending data: stop the others.
          attempt.isLeader = true;
          clearTimeout(hedgeTimer);
          attempts.forEach(other => {
            if (other !== attempt) other.cancel();
          });
        }
      }).then(response => {
        attempts.delete(attempt);
        if (finished) return;
        checkServerErrors(response);
        if (isEmpty(response) && emptyResponses === 0 && nextServer < backends.length) {
          // Mirrors sometimes return nothing for places they don't index yet.
          // Ask one more server before believing there are no roads.
          emptyResponses += 1;
          throw {statusError: 'empty', message: url + ' returned no data'};
        }
        succeed(response);
      }).catch(err => {
        attempts.delete(attempt);
        if (finished || (err && err.cancelled)) {
          if (!finished && attempts.size === 0) tryNextServer();
          return;
        }
        lastError = err;
        tryNextServer();
      });

      hedgeTimer = setTimeout(tryNextServer, HEDGE_DELAY_MS);
    }

    function succeed(response) {
      finish();
      resolve(response);
    }

    function fail() {
      finish();
      let err = typeof lastError === 'object' && lastError ? lastError : {message: String(lastError)};
      err.allServersFailed = true;
      err.serversAttempted = backends.length;
      reject(err);
    }

    function onCancel() {
      if (finished) return;
      finish();
      reject({cancelled: true, message: 'Cancelled'});
    }

    function finish() {
      finished = true;
      clearTimeout(hedgeTimer);
      progress.offCancel(onCancel);
      attempts.forEach(attempt => attempt.cancel());
      attempts.clear();
    }
  });
}

function checkServerErrors(response) {
  // Overpass reports timeouts and out-of-memory errors in a "remark" of an
  // otherwise successful response. Treat them as failures of this server.
  if (response && response.remark && /error/i.test(response.remark) &&
      (!response.elements || response.elements.length === 0)) {
    throw {
      statusError: 'remark',
      message: response.remark
    };
  }
}

function isEmpty(response) {
  return !response || !response.elements || response.elements.length === 0;
}
