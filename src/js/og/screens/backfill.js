/**
 * og/screens/backfill.js — экран «прошлая тренировка» (og-backfill).
 *
 * Тот же workout-экран с датой в прошлом: store.setNow замораживает «сейчас»
 * на выбранный день (ts сета = день бэкфилла), финиш идёт через тот же
 * buildCompletedWorkout/applyCompletedWorkout (insertChronological для d < сегодня).
 */

import { register, go, injectCss } from '../router.js';
import * as store from '../store.js';
import { startWorkoutSession, renderSession, getActive } from './workout.js';
import { tsOfDay, tr, esc } from './_workout-core.js';

const CSS = `
.og-bf-hint { margin-bottom: 16px; }
`;

function defaultDay() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return store.dayKey(d.getTime());
}

function renderForm(appEl, params) {
  const day = params.d || defaultDay();
  const today = store.dayKey(Date.now());
  appEl.innerHTML = `
    <div class="og-screen">
      <div class="og-header">
        <button class="og-back" data-act="back">←</button>
        <h2>${esc(tr('wk.pastWorkout'))}</h2>
      </div>
      <p class="og-muted og-bf-hint">${esc(tr('wk.pastHint'))}</p>
      <div class="og-form-group">
        <label class="og-label">${esc(tr('wk.date'))}</label>
        <input type="date" class="og-input" id="og-bf-date" value="${esc(day)}" max="${esc(today)}">
      </div>
      <button class="og-btn og-btn-primary og-btn-block" data-act="start">${esc(tr('wk.start'))}</button>
    </div>`;
  appEl.onclick = (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'back') { go('home'); return; }
    if (btn.dataset.act === 'start') {
      const input = document.getElementById('og-bf-date');
      const d = (input && input.value) || day;
      const S = store.load();
      store.setNow(S, tsOfDay(d));
      startWorkoutSession(appEl, { rid: params.rid || null, backfillDay: d });
    }
  };
}

export function render(appEl, params) {
  injectCss('og-backfill', CSS);
  if (getActive()) { renderSession(appEl); return; }
  renderForm(appEl, params);
}

register('backfill', render);