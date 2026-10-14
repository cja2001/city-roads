<template>
  <div class='segmented source-picker' :class='{dark}' role='radiogroup' aria-label='Fuente de las calles' @keydown='onKey'>
    <button v-for='(info, key) in sources' :key='key' type='button' role='radio' :aria-checked='modelValue === key'
      :tabindex='modelValue === key ? 0 : -1' :title='hints[key]' @click='$emit("update:modelValue", key)'>
      {{info.label}}
    </button>
  </div>
</template>

<script>
import {SOURCES} from '../lib/extractRoads.js';

/**
 * OpenStreetMap / Overture / Ambas, as a radio group (arrow keys move the choice).
 */
export default {
  name: 'SourcePicker',
  props: {
    modelValue: String,
    dark: Boolean
  },
  emits: ['update:modelValue'],
  data() {
    return {
      sources: SOURCES,
      hints: {
        osm: 'Calles de OpenStreetMap, con nombres y atributos',
        overture: 'Overture Maps: OpenStreetMap combinado con datos de Microsoft, TomTom y Meta',
        both: 'Todas las calles de OpenStreetMap, más las de Overture que le faltan, sin duplicados'
      }
    };
  },
  methods: {
    onKey(e) {
      let keys = Object.keys(this.sources);
      let index = keys.indexOf(this.modelValue);
      let next = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = keys[(index + 1) % keys.length];
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = keys[(index - 1 + keys.length) % keys.length];
      if (!next) return;
      e.preventDefault();
      this.$emit('update:modelValue', next);
      this.$nextTick(() => {
        let button = this.$el.querySelector('[aria-checked="true"]');
        if (button) button.focus();
      });
    }
  }
}
</script>

<style>
.source-picker.dark {
  background: rgba(255, 255, 255, 0.04);
  border-color: var(--topbar-border);
}
.source-picker.dark button {
  color: var(--topbar-muted);
}
.source-picker.dark button:hover {
  color: var(--topbar-text);
}
.source-picker.dark button[aria-checked="true"] {
  background: var(--sd-navy-surface);
  color: var(--sd-cyan);
  box-shadow: inset 0 0 0 1px rgba(77, 225, 210, 0.35);
}
.source-picker.dark button:focus-visible {
  box-shadow: 0 0 0 2px var(--sd-cyan);
}
</style>
