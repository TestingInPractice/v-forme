/**
 * og/router.js — hash-роутер og-контура (#og/<screen>).
 *
 * Изолированный контур портированных экранов openGym. Существующие экраны fitness-app
 * (ui.js) НЕ трогает: выход из контура — через backToApp() → showScreen('home') импортом
 * из ui.js (только вызов, без изменений).
 */

import { showScreen } from '../modules/ui.js';

const SCREENS = new Map();
const CSS_CACHE = new Map();
let _current = null;
let _params = {};

/**
 * Регистрация экрана.
 * @param {string} name   имя экрана (в URL: #og/<name>)
 * @param {(appEl: HTMLElement, params: object) => void} renderFn
 */
export function register(name, renderFn) {
  if (typeof renderFn !== 'function') throw new Error(`og: renderFn для '${name}' не функция`);
  SCREENS.set(name, renderFn);
}

/** Переход на экран. '#' + query-параметры. */
export function go(name, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  location.hash = `#og/${name}${qs ? '?' + qs : ''}`;
}

/** Рендер по текущему hash. Возвращает true, если обработал og-маршрут. */
export function route() {
  const m = location.hash.match(/^#og\/([A-Za-z0-9_-]+)/);
  if (!m) return false;
  const name = m[1];
  const qs = new URLSearchParams((location.hash.split('?')[1] || ''));
  const params = Object.fromEntries(qs.entries());
  const renderFn = SCREENS.get(name);
  const app = document.getElementById('app');
  if (!renderFn || !app) return false;

  _current = name;
  _params = params;
  app.innerHTML = '';
  app.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    renderFn(app, params);
  } catch (err) {
    console.error(`og: ошибка рендера '${name}'`, err);
    app.innerHTML = `
      <div class="og-screen og-screen-error">
        <h3>Ошибка экрана ${name}</h3>
        <p class="og-muted">${String(err?.message || err)}</p>
        <button class="og-btn" id="og-err-back">← Назад</button>
      </div>`;
    const btn = document.getElementById('og-err-back');
    if (btn) btn.onclick = () => backToApp();
  }
  return true;
}

/** Вызов при старте приложения (из app.js). Возвращает true, если обработал. */
export function boot() {
  return route();
}

/**
 * Одноразовая инъекция CSS для экрана (стили экранов живут рядом с ними).
 * @returns {HTMLStyleElement}
 */
export function injectCss(name, cssText) {
  if (CSS_CACHE.has(name)) return CSS_CACHE.get(name);
  const style = document.createElement('style');
  style.dataset.ogCss = name;
  style.textContent = cssText;
  document.head.appendChild(style);
  CSS_CACHE.set(name, style);
  return style;
}

/** Выход из og-контура в основное приложение (главная ui.js). */
export function backToApp() {
  location.hash = '';
  _current = null;
  _params = {};
  showScreen('home');
}

/** Ссылка на og-экран для использования внутри HTML-строк. */
export function link(name, label, params = {}) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null)).toString();
  return `<a class="og-link" href="#og/${name}${qs ? '?' + qs : ''}">${label}</a>`;
}

/** Текущее имя экрана og-контура. */
export function currentName() {
  return _current;
}

/** Текущие параметры экрана. */
export function currentParams() {
  return _params;
}

/** hash сейчас ведёт в og-контур? */
export function isOgHash() {
  return /^#og\//.test(location.hash || '');
}

// Реагируем на ручное изменение hash пользователем (back/forward).
window.addEventListener('hashchange', () => {
  if (isOgHash()) route();
});