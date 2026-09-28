/**
 * og/store.js — состояние og-контура (персистентный стор).
 * Хранится в localStorage 'og_state_v1' целиком (как openGym gym_state_v1).
 * Чистые функции + update(fn) для мутаций.
 */

export const KEY = 'og_state_v1';

const DEFAULTS = Object.freeze({
  v: 1,
  profile: {
    name: 'Тренажёр',
    uid: '', // стабильный идентификатор владельца для QR-чекина (генерится лениво, см. og/checkin.js)
    gym: '', // название зала для QR-чекина (настраивается в профиле)
    unit: 'kg',
    effort: 'rir',
    theme: 'dark',
    accent: 'purple',
    restSec: 90,
    beep: true,
    vibrate: true,
    timerFlash: true,
    wc: { steppers: true, setShortcuts: false, pairButtons: false, exerciseButtons: false },
    bodyWeight: 75,
  },
  routines: [],
  workouts: [],
  checkins: [], // журнал QR-чекинов: [{id, ts, d, uid, name, gym}, ...]
  week: 0,
  weekStart: 0,
  bodyweight: [],
  exWeights: {},
  customExercises: [],
  favorites: [], // избранные упражнения: массив id (чистые функции — og/favorites.js)
  equipProfiles: [], // профили оборудования: [{id, name, equipment: string[]}] (og/equipment.js)
  activeEquipId: null, // активный профиль оборудования (filter-гейт в библиотеке/пикерах)
  equipFilterOn: false, // мастер-выключатель профилей оборудования
  _now: 0,
});

/** Чистый дефолт состояния (клонируем, не отдаём замороженный объект). */
export function defaultState() {
  return JSON.parse(JSON.stringify(DEFAULTS));
}

function _read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Merge дефолта + сохранённого (безопасно по ключам верхнего уровня). */
export function load() {
  const base = defaultState();
  const stored = _read();
  if (!stored) return base;
  const merged = { ...base, ...stored };
  merged.profile = { ...base.profile, ...(stored.profile || {}) };
  merged.profile.wc = { ...base.profile.wc, ...(stored.profile?.wc || {}) };
  if (!Array.isArray(merged.routines)) merged.routines = [];
  if (!Array.isArray(merged.workouts)) merged.workouts = [];
  if (!Array.isArray(merged.checkins)) merged.checkins = [];
  if (!Array.isArray(merged.bodyweight)) merged.bodyweight = [];
  if (!Array.isArray(merged.customExercises)) merged.customExercises = [];
  if (!Array.isArray(merged.favorites)) merged.favorites = [];
  if (!Array.isArray(merged.equipProfiles)) merged.equipProfiles = [];
  if (merged.activeEquipId != null && typeof merged.activeEquipId !== 'string') merged.activeEquipId = null;
  if (typeof merged.equipFilterOn !== 'boolean') merged.equipFilterOn = false;
  if (typeof merged.exWeights !== 'object' || merged.exWeights === null) merged.exWeights = {};
  return merged;
}

export function save(S) {
  try {
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {
    // квота/приватный режим — молча
  }
}

/** fn(prevS) -> nextS; сохраняет и возвращает nextS. */
export function update(fn) {
  const next = fn(load());
  save(next);
  return next;
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** "Сейчас" в рамках состояния (позволяет заморозить время для бэкфилла/тестов). */
export function now(S) {
  return S._now || Date.now();
}

/** Локальный день 'YYYY-MM-DD' для ts. */
export function dayKey(ts) {
  const dt = new Date(ts);
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${dt.getFullYear()}-${m}-${d}`;
}

/** Заморозить время (для демо/бэкфилла). 0 = реальное время. */
export function setNow(S, ts) {
  return update(() => ({ ...S, _now: ts }));
}

/** Локальные ключи og-контура вне og_state_v1 (см. screens/coach.js, screens/_workout-core.js). */
export const LS_KEYS = [
  'og_coach_key',       // BYOK API-ключ (screens/coach.js KEY_LS)
  'og_coach_consent',   // согласие на коуч (screens/coach.js CONSENT_LS)
  'og_coach_prefs',     // префсы провайдера (screens/coach.js PREFS_LS)
];
export const SS_KEYS = [
  'og_workout_pending', // pending-выбор из библиотеки (screens/_workout-core.js PENDING_KEY)
];

/** Полный сброс контура: og_state_v1 + coach-ключи + sessionStorage-pending. */
export function reset() {
  for (const k of [KEY, ...LS_KEYS]) {
    try { localStorage.removeItem(k); } catch { /* приватный режим — игнор */ }
  }
  for (const k of SS_KEYS) {
    try { sessionStorage.removeItem(k); } catch { /* приватный режим — игнор */ }
  }
}