<template>
  <div class='toast-host' role='status' aria-live='polite'>
    <transition-group name='toast'>
      <div v-for='toast in toasts' :key='toast.id' class='toast' :class='"toast-" + toast.kind'>
        <circle-check v-if='toast.kind === "success"' :size='18' class='toast-icon'/>
        <circle-alert v-else-if='toast.kind === "error"' :size='18' class='toast-icon'/>
        <info v-else :size='18' class='toast-icon'/>
        <div class='toast-text'>
          <div class='toast-message'>{{toast.message}}</div>
          <div v-if='toast.detail' class='toast-detail'>{{toast.detail}}</div>
        </div>
        <button type='button' class='icon-btn toast-close' aria-label='Cerrar notificación' @click='dismiss(toast.id)'>
          <x-icon :size='16'/>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<script>
import {CircleCheck, CircleAlert, Info, X} from 'lucide-vue-next';
import {toasts, dismiss} from '../lib/toasts.js';

export default {
  name: 'ToastHost',
  components: {CircleCheck, CircleAlert, Info, XIcon: X},
  setup() {
    return {toasts, dismiss};
  }
}
</script>

<style>
.toast-host {
  position: fixed;
  top: calc(var(--topbar-height) + 12px);
  left: var(--stage-left);
  right: var(--stage-right);
  z-index: 90;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 0 64px;
  pointer-events: none;
}
.toast-host > * {
  width: min(380px, 100%);
}
@media (max-width: 720px) {
  .toast-host {
    top: auto;
    bottom: 12px;
    padding: 0 12px;
  }
}
.toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 6px 10px 12px;
  border: 1px solid var(--border);
  border-left: 3px solid var(--text-muted);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}
.toast-success {
  border-left-color: var(--accent);
}
.toast-success .toast-icon {
  color: var(--accent-text);
}
.toast-error {
  border-left-color: var(--danger);
}
.toast-error .toast-icon {
  color: var(--danger);
}
.toast-icon {
  flex-shrink: 0;
  margin-top: 1px;
}
.toast-text {
  flex: 1;
  min-width: 0;
}
.toast-message {
  font-size: 14px;
  font-weight: 600;
}
.toast-detail {
  margin-top: 2px;
  font-size: 13px;
  color: var(--text-muted);
  word-break: break-word;
}
.toast-close {
  width: 28px;
  height: 28px;
  margin-top: -4px;
}
.toast-enter-active,
.toast-leave-active {
  transition: opacity 150ms ease-out, transform 150ms ease-out;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
