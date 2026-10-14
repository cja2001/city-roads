<template>
  <div class='map-controls' role='toolbar' aria-label='Controles del mapa' aria-orientation='vertical'>
    <div class='control-group'>
      <button type='button' class='map-btn' aria-label='Acercar' data-tip='Acercar (+)' data-tip-pos='left' @click='$emit("zoom", 0.5)'>
        <plus-icon :size='18'/>
      </button>
      <button type='button' class='map-btn' aria-label='Alejar' data-tip='Alejar (−)' data-tip-pos='left' @click='$emit("zoom", -1)'>
        <minus-icon :size='18'/>
      </button>
    </div>
    <div class='control-group'>
      <button type='button' class='map-btn' aria-label='Ver toda el área extraída' data-tip='Ver toda el área' data-tip-pos='left' @click='$emit("fit")'>
        <maximize-icon :size='17'/>
      </button>
      <button type='button' class='map-btn' :class='{active: drawing}' :aria-pressed='drawing' aria-label='Dibujar área de exportación'
        data-tip='Dibujar área de exportación' data-tip-pos='left' @click='$emit("draw")'>
        <square-dashed-mouse-pointer :size='17'/>
      </button>
    </div>
  </div>
</template>

<script>
import {Plus, Minus, Maximize, SquareDashedMousePointer} from 'lucide-vue-next';

export default {
  name: 'MapControls',
  components: {PlusIcon: Plus, MinusIcon: Minus, MaximizeIcon: Maximize, SquareDashedMousePointer},
  props: {drawing: Boolean},
  emits: ['zoom', 'fit', 'draw']
}
</script>

<style>
.map-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.control-group {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--map-chrome);
  box-shadow: var(--shadow);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.map-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 0;
  background: transparent;
  color: var(--text);
  cursor: pointer;
}
.map-btn + .map-btn {
  border-top: 1px solid var(--border);
}
.control-group .map-btn:first-child {
  border-radius: var(--radius) var(--radius) 0 0;
}
.control-group .map-btn:last-child {
  border-radius: 0 0 var(--radius) var(--radius);
}
.map-btn:hover {
  background: var(--surface-2);
}
.map-btn.active {
  background: var(--accent);
  color: var(--on-accent);
}
@media (max-width: 720px) {
  .map-btn {
    width: 44px;
    height: 44px;
  }
}
</style>
