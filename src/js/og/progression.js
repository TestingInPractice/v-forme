/**
 * og/progression.js — прогрессия нагрузки (A1).
 * Политики: 'off' | 'linear' | 'greyskull' | 'double' | 'time'.
 * Чистые функции; состояние читается через S (без мутаций).
 */

export const DELOAD_FACTOR = 0.10;
export const DELOAD_AFTER = { linear: 3, greyskull: 2, double: 3, time: 3 };

const POLICIES_FOR = {
  reps: ['off', 'linear', 'greyskull', 'double'],
  time: ['off', 'time'],
  cardio: ['off'],
};

/** Зеркало sessionBuild.modeOf (держать в синхроне). */
function modeOf(cfg) {
  const type = (cfg && cfg.type) || 'reps';
  if (type === 'time') return 'time';
  if (type === 'cardio') return 'cardio';
  return 'reps';
}

/** Зеркало sessionBuild.isWarmupRow (держать в синхроне). */
function isWarmupRow(set) {
  return !!(set && set.warmup === true);
}

function snap(v, step) {
  const s = step > 0 ? step : 1;
  return Math.max(0, Math.round(v / s) * s);
}

function round1(v) {
  return Math.round(v * 10) / 10;
}

/** Шаг прогрессии для упражнения: cfg.inc или дефолт по категории. */
export function weightIncrement(cfg, unit) {
  if (cfg && Number.isFinite(cfg.inc) && cfg.inc > 0) return cfg.inc;
  return defaultIncrement(cfg && cfg.id, unit);
}

const HEAVY = new Set([
  'squat', 'front_squat', 'lunge', 'step_up', 'glute_bridge', 'jump_squat', 'pistol_squat',
  'bench_press', 'shoulder_press', 'bent_over_row', 'inverted_row', 'chin_up', 'pull_up',
  'dip', 'kettlebell_swing',
]);

/** Дефолтный шаг: тяжёлые — kg 2.5 / lb 5, лёгкие — kg 1.25 / lb 2.5. */
export function defaultIncrement(exId, unit) {
  const heavy = exId ? HEAVY.has(exId) : false;
  if (unit === 'lb') return heavy ? 5 : 2.5;
  return heavy ? 2.5 : 1.25;
}

/** Чтение одной записи упражнения из истории (внутреннее, богатое). */
function readEntry(entry, fallback) {
  const target = (entry && entry.target) || fallback || {};
  const mode = modeOf(target);
  const logged = ((entry && entry.sets) || []).filter((s) => !isWarmupRow(s));
  const planned = target.sets || logged.length;
  const enough = logged.length >= planned;
  const sets = logged.slice(0, Math.max(1, planned));
  const weight = Math.max(0, ...sets.filter((s) => s.done).map((s) => s.w || 0));
  if (mode === 'time') {
    const goal = target.sec || 0;
    const held = sets.map((s) => (s.done ? s.sec || 0 : 0));
    return {
      mode, target, goal, held, weight,
      best: Math.max(0, ...held),
      ok: goal > 0 && enough && held.length > 0 && held.every((h) => h >= goal),
    };
  }
  const goal = target.reps || 0;
  const reps = sets.map((s) => (s.done ? s.reps || 0 : 0));
  return {
    mode, target, goal, reps, weight,
    count: reps.length,
    low: reps.length ? Math.min(...reps) : 0,
    amrap: reps.length ? reps[reps.length - 1] : 0,
    ok: goal > 0 && enough && reps.length > 0 && reps.every((r) => r >= goal),
  };
}

/** Сессии упражнения из истории (внутреннее). */
function sessionsFor(S, exId, fallback) {
  const out = [];
  for (const w of (S && S.workouts) || []) {
    if (w.excludeFromProgression) continue;
    for (const entry of w.entries || []) {
      if (!entry || entry.id !== exId || entry.noProg) continue;
      const done = (entry.sets || []).some((s) => s.done && !isWarmupRow(s));
      if (!done) continue;
      out.push({ d: w.d, ...readEntry(entry, fallback) });
    }
  }
  return out;
}

/** Выбор политики: cfg.prog > routine.prog > дефолт по режиму. */
function policyFor(cfg, routine, mode) {
  const m = mode || modeOf(cfg || {});
  const allowed = POLICIES_FOR[m] || ['off'];
  const pick = (cfg && cfg.prog) || (routine && routine.prog) || (m === 'reps' ? 'linear' : 'off');
  return allowed.includes(pick) ? pick : 'off';
}

/** Подряд идущие «неудачные» сессии (внутреннее). */
function stallCountInternal(sessions, policy) {
  let n = 0;
  for (let i = sessions.length - 1; i >= 0; i--) {
    if (sessions[i].ok) break;
    if (i < sessions.length - 1 && sessions[i].weight !== sessions[i + 1].weight) break;
    if (policy === 'double') {
      const run = [];
      for (let j = i - 1; j >= 0 && sessions[j].weight === sessions[i].weight; j--) run.push(sessions[j].low);
      if (run.length && sessions[i].low > Math.max(...run)) break;
    }
    n++;
  }
  return n;
}

/** Количество подряд неудачных сессий упражнения. */
export function stallCount(S, cfg) {
  const mode = modeOf(cfg);
  const policy = policyFor(cfg, null, mode);
  const sessions = sessionsFor(S, cfg && cfg.id, cfg).filter((s) => s.mode === mode);
  return stallCountInternal(sessions, policy);
}

/** Следующее предписание для упражнения. */
export function nextPrescription(S, cfg, routine) {
  const mode = modeOf(cfg);
  const policy = policyFor(cfg, routine, mode);
  const unit = (S && S.profile && S.profile.unit) || 'kg';
  const inc = weightIncrement(cfg, unit);
  const sessions = sessionsFor(S, cfg && cfg.id, cfg).filter((s) => s.mode === mode);
  const last = sessions[sessions.length - 1];
  const lastWeight = (S && S.exWeights && S.exWeights[cfg.id] && S.exWeights[cfg.id].w) || cfg.weight || 0;
  const isBodyweight = cfg.type === 'bodyweight' || lastWeight <= 0;
  const sets = cfg.sets || (last && last.target && last.target.sets) || 3;

  if (policy === 'off') return { policy, kind: 'off' };

  if (mode === 'time') {
    if (!last) return { policy, kind: 'first', sec: cfg.sec || 60, sets };
    const goal = last.goal || cfg.sec || 60;
    const sec = last.ok ? goal + inc : Math.max(0, goal - inc);
    return { policy, kind: last.ok ? 'up' : 'hold', sec, sets };
  }

  if (!last) {
    return { policy, kind: 'first', weight: isBodyweight ? 0 : lastWeight, reps: cfg.reps || 10, sets };
  }

  const stalls = stallCountInternal(sessions, policy);
  const deload = stalls >= DELOAD_AFTER[policy];

  if (policy === 'double') {
    const top = last.goal || cfg.reps || 10;
    const bottom = cfg.repsMin != null ? cfg.repsMin : Math.max(1, top - 2);
    if (last.ok) {
      return { policy, kind: 'up', weight: isBodyweight ? 0 : round1(last.weight + inc), reps: bottom, sets };
    }
    return { policy, kind: 'hold', weight: isBodyweight ? 0 : last.weight, reps: top, sets };
  }

  // linear / greyskull
  const base = isBodyweight ? 0 : last.weight;
  if (deload) {
    return { policy, kind: 'deload', weight: isBodyweight ? 0 : round1(base * (1 - DELOAD_FACTOR)), reps: cfg.reps || last.goal || 10, sets };
  }
  if (last.ok) {
    return { policy, kind: 'up', weight: isBodyweight ? 0 : round1(base + inc), reps: cfg.reps || last.goal || 10, sets };
  }
  return { policy, kind: 'hold', weight: base, reps: cfg.reps || last.goal || 10, sets };
}

/** Применить план к не-выполненным (не warmup) сетами; при необходимости добавить сеты. */
export function applyPrescription(sets, plan, step) {
  const out = Array.isArray(sets) ? sets.slice() : [];
  if (!plan || plan.kind === 'off') return out;
  const s = step > 0 ? step : 1;
  const work = out.filter((x) => !isWarmupRow(x));
  const pending = work.filter((x) => !x.done);
  const targets = pending.length ? pending : work;
  for (const t of targets) {
    if (plan.weight != null) t.w = snap(plan.weight, s);
    if (plan.reps != null) t.reps = plan.reps;
    if (plan.sec != null) t.sec = plan.sec;
  }
  if (plan.sets != null && plan.sets > work.length) {
    const last = work[work.length - 1];
    for (let i = work.length; i < plan.sets; i++) {
      out.push({ ...last, done: false, dropset: false, burst: false, ts: 0 });
    }
  }
  return out;
}