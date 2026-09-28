/**
 * og/i18n.js — переводы og-контура (A1).
 * Ключи — русские строки или dotted-ключи ('library.title').
 * t() возвращает перевод для текущего языка; при отсутствии — сам ключ (русский фолбэк).
 */

export const LANGS = ['ru', 'en'];

let lang = 'ru';

const DICT = {
  // library
  'library.title': { ru: 'Библиотека упражнений', en: 'Exercise library' },
  'library.close': { ru: 'Закрыть', en: 'Close' },
  'library.searchPlaceholder': { ru: 'Поиск упражнений…', en: 'Search exercises…' },
  'library.all': { ru: 'Все', en: 'All' },
  'library.allMuscles': { ru: 'Все мышцы', en: 'All muscles' },
  'library.empty': { ru: 'Ничего не найдено', en: 'Nothing found' },
  'library.toTemplate': { ru: 'В шаблон', en: 'To template' },
  'library.train': { ru: 'Тренироваться', en: 'Train' },
  'library.muscles': { ru: 'Мышцы', en: 'Muscles' },
  'library.category': { ru: 'Категория', en: 'Category' },
  'library.equipment': { ru: 'Инвентарь', en: 'Equipment' },
  'library.difficulty': { ru: 'Сложность', en: 'Difficulty' },
  'library.calories': { ru: 'Калории', en: 'Calories' },
  'library.eq.bodyweight': { ru: 'Свой вес', en: 'Bodyweight' },
  'library.eq.barbell': { ru: 'Штанга', en: 'Barbell' },
  'library.eq.dumbbell': { ru: 'Гантели', en: 'Dumbbells' },
  'library.eq.bar': { ru: 'Перекладина', en: 'Bar' },
  'library.eq.bars': { ru: 'Брусья', en: 'Bars' },
  'library.eq.band': { ru: 'Эспандер', en: 'Band' },
  'library.eq.kettlebell': { ru: 'Гиря', en: 'Kettlebell' },
  'library.favAdd': { ru: 'В избранное', en: 'Add to favourites' },
  'library.favRemove': { ru: 'Убрать из избранного', en: 'Remove from favourites' },
  'library.favMark': { ru: 'В избранном', en: 'Favourite' },
  'library.allEq': { ru: 'Всё оборудование', en: 'All equipment' },
  'library.eqFilterOn': { ru: 'Фильтр по моему оборудованию включён', en: 'Filtered to my equipment' },
  'library.eqShowAll': { ru: 'Показать всё', en: 'Show all' },
  'library.eqShowAvailable': { ru: 'Только моё оборудование', en: 'Only my equipment' },
  'library.diff.1': { ru: 'Легко', en: 'Easy' },
  'library.diff.2': { ru: 'Средне', en: 'Medium' },
  'library.diff.3': { ru: 'Сложно', en: 'Hard' },
  'library.diff.4': { ru: 'Эксперт', en: 'Expert' },
  // routines
  'routines.title': { ru: 'Рутины', en: 'Routines' },
  'routines.new': { ru: 'Новая рутина', en: 'New routine' },
  'routines.deleteConfirm': { ru: 'Удалить рутину «{name}»?', en: 'Delete routine "{name}"?' },
  'routines.empty': { ru: 'Пока нет рутин.\nСоздайте первую — соберите упражнения под свою цель.', en: 'No routines yet.\nCreate your first one.' },
  'routines.ex': { ru: 'упражнение', en: 'exercise' },
  'routines.ex2': { ru: 'упражнения', en: 'exercises' },
  'routines.ex5': { ru: 'упражнений', en: 'exercises' },
  'routines.ss': { ru: 'суперсет', en: 'superset' },
  'routines.ss2': { ru: 'суперсета', en: 'supersets' },
  'routines.ss5': { ru: 'суперсетов', en: 'supersets' },
  'routines.rehab': { ru: 'Реабилитация', en: 'Rehab' },
  'routines.start': { ru: 'Старт', en: 'Start' },
  'routines.edit': { ru: 'Изменить', en: 'Edit' },
  'routines.delete': { ru: 'Удалить', en: 'Delete' },
  // settings
  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.profile': { ru: 'Профиль', en: 'Profile' },
  'settings.name': { ru: 'Имя', en: 'Name' },
  'settings.bodyWeight': { ru: 'Вес тела', en: 'Body weight' },
  'settings.unitsEffort': { ru: 'Единицы и усилие', en: 'Units & effort' },
  'settings.unit': { ru: 'Единицы веса', en: 'Weight units' },
  'settings.unitKg': { ru: 'Килограммы (кг)', en: 'Kilograms (kg)' },
  'settings.unitLb': { ru: 'Фунты (lb)', en: 'Pounds (lb)' },
  'settings.effort': { ru: 'Шкала усилия', en: 'Effort scale' },
  'settings.off': { ru: 'Выкл', en: 'Off' },
  'settings.appearance': { ru: 'Внешний вид', en: 'Appearance' },
  'settings.theme': { ru: 'Тема', en: 'Theme' },
  'settings.dark': { ru: 'Тёмная', en: 'Dark' },
  'settings.light': { ru: 'Светлая', en: 'Light' },
  'settings.accent': { ru: 'Акцент', en: 'Accent' },
  'settings.restTimer': { ru: 'Таймер отдыха', en: 'Rest timer' },
  'settings.restSec': { ru: 'Отдых по умолчанию, сек', en: 'Default rest, sec' },
  'settings.beep': { ru: 'Звук', en: 'Sound' },
  'settings.vibrate': { ru: 'Вибрация', en: 'Vibration' },
  'settings.timerFlash': { ru: 'Мигание экрана', en: 'Screen flash' },
  'settings.wc': { ru: 'Управление', en: 'Controls' },
  'settings.wcSteppers': { ru: 'Степперы веса/повторов', en: 'Weight/reps steppers' },
  'settings.wcSetShortcuts': { ru: 'Быстрые кнопки подходов', en: 'Set shortcuts' },
  'settings.wcPairButtons': { ru: 'Парные кнопки', en: 'Pair buttons' },
  'settings.wcExerciseButtons': { ru: 'Кнопки упражнений', en: 'Exercise buttons' },
  'settings.data': { ru: 'Данные', en: 'Data' },
  'settings.export': { ru: 'Экспорт', en: 'Export' },
  'settings.import': { ru: 'Импорт', en: 'Import' },
  'settings.reset': { ru: 'Сбросить всё', en: 'Reset all' },
  'settings.dataNote': { ru: 'Данные хранятся локально в браузере.', en: 'Data is stored locally in the browser.' },
  'settings.importInvalid': { ru: 'Неверный формат файла', en: 'Invalid file format' },
  'settings.importError': { ru: 'Ошибка импорта', en: 'Import error' },
  'settings.resetConfirm': { ru: 'Сбросить все данные og? Будет удалён и ключ коуча.', en: 'Reset all og data? The coach key will also be removed.' },
  // equipment profiles (settings)
  'settings.equipment': { ru: 'Оборудование', en: 'Equipment' },
  'settings.equipFilter': { ru: 'Фильтровать по моему оборудованию', en: 'Filter to my equipment' },
  'settings.equipNoProfiles': { ru: 'Профилей пока нет — добавьте, чтобы видеть только упражнения под ваше оборудование.', en: 'No equipment profiles yet — add one to see only exercises matching what you have.' },
  'settings.equipAdd': { ru: 'Добавить профиль', en: 'Add profile' },
  'settings.equipEdit': { ru: 'Изменить', en: 'Edit' },
  'settings.equipDelete': { ru: 'Удалить', en: 'Delete' },
  'settings.equipActive': { ru: 'Активный профиль', en: 'Active profile' },
  'settings.equipName': { ru: 'Название профиля', en: 'Profile name' },
  'settings.equipNamePlaceholder': { ru: 'Например: Мой зал', en: 'e.g. My gym' },
  'settings.equipItems': { ru: 'Оборудование', en: 'Equipment' },
  'settings.equipCount': { ru: '{n} шт.', en: '{n} items' },
  'settings.equipHint': { ru: 'Профиль — набор инвентаря. Упражнения вне набора скрываются (кроме «свой вес» — он доступен всегда).', en: 'A profile is a set of equipment. Exercises outside the set are hidden (bodyweight is always available).' },
  'settings.equipDeleteConfirm': { ru: 'Удалить профиль «{name}»?', en: 'Delete profile "{name}"?' },
  // editor
  'editor.titleEdit': { ru: 'Редактор рутины', en: 'Routine editor' },
  'editor.titleNew': { ru: 'Новая рутина', en: 'New routine' },
  'editor.notFound': { ru: 'Рутина не найдена', en: 'Routine not found' },
  'editor.name': { ru: 'Название', en: 'Name' },
  'editor.namePlaceholder': { ru: 'Например: Сила 3×5', en: 'e.g. Strength 3×5' },
  'editor.rehab': { ru: 'Реабилитация (без прогрессии)', en: 'Rehab (no progression)' },
  'editor.restSec': { ru: 'Отдых, сек', en: 'Rest, sec' },
  'editor.auto': { ru: 'авто', en: 'auto' },
  'editor.addExercise': { ru: 'Добавить упражнение', en: 'Add exercise' },
  'editor.hint': { ru: 'Подсказка: упражнения с одинаковым номером суперсета идут подряд.', en: 'Tip: exercises with the same superset number go together.' },
  'editor.sgHint': { ru: 'Суперсеты', en: 'Supersets' },
  'editor.save': { ru: 'Сохранить', en: 'Save' },
  'editor.errName': { ru: 'Введите название', en: 'Enter a name' },
  'editor.errItems': { ru: 'Добавьте хотя бы одно упражнение', en: 'Add at least one exercise' },
  'editor.modeReps': { ru: 'Повторы', en: 'Reps' },
  'editor.modeTime': { ru: 'Время', en: 'Time' },
  'editor.modeCardio': { ru: 'Кардио', en: 'Cardio' },
  'editor.replace': { ru: 'Заменить', en: 'Replace' },
  'editor.remove': { ru: 'Убрать', en: 'Remove' },
  'editor.mode': { ru: 'Режим', en: 'Mode' },
  'editor.sets': { ru: 'Подходы', en: 'Sets' },
  'editor.reps': { ru: 'Повторы', en: 'Reps' },
  'editor.repsMin': { ru: 'Мин. повторы', en: 'Min reps' },
  'editor.weight': { ru: 'Вес', en: 'Weight' },
  'editor.sec': { ru: 'Секунды', en: 'Seconds' },
  'editor.dist': { ru: 'Дистанция', en: 'Distance' },
  'editor.inc': { ru: 'Шаг прогрессии', en: 'Progression step' },
  'editor.intensifier': { ru: 'Интенсификатор', en: 'Intensifier' },
  'editor.drop': { ru: 'Дроп-сеты', en: 'Drop sets' },
  'editor.burst': { ru: 'Бёрст', en: 'Burst' },
  'editor.ramp': { ru: 'Рампа (разминка)', en: 'Warmup ramp' },
  'editor.sg': { ru: 'Суперсет', en: 'Superset' },
  'editor.sgNone': { ru: 'Нет', en: 'None' },
  'editor.pickExercise': { ru: 'Выберите упражнение', en: 'Pick an exercise' },
  'editor.searchPlaceholder': { ru: 'Поиск…', en: 'Search…' },
  'editor.empty': { ru: 'Ничего не найдено', en: 'Nothing found' },
  'editor.favFilter': { ru: 'Избранные ({n})', en: 'Favourites ({n})' },
  'wk.favFilter': { ru: 'Избранные ({n})', en: 'Favourites ({n})' },
};

export function setLang(next) {
  if (LANGS.includes(next)) lang = next;
}

export function getLang() {
  return lang;
}

/** Перевод ключа; при отсутствии — сам ключ (русский фолбэк). {param} подставляются из params. */
export function t(key, params = {}) {
  try {
    const entry = DICT[key];
    const text = entry ? (entry[lang] || entry.ru || key) : key;
    return String(text).replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? String(params[k]) : m));
  } catch {
    return String(key);
  }
}