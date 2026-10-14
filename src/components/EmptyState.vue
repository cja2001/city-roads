<template>
  <div class='empty-state'>
    <svg class='empty-network' viewBox='0 0 600 400' aria-hidden='true' preserveAspectRatio='xMidYMid slice'>
      <g class='net-minor'>
        <path d='M0 70 H600 M0 150 H600 M0 255 H600 M0 335 H600 M70 0 V400 M180 0 V400 M300 0 V400 M420 0 V400 M530 0 V400'/>
      </g>
      <g class='net-major'>
        <path d='M0 210 C150 190 260 230 380 200 S560 170 600 180 M240 0 C250 120 230 260 260 400 M0 380 L600 30'/>
      </g>
    </svg>
    <div class='empty-card'>
      <brand-logo :compact='true' :size='44' tone='light' class='empty-logo'/>
      <h1 class='empty-title'>Cada calle cuenta una historia.</h1>
      <p class='empty-tagline'>Extrae. Analiza. Exporta.</p>
      <ol class='empty-steps'>
        <li><span>1</span>Busca un lugar en el panel «Extraer datos».</li>
        <li><span>2</span>Elige la fuente, las calles, las parcelas y los nombres.</li>
        <li><span>3</span>Extrae los datos y descárgalos en KML, PNG o SVG.</li>
      </ol>
      <button type='button' class='btn btn-primary empty-start' @click='$emit("start")'>
        <search-icon :size='16'/> Buscar un lugar
      </button>
    </div>
  </div>
</template>

<script>
import {Search} from 'lucide-vue-next';
import BrandLogo from './BrandLogo.vue';

/**
 * What the map area shows before any data is extracted.
 */
export default {
  name: 'EmptyState',
  components: {BrandLogo, SearchIcon: Search},
  emits: ['start']
}
</script>

<style>
.empty-state {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}
.empty-network {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.empty-network path {
  fill: none;
  stroke-linecap: round;
}
.net-minor path {
  stroke: var(--border);
  stroke-width: 1;
}
.net-major path {
  stroke: var(--surface-3);
  stroke-width: 3;
}
.empty-card {
  position: relative;
  max-width: 440px;
  padding: 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
  text-align: center;
}
.empty-logo {
  justify-content: center;
}
.empty-title {
  margin: 16px 0 4px;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.3px;
}
.empty-tagline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: var(--accent-text);
}
.empty-steps {
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
  text-align: left;
}
.empty-steps li {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 6px 0;
  font-size: 13.5px;
  color: var(--text-muted);
}
.empty-steps span {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent-text);
  font-size: 11px;
  font-weight: 700;
}
.empty-start {
  margin-top: 18px;
  display: none;
}
@media (max-width: 1023px) {
  .empty-start {
    display: inline-flex;
  }
}
@media (max-width: 720px) {
  .empty-state {
    align-items: flex-start;
    padding: 16px;
  }
  .empty-card {
    padding: 20px;
  }
  .empty-title {
    font-size: 19px;
  }
}
</style>
