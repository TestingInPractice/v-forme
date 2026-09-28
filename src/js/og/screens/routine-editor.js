/**
 * og/screens/routine-editor.js — редактор шаблона тренировки (og-routine-edit).
 *
 * Создание/редактирование routine в S.routines:
 *   - название, excludeFromProgression (rehab), restSec (пусто = профиль);
 *   - items: выбор упражнения из каталога (поиск), режим reps/time/cardio,
 *     сеты, повторы/мин. повторы, вес, шаг инкремента (пусто = авто),
 *     отдых (пусто = профиль), интенсификатор (drop/burst), суперсет-группа sg.
 * Сохранение — store.update (upsert по id, uid('r') для новых) → go('routines').
 * Параметр ?add=<exId> (из библиотеки) — сразу добавляет упражнение в шаблон.
 */

import { register, go, injectCss, backToApp } from '../router.js';
import * as catalog from '../../modules/catalog.js';
import { load as loadState, update as updateState, uid } from '../store.js';
import * as fav from '../favorites.js';
import * as eq from '../equipment.js';

injectCss('og-routine-edit', `
.og-editor-value { width: 58%; flex: 0 1 280px; }
.og-editor-items { display: flex; flex-direction: column; gap: 12px; margin-bottom: 14px; }
.og-editor-badges { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; }
.og-editor-actions { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 16px; }
.og-editor-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 10px; padding: 0 16px 14px; }
.og-editor-grid .og-form-group { margin-bottom: 0; }
.og-editor-grid .og-num { width: 100%; }
.og-editor-error { color: var(--og-red); margin-top: 8px; text-align: center; }
.og-editor-picker-list { max-height: 50dvh; margin-top: 12px; overflow-y: auto; }
.og-editor-pick { width: 100%; font-family: inherit; text-align: left; }
.og-editor-picker-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 10px; }
.og-fav-star { color: var(--og-yellow, #ffd000); }
`);

/* ─── Русский словарь (fallback, если i18n.js ещё не готов) ─── */
const RU = {
  'editor.titleNew': 'Новый шаблон',
  'editor.titleEdit': 'Редактировать шаблон',
  'editor.name': 'Название',
  'editor.namePlaceholder': 'Например: Силовая А',
  'editor.rehab': 'Rehab (без прогрессии)',
  'editor.restSec': 'Отдых (сек)',
  'editor.auto': 'авто',
  'editor.addExercise': 'Добавить упражнение',
  'editor.save': 'Сохранить шаблон',
  'editor.replace': 'Заменить',
  'editor.remove': 'Удалить',
  'editor.mode': 'Режим',
  'editor.modeReps': 'Повторы',
  'editor.modeTime': 'Время',
  'editor.modeCardio': 'Кардио',
  'editor.modeBodyweight': 'Вес тела',
  'editor.sets': 'Сеты',
  'editor.reps': 'Повторы',
  'editor.repsMin': 'Мин. повторы',
  'editor.weight': 'Вес',
  'editor.sec': 'Секунды',
  'editor.dist': 'Дистанция',
  'editor.inc': 'Шаг',
  'editor.intensifier': 'Интенсификатор',
  'editor.drop': 'Дроп-сет',
  'editor.burst': 'Burst',
  'editor.ramp': 'Рампа (разминка)',
  'editor.sg': 'Суперсет',
  'editor.sgNone': 'никто',
  'editor.sgHint': 'Одинаковый номер = общий суперсет',
  'editor.hint': 'Пустые поля: вес — без отягощения, шаг — авто, отдых — профильный.',
  'editor.errName': 'Введите название шаблона',
  'editor.errItems': 'Добавьте хотя бы одно упражнение',
  'editor.pickExercise': 'Выбрать упражнение',
  'editor.searchPlaceholder': 'Поиск упражнения…',
  'editor.empty': 'Ничего не найдено',
  'editor.notFound': 'Шаблон не найден',
  'editor.favFilter': 'Избранные ({n})',
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

async function ensureCatalog() {
  if (catalog.getExercises().length === 0) await catalog.init();
}

/** Дефолтный режим упражнения по его флагам в каталоге. */
function defaultType(ex) {
  if (ex.isHold || ex.isTime) return 'time';
  if (ex.category === 'cardio') return 'cardio';
  if (ex.equipment === 'bodyweight') return 'bodyweight';
  return 'reps';
}

/** itemCfg по упражнению каталога (стартовые значения). */
function itemFromExercise(ex) {
  return {
    id: ex.id,
    name: ex.name,
    type: defaultType(ex),
    sets: 3,
    reps: ex.typicalReps?.min ?? 10,
    repsMin: null,
    weight: null,
    sec: null,
    dist: null,
    restSec: null,
    warmupRestSec: null,
    inc: null,
    sg: null,
    intensifier: null,
  };
}

/** Нормализация item перед сохранением (все поля по контракту). */
function normalizeItem(item) {
  return {
    id: item.id,
    name: item.name,
    type: item.type === 'time' || item.type === 'cardio' || item.type === 'bodyweight' ? item.type : 'reps',
    sets: item.sets ?? 3,
    reps: item.reps ?? null,
    repsMin: item.repsMin ?? null,
    weight: item.weight ?? null,
    sec: item.sec ?? null,
    dist: item.dist ?? null,
    restSec: item.restSec ?? null,
    warmupRestSec: item.warmupRestSec ?? null,
    inc: item.inc ?? null,
    sg: item.sg ?? null,
    intensifier: item.intensifier ?? null,
  };
}

/** Целочисленные поля (округляем), остальные — float. */
const INT_FIELDS = new Set(['sets', 'reps', 'repsMin', 'restSec', 'sec']);

function parseNum(raw, field) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (INT_FIELDS.has(field)) return Math.max(0, Math.round(n));
  return n;
}

export async function render(appEl, params) {
  try {
    await ensureCatalog();

    let draft;
    if (params.rid) {
      const found = loadState().routines.find((r) => r.id === params.rid);
      if (!found) {
        appEl.innerHTML = `
          <div class="og-screen">
            <header class="og-hdr"><button class="og-back" id="og-ed-err-back">←</button><h2>${t('editor.titleEdit')}</h2></header>
            <div class="og-empty">${t('editor.notFound')}</div>
          </div>`;
        appEl.querySelector('#og-ed-err-back').onclick = () => go('routines');
        return;
      }
      draft = JSON.parse(JSON.stringify(found));
    } else {
      draft = { id: null, name: '', excludeFromProgression: false, restSec: null, items: [] };
    }

    // Параметр ?add=<exId> из библиотеки: добавить упражнение и «съесть» параметр.
    if (params.add) {
      const ex = catalog.getExercise(params.add);
      if (ex && !draft.items.some((i) => i.id === ex.id)) {
        draft.items.push(itemFromExercise(ex));
      } else if (!ex) {
        console.warn(`og-routine-edit: упражнение не найдено в каталоге: ${params.add}`);
      }
      const qs = params.rid ? `?rid=${encodeURIComponent(params.rid)}` : '';
      history.replaceState(null, '', `#og/routine-edit${qs}`);
    }

    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" data-act="back" aria-label="←">←</button>
          <h2>${draft.id ? t('editor.titleEdit') : t('editor.titleNew')}</h2>
        </header>
        <section class="og-sect">
          <div class="og-sect-b">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('editor.name')}</span>
              <input class="og-input og-editor-value" data-act="name" value="${esc(draft.name)}" placeholder="${t('editor.namePlaceholder')}" autocomplete="off">
            </label>
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('editor.rehab')}</span>
              <span class="og-sw"><input class="og-sw-in" type="checkbox" data-act="rehab" ${draft.excludeFromProgression ? 'checked' : ''}><span class="og-sw-kn"></span></span>
            </label>
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('editor.restSec')}</span>
              <input class="og-input og-num" type="number" min="0" step="5" data-act="restSec" value="${draft.restSec ?? ''}" placeholder="${t('editor.auto')}">
            </label>
          </div>
        </section>
        <div class="og-editor-items" data-act="items"></div>
        <button class="og-btn og-btn-block" data-act="add">+ ${t('editor.addExercise')}</button>
        <p class="og-sect-f">${t('editor.hint')} ${t('editor.sgHint')}.</p>
        <div class="og-spacer"></div>
        <button class="og-btn og-btn-primary og-btn-xl" data-act="save">${t('editor.save')}</button>
        <div class="og-editor-error" data-act="error" hidden></div>
      </div>
      <div class="og-modal" data-act="picker" hidden></div>
    `;

    const itemsEl = appEl.querySelector('[data-act="items"]');
    const pickerEl = appEl.querySelector('[data-act="picker"]');
    const errorEl = appEl.querySelector('[data-act="error"]');

    appEl.querySelector('[data-act="back"]').onclick = () => go('routines');

    const nameEl = appEl.querySelector('[data-act="name"]');
    nameEl.addEventListener('input', () => { draft.name = nameEl.value; });

    const rehabEl = appEl.querySelector('[data-act="rehab"]');
    rehabEl.addEventListener('change', () => { draft.excludeFromProgression = rehabEl.checked; });

    const restSecEl = appEl.querySelector('[data-act="restSec"]');
    restSecEl.addEventListener('input', () => {
      const raw = restSecEl.value.trim();
      draft.restSec = raw === '' ? null : Math.max(0, Math.round(Number(raw)));
    });

    appEl.querySelector('[data-act="add"]').onclick = () => openPicker((ex) => {
      draft.items.push(itemFromExercise(ex));
      renderItems();
    });

    appEl.querySelector('[data-act="save"]').onclick = () => {
      const name = draft.name.trim();
      if (!name) { showError(t('editor.errName')); return; }
      if (draft.items.length === 0) { showError(t('editor.errItems')); return; }
      updateState((prev) => {
        const routine = {
          id: draft.id || uid('r'),
          name,
          excludeFromProgression: !!draft.excludeFromProgression,
          restSec: draft.restSec ?? null,
          items: draft.items.map(normalizeItem),
        };
        const routines = prev.routines.filter((r) => r.id !== routine.id);
        routines.push(routine);
        return { ...prev, routines };
      });
      go('routines');
    };

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.hidden = false;
    }

    function renderItems() {
      if (draft.items.length === 0) {
        itemsEl.innerHTML = `<div class="og-empty">${t('editor.addExercise')}</div>`;
        return;
      }
      itemsEl.innerHTML = draft.items.map((item, idx) => itemHtml(item, idx)).join('');
    }

    function fieldHtml(item, idx, field, label, value) {
      return `
        <div class="og-form-group">
          <label class="og-label">${label}</label>
          <input class="og-input og-num" type="number" min="0" step="any" data-field="${field}" data-idx="${idx}" value="${value ?? ''}" placeholder="—">
        </div>`;
    }

    function itemHtml(item, idx) {
      const isReps = item.type === 'reps';
      const isTime = item.type === 'time';
      const isCardio = item.type === 'cardio';
      const isBW = item.type === 'bodyweight';
      const typeName = isReps ? t('editor.modeReps') : (isTime ? t('editor.modeTime') : (isCardio ? t('editor.modeCardio') : t('editor.modeBodyweight')));
      return `
        <div class="og-sect-b" data-idx="${idx}">
          <div class="og-lrow">
            <span class="og-lrow-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg></span>
            <span class="og-lrow-tt">${esc(item.name)}</span>
            <span class="og-editor-badges">
              ${item.sg ? `<span class="og-chip">SS ${item.sg}</span>` : ''}
              <span class="og-chip">${typeName}</span>
            </span>
          </div>
          <div class="og-editor-actions">
            <button class="og-iconbtn" data-act="replace" aria-label="${t('editor.replace')}">${t('editor.replace')}</button>
            <button class="og-iconbtn" data-act="up" ${idx === 0 ? 'disabled' : ''} aria-label="↑">↑</button>
            <button class="og-iconbtn" data-act="down" ${idx === draft.items.length - 1 ? 'disabled' : ''} aria-label="↓">↓</button>
            <button class="og-iconbtn og-btn-danger" data-act="remove" aria-label="${t('editor.remove')}">${t('editor.remove')}</button>
          </div>
          <div class="og-editor-grid">
            <div class="og-form-group">
              <label class="og-label">${t('editor.mode')}</label>
              <select class="og-select" data-field="type" data-idx="${idx}">
                <option value="reps" ${isReps ? 'selected' : ''}>${t('editor.modeReps')}</option>
                <option value="time" ${isTime ? 'selected' : ''}>${t('editor.modeTime')}</option>
                <option value="cardio" ${isCardio ? 'selected' : ''}>${t('editor.modeCardio')}</option>
                <option value="bodyweight" ${isBW ? 'selected' : ''}>${t('editor.modeBodyweight')}</option>
              </select>
            </div>
            ${fieldHtml(item, idx, 'sets', t('editor.sets'), item.sets ?? 3)}
            ${isReps || isBW ? fieldHtml(item, idx, 'reps', t('editor.reps'), item.reps ?? '') : ''}
            ${isReps || isBW ? fieldHtml(item, idx, 'repsMin', t('editor.repsMin'), item.repsMin ?? '') : ''}
            ${!isCardio && !isBW ? fieldHtml(item, idx, 'weight', t('editor.weight'), item.weight ?? '') : ''}
            ${!isReps && !isBW ? fieldHtml(item, idx, 'sec', t('editor.sec'), item.sec ?? '') : ''}
            ${isCardio ? fieldHtml(item, idx, 'dist', t('editor.dist'), item.dist ?? '') : ''}
            ${!isCardio && !isBW ? fieldHtml(item, idx, 'inc', t('editor.inc'), item.inc ?? '') : ''}
            ${fieldHtml(item, idx, 'restSec', t('editor.restSec'), item.restSec ?? '')}
            <div class="og-form-group">
              <label class="og-label">${t('editor.intensifier')}</label>
              <select class="og-select" data-field="intensifier" data-idx="${idx}">
                <option value="" ${!item.intensifier ? 'selected' : ''}>—</option>
                <option value="drop" ${item.intensifier === 'drop' ? 'selected' : ''}>${t('editor.drop')}</option>
                <option value="burst" ${item.intensifier === 'burst' ? 'selected' : ''}>${t('editor.burst')}</option>
<option value="ramp" ${item.intensifier === 'ramp' ? 'selected' : ''}>${t('editor.ramp')}</option>
              </select>
            </div>
            <div class="og-form-group">
              <label class="og-label">${t('editor.sg')}</label>
              <select class="og-select" data-field="sg" data-idx="${idx}">
                <option value="" ${!item.sg ? 'selected' : ''}>${t('editor.sgNone')}</option>
                ${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${item.sg === n ? 'selected' : ''}>${n}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>`;
    }

    // Действия по карточке упражнения (замена/перестановка/удаление).
    itemsEl.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const card = btn.closest('[data-idx]');
      if (!card) return;
      const idx = Number(card.dataset.idx);
      const act = btn.dataset.act;
      if (act === 'replace') {
        openPicker((ex) => {
          draft.items[idx].id = ex.id;
          draft.items[idx].name = ex.name;
          draft.items[idx].type = defaultType(ex);
          renderItems();
        });
        return;
      }
      if (act === 'up' && idx > 0) {
        const [it] = draft.items.splice(idx, 1);
        draft.items.splice(idx - 1, 0, it);
        renderItems();
        return;
      }
      if (act === 'down' && idx < draft.items.length - 1) {
        const [it] = draft.items.splice(idx, 1);
        draft.items.splice(idx + 1, 0, it);
        renderItems();
        return;
      }
      if (act === 'remove') {
        draft.items.splice(idx, 1);
        renderItems();
      }
    };

    // Числовые поля и селекты карточек (делегирование).
    itemsEl.addEventListener('input', (e) => {
      const el = e.target;
      if (el.dataset.idx == null || !el.dataset.field) return;
      const idx = Number(el.dataset.idx);
      const item = draft.items[idx];
      if (!item) return;
      const raw = el.value.trim();
      item[el.dataset.field] = raw === '' ? null : parseNum(raw, el.dataset.field);
    });

    itemsEl.addEventListener('change', (e) => {
      const el = e.target;
      if (el.tagName !== 'SELECT' || el.dataset.idx == null || !el.dataset.field) return;
      const idx = Number(el.dataset.idx);
      const item = draft.items[idx];
      if (!item) return;
      const field = el.dataset.field;
      if (field === 'sg') item.sg = el.value === '' ? null : Number(el.value);
      else if (field === 'intensifier') item.intensifier = el.value === '' ? null : el.value;
      else if (field === 'type') { item.type = el.value; renderItems(); }
    });

    // Пайкер упражнений из каталога (для «добавить» и «заменить»).
    function openPicker(onPick) {
      pickerEl.innerHTML = `
        <div class="og-modal-sheet">
          <div class="og-row">
            <h3 class="og-row-label">${t('editor.pickExercise')}</h3>
            <button class="og-back" data-act="close" aria-label="✕">✕</button>
          </div>
          <input class="og-searchf" type="search" data-act="pq" placeholder="${t('editor.searchPlaceholder')}" autocomplete="off">
          <div class="og-editor-picker-chips" data-act="pchips" hidden></div>
          <div class="og-sect-b og-editor-picker-list" data-act="plist"></div>
        </div>`;
      pickerEl.hidden = false;
      const qEl = pickerEl.querySelector('[data-act="pq"]');
      const chipsEl = pickerEl.querySelector('[data-act="pchips"]');
      const listEl = pickerEl.querySelector('[data-act="plist"]');
      let favOnly = false;

      const renderChips = () => {
        const n = fav.favIds(loadState()).length;
        if (n === 0) { chipsEl.hidden = true; chipsEl.innerHTML = ''; return; }
        chipsEl.hidden = false;
        chipsEl.innerHTML = `
          <button class="og-chip ${favOnly ? 'active' : ''}" data-favonly role="switch" aria-checked="${favOnly}">${t('editor.favFilter', { n: String(n) })}</button>`;
      };

      const renderList = () => {
        const q = qEl.value.trim().toLowerCase();
        const S = loadState();
        let list = catalog.getExercises().filter((ex) => !q || ex.name.toLowerCase().includes(q));
        if (eq.activeProfile(S)) list = list.filter((ex) => eq.exAvailable(S, ex));
        if (favOnly) list = list.filter((ex) => fav.isFavorite(S, ex.id));
        list = fav.sortFavoritesFirst(list, S);
        listEl.innerHTML = list.length === 0
          ? `<div class="og-empty">${t('editor.empty')}</div>`
          : list.map((ex) => `
              <button class="og-lrow og-editor-pick" data-ex="${esc(ex.id)}">
                <span class="og-lrow-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg></span>
                <span class="og-lrow-tt">${esc(ex.name)}
                  <span class="og-lrow-ss">${esc((ex.muscleGroup || []).join(', '))}</span>
                </span>
                <span class="og-lrow-che">${fav.isFavorite(S, ex.id) ? '<span class="og-fav-star" aria-label="★">★</span>' : ''}</span>
              </button>`).join('');
      };

      qEl.addEventListener('input', renderList);
      chipsEl.onclick = (e) => {
        const chip = e.target.closest('[data-favonly]');
        if (!chip) return;
        favOnly = !favOnly;
        renderChips();
        renderList();
      };
      listEl.onclick = (e) => {
        const btn = e.target.closest('[data-ex]');
        if (!btn) return;
        const ex = catalog.getExercise(btn.dataset.ex);
        if (ex) onPick(ex);
        pickerEl.hidden = true;
      };
      pickerEl.onclick = (e) => {
        if (e.target === pickerEl) pickerEl.hidden = true;
        if (e.target.closest('[data-act="close"]')) pickerEl.hidden = true;
      };
      renderChips();
      renderList();
      qEl.focus();
    }

    renderItems();
  } catch (err) {
    console.error('og-routine-edit:', err);
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr"><button class="og-back" id="og-ed-err-back">←</button><h2>${t('editor.titleNew')}</h2></header>
        <div class="og-empty">${esc(String(err?.message || err))}</div>
      </div>`;
    const btn = appEl.querySelector('#og-ed-err-back');
    if (btn) btn.onclick = () => go('routines');
  }
}

register('routine-edit', render);