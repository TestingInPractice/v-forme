/**
 * og/effort.js — шкала усилия RIR/RPE (A1).
 * Чистые функции; состояние читается через S.
 */

import { weekKey, startOfWeek } from './historyLogic.js';
import { now } from './store.js';
import { isWarmupRow } from './sessionBuild.js';

export const HARD_RIR = 3;
export const MIN_RATED = 5;
export const BUCKETS = 4;

/** Полосы RIR: от 0 (предельно) до 4 (разминка). */
export const EFFORT_BANDS = [
  { rir: 0, max: 0, color: 'var(--og-purple)', feel: 'предельно' },
  { rir: 0.5, max: 0.5, color: 'var(--og-red)', feel: 'тяжело' },
  { rir: 1, max: 1, color: 'var(--og-orange)', feel: 'с запасом' },
  { rir: 2, max: 2, color: 'var(--og-yellow)', feel: 'легко' },
  { rir: 3, max: 3, color: 'var(--og-green)', feel: 'очень легко' },
  { rir: 4, max: 4, color: 'var(--og-blue)', feel: 'разминка' },
];

/** Пресеты кнопок усилия: полосы + tail на последней (4+). */
export const EFFORT_PRESETS = EFFORT_BANDS.map((b) => ({ ...b, tail: b.rir === 4 }));

/** RIR сета: rir, иначе 10 - rpe (RPE 8 == RIR 2), иначе null. */
export function rirOf(set) {
  if (!set) return null;
  if (Number.isFinite(set.rir)) return set.rir;
  if (Number.isFinite(set.rpe)) return 10 - set.rpe;
  return null;
}

/** Перевод RIR в шкалу: 'rpe' -> 10 - rir (6..10), иначе как есть. */
export function toScale(kind, rir) {
  if (kind === 'rpe') {
    if (rir === null || rir === undefined) return null;
    return Math.max(6, Math.min(10, Math.round(10 - rir)));
  }
  return rir;
}

/** Активная шкала: предпочтение профиля или по большинству оценок в истории. */
export function displayScale(S) {
  const pref = S && S.profile && S.profile.effort;
  if (pref === 'rir' || pref === 'rpe') return pref;
  let rpe = 0;
  let rir = 0;
  for (const w of (S && S.workouts) || []) {
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        if (Number.isFinite(s.rpe)) rpe++;
        else if (Number.isFinite(s.rir)) rir++;
      }
    }
  }
  return rpe > rir ? 'rpe' : 'rir';
}

/** Имя шкалы: 'RPE' | 'RIR'. */
export function scaleName(kind) {
  if (kind === 'rpe') return 'RPE';
  return 'RIR';
}

/** Есть ли хоть одна оценка усилия в истории? */
export function hasEffort(S) {
  for (const w of (S && S.workouts) || []) {
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        if (rirOf(s) !== null) return true;
      }
    }
  }
  return false;
}

/** Жёсткий сет? (RIR <= HARD_RIR — близко к отказу). */
export function isHardSet(set) {
  const r = rirOf(set);
  return r !== null && r <= HARD_RIR;
}

/** Цвет полосы для RIR; null вне шкалы. */
export function effortColor(rir) {
  if (rir === null || rir === undefined) return null;
  for (const b of EFFORT_BANDS) {
    if (rir <= b.max) return b.color;
  }
  return null;
}

function inWindow(w, from) {
  return from <= 0 || (w.start || 0) >= from;
}

/** Сводка усилия за окно дней (0 = всё время): {done, rated, hard, avg, hardPct}. */
export function effortSummary(S, days = 0) {
  const from = days > 0 ? now(S) - days * 86400000 : 0;
  let done = 0;
  let rated = 0;
  let hard = 0;
  let sum = 0;
  for (const w of (S && S.workouts) || []) {
    if (!inWindow(w, from)) continue;
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        if (!s.done || isWarmupRow(s)) continue;
        done++;
        const r = rirOf(s);
        if (r === null) continue;
        rated++;
        sum += r;
        if (r <= HARD_RIR) hard++;
      }
    }
  }
  return {
    done,
    rated,
    hard,
    avg: rated ? Math.round((sum / rated) * 10) / 10 : 0,
    hardPct: done > 0 ? Math.round((hard / done) * 100) : 0,
  };
}

/** Усилие по неделям: [{t, rir, n, sets}], только недели с n >= 2. */
export function effortWeeks(S, days = 0) {
  const from = days > 0 ? now(S) - days * 86400000 : 0;
  const ws = (S && S.weekStart) || 0;
  const byWeek = new Map();
  for (const w of (S && S.workouts) || []) {
    if (!inWindow(w, from)) continue;
    const wk = weekKey(w.d, ws);
    if (!wk) continue;
    if (!byWeek.has(wk)) byWeek.set(wk, { t: 0, rated: 0, sum: 0, sets: 0 });
    const acc = byWeek.get(wk);
    if (!acc.t) acc.t = startOfWeek(w.start || 0, ws);
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        if (!s.done || isWarmupRow(s)) continue;
        acc.sets++;
        const r = rirOf(s);
        if (r === null) continue;
        acc.rated++;
        acc.sum += r;
      }
    }
  }
  const out = [];
  for (const [wk, acc] of byWeek) {
    if (acc.rated < 2) continue;
    out.push({
      t: acc.t,
      rir: Math.round((acc.sum / acc.rated) * 10) / 10,
      n: acc.rated,
      sets: acc.sets,
    });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Распределение оценок: [{rir, tail, n, pct}], только полосы с n > 0. */
export function effortHistogram(S, days = 0) {
  const from = days > 0 ? now(S) - days * 86400000 : 0;
  const counts = new Map();
  let total = 0;
  for (const w of (S && S.workouts) || []) {
    if (!inWindow(w, from)) continue;
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        const r = rirOf(s);
        if (r === null) continue;
        counts.set(r, (counts.get(r) || 0) + 1);
        total++;
      }
    }
  }
  const out = [];
  for (const [rir, n] of counts) {
    out.push({
      rir,
      tail: rir === 4,
      n,
      pct: total > 0 ? Math.round((n / total) * 100) : 0,
    });
  }
  return out.sort((a, b) => a.rir - b.rir);
}