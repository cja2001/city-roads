import svgExport from './svgExport.js';
import kmlExport from './kmlExport.js';

/**
 * Builds a descriptive file name such as
 * "StreetData_San-Salvador_calles-parcelas_2026-10-14.kml".
 */
export function makeFileName(placeName, parts, extension) {
  let date = new Date();
  let day = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
  let place = escapeFileName(placeName || 'mapa').trim().replace(/\s+/g, '-') || 'mapa';
  return ['StreetData', place].concat(parts || []).concat(day).filter(Boolean).join('_') + extension;
}

/**
 * Writes a KML file. Resolves to the counts of what was written, and rejects
 * (without downloading anything) when nothing would be written.
 */
export function toKML(grid, options) {
  options = options || {};
  return new Promise((resolve, reject) => {
    let result = kmlExport(grid, options);
    if (!result.segments && !result.parcels) {
      let error = new Error(options.area ?
        'No hay geometrías dentro del área seleccionada.' :
        'No hay geometrías visibles para exportar.');
      error.empty = true;
      reject(error);
      return;
    }
    let blob = new Blob([result.kml], {type: 'application/vnd.google-earth.kml+xml'});
    download(blob, options.fileName || makeFileName(options.name, [], '.kml'));
    resolve(Object.assign({bytes: blob.size}, result));
  });
}

export function toSVG(scene, options) {
  options = options || {};
  let svg = svgExport(scene, {
    printable: collectPrintable(options),
    ...options
  });
  let blob = new Blob([svg], {type: 'image/svg+xml'});
  download(blob, options.fileName || makeFileName(options.name, [], '.svg'));
  return {bytes: blob.size};
}

/**
 * Turns a printable canvas into a PNG file and downloads it.
 */
export function canvasToPNG(canvas, fileName) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => {
        if (!blob) {
          reject(new Error('El navegador no pudo crear la imagen.'));
          return;
        }
        download(blob, fileName);
        resolve({bytes: blob.size, width: canvas.width, height: canvas.height});
      }, 'image/png');
    } catch (e) {
      reject(explainCanvasError(e));
    }
  });
}

/**
 * Kept for the console API (scene.saveToPNG).
 */
export function toPNG(scene, options) {
  options = options || {};
  return getPrintableCanvas(scene, options).then(canvas =>
    canvasToPNG(canvas, options.fileName || makeFileName(options.name, [], '.png')));
}

/**
 * Composes the map into one 2d canvas: background, base map, roads and
 * parcels, street names and the printable labels (title and credits).
 *
 * options:
 *  - baseMap (default true): include the base map tiles
 *  - streetNames (default true): include street names
 *  - title (default true): include the place name
 *  - crop: {left, top, width, height} in css pixels of the map, to export
 *    only part of the view
 *  - background: css color painted under everything
 */
export function getPrintableCanvas(scene, options = {}) {
  let cityCanvas = getCanvas();
  let width = cityCanvas.width;
  let height = cityCanvas.height;
  let ratio = width / (cityCanvas.clientWidth || width);

  let full = document.createElement('canvas');
  let ctx = full.getContext('2d');
  full.width = width;
  full.height = height;
  scene.render();

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  let baseMap = document.querySelector('#base-map');
  if (options.baseMap !== false && baseMap && baseMap.style.display !== 'none') {
    ctx.drawImage(baseMap, 0, 0, baseMap.width, baseMap.height, 0, 0, width, height);
  }
  ctx.drawImage(cityCanvas, 0, 0, cityCanvas.width, cityCanvas.height, 0, 0, width, height);
  let streetNames = document.querySelector('#street-names');
  if (options.streetNames !== false && streetNames && streetNames.style.display !== 'none') {
    ctx.drawImage(streetNames, 0, 0, streetNames.width, streetNames.height, 0, 0, width, height);
  }

  return Promise.all(collectPrintable(options).map(label => drawTextLabel(label, ctx, ratio))).then(() => {
    let crop = options.crop;
    if (!crop) return full;
    let left = Math.max(0, Math.round(crop.left * ratio));
    let top = Math.max(0, Math.round(crop.top * ratio));
    let right = Math.min(width, Math.round((crop.left + crop.width) * ratio));
    let bottom = Math.min(height, Math.round((crop.top + crop.height) * ratio));
    if (right - left < 2 || bottom - top < 2) throw new Error('El área seleccionada está fuera de la vista. Acércate a ella o quita la selección.');
    let cropped = document.createElement('canvas');
    cropped.width = right - left;
    cropped.height = bottom - top;
    cropped.getContext('2d').drawImage(full, left, top, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
    return cropped;
  });
}

/**
 * Tiles from servers without CORS headers "taint" the canvas, and browsers
 * then refuse to export it.
 */
export function explainCanvasError(e) {
  if (e && e.name === 'SecurityError') {
    let error = new Error('El servidor del mapa base no permite copiar sus teselas en una imagen. Exporta sin mapa base o elige otro.');
    error.tainted = true;
    return error;
  }
  return e;
}

export function getCanvas() {
  return document.querySelector('#canvas')
}

function download(blob, fileName) {
  let url = window.URL.createObjectURL(blob);
  // For some reason, safari doesn't like when download happens on the same
  // event loop cycle. Pushing it to the next one.
  setTimeout(() => {
    let a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    revokeLater(url);
  }, 30);
}

function pad(n) {
  return n < 10 ? '0' + n : String(n);
}

function escapeFileName(str) {
  if (!str) return '';

  return str.replace(/[#%&{}\\/?*><$!'":@+`|=,;]/g, '_');
}

function drawTextLabel(element, ctx, ratio) {
  if (!element) return Promise.resolve();

  return new Promise((resolve) => {
    if (element.element instanceof SVGSVGElement) {
      let svg = element.element;
      let rect = element.bounds;
      let image = new Image();
      image.width = rect.width * ratio;
      image.height = rect.height * ratio;
      image.onload = () => {
        ctx.drawImage(image, rect.left * ratio, rect.top * ratio, image.width, image.height);
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        resolve();
      };

      // Need to set width, otherwise firefox doesn't work: https://stackoverflow.com/questions/28690643/firefox-error-rendering-an-svg-image-to-html5-canvas-with-drawimage
      svg.setAttribute('width', image.width);
      svg.setAttribute('height', image.height);
      image.src = 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(svg));
    } else {
      ctx.save();

      ctx.font = ratio * element.fontSize + 'px ' + element.fontFamily;
      ctx.fillStyle = element.color;
      ctx.textAlign = 'end';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(
        element.text,
        (element.bounds.right - element.paddingRight) * ratio,
        (element.bounds.bottom - element.paddingBottom) * ratio
      )
      ctx.restore();
      resolve();
    }
  });
}

/**
 * Elements marked `.printable` (the place name and the data credits) are
 * copied into exports. Their bounds are made relative to the map canvas,
 * which does not start at the corner of the window.
 */
function collectPrintable(options = {}) {
  let canvasRect = getCanvas().getBoundingClientRect();
  return Array.from(document.querySelectorAll('.printable')).filter(element => {
    if (options.title === false && element.closest('.city-name')) return false;
    return element.offsetParent !== null || element.getClientRects().length > 0;
  }).map(element => {
    let computedStyle = window.getComputedStyle(element);
    let rect = element.getBoundingClientRect();
    let bounds = {
      left: rect.left - canvasRect.left,
      right: rect.right - canvasRect.left,
      top: rect.top - canvasRect.top,
      bottom: rect.bottom - canvasRect.top,
      width: rect.width,
      height: rect.height
    };
    let fontSize = Number.parseFloat(computedStyle.fontSize);
    let paddingRight = Number.parseFloat(computedStyle.paddingRight) || 0;
    let paddingBottom = Number.parseFloat(computedStyle.paddingBottom) || 0;
    // Baseline sits above the bottom padding by the font descent.
    paddingBottom += fontSize * 0.25;

    return {
      text: element.innerText,
      bounds,
      fontSize,
      paddingBottom,
      paddingRight,
      color: computedStyle.color,
      fontFamily: computedStyle.fontFamily,
      fill: computedStyle.color,
      element
    }
  });
}

function revokeLater(url) {
  // In iOS immediately revoked URLs cause "WebKitBlobResource error 1." error
  // Setting a timeout to revoke URL in the future fixes the error:
  setTimeout(() => {
    window.URL.revokeObjectURL(url);
  }, 45000);
}
