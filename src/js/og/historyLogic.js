/**
 * og/historyLogic.js — статистика и история (A1).
 * Чистые функции; состояние читается через S.
 */

import { dayKey, now } from './store.js';
import { isWarmupRow } from './sessionBuild.js';

/** id упражнения -> основная группа мышц (русское имя из каталога). */
const EX_MUSCLES = {
  squat: 'Квадрицепсы',
  front_squat: 'Квадрицепсы',
  lunge: 'Квадрицепсы',
  lateral_lunge: 'Квадрицепсы',
  step_up: 'Квадрицепсы',
  glute_bridge: 'Ягодицы',
  calf_raise: 'Икроножные',
  pistol_squat: 'Квадрицепсы',
  push_up: 'Грудные',
  incline_push_up: 'Грудные',
  dip: 'Трицепс',
  pike_push_up: 'Дельты',
  shoulder_press: 'Дельты',
  lateral_raise: 'Средняя дельта',
  bench_press: 'Грудные',
  pull_up: 'Широчайшие',
  chin_up: 'Широчайшие',
  bent_over_row: 'Широчайшие',
  inverted_row: 'Широчайшие',
  face_pull: 'Задняя дельта',
  biceps_curl: 'Бицепс',
  plank: 'Поперечная мышца живота',
  side_plank: 'Косые мышцы',
  crunch: 'Прямая мышца живота',
  sit_up: 'Прямая мышца живота',
  russian_twist: 'Косые мышцы',
  dead_bug: 'Поперечная мышца живота',
  bird_dog: 'Поперечная мышца живота',
  burpee: 'Всё тело',
  jumping_jack: 'Всё тело',
  jump_squat: 'Квадрицепсы',
  high_knees: 'Подвздошно-поясничная',
  kettlebell_swing: 'Ягодицы',
  mountain_climber: 'Кор',
  childs_pose: 'Спина',
  cat_cow: 'Позвоночник',
  downward_dog: 'Бицепс бедра',
  forward_fold: 'Бицепс бедра',
  quad_stretch: 'Квадрицепсы',
  hip_flexor_stretch: 'Подвздошно-поясничная',
  shoulder_stretch: 'Плечи',
};

/** Русское имя группы мышц -> слаг (18 групп + 'full-body' для «Всё тело»). */
const MUSCLE_ALIAS = {
  'Квадрицепсы': 'quadriceps',
  'Ягодицы': 'gluteal',
  'Бицепс бедра': 'hamstring',
  'Приводящие': 'adductors',
  'Икроножные': 'calves',
  'Камбаловидная': 'calves',
  'Грудные': 'chest',
  'Передняя дельта': 'deltoids',
  'Трицепс': 'triceps',
  'Дельты': 'deltoids',
  'Средняя дельта': 'deltoids',
  'Задняя дельта': 'deltoids',
  'Верх трапеций': 'trapezius',
  'Широчайшие': 'upper-back',
  'Бицепс': 'biceps',
  'Большая круглая': 'upper-back',
  'Ромбовидные': 'upper-back',
  'Ротаторная манжета': 'upper-back',
  'Трапеции': 'trapezius',
  'Плечевая мышца': 'biceps',
  'Поперечная мышца живота': 'abs',
  'Прямая мышца живота': 'abs',
  'Косые мышцы': 'obliques',
  'Квадратная мышца поясницы': 'lower-back',
  'Разгибатели спины': 'lower-back',
  'Подвздошно-поясничная': 'hip-flexors',
  'Всё тело': 'full-body',
  'Кор': 'abs',
  'Плечи': 'deltoids',
  'Спина': 'upper-back',
  'Позвоночник': 'lower-back',
  'Поясница': 'lower-back',
};

/** Слаг -> русское имя для отображения. */
const SLUG_NAMES = {
  trapezius: 'Трапеции',
  deltoids: 'Дельты',
  chest: 'Грудные',
  'upper-back': 'Спина',
  serratus: 'Передняя зубчатая',
  biceps: 'Бицепс',
  triceps: 'Трицепс',
  forearm: 'Предплечья',
  abs: 'Пресс',
  obliques: 'Косые',
  'lower-back': 'Поясница',
  gluteal: 'Ягодицы',
  quadriceps: 'Квадрицепсы',
  hamstring: 'Бицепс бедра',
  adductors: 'Приводящие',
  'hip-flexors': 'Сгибатели бедра',
  calves: 'Икры',
  tibialis: 'Передняя большеберцовая',
  'full-body': 'Всё тело',
};

function muscleOf(entry) {
  const name = EX_MUSCLES[entry && entry.id];
  return name ? MUSCLE_ALIAS[name] || null : null;
}

/** Недельный ключ 'YYYY-W##' (ISO 8601, четверговая схема). */
export function weekKey(d, weekStart) {
  const dt = new Date(`${d}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return '';
  const date = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Понедельник недели, содержащей ts (ts недельного старта). */
export function startOfWeek(ts, weekStart) {
  const dt = new Date(ts);
  const day = dt.getDay() || 7; // 1..7 (Пн..Вс)
  const monday = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - (day - 1));
  return monday.getTime();
}

/** Тоннаж записи: сумма w*reps по выполненным рабочим сетами. */
export function workoutVolume(record) {
  let sum = 0;
  for (const entry of (record && record.entries) || []) {
    for (const s of entry.sets || []) {
      if (!s.done || isWarmupRow(s)) continue;
      sum += (s.w || 0) * (s.reps || 0);
    }
  }
  return sum;
}

/** Тренировки по дням: { 'YYYY-MM-DD': [record, ...] }. */
export function byDay(workouts) {
  const map = {};
  for (const w of workouts || []) {
    const d = w.d || '';
    if (!d) continue;
    if (!map[d]) map[d] = [];
    map[d].push(w);
  }
  return map;
}

/** Записи тренировок за день (массив). */
export function workoutsOn(S, dayStr) {
  const out = [];
  for (const w of (S && S.workouts) || []) {
    if (w.d === dayStr) out.push(w);
  }
  return out;
}

/** Недель подряд с тренировками (текущая неделя не ломает серию). */
export function streakWeeks(S) {
  const ws = (S && S.weekStart) || 0;
  const anchor = startOfWeek(now(S), ws);
  const seen = new Set();
  for (const w of (S && S.workouts) || []) {
    const wk = weekKey(w.d, ws);
    if (wk) seen.add(wk);
  }
  let streak = 0;
  for (let k = 0; k < 520; k++) { // до 10 лет назад
    const wk = weekKey(dayKey(anchor - k * 604800000), ws);
    if (seen.has(wk)) streak++;
    else if (k > 0) break;
  }
  return streak;
}

/** Тоннаж за всё время; muscle (слаг) — только по этой мышце. */
export function loadOfWorkouts(S, muscle) {
  let sum = 0;
  for (const w of (S && S.workouts) || []) {
    for (const entry of w.entries || []) {
      if (muscle && muscleOf(entry) !== muscle) continue;
      for (const s of entry.sets || []) {
        if (!s.done || isWarmupRow(s)) continue;
        sum += (s.w || 0) * (s.reps || 0);
      }
    }
  }
  return sum;
}

/** Нагрузка по мышцам: [{muscle, load, sets, share}], share = доля от общего load. */
export function muscleBreakdown(S) {
  const totals = new Map();
  let all = 0;
  for (const w of (S && S.workouts) || []) {
    for (const entry of w.entries || []) {
      const slug = muscleOf(entry);
      if (!slug) continue;
      let load = 0;
      let sets = 0;
      for (const s of entry.sets || []) {
        if (!s.done || isWarmupRow(s)) continue;
        load += (s.w || 0) * (s.reps || 0);
        sets++;
      }
      if (sets === 0) continue;
      const cur = totals.get(slug) || { load: 0, sets: 0 };
      cur.load += load;
      cur.sets += sets;
      totals.set(slug, cur);
      all += load;
    }
  }
  const out = [];
  for (const [slug, t] of totals) {
    out.push({
      muscle: SLUG_NAMES[slug] || slug,
      load: t.load,
      sets: t.sets,
      share: all > 0 ? Math.round((t.load / all) * 1000) / 1000 : 0,
    });
  }
  return out.sort((a, b) => b.load - a.load);
}

/** 'YYYY-MM-DD' -> 'ДД.ММ'. */
export function formatDate(dStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dStr || '');
  if (!m) return dStr || '';
  return `${m[3]}.${m[2]}`;
}

/** Секунды -> 'Ч:ММ' (час+) или 'М:СС'. */
export function formatDuration(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Сводка за окно дней (0 = всё время): {workouts, volume, minutes, avgEffort}. */
export function weekSummary(S, days = 0) {
  const from = days > 0 ? now(S) - days * 86400000 : 0;
  let workouts = 0;
  let volume = 0;
  let minutes = 0;
  let rated = 0;
  let sum = 0;
  for (const w of (S && S.workouts) || []) {
    if (from > 0 && (w.start || 0) < from) continue;
    workouts++;
    volume += workoutVolume(w);
    minutes += Math.round((w.totalTime || 0) / 60000);
    for (const entry of w.entries || []) {
      for (const s of entry.sets || []) {
        const r = Number.isFinite(s.rir) ? s.rir : Number.isFinite(s.rpe) ? s.rpe : null;
        if (r === null) continue;
        rated++;
        sum += r;
      }
    }
  }
  return { workouts, volume, minutes, avgEffort: rated ? Math.round((sum / rated) * 10) / 10 : 0 };
}