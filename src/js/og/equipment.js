/**
 * og/equipment.js — оборудование и профили оборудования (задача #55).
 *
 * Чистое зеркало openGym `lib/equipment.js` (DuarteSantos8/openGym):
 *   - `equipmentOf(list)`  — уникальные значения инвентаря (по частоте desc, равные — по алфавиту)
 *   - `activeProfile(S)`   — активный профиль оборудования или null (чисто аддитивно)
 *   - `exAvailable(S, ex)` — доступно ли упражнение при активном профиле
 *   - `newProfile(name)`   — создание профиля { id, name, equipment: [] }
 *
 * Модель порта: поле каталога `equipment` — строка, значения:
 *   bodyweight | barbell | dumbbell | bar | bars | band | kettlebell
 * ('bodyweight' одним словом — в отличие от upstream 'body weight').
 *
 * Фильтр ЧИСТО АДДИТИВЕН: без активного профиля ВСЁ доступно (никогда не ловушка).
 * ALWAYS_AVAILABLE ('bodyweight') доступен в любом профиле.
 */

export const ALWAYS_AVAILABLE = 'bodyweight';

/**
 * Уникальные значения оборудования по частоте (desc), равные — по алфавиту.
 * @param {Array<{equipment?: string}>} exercises
 * @returns {string[]}
 */
export function equipmentOf(exercises) {
  const freq = new Map();
  for (const ex of exercises || []) {
    const eq = ex && ex.equipment;
    if (!eq) continue;
    freq.set(eq, (freq.get(eq) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([eq]) => eq);
}

/**
 * Активный профиль оборудования или null: мастер-выключатель equipFilterOn,
 * затем поиск activeEquipId в equipProfiles.
 * @param {object} S состояние og-контура
 * @returns {{id: string, name: string, equipment: string[]}|null}
 */
export function activeProfile(S) {
  if (!S || !S.equipFilterOn) return null;
  const profiles = Array.isArray(S.equipProfiles) ? S.equipProfiles : [];
  if (!S.activeEquipId) return null;
  return profiles.find((p) => p && p.id === S.activeEquipId) || null;
}

/**
 * Доступно ли упражнение при активном профиле (аддитивно: профиль не добавляет
 * ничего запретного). Без активного профиля — ВСЁ доступно.
 * @param {object} S состояние og-контура
 * @param {{equipment?: string}} ex упражнение каталога
 * @returns {boolean}
 */
export function exAvailable(S, ex) {
  const profile = activeProfile(S);
  if (!profile) return true;
  const eq = ex && ex.equipment;
  if (!eq || eq === ALWAYS_AVAILABLE) return true;
  return Array.isArray(profile.equipment) && profile.equipment.includes(eq);
}

/** id нового профиля: строка 'eqp_…' (генерируется на месте, без импортов). */
export function newProfileId() {
  return `eqp_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Создать профиль оборудования.
 * @param {string} name
 * @returns {{id: string, name: string, equipment: string[]}}
 */
export function newProfile(name) {
  return { id: newProfileId(), name: String(name ?? ''), equipment: [] };
}