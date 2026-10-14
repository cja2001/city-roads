<template>
  <div class='map-status'>
    <div v-if='scale' class='scale-bar' aria-label='Escala gráfica'>
      <span class='scale-line' :style='{width: scale.pixels + "px"}'></span>
      <span class='scale-text'>{{scale.label}}</span>
    </div>
    <div class='coords' :title='pointer ? "Coordenadas del cursor (WGS 84)" : "Coordenadas del centro del mapa (WGS 84)"'>
      <crosshair :size='12'/>
      <span>{{coordsText}}</span>
    </div>
  </div>
</template>

<script>
import {Crosshair} from 'lucide-vue-next';
import {formatCoordinate} from '../lib/format.js';

const MAX_BAR = 110;

/**
 * Graphic scale and coordinates (cursor, or the center of the map on touch
 * screens).
 */
export default {
  name: 'MapStatus',
  components: {Crosshair},
  props: {
    metersPerPixel: Number,
    center: Array,
    pointer: Array
  },
  computed: {
    scale() {
      let mpp = this.metersPerPixel;
      if (!mpp || !Number.isFinite(mpp)) return null;
      let maxMeters = mpp * MAX_BAR;
      let magnitude = Math.pow(10, Math.floor(Math.log10(maxMeters)));
      let nice = [5, 2, 1].map(k => k * magnitude).find(v => v <= maxMeters) || magnitude;
      let label = nice >= 1000 ? (nice / 1000).toString().replace('.', ',') + ' km' : nice + ' m';
      return {pixels: Math.round(nice / mpp), label};
    },
    coordsText() {
      let p = this.pointer || this.center;
      if (!p) return '—';
      return formatCoordinate(p[1], 'N', 'S') + '  ' + formatCoordinate(p[0], 'E', 'O');
    }
  }
}
</script>

<style>
.map-status {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--map-chrome);
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 11px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.scale-bar {
  display: flex;
  align-items: center;
  gap: 6px;
}
.scale-line {
  height: 6px;
  border: 1.5px solid var(--text);
  border-top: 0;
}
.coords {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono);
  white-space: pre;
  color: var(--text-muted);
}
@media (max-width: 720px) {
  .coords {
    display: none;
  }
}
</style>
