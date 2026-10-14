<template>
  <transition name='install'>
    <aside v-if='open' class='install-banner' role='dialog' aria-labelledby='install-title' aria-describedby='install-text'>
      <brand-logo :compact='true' :size='44' tone='light' class='install-logo'/>
      <div class='install-body'>
        <h2 id='install-title' class='install-title'>Instala StreetData</h2>
        <p id='install-text' class='install-text' v-if='pwa.method === "prompt"'>
          Ábrela como una app, con su propio icono y ventana, sin buscarla en el navegador.
        </p>
        <p id='install-text' class='install-text' v-else-if='pwa.method === "ios"'>
          Toca <share-icon :size='15' class='inline-icon' aria-label='Compartir'/> <strong>Compartir</strong> y luego
          <square-plus :size='15' class='inline-icon' aria-hidden='true'/> <strong>Añadir a pantalla de inicio</strong>.
        </p>
        <p id='install-text' class='install-text' v-else-if='pwa.method === "mac-safari"'>
          En el menú <strong>Archivo</strong>, elige <strong>Añadir al Dock</strong>.
        </p>
        <p id='install-text' class='install-text' v-else>
          Abre el menú del navegador <ellipsis-vertical :size='15' class='inline-icon' aria-label='menú'/> y elige
          <strong>Instalar app</strong> o <strong>Añadir a pantalla de inicio</strong>.
        </p>
        <div class='install-actions'>
          <button v-if='pwa.method === "prompt"' type='button' class='btn btn-primary btn-sm' @click='onInstall'>
            <monitor-down :size='16'/>Instalar
          </button>
          <button type='button' class='btn btn-ghost btn-sm' @click='dismissBanner'>
            {{pwa.method === 'prompt' ? 'Ahora no' : 'Entendido'}}
          </button>
        </div>
      </div>
      <button type='button' class='icon-btn install-close' aria-label='Cerrar aviso de instalación' @click='dismissBanner'>
        <x-icon :size='16'/>
      </button>
    </aside>
  </transition>
</template>

<script>
import {MonitorDown, Share, SquarePlus, EllipsisVertical, X} from 'lucide-vue-next';
import BrandLogo from './BrandLogo.vue';
import {pwa, install, dismissBanner, canInstall} from '../lib/pwa.js';
import {notify} from '../lib/toasts.js';

/**
 * Invitation to install StreetData as an app. Only shown while it isn't
 * installed; "Ahora no" hides it for a week.
 */
export default {
  name: 'InstallBanner',
  components: {BrandLogo, MonitorDown, ShareIcon: Share, SquarePlus, EllipsisVertical, XIcon: X},
  setup() {
    return {pwa, dismissBanner};
  },
  computed: {
    open() {
      return pwa.bannerOpen && canInstall();
    }
  },
  methods: {
    onInstall() {
      install().then(accepted => {
        if (accepted) notify('StreetData se está instalando', {kind: 'success', detail: 'La encontrarás junto a tus otras apps.'});
      });
    }
  }
}
</script>

<style>
.install-banner {
  position: fixed;
  /* Centered on the map, between the side panels. */
  left: calc(var(--stage-left, 0px) + (100vw - var(--stage-left, 0px) - var(--stage-right, 0px)) / 2);
  bottom: 16px;
  z-index: 60;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(440px, calc(100vw - 24px));
  padding: 14px 40px 14px 14px;
  transform: translateX(-50%);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.install-logo {
  flex-shrink: 0;
}
.install-body {
  min-width: 0;
}
.install-title {
  margin: 0 0 2px;
  font-size: 15px;
  font-weight: 700;
}
.install-text {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
  line-height: 1.45;
}
.install-text strong {
  color: var(--text);
  font-weight: 600;
}
.inline-icon {
  display: inline-block;
  vertical-align: -2px;
  color: var(--text);
}
.install-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.install-close {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 30px;
  height: 30px;
  color: var(--text-muted);
}
.install-enter-active,
.install-leave-active {
  transition: opacity 200ms ease-out, transform 200ms ease-out;
}
.install-enter-from,
.install-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
@media (max-width: 640px) {
  .install-banner {
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom));
  }
}
</style>
