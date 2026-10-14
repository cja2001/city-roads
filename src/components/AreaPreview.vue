<template>
  <svg class='area-preview' viewBox='0 0 100 100' role='img' :aria-label='label'>
    <rect x='0' y='0' width='100' height='100' class='area-preview-bg'/>
    <path v-if='path' :d='path' class='area-preview-shape' fill-rule='evenodd'/>
    <g v-else class='area-preview-empty'>
      <circle cx='50' cy='50' r='5'/>
    </g>
  </svg>
</template>

<script>
/**
 * Thumbnail of the outline of the chosen place (from Nominatim), so the user
 * sees what will be extracted before downloading anything.
 */
export default {
  name: 'AreaPreview',
  props: {
    boundary: Object,
    bbox: Array // [south, west, north, east]
  },
  computed: {
    label() {
      return this.boundary ? 'Contorno del área seleccionada' : 'Rectángulo del área seleccionada';
    },
    rings() {
      let b = this.boundary;
      if (b && b.type === 'Polygon') return b.coordinates;
      if (b && b.type === 'MultiPolygon') return [].concat(...b.coordinates);
      if (this.bbox) {
        let [south, west, north, east] = this.bbox;
        return [[[west, south], [east, south], [east, north], [west, north], [west, south]]];
      }
      return null;
    },
    path() {
      let rings = this.rings;
      if (!rings || !rings.length) return '';
      let all = [].concat(...rings);
      let lats = all.map(p => p[1]);
      let midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      let k = Math.cos(midLat * Math.PI / 180);
      let xs = all.map(p => p[0] * k), ys = all.map(p => -p[1]);
      let minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      let size = Math.max(maxX - minX, maxY - minY) || 1;
      let scale = 84 / size;
      let offsetX = 50 - (minX + maxX) / 2 * scale;
      let offsetY = 50 - (minY + maxY) / 2 * scale;
      return rings.map(ring => {
        // Long outlines are thinned out; the thumbnail is tiny.
        let step = Math.max(1, Math.floor(ring.length / 400));
        let points = ring.filter((p, i) => i % step === 0);
        return 'M' + points.map(p => (p[0] * k * scale + offsetX).toFixed(1) + ',' + (-p[1] * scale + offsetY).toFixed(1)).join('L') + 'Z';
      }).join('');
    }
  }
}
</script>

<style>
.area-preview {
  display: block;
  width: 64px;
  height: 64px;
  flex-shrink: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
}
.area-preview-bg {
  fill: var(--surface-2);
}
.area-preview-shape {
  fill: var(--accent-soft);
  stroke: var(--accent-text);
  stroke-width: 1.5;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}
.area-preview-empty {
  fill: var(--text-faint);
}
</style>
