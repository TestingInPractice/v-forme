/**
 * og/index.js — точка входа og-контура.
 *
 * Импортирует все экраны контура (каждый сам регистрируется через register())
 * и, если текущий hash ведёт в og-контур (#og/<screen>), отрисовывает его.
 * Вызывается из app.js ПОСЛЕ init() основного приложения (чтобы catalog был готов).
 */

import { boot } from './router.js';

const SCREENS = [
  'home',          // og/screens/home.js
  'workout',       // активная сессия (+ _workout-core)
  'backfill',      // прошедшая тренировка
  'library',       // библиотека упражнений
  'routines',      // шаблоны
  'routine-editor', // редактор шаблона
  'stats',         // статистика
  'history',       // история
  'settings',      // настройки
  'checkin',       // киоск (QR)
  'coach',         // AI-коуч (BYOK)
];

let _ready = null;

/**
 * Инициализация og-контура: динамически импортирует все экраны (каждый
 * регистрируется сам при импорте), затем вызывает boot() — если hash уже
 * ведёт в контур, экран отрисуется; иначе ничего не произойдёт.
 * Идемпотентна: повторные вызовы возвращают тот же промис.
 */
export function initOg() {
  if (!_ready) {
    _ready = Promise
      .all(SCREENS.map((name) => import(`./screens/${name}.js`)))
      .then(() => boot())
      .catch((err) => {
        console.error('og: ошибка инициализации контура', err);
      });
  }
  return _ready;
}