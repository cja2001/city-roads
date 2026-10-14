const STORAGE_KEY = 'streetdata-theme';

/**
 * Light / dark mode of the interface. The choice is remembered in this
 * browser; the first visit follows the system setting.
 */
export function getInitialTheme() {
  try {
    let saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (e) {
    // Storage can be blocked (private mode); fall back to the system setting.
  }
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (e) {
    // Not critical: the theme just won't be remembered.
  }
}
