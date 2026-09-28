/**
 * Main entry point — initializes the SPA.
 */
import { init } from './modules/ui.js';
import { initOg } from './og/index.js';

// Register service worker (относительно текущего модуля — работает на под-пути gh-pages)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../../sw.js', import.meta.url)).catch(() => {});
}

// Preload voices for speechSynthesis
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// Initialize UI
init().then(() => initOg());
