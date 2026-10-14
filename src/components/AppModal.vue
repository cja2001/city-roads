<template>
  <teleport to='body'>
    <div class='modal-scrim' @mousedown.self='$emit("close")'>
      <div class='modal' :class='["modal-" + size]' role='dialog' aria-modal='true' :aria-labelledby='titleId'
        ref='dialog' @keydown='onKeyDown'>
        <header class='modal-header'>
          <h2 :id='titleId' class='modal-title'>{{title}}</h2>
          <button type='button' class='icon-btn' aria-label='Cerrar' @click='$emit("close")'>
            <x-icon :size='18'/>
          </button>
        </header>
        <div class='modal-body scroll-y'>
          <slot></slot>
        </div>
        <footer v-if='$slots.footer' class='modal-footer'>
          <slot name='footer'></slot>
        </footer>
      </div>
    </div>
  </teleport>
</template>

<script>
import {X} from 'lucide-vue-next';

let counter = 0;

/**
 * Accessible dialog: focus moves inside when it opens, Tab stays inside,
 * Escape closes it and focus returns to the button that opened it.
 */
export default {
  name: 'AppModal',
  components: {XIcon: X},
  props: {
    title: {type: String, required: true},
    size: {type: String, default: 'md'}
  },
  emits: ['close'],
  data() {
    return {titleId: 'modal-title-' + (++counter)};
  },
  mounted() {
    this.previousFocus = document.activeElement;
    this.$nextTick(() => {
      let target = this.$refs.dialog.querySelector('[autofocus]') || this.focusable()[1] || this.focusable()[0];
      if (target) target.focus();
    });
  },
  beforeUnmount() {
    if (this.previousFocus && this.previousFocus.focus) this.previousFocus.focus();
  },
  methods: {
    focusable() {
      return Array.from(this.$refs.dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
      ));
    },
    onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.$emit('close');
        return;
      }
      if (e.key !== 'Tab') return;
      let items = this.focusable();
      if (!items.length) return;
      let first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }
  }
}
</script>

<style>
.modal-scrim {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--scrim);
  animation: sd-fade 120ms ease-out;
}
.modal {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-height: calc(100vh - 32px);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
  animation: sd-rise 160ms ease-out;
}
.modal-sm { max-width: 420px; }
.modal-md { max-width: 560px; }
.modal-lg { max-width: 820px; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px 10px 20px;
}
.modal-title {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}
.modal-body {
  padding: 0 20px 16px;
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
}
@keyframes sd-fade {
  from { opacity: 0; }
}
@keyframes sd-rise {
  from { opacity: 0; transform: translateY(8px); }
}
@media (max-width: 600px) {
  .modal-scrim {
    align-items: flex-end;
    padding: 0;
  }
  .modal {
    max-height: 92vh;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }
}
</style>
