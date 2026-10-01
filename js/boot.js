/*
 * boot.js — classic (non-module) script, loaded on every page right after the Tailwind CDN.
 * 1) Shared Tailwind theme config.
 * 2) A visible warning when a page is opened straight from disk (file://),
 *    because browsers refuse to load ES modules that way.
 */
window.tailwind = window.tailwind || {};
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
};

if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', function () {
    var bar = document.createElement('div');
    bar.setAttribute('role', 'alert');
    bar.style.cssText = 'position:sticky;top:0;z-index:100;background:#0a0a0a;color:#fff;'
      + 'font:500 13px/1.5 system-ui,sans-serif;padding:12px 16px;text-align:center';
    bar.textContent = 'This prototype uses ES modules, which browsers block when a file is opened from disk. '
      + 'Open it through GitHub Pages, or run a local server in this folder (VS Code Live Server, or: python -m http.server).';
    document.body.prepend(bar);
  });
}
