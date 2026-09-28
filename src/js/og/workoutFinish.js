/**
 * og/workoutFinish.js — завершение тренировки (A1).
 * buildCompletedWorkout: активная сессия -> запись.
 * applyCompletedWorkout: запись -> новое состояние (прогрессия, PR, неделя).
 */

import { now, dayKey } from './store.js';
import { bestSetOf, estimate1RM, is1RMRecord } from './onerm.js';
import { workoutVolume, startOfWeek } from './historyLogic.js';
import { weightIncrement } from './progression.js';

/** Все рабочие (не warmup) сеты выполнены? */
export function readSession(S, fullEntry) {
  const sets = ((fullEntry && fullEntry.sets) || []).filter((s) => !(s && s.warmup === true));
  return sets.length > 0 && sets.every((s) => s.done);
}

/** Активная сессия -> запись тренировки. */
export function buildCompletedWorkout(S, active) {
  const start = (active && active.start) || now(S);
  const end = now(S);
  const entries = ((active && active.entries) || [])
    .filter((e) => e && (e.sets || []).some((s) => s.done))
    .map((e) => ({ ...e, sets: (e.sets || []).slice() }));
  const volume = entries.reduce((sum, e) => sum + workoutVolume({ entries: [e] }), 0);
  return {
    id: (active && active.id) || '',
    rid: (active && active.rid) || null,
    name: (active && active.name) || '',
    start,
    end,
    d: dayKey(start),
    volume,
    totalTime: Math.max(0, end - start),
    bodyWeight: (S.profile && S.profile.bodyWeight) || null,
    entries,
  };
}

/** Хронологическая вставка record в S.workouts по (d, start). Стабильна при равных ключах. */
export function insertChronological(S, record) {
  const ws = S.workouts || [];
  const d = record.d;
  const start = record.start || 0;
  const idx = ws.findIndex((w) => w.d > d || (w.d === d && (w.start || 0) > start));
  if (idx === -1) ws.push(record);
  else ws.splice(idx, 0, record);
  return S;
}

/** Запись -> новое состояние: PR, вставка, прогрессия, неделя, вес тела. */
export function applyCompletedWorkout(S, record, opts = {}) {
  const next = {
    ...S,
    workouts: (S.workouts || []).slice(),
    exWeights: { ...(S.exWeights || {}) },
  };
  const entries = (record && record.entries) || [];
  const isBackfill = opts.backfill === true;

  // PR-детект против истории БЕЗ новой записи (кроме backfill: 1RM задним числом не двигаем)
  const prIds = [];
  if (!isBackfill) {
    for (const entry of entries) {
      const best = bestSetOf([entry], entry.id);
      if (best) {
        const est = estimate1RM(best.w, best.reps);
        if (est !== null && is1RMRecord(S, entry.id, est)) {
          best.e1prs = true;
          prIds.push(entry.id);
        }
      }
      const heaviest = (entry.sets || [])
        .filter((s) => s.done && !(s && s.warmup === true))
        .reduce((m, s) => (!m || (s.w || 0) > (m.w || 0) ? s : m), null);
      if (heaviest && heaviest.w > 0) {
        let prevMax = 0;
        for (const w of (S.workouts || [])) {
          for (const e of w.entries || []) {
            if (!e || e.id !== entry.id) continue;
            for (const s of e.sets || []) {
              if (s.done && !(s && s.warmup === true) && (s.w || 0) > prevMax) prevMax = s.w;
            }
          }
        }
        if (heaviest.w > prevMax) heaviest.pr = true;
      }
    }
    if (prIds.length === 1) record.prId = prIds[0];
    else if (prIds.length > 1) record.prId = prIds;
  }

  // источник: backfill помечается явно (CONTRACT record form)
  if (isBackfill) record.source = 'backfill';

  // вставка: backfill — хронологически по (d, start), иначе в конец
  if (isBackfill) insertChronological(next, record);
  else next.workouts.push(record);

  // прогрессия по каждому entry (кроме noProg/off): план выполнен -> продвинуть вес
  // backfill НЕ трогает прогрессию (нельзя двигать 1RM задним числом по умолчанию)
  if (!isBackfill) {
    for (const entry of entries) {
      const cfg = entry && entry.target;
      if (!cfg || entry.noProg || (entry.plan && entry.plan.policy === 'off')) continue;
      if (!readSession(S, entry)) continue;
      const unit = (S.profile && S.profile.unit) || 'kg';
      const inc = weightIncrement(cfg, unit);
      const lastW = (next.exWeights[cfg.id] && next.exWeights[cfg.id].w) || cfg.weight || 0;
      if (lastW > 0) {
        next.exWeights[cfg.id] = { w: Math.round((lastW + inc) * 10) / 10 };
      }
    }
  }

  // неделя/недельный старт
  const wkStart = startOfWeek(record.start, S.weekStart);
  if (wkStart > (S.weekStart || 0)) {
    next.week = (S.week || 0) + 1;
    next.weekStart = wkStart;
  }

  // вес тела, если измерен в сессии
  const bw = record.bodyWeight || 0;
  if (bw > 0) {
    next.bodyweight = (S.bodyweight || []).slice().concat([{ d: record.d, w: bw }]);
  }

  return next;
}