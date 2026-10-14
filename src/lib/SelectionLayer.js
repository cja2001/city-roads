import bus from './bus.js';
import {SELECTION_COLOR} from './mapStyles.js';

/**
 * Draws what the user selected on top of the map: the export area and the
 * highlighted street or parcel. It is a separate canvas, so it never ends up
 * in exported images.
 */
export default class SelectionLayer {
  constructor(scene) {
    this.scene = scene;
    this.area = null; // counter-clockwise polygon in scene coordinates
    this.feature = null; // {points, closed}
    this.draft = null; // rectangle being drawn, in css pixels
    this.pendingFrame = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'selection-overlay';
    Object.assign(this.canvas.style, {
      position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
      pointerEvents: 'none'
    });
    let cityCanvas = document.querySelector('#canvas');
    cityCanvas.parentNode.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.requestRender = this.requestRender.bind(this);
    bus.on('scene-transform', this.requestRender);
    window.addEventListener('resize', this.requestRender);
  }

  setArea(area) {
    this.area = area;
    this.requestRender();
  }

  setFeature(feature) {
    this.feature = feature;
    this.requestRender();
  }

  setDraft(rect) {
    this.draft = rect;
    this.requestRender();
  }

  requestRender() {
    if (this.pendingFrame) return;
    this.pendingFrame = requestAnimationFrame(() => {
      this.pendingFrame = 0;
      this.render();
    });
  }

  toScreen(point) {
    return this.scene.getRenderer().getClientCoordinate(point.x, point.y);
  }

  render() {
    let {canvas, ctx} = this;
    let cityCanvas = document.querySelector('#canvas');
    if (!cityCanvas) return;
    if (canvas.width !== cityCanvas.width) canvas.width = cityCanvas.width;
    if (canvas.height !== cityCanvas.height) canvas.height = cityCanvas.height;
    let cssWidth = cityCanvas.clientWidth;
    let cssHeight = cityCanvas.clientHeight;
    let ratio = canvas.width / (cssWidth || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    if (this.area) {
      let corners = this.area.map(p => this.toScreen(p));
      // Dim everything outside of the export area.
      ctx.beginPath();
      ctx.rect(0, 0, cssWidth, cssHeight);
      tracePath(ctx, corners, true);
      ctx.fillStyle = 'rgba(11, 20, 36, 0.28)';
      ctx.fill('evenodd');

      ctx.beginPath();
      tracePath(ctx, corners, true);
      ctx.setLineDash([8, 5]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.stroke();
      ctx.setLineDash([]);
      corners.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = SELECTION_COLOR;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#0B1424';
        ctx.stroke();
      });
    }

    if (this.feature) {
      let points = this.feature.points.map(p => this.toScreen(p));
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      tracePath(ctx, points, this.feature.closed);
      if (this.feature.closed) {
        ctx.fillStyle = 'rgba(77, 225, 210, 0.22)';
        ctx.fill();
      }
      ctx.lineWidth = 7;
      ctx.strokeStyle = 'rgba(11, 20, 36, 0.55)';
      ctx.stroke();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.stroke();
    }

    if (this.draft) {
      let {x, y, width, height} = this.draft;
      ctx.fillStyle = 'rgba(77, 225, 210, 0.12)';
      ctx.fillRect(x, y, width, height);
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.strokeRect(x, y, width, height);
      ctx.setLineDash([]);
    }
  }

  dispose() {
    if (this.pendingFrame) cancelAnimationFrame(this.pendingFrame);
    bus.off('scene-transform', this.requestRender);
    window.removeEventListener('resize', this.requestRender);
    this.canvas.remove();
  }
}

function tracePath(ctx, points, closed) {
  points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  if (closed) ctx.closePath();
}
