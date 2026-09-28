/**
 * og/screens/_workout-core.js — общее ядро активной сессии (workout + backfill).
 *
 * Модуль-скоуп сессии: `active` (не персистится; в store сохраняется только через
 * store.update/load при финише). Формы данных — строго по CONTRACT.md (record/entry/set).
 * Библиотеки импортируются по контракту (A1). Стили экрана — injectCss('og-workout', …).
 */

import { go, injectCss } from '../router.js';
import * as store from '../store.js';
import { buildSessionEntries } from '../sessionBuild.js';
import {
  supersetUnits, unitOf, hasWork, nextUnfinishedUnit,
  restAfterSet, restOnRecheck, restSecFor, warmupRestSecFor, supersetFlowStep, setProgressHighWater,
} from '../supersetFlow.js';
import { buildCompletedWorkout, applyCompletedWorkout } from '../workoutFinish.js';
import { weightIncrement } from '../progression.js';
import { EFFORT_PRESETS, rirOf, toScale, scaleName, effortColor } from '../effort.js';
import { fmtNum, fmtClock, plural } from '../format.js';
import { t } from '../i18n.js';
import { unlockAudio, restEndSound, restTickSound, vibrate } from '../sound.js';
import * as catalog from '../../modules/catalog.js';
import * as fav from '../favorites.js';
import * as eq from '../equipment.js';

/* ─── модуль-скоуп сессии (не глобальное состояние) ─── */
let active = null;        // { id, rid, name, start, entries, backfillDay, hw, _realStart, _curUnit }
let restTimer = null;     // { endTs, total, iv, overlay }
let sessionClockIv = null;
let currentApp = null;

export function getActive() { return active; }

/** Полный сброс активной сессии (settings reset): стоп таймеров + active = null. */
export function resetActiveSession() {
  stopRest();
  stopSessionClock();
  active = null;
  currentApp = null;
}

/* ─── i18n: t() с русским fallback ─── */
const RU = {
  'wk.finish': 'Завершить',
  'wk.addExercise': 'Добавить упражнение',
  'wk.library': 'Выбрать в библиотеке',
  'wk.emptyTitle': 'Тренировка пуста',
  'wk.emptyHint': 'Добавьте упражнения, чтобы начать',
  'wk.rest': 'Отдых',
  'wk.skip': 'Пропустить',
  'wk.finishConfirm': 'Завершить тренировку?',
  'wk.cancel': 'Отмена',
  'wk.ok': 'Завершить',
  'wk.newSession': 'Начать новую тренировку?',
  'wk.newSessionHint': 'Текущая тренировка не завершена и не будет сохранена.',
  'wk.startNew': 'Начать новую',
  'wk.swap': 'замена',
  'wk.remove': 'удалить',
  'wk.addSet': '+ подход',
  'wk.addWarmup': '+ разминка',
  'wk.deleteSet': 'удалить',
  'wk.superset': 'суперсет',
  'wk.warmup': 'разминка',
  'wk.drop': 'дроп',
  'wk.searchPlaceholder': 'Поиск упражнения…',
  'wk.notFound': 'Ничего не найдено',
  'wk.addTitle': 'Добавить упражнение',
  'wk.swapTitle': 'Заменить упражнение',
  'wk.setsDone': 'Выполнено',
  'wk.freeSession': 'Свободная тренировка',
  'wk.pastSession': 'Прошлая тренировка',
  'wk.pastBanner': 'Тренировка за {day}',
  'wk.pickRoutine': 'Выберите шаблон или начните свободную тренировку',
  'wk.startEmpty': 'Начать с пустого',
  'wk.noRoutines': 'Нет шаблонов тренировок',
  'wk.exercises': 'упр.',
  'wk.workout': 'Тренировка',
  'wk.pastWorkout': 'Прошлая тренировка',
  'wk.pastHint': 'Запишите тренировку за прошедший день. Прогрессия не пересчитывается.',
  'wk.date': 'Дата',
  'wk.start': 'Начать',
  'wk.bodyweight': 'вес тела',
  'wk.finishError': 'Не удалось завершить тренировку',
  'wk.pair': 'суперсет',
  'wk.favFilter': 'Избранные ({n})',
};

export function tr(key, params) {
  let v = null;
  try { v = t(key, params); } catch { v = null; }
  if (v && v !== key) return v;
  const f = RU[key];
  if (f == null) return key;
  return params ? f.replace(/\{(\w+)\}/g, (_, k) => (params[k] != null ? params[k] : `{${k}}`)) : f;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** ts локального полдня выбранного дня (избегаем DST-граней). */
export function tsOfDay(dayStr) {
  const [y, m, d] = String(dayStr).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).getTime();
}

/* ─── CSS экрана (одноразовая инъекция) ─── */
const CSS = `
.og-wk-clock { font-variant-numeric: tabular-nums; white-space: nowrap; }
.og-banner { background: var(--og-accent-soft); border: var(--og-hair) solid var(--og-accent-line); border-radius: var(--og-radius); padding: 10px 13px; margin-bottom: 12px; font-size: 13px; }
.og-progress { height: 4px; overflow: hidden; margin-bottom: 12px; }
.og-progress-fill { height: 100%; background: var(--og-accent); transition: width var(--og-med) var(--og-ease); }
.og-entry.current { border-color: var(--og-accent); box-shadow: 0 0 0 1px var(--og-accent); }
.og-entry-plan { margin-top: 2px; }
.og-set-num { font-weight: 700; text-align: center; }
.og-set-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.og-set-line { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.og-chip.og-badge { font-size: 11px; padding: 2px 7px; }
.og-chip.og-badge-warmup { color: var(--og-blue); }
.og-chip.og-badge-drop { color: var(--og-orange); }
.og-chip.og-badge-burst { color: var(--og-yellow); }
.og-effort-row { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
.og-effort-label { font-weight: 700; }
.og-set-actions { display: flex; gap: 6px; margin-top: 4px; flex-wrap: wrap; }
.og-finish-bar { position: fixed; bottom: 0; left: 0; right: 0; padding: 11px 16px calc(11px + var(--og-sab)); background: color-mix(in srgb, var(--og-bg) 90%, transparent); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-top: var(--og-hair) solid var(--og-line); z-index: 20; }
.og-finish-bar .og-btn { display: block; max-width: min(var(--og-screen-w), 100%); margin: 0 auto; }
.og-rest-flash { position: fixed; inset: 0; background: var(--og-accent); opacity: .35; z-index: 70; pointer-events: none; animation: og-flash-fade .7s ease-out forwards; }
@keyframes og-flash-fade { from { opacity: .35; } to { opacity: 0; } }
.og-modal-title { margin: 0; font-size: 17px; font-weight: 700; letter-spacing: -0.015em; }
.og-search-input { margin-bottom: 10px; }
.og-search-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.og-search-list { max-height: 46dvh; overflow-y: auto; }
.og-fav-star { color: var(--og-yellow, #ffd000); }
`;

/* ─── построение entry для одного упражнения (добавление/замена в сессии) ─── */
function makeCfg(exId) {
  const ex = catalog.getExercise(exId) || { id: exId, name: exId };
  const type = ex.isTime || ex.isHold ? 'time' : (ex.category === 'cardio' ? 'cardio' : (ex.equipment === 'bodyweight' ? 'bodyweight' : 'reps'));
  const reps = ex.typicalReps ? Math.round((ex.typicalReps.min + ex.typicalReps.max) / 2) : 10;
  return {
    id: ex.id,
    name: ex.name,
    type,
    sets: 3,
    reps,
    repsMin: null,
    weight: null,
    sec: type === 'time' ? (ex.timeSeconds || ex.holdSeconds || 30) : null,
    dist: null,
    restSec: null,
    warmupRestSec: null,
    inc: null,
    sg: null,
    intensifier: null,
  };
}

function buildSingleEntry(S, cfg) {
  const routine = active && active.rid ? (S.routines.find((r) => r.id === active.rid) || null) : null;
  const r = routine || { id: null, name: null, excludeFromProgression: true, items: [cfg] };
  const [entry] = buildSessionEntries(S, { ...r, items: [cfg] });
  return entry;
}

function planSummary(entry, S) {
  const tgt = entry.target || {};
  const n = tgt.sets ?? entry.sets.length;
  const unit = S.profile.unit;
  if (tgt.type === 'time') {
    const sec = tgt.sec != null ? fmtClock(tgt.sec) : '—';
    const w = tgt.weight != null ? ` @ ${fmtNum(tgt.weight, unit)}` : '';
    return `${n} × ${sec}${w}`;
  }
  if (tgt.type === 'cardio') {
    const d = tgt.dist != null ? `${fmtNum(tgt.dist, '')} м` : (tgt.sec != null ? fmtClock(tgt.sec) : '—');
    return `${n} × ${d}`;
  }
  const reps = tgt.reps != null ? tgt.reps : '—';
  const w = tgt.weight != null ? ` @ ${fmtNum(tgt.weight, unit)}` : '';
  return `${n} × ${reps}${w}`;
}

/* ─── рендер сессии ─── */
export function renderSession(appEl) {
  if (!active) return;
  currentApp = appEl;
  injectCss('og-workout', CSS);
  const S = store.load();
  const entries = active.entries;
  const totalSets = entries.reduce((n, e) => n + e.sets.length, 0);
  const doneSets = entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const pct = totalSets ? Math.round((doneSets / totalSets) * 100) : 0;
  const cur = active._curUnit || [];

  appEl.innerHTML = `
    <div class="og-screen">
      <div class="og-hdr">
        <button class="og-back" data-act="back">←</button>
        <h2>${esc(active.name)}</h2>
        <span class="og-hdr-sub og-wk-clock" id="og-session-clock">0:00</span>
      </div>
      ${active.backfillDay ? `<div class="og-banner">${esc(tr('wk.pastBanner', { day: active.backfillDay }))}</div>` : ''}
      <div class="og-progress"><div class="og-progress-fill" style="width:${pct}%"></div></div>
      ${entries.length === 0
        ? `<div class="og-empty"><p>${esc(tr('wk.emptyTitle'))}</p><p>${esc(tr('wk.emptyHint'))}</p></div>`
        : entries.map((e, i) => entryCard(e, i, S, cur)).join('')}
      <div class="og-spacer"></div>
      <button class="og-btn og-btn-block" data-act="add">+ ${esc(tr('wk.addExercise'))}</button>
      <div class="og-spacer"></div>
      <div class="og-finish-bar">
        <button class="og-btn og-btn-primary og-btn-xl" data-act="finish">${esc(tr('wk.finish'))}</button>
      </div>
    </div>`;

  appEl.onclick = (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const e = Number(btn.dataset.e);
    const s = Number(btn.dataset.s);
    handleAction(act, e, s, btn);
  };
  if (!active.backfillDay) startSessionClock();
}

function entryCard(entry, idx, S, cur) {
  const isCur = cur.includes(idx);
  const wc = S.profile.wc;
  const rows = entry.sets.map((set, si) => setRow(entry, set, idx, si, S, wc)).join('');
  return `
    <div class="og-card og-entry ${isCur ? 'current' : ''}">
      <div class="og-row">
        <div class="og-row-label">
          <h3>${esc(entry.target.name)}</h3>
          ${entry.sg ? `<span class="og-chip">${esc(tr('wk.superset'))}</span>` : ''}
          <div class="og-muted og-entry-plan">${esc(planSummary(entry, S))}</div>
        </div>
        ${wc.pairButtons && idx > 0 ? `<button class="og-chip" data-act="pair" data-e="${idx}">${esc(tr('wk.pair'))}</button>` : ''}
        <button class="og-chip" data-act="swap" data-e="${idx}">${esc(tr('wk.swap'))}</button>
        <button class="og-iconbtn" data-act="remove" data-e="${idx}">✕</button>
      </div>
      ${rows}
      <div class="og-set-actions">
        <button class="og-chip" data-act="addset" data-e="${idx}">${esc(tr('wk.addSet'))}</button>
        <button class="og-chip" data-act="addwarmup" data-e="${idx}">${esc(tr('wk.addWarmup'))}</button>
      </div>
      ${wc.exerciseButtons ? `
        <div class="og-set-actions">
          <button class="og-iconbtn" data-act="moveup" data-e="${idx}">↑</button>
          <button class="og-iconbtn" data-act="movedown" data-e="${idx}">↓</button>
        </div>` : ''}
    </div>`;
}

function setRow(entry, set, e, si, S, wc) {
  const tgt = entry.target || {};
  const unit = S.profile.unit;
  const isTime = tgt.type === 'time';
  const isCardio = tgt.type === 'cardio';
  const ex = catalog.getExercise(tgt.id);
  const isBW = !!(ex && ex.equipment === 'bodyweight');
  const rir = rirOf(set);
  const effortCss = rir != null ? effortColor(rir) : null;
  const effortOn = S.profile.effort !== 'off';
  const badges = [
    set.warmup ? `<span class="og-chip og-badge og-badge-warmup">${esc(tr('wk.warmup'))}</span>` : '',
    set.dropset ? `<span class="og-chip og-badge og-badge-drop">${esc(tr('wk.drop'))}</span>` : '',
    set.burst ? '<span class="og-chip og-badge og-badge-burst">burst</span>' : '',
  ].join('');

  const step = (act, label) => (
    `<button data-act="${act}" data-e="${e}" data-s="${si}">${label}</button>`
  );

  let targetLine;
  if (isTime) {
    const sec = set.sec ?? tgt.sec ?? 0;
    targetLine = wc.steppers
      ? `<span class="og-stp">${step('rminus', '−')}<span class="og-stp-num">${sec}</span>${step('rplus', '+')}</span>`
      : `<span class="og-set-reps">${sec}</span>`;
    targetLine += ` <span class="og-set-meta">с</span>`;
    if (!isBW && (tgt.weight != null || set.w != null)) {
      targetLine += ` × <span class="og-set-reps">${fmtNum(set.w ?? tgt.weight, unit)}</span> <span class="og-set-meta">${unit}</span>`;
    }
  } else if (isCardio) {
    const dist = set.dist ?? tgt.dist ?? 0;
    targetLine = wc.steppers
      ? `<span class="og-stp">${step('rminus', '−')}<span class="og-stp-num">${dist}</span>${step('rplus', '+')}</span>`
      : `<span class="og-set-reps">${dist}</span>`;
    targetLine += ` <span class="og-set-meta">м</span>`;
  } else {
    const reps = set.reps ?? tgt.reps ?? 0;
    const w = set.w ?? tgt.weight;
    const repsPart = wc.steppers
      ? `<span class="og-stp">${step('rminus', '−')}<span class="og-stp-num">${reps}</span>${step('rplus', '+')}</span>`
      : `<span class="og-set-reps">${reps}</span>`;
    let wPart;
    if (isBW) {
      wPart = `<span class="og-set-meta">${esc(tr('wk.bodyweight'))}</span>`;
    } else if (wc.steppers) {
      wPart = `<span class="og-stp">${step('wminus', '−')}<span class="og-stp-num">${w != null ? fmtNum(w, unit) : '—'}</span>${step('wplus', '+')}</span>`;
    } else {
      wPart = `<span class="og-set-reps">${w != null ? fmtNum(w, unit) : '—'}</span>`;
    }
    targetLine = `${repsPart} <span class="og-set-meta">×</span> ${wPart}${w != null && !isBW ? ` <span class="og-set-meta">${unit}</span>` : ''}`;
  }

  const effortRow = set.done && !set.warmup && effortOn ? `
    <div class="og-effort-row">
      <span class="og-set-meta og-effort-label">${esc(scaleName(S.profile.effort))}</span>
      ${(EFFORT_PRESETS || []).map((p) => {
        const r = p.rir;
        const isActive = rir === r;
        const color = effortColor(r);
        const label = p.tail ? '4+' : String(r);
        const disp = S.profile.effort === 'rpe' ? toScale('rpe', r) : label;
        return `<button class="og-chip effort ${isActive ? 'active' : ''}" data-act="effort" data-e="${e}" data-s="${si}" data-rir="${r}" style="${color ? `background:${color};border-color:${color}` : ''}">${disp}</button>`;
      }).join('')}
    </div>` : '';

  const shortcuts = wc.setShortcuts ? `
    <div class="og-set-actions">
      <button class="og-chip ${set.dropset ? 'on' : ''}" data-act="drop" data-e="${e}" data-s="${si}">+Drop</button>
      <button class="og-chip ${set.burst ? 'on' : ''}" data-act="burst" data-e="${e}" data-s="${si}">+Burst</button>
    </div>` : '';

  return `
    <div class="og-set-entry ${set.done ? 'done' : ''}">
      <div class="og-set-meta og-set-num">${si + 1}</div>
      <div class="og-set-body">
        <div class="og-set-line">${targetLine}${badges}</div>
        ${effortRow}
        ${shortcuts}
        <div class="og-set-actions">
          <button class="og-chip" data-act="delset" data-e="${e}" data-s="${si}">${esc(tr('wk.deleteSet'))}</button>
        </div>
      </div>
      <button class="og-set-done-btn ${set.done ? 'done' : ''}" data-act="done" data-e="${e}" data-s="${si}">${set.done ? '✓' : ''}</button>
    </div>`;
}

/* ─── действия ─── */
function handleAction(act, e, s, btn) {
  try {
    switch (act) {
      case 'back': go('home'); break;
      case 'done': toggleSet(e, s); break;
      case 'wplus': stepWeight(e, s, 1); break;
      case 'wminus': stepWeight(e, s, -1); break;
      case 'rplus': stepReps(e, s, 1); break;
      case 'rminus': stepReps(e, s, -1); break;
      case 'addset': addSet(e); break;
      case 'addwarmup': addSet(e, true); break;
      case 'delset': deleteSet(e, s); break;
      case 'swap': openExerciseSearch({ mode: 'swap', entryIdx: e }); break;
      case 'remove': removeEntry(e); break;
      case 'add': openExerciseSearch({ mode: 'add' }); break;
      case 'finish': confirmFinish(); break;
      case 'effort': setEffort(e, s, Number(btn.dataset.rir)); break;
      case 'drop': toggleFlag(e, s, 'dropset'); break;
      case 'burst': toggleFlag(e, s, 'burst'); break;
      case 'pair': pairWithPrevious(e); break;
      case 'moveup': moveEntry(e, -1); break;
      case 'movedown': moveEntry(e, 1); break;
    }
  } catch (err) {
    console.error('og: action', act, err);
  }
}

function rerender() {
  if (currentApp) renderSession(currentApp);
}

function toggleSet(e, s) {
  const entry = active.entries[e];
  if (!entry) return;
  const set = entry.sets[s];
  if (!set) return;
  const S = store.load();
  if (!set.done) {
    set.done = true;
    set.ts = store.now(S);
    const { isNew, highWater } = setProgressHighWater(entry, active.hw[entry.id] || 0);
    active.hw[entry.id] = highWater;
    if (isNew) afterSetDone(e, s);
    else maybeRestOnRecheck(e, s);
  } else {
    set.done = false;
    set.ts = 0;
    recomputeHighlight(e);
  }
  rerender();
}

/** High-water: навигация/отдых только при «новом» прогрессе. */
function afterSetDone(e, s) {
  const entries = active.entries;
  const units = supersetUnits(entries);
  const unit = unitOf(units, e);
  if (!unit) { active._curUnit = nextUnfinishedUnit(entries, units, e); return; }
  const step = supersetFlowStep(entries, unit, e);
  const unitDone = step ? step.unitDone : true;
  const lastUnit = step ? step.roundDone : true;
  if (!active.backfillDay && restAfterSet({ unitDone, lastUnit })) {
    const S = store.load();
    const restSec = restSecAfter(entries, e, s, S.profile.restSec);
    if (restSec > 0) startRest(restSec);
  }
  active._curUnit = unitDone
    ? nextUnfinishedUnit(entries, units, step ? step.nextIdx : e)
    : unit;
}

/** Re-check заполняет «дыру» (отдых истёк), но не сбрасывает тикающий таймер. */
function maybeRestOnRecheck(e, s) {
  const entries = active.entries;
  const units = supersetUnits(entries);
  const unit = unitOf(units, e);
  if (!unit) return;
  const step = supersetFlowStep(entries, unit, e);
  const unitDone = step ? step.unitDone : true;
  const lastUnit = step ? step.roundDone : true;
  if (!active.backfillDay && restOnRecheck({ timerRunning: !!restTimer, unitDone, lastUnit })) {
    const S = store.load();
    const restSec = restSecAfter(entries, e, s, S.profile.restSec);
    if (restSec > 0) startRest(restSec);
  }
  recomputeHighlight(e);
}

/** Секунды отдыха после сета: разминочный — warmupRestSecFor, рабочий — restSecFor. */
function restSecAfter(entries, e, s, fallback) {
  const set = entries[e] && entries[e].sets ? entries[e].sets[s] : null;
  if (set && set.warmup === true) {
    return warmupRestSecFor(entries[e], s, restSecFor(entries, unitOf(supersetUnits(entries), e), fallback));
  }
  return restSecFor(entries, unitOf(supersetUnits(entries), e), fallback);
}

function recomputeHighlight(e) {
  const entries = active.entries;
  const units = supersetUnits(entries);
  const unit = unitOf(units, e);
  if (unit && unit.some((i) => hasWork(entries, i))) { active._curUnit = unit; return; }
  active._curUnit = nextUnfinishedUnit(entries, units, e);
}

function stepWeight(e, s, dir) {
  const entry = active.entries[e];
  if (!entry) return;
  const set = entry.sets[s];
  if (!set) return;
  const S = store.load();
  const inc = weightIncrement(entry.target, S.profile.unit);
  const cur = set.w ?? entry.target.weight ?? 0;
  set.w = Math.max(0, Math.round((cur + dir * inc) * 100) / 100);
  rerender();
}

function stepReps(e, s, dir) {
  const entry = active.entries[e];
  if (!entry) return;
  const set = entry.sets[s];
  if (!set) return;
  const tgt = entry.target || {};
  if (tgt.type === 'time') {
    set.sec = Math.max(0, (set.sec ?? tgt.sec ?? 0) + dir * 5);
  } else if (tgt.type === 'cardio') {
    set.dist = Math.max(0, (set.dist ?? tgt.dist ?? 0) + dir * 50);
  } else {
    set.reps = Math.max(0, (set.reps ?? tgt.reps ?? 0) + dir);
  }
  rerender();
}

function addSet(e, warmup = false) {
  const entry = active.entries[e];
  if (!entry) return;
  const last = entry.sets[entry.sets.length - 1];
  const tgt = entry.target || {};
  entry.sets.push({
    done: false,
    reps: last ? last.reps : (tgt.reps ?? null),
    sec: last ? last.sec : (tgt.sec ?? null),
    dist: last ? last.dist : (tgt.dist ?? null),
    w: last ? last.w : (tgt.weight ?? null),
    rir: null,
    rpe: null,
    warmup: warmup === true,
    dropset: false,
    burst: false,
    ts: 0,
  });
  rerender();
}

function deleteSet(e, s) {
  const entry = active.entries[e];
  if (!entry || entry.sets.length <= 1) return;
  entry.sets.splice(s, 1);
  rerender();
}

function removeEntry(e) {
  active.entries.splice(e, 1);
  active._curUnit = null;
  rerender();
}

function moveEntry(e, dir) {
  const target = e + dir;
  if (target < 0 || target >= active.entries.length) return;
  const arr = active.entries;
  [arr[e], arr[target]] = [arr[target], arr[e]];
  rerender();
}

function pairWithPrevious(e) {
  if (e <= 0) return;
  const prev = active.entries[e - 1];
  const cur = active.entries[e];
  const sg = prev.sg || store.uid('sg');
  prev.sg = sg;
  cur.sg = sg;
  rerender();
}

function toggleFlag(e, s, flag) {
  const entry = active.entries[e];
  if (!entry) return;
  const set = entry.sets[s];
  if (!set) return;
  set[flag] = !set[flag];
  rerender();
}

function setEffort(e, s, rir) {
  const entry = active.entries[e];
  if (!entry) return;
  const set = entry.sets[s];
  if (!set) return;
  const S = store.load();
  const kind = S.profile.effort;
  if (kind === 'off') return;
  if (rirOf(set) === rir) {
    set.rir = null;
    set.rpe = null;
  } else if (kind === 'rpe') {
    set.rpe = toScale('rpe', rir);
    set.rir = null;
  } else {
    set.rir = rir;
    set.rpe = null;
  }
  rerender();
}

function addEntry(exId) {
  const S = store.load();
  active.entries.push(buildSingleEntry(S, makeCfg(exId)));
  rerender();
}

function swapEntry(e, exId) {
  const S = store.load();
  const old = active.entries[e];
  if (!old) return;
  const entry = buildSingleEntry(S, makeCfg(exId));
  entry.sg = old.sg;
  entry.rid = old.rid;
  active.entries[e] = entry;
  rerender();
}

/* ─── поиск упражнений (inline-модалка) ─── */
async function openExerciseSearch({ mode, entryIdx }) {
  let exs = catalog.getExercises();
  if (!exs.length) {
    try { await catalog.init(); } catch (err) { console.error('og: catalog init', err); }
    exs = catalog.getExercises();
  }
  const modal = showModal({
    title: mode === 'swap' ? tr('wk.swapTitle') : tr('wk.addTitle'),
    body: `
      <input class="og-searchf og-search-input" placeholder="${esc(tr('wk.searchPlaceholder'))}" autofocus>
      <div class="og-search-chips" data-cfg-group="chips-search"></div>
      <div class="og-sect-b og-search-list"></div>
      <div class="og-spacer"></div>
      <button class="og-btn og-btn-block" data-lib>${esc(tr('wk.library'))}</button>`,
  });
  const input = modal.querySelector('.og-search-input');
  const chipsEl = modal.querySelector('[data-cfg-group="chips-search"]');
  const list = modal.querySelector('.og-search-list');
  let favOnly = false;

  const renderChips = () => {
    const n = fav.favIds(store.load()).length;
    chipsEl.innerHTML = n > 0
      ? `<button class="og-chip ${favOnly ? 'active' : ''}" data-favonly role="switch" aria-checked="${favOnly}">${esc(tr('wk.favFilter', { n: String(n) }))}</button>`
      : '';
  };

  const renderList = (q) => {
    const ql = q.trim().toLowerCase();
    const S = store.load();
    let items = exs.filter((x) => !ql || (x.name || '').toLowerCase().includes(ql));
    if (eq.activeProfile(S)) items = items.filter((x) => eq.exAvailable(S, x));
    if (favOnly) items = items.filter((x) => fav.isFavorite(S, x.id));
    items = fav.sortFavoritesFirst(items, S);
    list.innerHTML = items.length
      ? items.slice(0, 30).map((x) => `
        <div class="og-lrow og-search-item" data-ex="${esc(x.id)}">
          <span class="og-lrow-tt">${esc(x.name)}<span class="og-lrow-ss">${esc((x.muscleGroup || []).join(', '))}</span></span>
          <span class="og-lrow-che">${fav.isFavorite(S, x.id) ? '<span class="og-fav-star" aria-label="★">★</span>' : ''}</span>
        </div>`).join('')
      : `<div class="og-empty">${esc(tr('wk.notFound'))}</div>`;
    list.querySelectorAll('.og-search-item').forEach((el) => {
      el.onclick = () => {
        const exId = el.dataset.ex;
        if (mode === 'swap' && entryIdx != null) swapEntry(entryIdx, exId);
        else addEntry(exId);
        modal.remove();
      };
    });
  };
  input.oninput = () => renderList(input.value);
  chipsEl.onclick = (e) => {
    const chip = e.target.closest('[data-favonly]');
    if (!chip) return;
    favOnly = !favOnly;
    renderChips();
    renderList(input.value);
  };
  renderChips();
  renderList('');
  modal.querySelector('[data-lib]').onclick = () => {
    modal.remove();
    go('library', { select: 'workout' });
  };
}

/* ─── модалки ─── */
function showModal({ title, body }) {
  const overlay = document.createElement('div');
  overlay.className = 'og-modal';
  overlay.innerHTML = `
    <div class="og-modal-sheet">
      <div class="og-row">
        <h3 class="og-row-label og-modal-title">${esc(title)}</h3>
        <button class="og-iconbtn" data-close>✕</button>
      </div>
      ${body}
    </div>`;
  overlay.querySelector('[data-close]').onclick = () => overlay.remove();
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  return overlay;
}

function confirmFinish() {
  const done = active.entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const total = active.entries.reduce((n, e) => n + e.sets.length, 0);
  const modal = showModal({
    title: tr('wk.finishConfirm'),
    body: `
      <p class="og-muted">${esc(tr('wk.setsDone'))}: ${plural(done, ['подход', 'подхода', 'подходов'])} из ${total}</p>
      <div class="og-row" style="gap:.5rem">
        <button class="og-btn og-btn-block" data-cancel>${esc(tr('wk.cancel'))}</button>
        <button class="og-btn og-btn-primary og-btn-block" data-ok>${esc(tr('wk.ok'))}</button>
      </div>`,
  });
  modal.querySelector('[data-cancel]').onclick = () => modal.remove();
  modal.querySelector('[data-ok]').onclick = () => { modal.remove(); doFinish(); };
}

function doFinish() {
  try {
    let S = store.load();
    if (active.backfillDay) {
      const end = active.start + Math.max(0, Date.now() - active._realStart);
      S = store.setNow(S, end);
    }
    const record = buildCompletedWorkout(S, active);
    const nextS = applyCompletedWorkout(S, record, active.backfillDay ? { backfill: true } : {});
    store.save(nextS);
    if (active.backfillDay) store.setNow(nextS, 0);
    active = null;
    stopRest();
    stopSessionClock();
    go('home');
  } catch (err) {
    console.error('og: finish workout', err);
    showModal({
      title: tr('wk.finishError'),
      body: `<p class="og-muted">${esc(String(err?.message || err))}</p>
        <button class="og-btn og-btn-block" data-close>OK</button>`,
    });
  }
}

/* ─── таймер отдыха (overlay на body, переживает ре-рендеры) ─── */
function startRest(sec) {
  stopRest();
  const total = Math.max(1, Math.round(sec));
  const overlay = document.createElement('div');
  overlay.className = 'og-rest-overlay';
  overlay.innerHTML = `
    <div class="og-muted">${esc(tr('wk.rest'))}</div>
    <div class="og-rest-timer">${fmtClock(total)}</div>
    <div class="og-rest-bar"><div class="og-rest-bar-fill" style="width:100%"></div></div>
    <button class="og-btn og-rest-skip">${esc(tr('wk.skip'))}</button>`;
  overlay.querySelector('.og-rest-skip').onclick = () => stopRest();
  document.body.appendChild(overlay);
  const endTs = Date.now() + total * 1000;
  let lastTick = -1;
  const iv = setInterval(() => {
    const remain = endTs - Date.now();
    const left = Math.max(0, Math.ceil(remain / 1000));
    const frac = Math.max(0, remain / (total * 1000));
    const timerEl = overlay.querySelector('.og-rest-timer');
    const fillEl = overlay.querySelector('.og-rest-bar-fill');
    if (timerEl) timerEl.textContent = fmtClock(left);
    if (fillEl) fillEl.style.width = `${frac * 100}%`;
    if (left !== lastTick) {
      lastTick = left;
      if (left > 0 && left <= 3) {
        try { restTickSound(left); } catch (err) { console.error('og: restTickSound', err); }
      }
    }
    if (left <= 0) {
      clearInterval(iv);
      restTimer = null;
      try { restEndSound(); } catch (err) { console.error('og: restEndSound', err); }
      const S = store.load();
      if (S.profile.vibrate) {
        try { vibrate(); } catch (err) { console.error('og: vibrate', err); }
      }
      if (S.profile.timerFlash) flash();
      setTimeout(() => { if (overlay.isConnected) overlay.remove(); }, 700);
    }
  }, 200);
  restTimer = { endTs, total, iv, overlay };
}

function stopRest() {
  if (!restTimer) return;
  clearInterval(restTimer.iv);
  if (restTimer.overlay.isConnected) restTimer.overlay.remove();
  restTimer = null;
}

function flash() {
  const el = document.createElement('div');
  el.className = 'og-rest-flash';
  document.body.appendChild(el);
  setTimeout(() => { if (el.isConnected) el.remove(); }, 750);
}

/* ─── часы сессии ─── */
function startSessionClock() {
  stopSessionClock();
  const tick = () => {
    const el = document.getElementById('og-session-clock');
    if (el && active) {
      const sec = Math.max(0, Math.floor((Date.now() - active._realStart) / 1000));
      el.textContent = fmtClock(sec);
    }
  };
  tick();
  sessionClockIv = setInterval(tick, 1000);
}

function stopSessionClock() {
  if (sessionClockIv) { clearInterval(sessionClockIv); sessionClockIv = null; }
}

/* ─── старт сессии ─── */
export function startWorkoutSession(appEl, opts = {}) {
  if (active) { confirmReplace(appEl, opts); return; }
  doStart(appEl, opts);
}

function doStart(appEl, opts = {}) {
  const S = store.load();
  const { rid, backfillDay, ex } = opts;
  const routine = rid ? (S.routines.find((r) => r.id === rid) || null) : null;
  const entries = routine ? buildSessionEntries(S, routine) : [];
  const start = backfillDay ? tsOfDay(backfillDay) : store.now(S);
  active = {
    id: store.uid('w'),
    rid: routine ? routine.id : null,
    name: routine ? routine.name : (backfillDay ? tr('wk.pastSession') : tr('wk.freeSession')),
    start,
    entries,
    backfillDay: backfillDay || null,
    hw: {},
    _realStart: Date.now(),
    _curUnit: null,
  };
  // Прямая тренировка из библиотеки: свободная сессия с одним упражнением.
  if (ex && !routine) {
    active.entries.push(buildSingleEntry(S, makeCfg(ex)));
  }
  const units = supersetUnits(entries);
  active._curUnit = nextUnfinishedUnit(entries, units, -1);
  renderSession(appEl);
}

function confirmReplace(appEl, opts) {
  const modal = showModal({
    title: tr('wk.newSession'),
    body: `
      <p class="og-muted">${esc(tr('wk.newSessionHint'))}</p>
      <div class="og-row" style="gap:.5rem">
        <button class="og-btn og-btn-block" data-cancel>${esc(tr('wk.cancel'))}</button>
        <button class="og-btn og-btn-primary og-btn-block" data-ok>${esc(tr('wk.startNew'))}</button>
      </div>`,
  });
  modal.querySelector('[data-cancel]').onclick = () => { modal.remove(); renderSession(appEl); };
  modal.querySelector('[data-ok]').onclick = () => { modal.remove(); doStart(appEl, opts); };
}

/* ─── возврат из библиотеки (library-экран с select='workout') ─── */
const PENDING_KEY = 'og_workout_pending';

export function applyPendingSelection(appEl) {
  let raw = null;
  try { raw = sessionStorage.getItem(PENDING_KEY); } catch { return; }
  if (!raw) return;
  let pend = null;
  try { pend = JSON.parse(raw); } catch { return; }
  try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  if (!pend || !pend.exId) return;
  if (!active) startWorkoutSession(appEl, { rid: null });
  if (!active) return;
  if (pend.mode === 'swap' && pend.entryId) {
    const idx = active.entries.findIndex((en) => en.id === pend.entryId);
    if (idx >= 0) swapEntry(idx, pend.exId);
  } else {
    addEntry(pend.exId);
  }
}

/* ─── очистка при уходе с экрана тренировки ─── */
window.addEventListener('hashchange', () => {
  const m = location.hash.match(/^#og\/([A-Za-z0-9_-]+)/);
  const name = m ? m[1] : null;
  if (name !== 'workout' && name !== 'backfill') {
    stopRest();
    stopSessionClock();
  }
});

/* Разблокировка Web Audio по первому жесту. */
document.addEventListener('pointerdown', function unlockOnce() {
  try { unlockAudio(); } catch (err) { console.error('og: unlockAudio', err); }
  document.removeEventListener('pointerdown', unlockOnce);
}, { once: true });