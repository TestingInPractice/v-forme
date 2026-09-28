/**
 * og/supersetFlow.js — навигация по суперсетам и таймер отдыха (A1).
 * Чистые функции.
 */

import { isWarmupRow } from './sessionBuild.js';

/** Группировка индексов записей в суперсеты: [[idx,...], ...]. */
export function supersetUnits(entries) {
  const units = [];
  const index = new Map();
  for (let i = 0; i < (entries || []).length; i++) {
    const sg = entries[i] && entries[i].sg;
    if (sg != null && index.has(sg)) {
      units[index.get(sg)].push(i);
    } else {
      index.set(sg != null ? sg : i, units.length);
      units.push([i]);
    }
  }
  return units;
}

/** Суперсет, содержащий idx; null, если не найден. */
export function unitOf(units, idx) {
  for (const unit of units || []) {
    if (unit.includes(idx)) return unit;
  }
  return null;
}

/** Есть ли невыполненные сеты у записи? */
export function hasWork(entries, idx) {
  const entry = entries && entries[idx];
  if (!entry) return false;
  return (entry.sets || []).some((s) => !s.done);
}

/** Следующий суперсет с невыполненной работой, начиная с fromIdx (с обёрткой). */
export function nextUnfinishedUnit(entries, units, fromIdx) {
  const ordered = [];
  for (const unit of units || []) {
    if (unit.includes(fromIdx)) {
      ordered.push(...unit);
      break;
    }
  }
  const rest = [];
  for (const unit of units || []) {
    if (!unit.includes(fromIdx)) rest.push(...unit);
  }
  const seq = ordered.concat(rest);
  for (const idx of seq) {
    if (hasWork(entries, idx)) return unitOf(units, idx);
  }
  return null;
}

/** Индекс вставки новой записи после текущего суперсета. */
export function insertionIndexAfterCurrentUnit(entries, units, idx) {
  const unit = unitOf(units, idx);
  if (!unit) return (entries || []).length;
  return Math.max(...unit) + 1;
}

/** Прогресс по выполненным рабочим сетами; isNew — появился ли новый. */
export function setProgressHighWater(entry, prev) {
  const done = ((entry && entry.sets) || []).filter((s) => s.done && !isWarmupRow(s)).length;
  const highWater = Math.max(prev || 0, done);
  return { isNew: done > (prev || 0), highWater };
}

/** Отдыхать после сета? (не конец суперсета или не последний суперсет). */
export function restAfterSet({ unitDone, lastUnit }) {
  return !unitDone || !lastUnit;
}

/** Отдыхать при повторной проверке? (таймер не запущен и отдых нужен). */
export function restOnRecheck({ timerRunning, unitDone, lastUnit }) {
  return !timerRunning && restAfterSet({ unitDone, lastUnit });
}

/** Секунды отдыха для суперсета: restSec упражнения или фолбэк. */
export function restSecFor(entries, unit, fallback) {
  const entry = entries && unit && unit.length ? entries[unit[0]] : null;
  const cfg = entry && entry.target;
  const sec = cfg && Number.isFinite(cfg.restSec) && cfg.restSec > 0 ? cfg.restSec : fallback;
  return Math.max(0, Math.round(sec || 0));
}

/** Секунды отдыха после warmup-сета: warmupRestSec суперсета или workRestSec. */
export function warmupRestSecFor(entry, setIdx, workRestSec) {
  const sets = (entry && entry.sets) || [];
  const next = sets[setIdx + 1];
  const nextUnclosedWarmup = !!(next && !next.done && isWarmupRow(next));
  // «последний разминочный → первый рабочий» отдыхает workRestSec (REFERENCE.md:221)
  if (!nextUnclosedWarmup) return Math.max(0, Math.round(workRestSec || 0));
  const cfg = entry && entry.target;
  const sec = cfg && Number.isFinite(cfg.warmupRestSec) && cfg.warmupRestSec > 0 ? cfg.warmupRestSec : workRestSec;
  return Math.max(0, Math.round(sec || 0));
}

/** Шаг потока: суперсет завершён? раунд завершён? куда дальше? */
export function supersetFlowStep(entries, unit, idx) {
  const unitDone = !hasWork(entries, idx);
  const nextIdx = unitDone ? insertionIndexAfterCurrentUnit(entries, unit, idx) : idx;
  const roundDone = unitDone && !hasWork(entries, nextIdx);
  return { unitDone, roundDone, nextIdx };
}