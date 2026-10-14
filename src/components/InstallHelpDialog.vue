<template>
  <app-modal title='Instalar StreetData' size='sm' @close='closeInstallHelp'>
    <p class='install-help-intro'>{{steps.intro}}</p>
    <ol v-if='steps.list.length' class='install-steps'>
      <li v-for='(step, i) in steps.list' :key='i' v-html='step'></li>
    </ol>
    <div v-if='copyLink' class='install-copy'>
      <input class='input' readonly :value='pageUrl' aria-label='Dirección de StreetData' @focus='$event.target.select()'>
      <button type='button' class='btn' @click='copy'>
        <copy-icon :size='16'/>{{copied ? 'Copiado' : 'Copiar'}}
      </button>
    </div>
    <template #footer>
      <button type='button' class='btn btn-primary' autofocus @click='closeInstallHelp'>Entendido</button>
    </template>
  </app-modal>
</template>

<script>
import {Copy} from 'lucide-vue-next';
import AppModal from './AppModal.vue';
import {pwa, closeInstallHelp} from '../lib/pwa.js';

// Inline icons drawn like the browser buttons they point to.
const SHARE = `<svg class='step-icon' viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 2v13'/><path d='m16 6-4-4-4 4'/><path d='M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8'/></svg>`;
const DOTS = `<svg class='step-icon' viewBox='0 0 24 24' width='16' height='16' fill='currentColor' aria-hidden='true'><circle cx='12' cy='5' r='2'/><circle cx='12' cy='12' r='2'/><circle cx='12' cy='19' r='2'/></svg>`;
const MENU = `<svg class='step-icon' viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' aria-hidden='true'><path d='M4 6h16M4 12h16M4 18h16'/></svg>`;
const INSTALL = `<svg class='step-icon' viewBox='0 0 24 24' width='16' height='16' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'><path d='M12 17V3'/><path d='m6 11 6 6 6-6'/><path d='M19 21H5'/></svg>`;

const STEPS = {
  'ios-safari': {
    intro: 'En iPhone y iPad la app se instala desde el menú Compartir de Safari:',
    list: [
      `Toca ${SHARE} <strong>Compartir</strong> en la barra de Safari (abajo en iPhone, arriba en iPad).`,
      'Desliza hacia abajo y toca <strong>Añadir a pantalla de inicio</strong>.',
      'Toca <strong>Añadir</strong>. StreetData aparecerá con su icono junto a tus apps.'
    ]
  },
  'ios-other': {
    intro: 'En iPhone y iPad la app se instala desde el menú Compartir:',
    list: [
      `Toca ${SHARE} <strong>Compartir</strong> (en Chrome está junto a la barra de direcciones).`,
      'Elige <strong>Añadir a pantalla de inicio</strong>. Si no aparece, abre esta página en <strong>Safari</strong> y repite.',
      'Toca <strong>Añadir</strong>.'
    ]
  },
  'in-app': {
    intro: 'Estás viendo StreetData dentro de otra app, que no permite instalar aplicaciones. Ábrela en tu navegador:',
    list: [
      `Toca ${DOTS} o ${SHARE} arriba o abajo de la pantalla.`,
      'Elige <strong>Abrir en el navegador</strong> (Chrome o Safari).',
      'Allí toca de nuevo <strong>Instalar app</strong>.'
    ],
    copyLink: true
  },
  samsung: {
    intro: 'En Samsung Internet:',
    list: [
      `Toca ${MENU} el menú de abajo a la derecha.`,
      'Elige <strong>Añadir página a</strong> → <strong>Pantalla de inicio</strong> (o <strong>Instalar</strong> si aparece).',
      'Confirma con <strong>Añadir</strong>.'
    ]
  },
  'firefox-android': {
    intro: 'En Firefox para Android:',
    list: [
      `Toca ${DOTS} el menú.`,
      'Elige <strong>Instalar</strong> o <strong>Añadir a pantalla de inicio</strong>.',
      'Confirma con <strong>Añadir</strong>.'
    ]
  },
  android: {
    intro: 'En Chrome para Android:',
    list: [
      `Toca ${DOTS} el menú, arriba a la derecha.`,
      'Elige <strong>Instalar app</strong> (o <strong>Añadir a pantalla de inicio</strong>).',
      'Confirma con <strong>Instalar</strong>.',
      'Si no aparece, recarga la página una vez y vuelve a tocar «Instalar».'
    ]
  },
  'mac-safari': {
    intro: 'En Safari para Mac (macOS Sonoma o posterior):',
    list: [
      'Abre el menú <strong>Archivo</strong>.',
      'Elige <strong>Añadir al Dock</strong> y luego <strong>Añadir</strong>.'
    ]
  },
  'desktop-chromium': {
    intro: 'En Chrome o Edge para computadora:',
    list: [
      `Haz clic en el icono ${INSTALL} <strong>Instalar</strong> a la derecha de la barra de direcciones.`,
      `Si no está, abre el menú ${DOTS} → <strong>Transmitir, guardar y compartir</strong> → <strong>Instalar StreetData</strong> (en Edge: <strong>Aplicaciones</strong> → <strong>Instalar este sitio como una aplicación</strong>).`,
      'Confirma con <strong>Instalar</strong>.'
    ]
  },
  'desktop-other': {
    intro: 'Este navegador no instala aplicaciones web. Abre StreetData en Chrome o Edge y pulsa «Instalar»:',
    list: [],
    copyLink: true
  }
};

/** Steps to install StreetData in browsers without an install dialog. */
export default {
  name: 'InstallHelpDialog',
  components: {AppModal, CopyIcon: Copy},
  setup() {
    return {pwa, closeInstallHelp};
  },
  data() {
    return {copied: false, pageUrl: location.origin + location.pathname};
  },
  computed: {
    steps() {
      return STEPS[pwa.platform] || STEPS['desktop-other'];
    },
    copyLink() {
      return Boolean(this.steps.copyLink);
    }
  },
  methods: {
    copy() {
      let done = () => { this.copied = true; };
      if (navigator.clipboard) navigator.clipboard.writeText(this.pageUrl).then(done, () => {});
    }
  }
}
</script>

<style>
.install-help-intro {
  margin: 0 0 12px;
  color: var(--text);
}
.install-steps {
  margin: 0;
  padding-left: 22px;
  color: var(--text-muted);
  line-height: 1.55;
}
.install-steps li + li {
  margin-top: 8px;
}
.install-steps strong {
  color: var(--text);
  font-weight: 600;
}
.install-steps .step-icon {
  display: inline-block;
  vertical-align: -3px;
  color: var(--text);
}
.install-copy {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
</style>
