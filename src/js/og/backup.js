/**
 * og/backup.js — экспорт/импорт JSON og-контура.
 * Бэкап = og_state_v1 + каталог (exercises/categories из IDB).
 * Чистые функции: buildExport/validateImport — без DOM и Blob в JSON.
 */

/** JSON-безопасная форма упражнения: gifBlob (Blob) не сериализуется — вырезаем. */
function jsonSafe(ex) {
  if (!ex || typeof ex !== 'object') return ex;
  const { gifBlob, ...rest } = ex;
  return rest;
}

/**
 * Полный бэкап: состояние + каталог.
 * @param {object} S состояние og_state_v1
 * @param {{exercises?: any[], categories?: any[]}} catalog каталог из IDB
 * @returns {object} {...S, exercises, categories}
 */
export function buildExport(S, { exercises = [], categories = [] } = {}) {
  return {
    ...S,
    exercises: exercises.map(jsonSafe),
    categories: categories.map(jsonSafe),
  };
}

/**
 * Валидация бэкапа. Бросает Error с внятным сообщением при неверной схеме.
 * @param {any} raw распарсенный JSON
 * @returns {{state: object, catalog: {exercises: any[], categories: any[]} | null}}
 *   state — без ключей exercises/categories; catalog — null, если секций нет (легаси-бэкап).
 */
export function validateImport(raw) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Файл не похож на резервную копию og_state_v1');
  }
  if (raw.v == null || typeof raw.v !== 'number') {
    throw new Error('В бэкапе нет версии og_state_v1 (поле v)');
  }
  if (!Array.isArray(raw.workouts)) {
    throw new Error('В бэкапе нет списка тренировок (поле workouts)');
  }

  let catalog = null;
  const hasCatalog = raw.exercises !== undefined || raw.categories !== undefined;
  if (hasCatalog) {
    if (!Array.isArray(raw.exercises) || !Array.isArray(raw.categories)) {
      throw new Error('Секции каталога (exercises/categories) должны быть массивами');
    }
    for (const ex of raw.exercises) {
      if (!ex || typeof ex.id !== 'string' || typeof ex.name !== 'string') {
        throw new Error('Упражнение без id/name в каталоге бэкапа');
      }
    }
    for (const cat of raw.categories) {
      if (!cat || typeof cat.id !== 'string' || typeof cat.name !== 'string') {
        throw new Error('Категория без id/name в каталоге бэкапа');
      }
    }
    catalog = { exercises: raw.exercises, categories: raw.categories };
  }

  const { exercises, categories, ...state } = raw;
  return { state, catalog };
}