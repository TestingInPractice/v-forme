/**
 * og/onerm.js — оценка 1ПМ и рекорды (A1).
 * Чистые функции; состояние читается через S.
 */

import { isWarmupRow } from './sessionBuild.js';
import { dayKey } from './store.js';

export const REP_CAP = 12;

/**
 * Оценка 1ПМ по Epley (reps <= 12) или Lombardi (reps > 12).
 * null при w <= 0 / reps <= 0 / нечисловых аргументах.
 */
export function estimate1RM(w, reps) {
  const weight = Number(w);
  const r = Number(reps);
  if (!Number.isFinite(weight) || !Number.isFinite(r)) return null;
  if (weight <= 0 || r <= 0) return null;
  const est = r <= REP_CAP ? weight * (1 + r / 30) : weight * Math.pow(r, 0.1);
  if (!Number.isFinite(est) || est <= 0) return null;
  return Math.round(est * 10) / 10;
}

/** Лучший (по оценке 1ПМ) выполненный рабочий сет упражнения; null, если нет. */
export function bestSetOf(entries, exId) {
  let best = null;
  let bestEst = -1;
  for (const entry of entries || []) {
    if (!entry || entry.id !== exId) continue;
    for (const s of entry.sets || []) {
      if (!s.done || isWarmupRow(s)) continue;
      const est = estimate1RM(s.w, s.reps);
      if (est !== null && est > bestEst) {
        bestEst = est;
        best = s;
      }
    }
  }
  return best;
}

/** Ряд оценок 1ПМ по дням: [{ d: 'YYYY-MM-DD', e1rm }], сортировка по d. */
export function e1rmSeries(entries, exId) {
  const pts = [];
  for (const entry of entries || []) {
    if (!entry || entry.id !== exId) continue;
    const best = bestSetOf([entry], exId);
    if (!best) continue;
    const est = estimate1RM(best.w, best.reps);
    if (est === null) continue;
    pts.push({ d: dayKey(best.ts || 0), e1rm: est });
  }
  return pts.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/** Новый рекорд 1ПМ? (e1rm > любой предыдущей оценки). */
export function is1RMRecord(S, exId, e1rm) {
  let prev = 0;
  for (const w of (S && S.workouts) || []) {
    for (const entry of w.entries || []) {
      if (!entry || entry.id !== exId) continue;
      for (const s of entry.sets || []) {
        if (!s.done || isWarmupRow(s)) continue;
        const est = estimate1RM(s.w, s.reps);
        if (est !== null && est > prev) prev = est;
      }
    }
  }
  return e1rm > prev;
}