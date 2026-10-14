<template>
  <div class='map-legend' :class='{collapsed}'>
    <button type='button' class='legend-toggle' :aria-expanded='!collapsed' aria-controls='legend-items' @click='collapsed = !collapsed'>
      <span>Leyenda</span>
      <chevron-down :size='14' class='legend-chevron'/>
    </button>
    <ul v-show='!collapsed' id='legend-items' class='legend-items'>
      <li v-if='layers.streets'><span class='legend-line' :style='{background: colors.roads}'></span>Calles</li>
      <li v-if='layers.parcels && parcelsReady'><span class='legend-poly' :style='{borderColor: colors.parcels}'></span>Parcelas</li>
      <li v-if='layers.names && namesReady'><span class='legend-label' :style='{color: colors.labels}'>Aa</span>Nombres de calles</li>
      <li v-if='hasArea'><span class='legend-area'></span>Área de exportación</li>
      <li v-if='hasFeature'><span class='legend-selected'></span>Selección</li>
      <li v-if='!layers.streets && !(layers.parcels && parcelsReady)' class='legend-empty'>No hay capas visibles</li>
    </ul>
  </div>
</template>

<script>
import {ChevronDown} from 'lucide-vue-next';

export default {
  name: 'MapLegend',
  components: {ChevronDown},
  props: {
    layers: Object,
    colors: Object,
    parcelsReady: Boolean,
    namesReady: Boolean,
    hasArea: Boolean,
    hasFeature: Boolean
  },
  data() {
    return {collapsed: window.innerWidth < 720};
  }
}
</script>

<style>
.map-legend {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--map-chrome);
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 12px;
}
.legend-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: var(--text-muted);
  cursor: pointer;
}
.legend-chevron {
  transition: transform var(--transition);
}
.map-legend.collapsed .legend-chevron {
  transform: rotate(-90deg);
}
.legend-items {
  margin: 0;
  padding: 0 10px 8px;
  list-style: none;
}
.legend-items li {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  color: var(--text);
}
.legend-line {
  width: 18px;
  height: 3px;
  border-radius: 2px;
}
.legend-poly {
  width: 14px;
  height: 12px;
  margin: 0 2px;
  border: 1.5px solid;
  border-radius: 2px;
}
.legend-label {
  width: 18px;
  font-weight: 700;
  text-align: center;
}
.legend-area {
  width: 16px;
  height: 12px;
  margin: 0 1px;
  border: 1.5px dashed var(--sd-cyan);
  border-radius: 2px;
}
.legend-selected {
  width: 18px;
  height: 4px;
  border-radius: 2px;
  background: var(--sd-cyan);
  box-shadow: 0 0 0 1.5px rgba(11, 20, 36, 0.55);
}
.legend-empty {
  color: var(--text-muted) !important;
}
</style>
