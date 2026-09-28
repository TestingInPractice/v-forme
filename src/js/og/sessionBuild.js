/**
 * og/sessionBuild.js — сборка сессии из рутины (A1).
 * Чистые функции; состояние читается через S.
 */

import { nextPrescription, applyPrescription, weightIncrement } from './progression.js';

/** Режим упражнения: 'reps' | 'time' | 'cardio'. */
export function modeOf(cfg) {
  const type = (cfg && cfg.type) || 'reps';
  if (type === 'time') return 'time';
  if (type === 'cardio') return 'cardio';
  return 'reps';
}

/** Разминочный сет? */
export function isWarmupRow(set) {
  return !!(set && set.warmup === true);
}

function baseSet() {
  return { done: false, reps: 0, sec: 0, dist: 0, w: 0, rir: null, rpe: null, warmup: false, dropset: false, burst: false, ts: 0 };
}

/** Сеты упражнения по конфигу (без плана). */
export function buildSets(S, cfg, opts = {}) {
  const unit = (S && S.profile && S.profile.unit) || 'kg';
  const step = opts.step || weightIncrement(cfg, unit);
  const useTarget = opts.useTarget === true;
  const mode = modeOf(cfg);
  const count = Math.max(1, cfg.sets || 3);
  const lastW = (S && S.exWeights && S.exWeights[cfg.id] && S.exWeights[cfg.id].w) || 0;
  const baseW = useTarget ? (cfg.weight || 0) : (lastW || cfg.weight || 0);
  const w = cfg.type === 'bodyweight' ? 0 : baseW;
  const reps = cfg.reps || 10;
  const sec = cfg.sec || 60;
  const out = [];
  // warmup-рампа (CONTRACT.md:153): 3 сета 50/65/80% рабочего веса перед рабочими
  if (mode === 'reps' && cfg.intensifier === 'ramp' && w > 0) {
    for (const pct of [0.5, 0.65, 0.8]) {
      const s = baseSet();
      s.reps = reps;
      s.w = Math.max(0, Math.round(w * pct * 2) / 2);
      s.warmup = true;
      out.push(s);
    }
  }
  for (let i = 0; i < count; i++) {
    const s = baseSet();
    if (mode === 'cardio') {
      s.dist = cfg.dist || 0;
      s.sec = sec;
    } else if (mode === 'time') {
      s.sec = sec;
      s.w = w;
    } else {
      s.reps = reps;
      s.w = w;
    }
    out.push(s);
  }
  return out;
}

/** Интенсификатор: 'drop' — дроп-сеты после каждого рабочего, 'burst' — бёрст-флаг. */
export function applyIntensifierPlan(sets, cfg) {
  const out = Array.isArray(sets) ? sets.slice() : [];
  const mode = modeOf(cfg);
  const intensifier = cfg.intensifier || null;
  if (mode !== 'reps' || !intensifier) return out;
  if (intensifier === 'drop') {
    const work = out.filter((s) => !isWarmupRow(s));
    const appended = work.map((s) => ({
      ...s,
      done: false,
      dropset: true,
      burst: false,
      ts: 0,
      w: Math.round((s.w || 0) * 0.85 * 2) / 2,
    }));
    return out.concat(appended);
  }
  if (intensifier === 'burst') {
    for (const s of out) if (!isWarmupRow(s)) s.burst = true;
  }
  return out;
}

/** Собрать записи сессии из рутины: план + сеты + интенсификатор. */
export function buildSessionEntries(S, routine) {
  const items = (routine && routine.items) || [];
  const unit = (S && S.profile && S.profile.unit) || 'kg';
  const entries = [];
  for (const cfg of items) {
    if (!cfg || !cfg.id) continue;
    const plan = nextPrescription(S, cfg, routine);
    const step = weightIncrement(cfg, unit);
    let sets = buildSets(S, cfg, { step, useTarget: plan.kind === 'first' });
    sets = applyPrescription(sets, plan, step);
    sets = applyIntensifierPlan(sets, cfg);
    entries.push({
      id: cfg.id,
      sg: cfg.sg != null ? cfg.sg : null,
      rid: routine && routine.id,
      target: cfg,
      plan,
      sets,
      noProg: cfg.noProg === true,
    });
  }
  return entries;
}