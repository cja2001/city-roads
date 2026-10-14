import {reactive} from 'vue';

/**
 * Installable app (PWA) support: registers the service worker and keeps track
 * of whether StreetData is installed and how it can be installed here.
 *
 * Chrome, Edge and Android fire `beforeinstallprompt`, which lets our
 * «Instalar» button open the browser's install dialog. Browsers that never
 * fire it (Safari on iPhone, Samsung Internet, Firefox, apps' built-in
 * browsers...) can't be installed from a button, so there the same button
 * opens the steps for that browser.
 */
const DISMISS_KEY = 'streetdata-install-dismissed';
const DISMISS_DAYS = 7;
// How long a click waits for Chrome to offer its install dialog before
// falling back to the steps.
const PROMPT_WAIT_MS = 1200;

let deferredPrompt = null;
let promptWaiters = [];

export const pwa = reactive({
  installed: isStandalone(),
  canPrompt: false,
  // ios-safari, ios-other, in-app, samsung, firefox-android, android,
  // mac-safari, desktop-chromium, desktop-other
  platform: detectPlatform(),
  bannerOpen: false,
  helpOpen: false
});

export function setupPWA() {
  // index.html keeps an event that arrived before this script ran.
  if (window.__installPromptEvent) usePrompt(window.__installPromptEvent);
  window.addEventListener('beforeinstallprompt', e => {
    // Keep the browser's own mini-bar away; we show our banner instead.
    e.preventDefault();
    usePrompt(e);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    pwa.canPrompt = false;
    pwa.installed = true;
    pwa.bannerOpen = false;
    pwa.helpOpen = false;
  });

  if (window.matchMedia) {
    let standalone = window.matchMedia('(display-mode: standalone)');
    let onChange = () => { pwa.installed = isStandalone(); };
    if (standalone.addEventListener) standalone.addEventListener('change', onChange);
  }

  setTimeout(maybeShowBanner, 2500);

  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    let register = () => navigator.serviceWorker.register('./sw.js')
      .catch(e => console.warn('Service worker not registered', e));
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register);
  }
}

function usePrompt(e) {
  deferredPrompt = e;
  pwa.canPrompt = true;
  promptWaiters.forEach(resolve => resolve(true));
  promptWaiters = [];
  maybeShowBanner();
}

/** True while StreetData isn't installed, so the install button is offered. */
export function canInstall() {
  return !pwa.installed;
}

/**
 * The «Instalar» button. Opens the browser's install dialog when there is one
 * and resolves to true when the person accepted. Everywhere else it opens the
 * steps for this browser.
 */
export function install() {
  return waitForPrompt().then(available => {
    if (!available) {
      pwa.helpOpen = true;
      return false;
    }
    let prompt = deferredPrompt;
    deferredPrompt = null;
    pwa.canPrompt = false;
    return Promise.resolve(prompt.prompt()).then(() => prompt.userChoice).then(choice => {
      let accepted = choice && choice.outcome === 'accepted';
      if (accepted) pwa.bannerOpen = false;
      // A refused dialog can't be reopened until the browser fires the event
      // again; until then the button shows the steps.
      return accepted;
    }, () => {
      pwa.helpOpen = true;
      return false;
    });
  });
}

function waitForPrompt() {
  if (deferredPrompt) return Promise.resolve(true);
  // Only Chromium browsers can still offer the dialog.
  if (!['android', 'desktop-chromium', 'samsung'].includes(pwa.platform)) return Promise.resolve(false);
  return new Promise(resolve => {
    promptWaiters.push(resolve);
    setTimeout(() => {
      promptWaiters = promptWaiters.filter(r => r !== resolve);
      resolve(false);
    }, PROMPT_WAIT_MS);
  });
}

export function openInstallHelp() {
  pwa.helpOpen = true;
}

export function closeInstallHelp() {
  pwa.helpOpen = false;
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

export function detectPlatform(ua = navigator.userAgent || '', touchPoints = navigator.maxTouchPoints || 0) {
  // Instagram, Facebook, TikTok, LinkedIn... open links in their own browser,
  // which can't install apps.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|LinkedInApp|Snapchat|; wv\)/i.test(ua)) return 'in-app';
  let iOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (iOS) return /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? 'ios-other' : 'ios-safari';
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Android/i.test(ua)) return /Firefox/i.test(ua) ? 'firefox-android' : 'android';
  if (/Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua)) return 'mac-safari';
  if (/Chrome|Chromium|Edg\//.test(ua) && !/OPR|Firefox/.test(ua)) return 'desktop-chromium';
  return 'desktop-other';
}
