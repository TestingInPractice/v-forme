/**
 * og/screens/checkin.js — экран «Киоск» (og-checkin).
 *
 * Вкладки: «Мой код» — QR своего чекина (payload v1 из og/checkin.js:
 * { v, ts, uid, name, unit, gym, sig }), обновление и копирование;
 * «Сканировать» — камера + BarcodeDetector, результат — карточка посетителя;
 * успешный разбор записывает событие чекина в журнал S.checkins.
 */

import { register, injectCss, backToApp } from '../router.js';
import { load as loadState, update as updateState } from '../store.js';
import { renderQrToCanvas, qrToDataUrl } from '../qr.js';
import { scanSupported, scanFromVideo } from '../scan.js';
import { buildCheckinPayload, parseCheckinPayload, ensureProfileUid, recordCheckin } from '../checkin.js';

injectCss('og-checkin', `
.og-checkin-rail { display: flex; gap: 12px; overflow-x: auto; padding: 2px 0 12px; scroll-snap-type: x mandatory; }
.og-checkin-card { flex: 0 0 min(100%, 360px); margin-bottom: 0; scroll-snap-align: center; }
.og-checkin-qr-plate { display: grid; place-items: center; padding: 16px; background: var(--og-bg2); border: var(--og-hair) solid var(--og-line); border-radius: var(--og-radius-sm); }
.og-checkin-qr { display: block; width: 100%; max-width: 260px; aspect-ratio: 1; image-rendering: pixelated; border-radius: 8px; }
.og-checkin-video { display: block; width: 100%; max-width: 320px; margin: 0 auto; border-radius: var(--og-radius); background: var(--og-bg); }
.og-checkin-status { min-height: 1.2em; text-align: center; margin-top: 8px; }
.og-checkin-actions { display: flex; gap: 8px; }
.og-checkin-actions .og-btn { flex: 1; }
.og-checkin-result { text-align: center; }
.og-checkin-dots { display: flex; justify-content: center; gap: 6px; margin-top: 12px; }
.og-checkin-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--og-track); }
.og-checkin-dot.active { width: 16px; border-radius: 999px; background: var(--og-accent); }
`);

/* ─── Русский словарь (fallback, если i18n.js ещё не готов) ─── */
const RU = {
  'checkin.title': 'Киоск',
  'checkin.tabMyCode': 'Мой код',
  'checkin.tabScan': 'Сканировать',
  'checkin.refresh': 'Обновить',
  'checkin.copy': 'Скопировать',
  'checkin.copied': 'Скопировано',
  'checkin.copyError': 'Не удалось скопировать',
  'checkin.scanHint': 'Наведите камеру на QR-код',
  'checkin.scanUnsupported': 'Сканирование недоступно в этом браузере',
  'checkin.cameraError': 'Нет доступа к камере',
  'checkin.scanAgain': 'Сканировать ещё',
};

let _t = (k, p = {}) => {
  let s = RU[k] ?? k;
  for (const [kk, vv] of Object.entries(p)) s = s.split(`{${kk}}`).join(String(vv));
  return s;
};
try {
  const m = await import('../i18n.js');
  if (m && typeof m.t === 'function') _t = m.t;
} catch (err) {
  console.warn('og: i18n.js недоступен — русский fallback', err);
}
function t(k, p = {}) {
  let s;
  try { s = _t(k, p); } catch { s = null; }
  if (s == null || s === k) s = RU[k] ?? k;
  if (typeof s !== 'string') s = String(s);
  for (const [kk, vv] of Object.entries(p)) s = s.split(`{${kk}}`).join(String(vv));
  return s;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ─── Жизненный цикл камеры ─── */

let _scanSession = 0;
let _stopScan = null;

function stopScan() {
  _scanSession++;
  if (_stopScan) {
    const fn = _stopScan;
    _stopScan = null;
    fn();
  }
}

async function startScan(videoEl, onDecode) {
  stopScan();
  const session = _scanSession;
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    console.error('og-checkin: нет доступа к камере', err);
    if (session === _scanSession && typeof onDecode === 'function') onDecode(null);
    return;
  }
  if (session !== _scanSession) {
    stream.getTracks().forEach((tr) => tr.stop());
    return;
  }
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (err) {
    console.error('og-checkin: не удалось запустить видео', err);
  }
  if (session !== _scanSession) {
    stream.getTracks().forEach((tr) => tr.stop());
    return;
  }
  const stopFn = await scanFromVideo(videoEl, {
    intervalMs: 150,
    onDecode: (value) => {
      if (session !== _scanSession) return;
      _stopScan = null;
      if (typeof onDecode === 'function') onDecode(value);
    },
  });
  if (session === _scanSession) {
    _stopScan = stopFn;
  } else {
    stopFn();
  }
}

/* ─── Вкладки ─── */

function renderMyCode(body, state) {
  let S = loadState();
  if (!S.profile || !S.profile.uid) {
    // первый показ QR — фиксируем стабильный uid владельца (сохраняется в стор)
    S = updateState(ensureProfileUid);
  }
  const profile = S.profile || {};
  const payload = buildCheckinPayload(S);
  const name = profile.name ? String(profile.name) : 'Тренажёр';
  const unit = profile.unit ? String(profile.unit) : '';
  const gym = profile.gym ? String(profile.gym) : 'Зал';

  body.innerHTML = `
    <div class="og-checkin-rail">
      <article class="og-card og-checkin-card">
        <div class="og-card-title">${esc(name)}</div>
        <div class="og-muted">${esc(unit)}${unit && gym ? ' · ' : ''}${esc(gym)}</div>
        <div class="og-checkin-qr-plate">
          <canvas class="og-checkin-qr" data-qr></canvas>
        </div>
        <div class="og-muted og-checkin-status" data-status></div>
        <div class="og-checkin-actions">
          <button class="og-btn" data-act="refresh">${t('checkin.refresh')}</button>
          <button class="og-btn og-btn-primary" data-act="copy">${t('checkin.copy')}</button>
        </div>
      </article>
    </div>
    <div class="og-checkin-dots" aria-hidden="true"><span class="og-checkin-dot active"></span></div>
  `;

  const canvas = body.querySelector('[data-qr]');
  renderQrToCanvas(canvas, payload, 256, 'M');
  state.payload = payload;

  body.querySelector('[data-act="refresh"]').onclick = () => renderMyCode(body, state);
  body.querySelector('[data-act="copy"]').onclick = async () => {
    const statusEl = body.querySelector('[data-status]');
    try {
      const dataUrl = qrToDataUrl(state.payload, 256, 'M');
      const blob = await (await fetch(dataUrl)).blob();
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      } else {
        await navigator.clipboard.writeText(state.payload);
      }
      statusEl.textContent = t('checkin.copied');
    } catch (err) {
      console.error('og-checkin: копирование QR', err);
      statusEl.textContent = t('checkin.copyError');
    }
  };
}

function renderScan(body, state) {
  if (!scanSupported()) {
    body.innerHTML = `<div class="og-empty">${t('checkin.scanUnsupported')}</div>`;
    return;
  }
  body.innerHTML = `
    <div class="og-card">
      <video class="og-checkin-video" autoplay playsinline muted></video>
      <div class="og-muted og-checkin-status">${t('checkin.scanHint')}</div>
    </div>
  `;
  const video = body.querySelector('video');
  startScan(video, (value) => {
    if (value === null) {
      body.innerHTML = `<div class="og-empty">${t('checkin.cameraError')}</div>`;
      return;
    }
    showResult(body, state, value);
  });
}

function showResult(body, state, raw) {
  const parsed = parseCheckinPayload(raw);
  const name = parsed ? String(parsed.name) : raw;
  const unit = parsed && parsed.unit ? String(parsed.unit) : '';
  const gym = parsed && parsed.gym ? String(parsed.gym) : '';
  // событие чекина пишется в журнал S.checkins (только при валидном payload;
  // неразобранный raw — просто текст без события)
  if (parsed) {
    try {
      updateState((prev) => recordCheckin(prev, parsed));
    } catch (err) {
      console.error('og-checkin: запись события чекина', err);
    }
  }
  body.innerHTML = `
    <article class="og-card og-checkin-result">
      <div class="og-card-title">${esc(name)}</div>
      ${unit || gym ? `<div class="og-muted">${esc(unit)}${unit && gym ? ' · ' : ''}${esc(gym)}</div>` : ''}
      <div class="og-checkin-actions">
        <button class="og-btn og-btn-primary" data-act="rescan">${t('checkin.scanAgain')}</button>
      </div>
    </article>
  `;
  body.querySelector('[data-act="rescan"]').onclick = () => renderScan(body, state);
}

/* ─── Экран ─── */

export async function render(appEl, params) {
  stopScan(); // сброс камеры при повторном рендере
  const state = { tab: 'mycode', payload: null };

  const draw = () => {
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" data-act="back" aria-label="←">←</button>
          <h2>${t('checkin.title')}</h2>
        </header>
        <div class="og-tabs">
          <button class="og-tab ${state.tab === 'mycode' ? 'active' : ''}" data-tab="mycode">${t('checkin.tabMyCode')}</button>
          <button class="og-tab ${state.tab === 'scan' ? 'active' : ''}" data-tab="scan">${t('checkin.tabScan')}</button>
        </div>
        <div data-body></div>
      </div>
    `;
    const body = appEl.querySelector('[data-body]');
    if (state.tab === 'mycode') renderMyCode(body, state);
    else renderScan(body, state);
  };

  draw();

  appEl.querySelector('[data-act="back"]').onclick = () => backToApp();
  appEl.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.onclick = () => {
      if (state.tab === btn.dataset.tab) return;
      if (state.tab === 'scan') stopScan(); // камера больше не нужна
      state.tab = btn.dataset.tab;
      draw();
    };
  });
}

/* ─── Остановка камеры при уходе с экрана ─── */

function onHashChange() {
  if (!/^#og\/checkin/.test(location.hash)) {
    stopScan();
  }
}
window.addEventListener('hashchange', onHashChange);
window.addEventListener('beforeunload', stopScan);

register('checkin', render);