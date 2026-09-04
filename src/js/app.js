/**
 * Main entry point — initializes the SPA.
 */
import { init } from './modules/ui.js';

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// Preload voices for speechSynthesis
if ('speechSynthesis' in window) {
  speechSynthesis.getVoices();
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
}

// Initialize UI
init();
