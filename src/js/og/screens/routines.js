/**
 * og/screens/routines.js — экран «Шаблоны тренировок» (og-routines).
 *
 * Список S.routines (store.load()): название, число упражнений, суперсеты.
 * Действия: Старт → go('workout', { rid }), Редактировать → go('routine-edit', { rid }),
 * Удалить (с подтверждением). Кнопка «+ Новый шаблон» → go('routine-edit').
 */

import { register, go, injectCss, backToApp } from '../router.js';
import { load as loadState, update as updateState } from '../store.js';

injectCss('og-routines', `
.og-rt-new { margin-bottom: 14px; }
.og-rt-actions { display: flex; gap: 6px; flex-shrink: 0; }
`);

/* ─── Русский словарь (fallback, если i18n.js ещё не готов) ─── */
const RU = {
  'routines.title': 'Шаблоны',
  'routines.new': 'Новый шаблон',
  'routines.start': 'Старт',
  'routines.edit': 'Редактировать',
  'routines.delete': 'Удалить',
  'routines.deleteConfirm': 'Удалить шаблон «{name}»?',
  'routines.empty': 'Пока нет шаблонов.\nСоздайте первый — и начните тренировку в один тап.',
  'routines.rehab': 'Rehab',
  'routines.ex': 'упражнение',
  'routines.ex2': 'упражнения',
  'routines.ex5': 'упражнений',
  'routines.ss': 'суперсет',
  'routines.ss2': 'суперсета',
  'routines.ss5': 'суперсетов',
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

function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} ${one}`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

export async function render(appEl, params) {
  try {
    const S = loadState();
    const routines = S.routines || [];

    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" data-act="back" aria-label="←">←</button>
          <h2>${t('routines.title')}</h2>
        </header>
        <button class="og-btn og-btn-primary og-btn-block og-rt-new" data-act="new">+ ${t('routines.new')}</button>
        <div class="og-sect-b" data-act="list"></div>
      </div>
    `;

    const listEl = appEl.querySelector('[data-act="list"]');

    appEl.querySelector('[data-act="back"]').onclick = () => backToApp();
    appEl.querySelector('[data-act="new"]').onclick = () => go('routine-edit');

    listEl.onclick = (e) => {
      const card = e.target.closest('[data-rid]');
      if (!card) return;
      const rid = card.dataset.rid;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'start') { go('workout', { rid }); return; }
      if (act === 'edit') { go('routine-edit', { rid }); return; }
      if (act === 'delete') {
        const r = routines.find((x) => x.id === rid);
        if (!r) return;
        if (!confirm(t('routines.deleteConfirm', { name: r.name }))) return;
        updateState((prev) => ({ ...prev, routines: prev.routines.filter((x) => x.id !== rid) }));
        render(appEl, params);
      }
    };

    if (routines.length === 0) {
      listEl.innerHTML = `<div class="og-empty">${t('routines.empty').replace(/\n/g, '<br>')}</div>`;
      return;
    }

    listEl.innerHTML = routines.map((r) => {
      const items = r.items || [];
      const sgCount = new Set(items.map((i) => i.sg).filter(Boolean)).size;
      const meta = plural(items.length, t('routines.ex'), t('routines.ex2'), t('routines.ex5'))
        + (sgCount > 0 ? ` · ${plural(sgCount, t('routines.ss'), t('routines.ss2'), t('routines.ss5'))}` : '');
      return `
        <div class="og-lrow" data-rid="${esc(r.id)}">
          <span class="og-lrow-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg></span>
          <span class="og-lrow-tt">${esc(r.name)}
            <span class="og-lrow-ss">${meta}</span>
          </span>
          ${r.excludeFromProgression ? `<span class="og-chip">${t('routines.rehab')}</span>` : ''}
          <span class="og-rt-actions">
            <button class="og-iconbtn" data-act="start" aria-label="${t('routines.start')}">▶</button>
            <button class="og-iconbtn" data-act="edit" aria-label="${t('routines.edit')}">✎</button>
            <button class="og-iconbtn og-btn-danger" data-act="delete" aria-label="${t('routines.delete')}">✕</button>
          </span>
          <span class="og-lrow-che"></span>
        </div>`;
    }).join('');
  } catch (err) {
    console.error('og-routines:', err);
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr"><button class="og-back" id="og-rt-err-back">←</button><h2>${t('routines.title')}</h2></header>
        <div class="og-empty">${esc(String(err?.message || err))}</div>
      </div>`;
    const btn = appEl.querySelector('#og-rt-err-back');
    if (btn) btn.onclick = () => backToApp();
  }
}

register('routines', render);