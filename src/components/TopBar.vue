<template>
  <header class='topbar'>
    <a class='topbar-brand' href='./' aria-label='StreetData, inicio' @click.prevent='$emit("new-extraction")'>
      <brand-logo :descriptor='true' class='brand-full'/>
      <brand-logo :compact='true' class='brand-compact' :size='28'/>
    </a>

    <div class='topbar-source' :title='hasData ? "Fuente de la próxima extracción" : "Fuente de las calles"'>
      <span class='topbar-label'>Fuente</span>
      <source-picker :model-value='source' dark @update:model-value='$emit("set-source", $event)'/>
    </div>

    <div class='topbar-actions'>
      <button type='button' class='topbar-btn panel-toggle' :class='{active: extractOpen}' :aria-pressed='extractOpen'
        aria-label='Panel de extracción' data-tip='Extraer datos' @click='$emit("toggle-extract")'>
        <scan-search :size='18'/><span class='topbar-btn-text'>Extraer</span>
      </button>
      <button type='button' class='topbar-btn panel-toggle' :class='{active: layersOpen}' :aria-pressed='layersOpen'
        :disabled='!hasData' aria-label='Capas y datos' data-tip='Capas y datos' @click='$emit("toggle-layers")'>
        <layers-icon :size='18'/><span class='topbar-btn-text'>Capas</span>
      </button>

      <div class='export-menu' ref='menu'>
        <button type='button' class='btn btn-primary topbar-export' :disabled='!hasData' aria-haspopup='menu'
          :aria-expanded='menuOpen' @click='menuOpen = !menuOpen' @keydown.down.prevent='openMenu'>
          <download-icon :size='17'/><span class='topbar-btn-text'>Exportar</span><chevron-down :size='15' class='chevron'/>
        </button>
        <div v-if='menuOpen' class='menu' role='menu' @keydown='onMenuKey'>
          <button type='button' role='menuitem' class='menu-item' @click='choose("png")'>
            <image-icon :size='17'/>
            <span><strong>PNG</strong><small>Imagen de la vista, con vista previa</small></span>
          </button>
          <button type='button' role='menuitem' class='menu-item' @click='choose("svg")'>
            <pen-tool :size='17'/>
            <span><strong>SVG</strong><small>Imagen vectorial de la vista</small></span>
          </button>
          <button type='button' role='menuitem' class='menu-item' @click='choose("kml")'>
            <globe-icon :size='17'/>
            <span><strong>KML</strong><small>Geometrías para Google Earth y SIG</small></span>
          </button>
        </div>
      </div>

      <span class='topbar-divider' aria-hidden='true'></span>
      <button type='button' class='topbar-btn icon-only' :aria-label='theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"'
        :data-tip='theme === "dark" ? "Modo claro" : "Modo oscuro"' @click='$emit("toggle-theme")'>
        <sun-icon v-if='theme === "dark"' :size='18'/>
        <moon-icon v-else :size='18'/>
      </button>
      <button type='button' class='topbar-btn icon-only' aria-label='Ayuda y documentación' data-tip='Ayuda' @click='$emit("open-help")'>
        <circle-help :size='18'/>
      </button>
    </div>
  </header>
</template>

<script>
import {ScanSearch, Layers, Download, ChevronDown, Image, PenTool, Globe, Sun, Moon, CircleHelp} from 'lucide-vue-next';
import BrandLogo from './BrandLogo.vue';
import SourcePicker from './SourcePicker.vue';

export default {
  name: 'TopBar',
  components: {
    BrandLogo, SourcePicker, ScanSearch, LayersIcon: Layers, DownloadIcon: Download, ChevronDown,
    ImageIcon: Image, PenTool, GlobeIcon: Globe, SunIcon: Sun, MoonIcon: Moon, CircleHelp
  },
  props: {
    theme: String,
    source: String,
    hasData: Boolean,
    extractOpen: Boolean,
    layersOpen: Boolean
  },
  emits: ['toggle-theme', 'open-help', 'set-source', 'toggle-extract', 'toggle-layers', 'export', 'new-extraction'],
  data() {
    return {menuOpen: false};
  },
  watch: {
    menuOpen(open) {
      if (open) {
        document.addEventListener('mousedown', this.onOutside, true);
        this.$nextTick(() => {
          let first = this.$refs.menu.querySelector('.menu-item');
          if (first) first.focus();
        });
      } else {
        document.removeEventListener('mousedown', this.onOutside, true);
      }
    }
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onOutside, true);
  },
  methods: {
    openMenu() {
      this.menuOpen = true;
    },
    onOutside(e) {
      if (!this.$refs.menu.contains(e.target)) this.menuOpen = false;
    },
    choose(format) {
      this.menuOpen = false;
      this.$emit('export', format);
    },
    onMenuKey(e) {
      let items = Array.from(this.$refs.menu.querySelectorAll('.menu-item'));
      let index = items.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        this.menuOpen = false;
        this.$refs.menu.querySelector('.topbar-export').focus();
      } else if (e.key === 'ArrowDown') {
        items[(index + 1) % items.length].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowUp') {
        items[(index - 1 + items.length) % items.length].focus();
        e.preventDefault();
      } else if (e.key === 'Tab') {
        this.menuOpen = false;
      }
    }
  }
}
</script>

<style>
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 16px;
  height: var(--topbar-height);
  padding: 0 12px 0 16px;
  background: var(--topbar-bg);
  border-bottom: 1px solid var(--topbar-border);
  color: var(--topbar-text);
}
.topbar-brand {
  display: flex;
  align-items: center;
  color: inherit;
  border-radius: var(--radius-sm);
}
.topbar-brand:hover {
  text-decoration: none;
}
.brand-compact {
  display: none !important;
}
.topbar-source {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 12px;
  padding-left: 16px;
  border-left: 1px solid var(--topbar-border);
}
.topbar-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--topbar-muted);
}
.topbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
.topbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 36px;
  padding: 0 11px;
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  color: var(--topbar-muted);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition), color var(--transition);
}
.topbar-btn:hover:not(:disabled) {
  background: var(--topbar-hover);
  color: var(--topbar-text);
}
.topbar-btn.active {
  color: var(--sd-cyan);
  background: rgba(77, 225, 210, 0.1);
}
.topbar-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.topbar-btn.icon-only {
  width: 36px;
  padding: 0;
  justify-content: center;
}
.topbar-btn:focus-visible,
.topbar-export:focus-visible,
.topbar-brand:focus-visible {
  box-shadow: 0 0 0 2px var(--sd-navy), 0 0 0 4px var(--sd-cyan);
}
.topbar-divider {
  width: 1px;
  height: 22px;
  margin: 0 6px;
  background: var(--topbar-border);
}
.export-menu {
  position: relative;
  margin-left: 6px;
}
.topbar-export {
  height: 36px;
  gap: 7px;
}
.topbar-export:disabled {
  opacity: 0.35;
}
.topbar-export .chevron {
  margin-left: -2px;
}
.menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 60;
  width: 270px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}
.menu-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 9px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.menu-item:hover,
.menu-item:focus-visible {
  background: var(--surface-2);
  box-shadow: none;
}
.menu-item svg {
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent-text);
}
.menu-item strong {
  display: block;
  font-size: 14px;
}
.menu-item small {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
}

@media (max-width: 1100px) {
  .topbar-source .topbar-label {
    display: none;
  }
}
@media (max-width: 960px) {
  .topbar-source {
    display: none;
  }
}
@media (max-width: 720px) {
  .topbar {
    gap: 8px;
    padding: 0 8px 0 12px;
  }
  .brand-full {
    display: none !important;
  }
  .brand-compact {
    display: inline-flex !important;
  }
  .topbar-btn-text {
    display: none;
  }
  .topbar-btn,
  .topbar-btn.icon-only {
    width: 40px;
    height: 40px;
    padding: 0;
    justify-content: center;
  }
  .topbar-export {
    width: 44px;
    height: 40px;
    padding: 0;
  }
  .topbar-export .chevron {
    display: none;
  }
  .topbar-divider {
    display: none;
  }
  .topbar-actions {
    gap: 2px;
  }
  /* Tooltips under the top bar would cover the map edge on phones. */
  .topbar [data-tip]::after {
    display: none;
  }
}
@media (max-width: 380px) {
  .export-menu {
    margin-left: 2px;
  }
}
</style>
