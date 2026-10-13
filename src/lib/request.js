import Progress from './Progress.js';

export default function request(url, options) {
  if (!options) options = {};
  let req;
  let progress = options.progress || new Progress();
  let isCancelled = false;
  if (progress.on) {
    progress.onCancel(cancelDownload);
  }

  return new Promise(download);

  function cancelDownload() {
    isCancelled = true;
    if (req) {
      req.abort();
    }
  }

  function download(resolve, reject) {
    req = new XMLHttpRequest();

    if (typeof progress.notify === 'function') {
      req.addEventListener('progress', updateProgress, false);
    }

    req.addEventListener('load', transferComplete, false);
    req.addEventListener('error', transferFailed, false);
    req.addEventListener('abort', transferCanceled, false);

    req.open(options.method || 'GET', url);
    if (options.responseType) {
      req.responseType = options.responseType;
    }
    let responseTimer;
    if (options.responseTimeout) {
      // Only limits how long we wait for the server to start answering, so
      // that a slow download of a large response is not interrupted.
      responseTimer = setTimeout(transferTimedOut, options.responseTimeout);
    }
    let responseStarted = false;
    req.addEventListener('readystatechange', () => {
      if (req.readyState < 2 || responseStarted) return;
      responseStarted = true;
      clearTimeout(responseTimer);
      if (options.onResponseStart) options.onResponseStart(req.status);
    });

    if (options.headers) {
      Object.keys(options.headers).forEach(key => {
        req.setRequestHeader(key, options.headers[key]);
      });
    }

    if (options.method === 'POST') {
      req.send(options.body);
    } else {
      req.send(null);
    }

    function updateProgress(e) {
      if (e.lengthComputable) {
        progress.notify({
          loaded: e.loaded,
          total: e.total,
          percent: e.loaded / e.total,
          lengthComputable: true
        });
      } else {
        progress.notify({
          loaded: e.loaded,
          lengthComputable: false
        });
      }
    }

    function transferComplete() {
      progress.offCancel(cancelDownload);

      if (progress.isCancelled) return;

      if (req.status !== 200) {
        reject({
          statusError: req.status,
          message: `Unexpected status code ${req.status} when calling ${url}`
        });
        return;
      }
      var response = req.response;

      if (options.responseType === 'json' && typeof response === 'string') {
        // IE
        response = JSON.parse(response);
      }

      setTimeout(() => resolve(response), 0);
    }

    function transferFailed() {
      clearTimeout(responseTimer);
      reject(`Failed to download ${url}`);
    }

    function transferTimedOut() {
      progress.offCancel(cancelDownload);
      req.removeEventListener('abort', transferCanceled, false);
      req.abort();
      reject({
        timedOut: true,
        message: `${url} did not respond in ${Math.round(options.responseTimeout / 1000)} seconds`
      });
    }

    function transferCanceled() {
      clearTimeout(responseTimer);
      reject({
        cancelled: true,
        message: `Cancelled download of ${url}`
      });
    }
  }
}