import {reactive} from 'vue';

/**
 * Installable app (PWA) support: registers the service worker and keeps track
 * of whether StreetData is installed and how it can be installed here.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt`, which lets us show our
 * own install button. Safari on iPhone/iPad never does: there the app is
 * installed from Share → "Add to Home Screen", so we explain that instead.
 */
const DISMISS_KEY = 'streetdata-install-dismissed';
const DISMISS_DAYS = 7;

let deferredPrompt = null;

export const pwa = reactive({
  installed: isStandalone(),
  // 'prompt' (native install dialog available), 'ios', 'mac-safari', 'manual' or ''.
  method: '',
  bannerOpen: false
});

pwa.method = detectManualMethod();

export function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    // Keep the browser's own mini-bar away; we show our banner instead.
    e.preventDefault();
    deferredPrompt = e;
    pwa.method = 'prompt';
    maybeShowBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    pwa.installed = true;
    pwa.bannerOpen = false;
  });

  if (window.matchMedia) {
    let standalone = window.matchMedia('(display-mode: standalone)');
    let onChange = () => { pwa.installed = isStandalone(); };
    if (standalone.addEventListener) standalone.addEventListener('change', onChange);
  }

  // iPhone and mobile browsers without the install event get instructions.
  if (pwa.method) setTimeout(maybeShowBanner, 2500);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker not registered', e));
    });
  }
}

/** True when the app can be offered for installation here. */
export function canInstall() {
  return !pwa.installed && Boolean(pwa.method);
}

/**
 * Opens the browser's install dialog when there is one. Resolves to true when
 * the person accepted; for iPhone and other browsers it opens the banner with
 * the steps.
 */
export function install() {
  if (!deferredPrompt) {
    pwa.bannerOpen = true;
    return Promise.resolve(false);
  }
  let prompt = deferredPrompt;
  deferredPrompt = null;
  prompt.prompt();
  return prompt.userChoice.then(choice => {
    let accepted = choice && choice.outcome === 'accepted';
    if (accepted) {
      pwa.bannerOpen = false;
    } else {
      // The event can only be used once; the browser fires a new one later.
      pwa.method = detectManualMethod();
    }
    return accepted;
  });
}

export function dismissBanner() {
  pwa.bannerOpen = false;
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (e) {
    // Private mode: the banner simply comes back next time.
  }
}

function maybeShowBanner() {
  if (!canInstall() || recentlyDismissed()) return;
  pwa.bannerOpen = true;
}

function recentlyDismissed() {
  let at;
  try {
    at = Number.parseInt(localStorage.getItem(DISMISS_KEY), 10);
  } catch (e) {
    return false;
  }
  return Number.isFinite(at) && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function isStandalone() {
  if (window.navigator.standalone === true) return true; // iOS Safari
  if (!window.matchMedia) return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches;
}

function detectManualMethod() {
  let ua = navigator.userAgent || '';
  let iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return 'ios';
  // Safari 17+ on a Mac adds web apps to the Dock from the File menu.
  if (/Macintosh/.test(ua) && /Version\/(1[7-9]|[2-9]\d)\./.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  // Other phones (Firefox, Samsung Internet...) install from the browser menu.
  // Desktop browsers without the install event (Firefox, older Safari) can't
  // install web apps the same way, so they get no message.
  if (/Android|Mobile/i.test(ua)) return 'manual';
  return '';
}
