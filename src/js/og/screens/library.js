/**
 * og/screens/library.js — экран «Библиотека упражнений» (og-library).
 *
 * Поиск/фильтр по нашему каталогу (catalog.js — единственный источник упражнений),
 * карточки упражнений с быстрыми действиями:
 *   «Создать шаблон» → go('routine-edit', { add: exId })
 *   «Тренировать»    → go('workout', { ex: exId })
 * Модалка с деталями: мышцы, категория, инвентарь, сложность, оценка калорий.
 */

import { register, go, injectCss, backToApp } from '../router.js';
import * as catalog from '../../modules/catalog.js';
import { load as loadState, update as updateState } from '../store.js';
import * as fav from '../favorites.js';
import * as eq from '../equipment.js';

injectCss('og-library', `
.og-lib-searchf { margin-bottom: 12px; }
.og-lib-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
.og-lib-chips .og-chip { cursor: pointer; }
.og-lib-actions { display: flex; gap: 6px; flex-shrink: 0; }
.og-fav-star { color: var(--og-yellow, #ffd000); }
.og-lib-eqbanner { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; padding: 8px 10px; border: 1px solid var(--og-border, #333); border-radius: 8px; }
.og-lib-eqbanner[hidden] { display: none; }
.og-lib-eqbanner .og-lrow-tt { flex: 1 1 auto; }
`);

/* ─── Русский словарь (fallback, если i18n.js ещё не готов) ─── */
const RU = {
  'library.title': 'Библиотека упражнений',
  'library.searchPlaceholder': 'Поиск упражнения…',
  'library.all': 'Все',
  'library.allMuscles': 'Все мышцы',
  'library.toTemplate': 'Создать шаблон',
  'library.train': 'Тренировать',
  'library.muscles': 'Мышцы',
  'library.category': 'Категория',
  'library.equipment': 'Инвентарь',
  'library.difficulty': 'Сложность',
  'library.calories': 'Калории (оценка)',
  'library.empty': 'Ничего не найдено',
  'library.close': 'Закрыть',
  'library.calReps': '≈ {kcal} ккал (3 подхода × {reps})',
  'library.calHold': '≈ {kcal} ккал (1 удержание)',
  'library.calTime': '≈ {kcal} ккал (1 интервал)',
  'library.eq.bodyweight': 'Свой вес',
  'library.eq.barbell': 'Штанга',
  'library.eq.dumbbell': 'Гантели',
  'library.eq.bar': 'Перекладина',
  'library.eq.bars': 'Брусья',
  'library.eq.band': 'Резинка',
  'library.eq.kettlebell': 'Гиря',
  'library.allEq': 'Всё оборудование',
  'library.eqFilterOn': 'Фильтр по моему оборудованию включён',
  'library.eqShowAll': 'Показать всё',
  'library.eqShowAvailable': 'Только моё оборудование',
  'library.diff.1': 'Лёгкое',
  'library.diff.2': 'Среднее',
  'library.diff.3': 'Сложное',
  'library.diff.4': 'Эксперт',
  'library.favAdd': 'В избранное',
  'library.favRemove': 'Убрать из избранного',
  'library.favMark': 'В избранном',
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

const EQ_KEYS = {
  bodyweight: 'library.eq.bodyweight',
  barbell: 'library.eq.barbell',
  dumbbell: 'library.eq.dumbbell',
  bar: 'library.eq.bar',
  bars: 'library.eq.bars',
  band: 'library.eq.band',
  kettlebell: 'library.eq.kettlebell',
};

function eqName(eq) {
  return EQ_KEYS[eq] ? t(EQ_KEYS[eq]) : (eq || '—');
}

function diffName(d) {
  return d >= 1 && d <= 4 ? t(`library.diff.${d}`) : (d != null ? String(d) : '—');
}

function catName(catId) {
  const c = catalog.getCategories().find((x) => x.id === catId);
  return c ? c.name : (catId || '—');
}

/** Оценка калорий за типовой подход (по формуле каталога). */
function caloriesFor(ex, bodyWeightKg) {
  if (typeof catalog.calcExerciseCalories !== 'function') return null;
  let reps = 1;
  let sets = 1;
  let labelKey = 'library.calReps';
  if (ex.isHold) labelKey = 'library.calHold';
  else if (ex.isTime) labelKey = 'library.calTime';
  else { reps = ex.typicalReps?.max ?? 10; sets = 3; }
  const kcal = catalog.calcExerciseCalories(ex, reps, sets, bodyWeightKg);
  return { kcal, reps, labelKey };
}

export async function render(appEl, params) {
  try {
    await ensureCatalog();
    const S = loadState();
    const bodyWeight = S.profile?.bodyWeight ?? 75;
    const state = { q: '', cat: 'all', muscle: 'all', eq: 'all', ex: null, showAll: false };

    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" data-act="back" aria-label="${t('library.close')}">←</button>
          <h2>${t('library.title')}</h2>
        </header>
        <input class="og-searchf og-lib-searchf" type="search" data-act="search"
               placeholder="${t('library.searchPlaceholder')}" autocomplete="off">
        <div class="og-tabs" data-act="tabs"></div>
        <div class="og-lib-chips" data-act="chips"></div>
        <div class="og-lib-eqbanner" data-act="eqbanner" hidden></div>
        <div class="og-lib-chips" data-act="eqchips"></div>
        <div class="og-sect-b" data-act="list"></div>
      </div>
      <div class="og-modal" data-act="modal" hidden></div>
    `;

    const searchEl = appEl.querySelector('[data-act="search"]');
    const tabsEl = appEl.querySelector('[data-act="tabs"]');
    const chipsEl = appEl.querySelector('[data-act="chips"]');
    const eqBannerEl = appEl.querySelector('[data-act="eqbanner"]');
    const eqChipsEl = appEl.querySelector('[data-act="eqchips"]');
    const listEl = appEl.querySelector('[data-act="list"]');
    const modalEl = appEl.querySelector('[data-act="modal"]');

    appEl.querySelector('[data-act="back"]').onclick = () => backToApp();

    searchEl.addEventListener('input', () => {
      state.q = searchEl.value.trim().toLowerCase();
      renderEqChips();
      renderList();
    });

    tabsEl.onclick = (e) => {
      const btn = e.target.closest('[data-cat]');
      if (!btn) return;
      state.cat = btn.dataset.cat;
      renderTabs();
      renderChips();
      renderEqChips();
      renderEqBanner();
      renderList();
    };

    chipsEl.onclick = (e) => {
      const btn = e.target.closest('[data-muscle]');
      if (!btn) return;
      state.muscle = btn.dataset.muscle;
      renderTabs();
      renderChips();
      renderEqChips();
      renderEqBanner();
      renderList();
    };

    eqChipsEl.onclick = (e) => {
      const btn = e.target.closest('[data-eq]');
      if (!btn) return;
      state.eq = btn.dataset.eq;
      renderEqChips();
      renderList();
    };

    eqBannerEl.onclick = (e) => {
      const btn = e.target.closest('[data-showall]');
      if (!btn) return;
      state.showAll = !state.showAll;
      renderEqBanner();
      renderEqChips();
      renderList();
    };

    listEl.onclick = (e) => {
      const card = e.target.closest('[data-ex]');
      if (!card) return;
      const exId = card.dataset.ex;
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'template') { go('routine-edit', { add: exId }); return; }
      if (act === 'train') { go('workout', { ex: exId }); return; }
      openModal(exId);
    };

    modalEl.onclick = (e) => {
      if (e.target === modalEl) { closeModal(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'close') { closeModal(); return; }
      if (act === 'fav' && state.ex) {
        updateState((prev) => fav.toggleFavorite(prev, state.ex.id));
        openModal(state.ex.id);
        renderList();
        return;
      }
      if (act === 'template' && state.ex) { closeModal(); go('routine-edit', { add: state.ex.id }); return; }
      if (act === 'train' && state.ex) { closeModal(); go('workout', { ex: state.ex.id }); return; }
    };

    function renderTabs() {
      const cats = catalog.getCategories();
      const html = [`<button class="og-tab ${state.cat === 'all' ? 'active' : ''}" data-cat="all">${t('library.all')}</button>`]
        .concat(cats.map((c) => `<button class="og-tab ${state.cat === c.id ? 'active' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}</button>`))
        .join('');
      tabsEl.innerHTML = html;
    }

    function renderChips() {
      const groups = catalog.getMuscleGroups();
      const html = [`<button class="og-chip ${state.muscle === 'all' ? 'active' : ''}" data-muscle="all">${t('library.allMuscles')}</button>`]
        .concat(groups.map((m) => `<button class="og-chip ${state.muscle === m ? 'active' : ''}" data-muscle="${esc(m)}">${esc(m)}</button>`))
        .join('');
      chipsEl.innerHTML = html;
    }

    function renderEqBanner() {
      const S = loadState();
      const profile = eq.activeProfile(S);
      if (!profile) {
        eqBannerEl.hidden = true;
        eqBannerEl.innerHTML = '';
        return;
      }
      eqBannerEl.hidden = false;
      eqBannerEl.innerHTML = `
        <span class="og-lrow-tt">${t('library.eqFilterOn')}: <b>${esc(profile.name)}</b></span>
        <button class="og-chip ${state.showAll ? 'active' : ''}" data-showall="1">${state.showAll ? t('library.eqShowAvailable') : t('library.eqShowAll')}</button>
      `;
    }

    /** Базовый список: категория + мышца + поиск (без профиль-гейта и eq-фасета). */
    function baseFiltered() {
      const all = catalog.getExercises();
      return all.filter((ex) => {
        if (state.cat !== 'all' && ex.category !== state.cat) return false;
        if (state.muscle !== 'all' && !(ex.muscleGroup || []).includes(state.muscle)) return false;
        if (state.q && !ex.name.toLowerCase().includes(state.q)) return false;
        return true;
      });
    }

    /** Профиль-гейт: при активном профиле и без showAll — только доступное оборудование. */
    function eqGated(list) {
      const S = loadState();
      const profile = eq.activeProfile(S);
      if (!profile || state.showAll) return list;
      return list.filter((ex) => eq.exAvailable(S, ex));
    }

    function renderEqChips() {
      const opts = eq.equipmentOf(eqGated(baseFiltered()));
      if (opts.length <= 1) {
        eqChipsEl.innerHTML = '';
        return;
      }
      const eqOn = opts.includes(state.eq) ? state.eq : 'all';
      const html = [`<button class="og-chip ${eqOn === 'all' ? 'active' : ''}" data-eq="all">${t('library.allEq')}</button>`]
        .concat(opts.map((o) => `<button class="og-chip ${eqOn === o ? 'active' : ''}" data-eq="${esc(o)}">${esc(eqName(o))}</button>`))
        .join('');
      eqChipsEl.innerHTML = html;
    }

    function renderList() {
      let list = eqGated(baseFiltered());
      const opts = eq.equipmentOf(list);
      const eqOn = opts.includes(state.eq) ? state.eq : 'all';
      if (eqOn !== 'all') list = list.filter((ex) => ex.equipment === eqOn);
      const ordered = fav.sortFavoritesFirst(list, loadState());
      if (ordered.length === 0) {
        listEl.innerHTML = `<div class="og-empty">${t('library.empty')}</div>`;
        return;
      }
      listEl.innerHTML = ordered.map((ex) => `
        <div class="og-lrow" data-ex="${esc(ex.id)}">
          <span class="og-lrow-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg></span>
          <span class="og-lrow-tt">${esc(ex.name)}
            <span class="og-lrow-ss">${esc((ex.muscleGroup || []).join(', ')) || '—'}</span>
          </span>
          <span class="og-lib-actions">
            <button class="og-iconbtn" data-act="template" aria-label="${t('library.toTemplate')}">+</button>
            <button class="og-iconbtn" data-act="train" aria-label="${t('library.train')}">▶</button>
          </span>
          <span class="og-lrow-che">${fav.isFavorite(loadState(), ex.id) ? `<span class="og-fav-star" aria-label="${t('library.favMark')}">★</span>` : ''}</span>
        </div>`).join('');
    }

    function openModal(exId) {
      const ex = catalog.getExercise(exId);
      if (!ex) return;
      state.ex = ex;
      const cal = caloriesFor(ex, bodyWeight);
      const S = loadState();
      const isFav = fav.isFavorite(S, ex.id);
      modalEl.innerHTML = `
        <div class="og-modal-sheet">
          <div class="og-row">
            <h3 class="og-row-label">${esc(ex.name)}</h3>
            <button class="og-iconbtn ${isFav ? 'og-fav-star' : ''}" data-act="fav" aria-pressed="${isFav}" aria-label="${t(isFav ? 'library.favRemove' : 'library.favAdd')}">${isFav ? '★' : '☆'}</button>
            <button class="og-back" data-act="close" aria-label="${t('library.close')}">✕</button>
          </div>
          ${ex.description ? `<p class="og-muted">${esc(ex.description)}</p>` : ''}
          <div class="og-row"><span class="og-row-label og-muted">${t('library.muscles')}</span><span class="og-row-value">${esc((ex.muscleGroup || []).join(', ')) || '—'}</span></div>
          <div class="og-row"><span class="og-row-label og-muted">${t('library.category')}</span><span class="og-row-value">${esc(catName(ex.category))}</span></div>
          <div class="og-row"><span class="og-row-label og-muted">${t('library.equipment')}</span><span class="og-row-value">${esc(eqName(ex.equipment))}</span></div>
          <div class="og-row"><span class="og-row-label og-muted">${t('library.difficulty')}</span><span class="og-row-value">${esc(diffName(ex.difficulty))}</span></div>
          ${cal ? `<div class="og-row"><span class="og-row-label og-muted">${t('library.calories')}</span><span class="og-row-value">${t(cal.labelKey, { kcal: String(cal.kcal), reps: String(cal.reps) })}</span></div>` : ''}
          <div class="og-spacer"></div>
          <button class="og-btn og-btn-primary og-btn-block" data-act="template">+ ${t('library.toTemplate')}</button>
          <div class="og-spacer"></div>
          <button class="og-btn og-btn-block" data-act="train">${t('library.train')}</button>
        </div>`;
      modalEl.hidden = false;
    }

    function closeModal() {
      modalEl.hidden = true;
      state.ex = null;
    }

    renderTabs();
    renderChips();
    renderEqBanner();
    renderEqChips();
    renderList();
  } catch (err) {
    console.error('og-library:', err);
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr"><button class="og-back" id="og-lib-err-back">←</button><h2>${t('library.title')}</h2></header>
        <div class="og-empty">${esc(String(err?.message || err))}</div>
      </div>`;
    const btn = appEl.querySelector('#og-lib-err-back');
    if (btn) btn.onclick = () => backToApp();
  }
}

register('library', render);