/**
 * og/screens/workout.js — экран активной тренировки (og-workout).
 *
 * Регистрирует 'workout'. Общее ядро сессии — _workout-core.js (startWorkoutSession,
 * renderSession, applyPendingSelection). Возврат из библиотеки: library-экран с
 * select='workout' пишет в sessionStorage 'og_workout_pending'
 * JSON { mode:'add'|'swap', entryId, exId, name } и делает go('workout') —
 * выбор применяется к активной сессии (см. applyPendingSelection).
 */

import { register, go, injectCss } from '../router.js';
import * as store from '../store.js';
import {
  startWorkoutSession, renderSession, getActive, applyPendingSelection, tr, esc,
} from './_workout-core.js';

export { startWorkoutSession, renderSession, getActive };

const CSS = `
    .og-wk-workout-hint { margin: 0 0 12px; }
  `;

function renderRoutinePicker(appEl) {
  const S = store.load();
  const routines = S.routines || [];
  appEl.innerHTML = `
    <div class="og-screen">
      <div class="og-header">
        <button class="og-back" data-act="back">←</button>
        <h2>${esc(tr('wk.workout'))}</h2>
      </div>
      <p class="og-muted og-wk-workout-hint">${esc(tr('wk.pickRoutine'))}</p>
      ${routines.length
        ? `<div class="og-sect-b">${routines.map((r) => `
          <div class="og-lrow" data-rid="${esc(r.id)}">
            <span class="og-lrow-tt">${esc(r.name)}<span class="og-lrow-ss">${r.items.length} ${esc(tr('wk.exercises'))}</span></span>
            <span class="og-lrow-che"></span>
          </div>`).join('')}</div>`
        : `<div class="og-empty">${esc(tr('wk.noRoutines'))}</div>`}
      <div class="og-spacer"></div>
      <button class="og-btn og-btn-primary og-btn-block" data-act="empty">${esc(tr('wk.startEmpty'))}</button>
    </div>`;
  appEl.onclick = (ev) => {
    const card = ev.target.closest('[data-rid]');
    if (card) { startWorkoutSession(appEl, { rid: card.dataset.rid }); return; }
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    if (btn.dataset.act === 'back') go('home');
    else if (btn.dataset.act === 'empty') startWorkoutSession(appEl, { rid: null });
  };
}

export function render(appEl, params) {
  injectCss('og-workout', CSS);
  applyPendingSelection(appEl);
  if (getActive()) {
    if (params.rid && getActive().rid !== params.rid) {
      startWorkoutSession(appEl, { rid: params.rid });
    } else {
      renderSession(appEl);
    }
    return;
  }
  if (params.ex) startWorkoutSession(appEl, { ex: params.ex });
  else if (params.rid) startWorkoutSession(appEl, { rid: params.rid });
  else renderRoutinePicker(appEl);
}

register('workout', render);