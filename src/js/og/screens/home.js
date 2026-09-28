/**
 * og/screens/home.js — экран «Главная» (og-home).
 *
 * Недельная полоса активности (7 дней), CTA «Начать тренировку», streak-недели
 * и навигационные карточки по всем экранам og-контура.
 * Данные — только из store S (S.workouts, S.routines); пустое состояние
 * рендерится без ошибок.
 */
import { register, go, backToApp, injectCss } from '../router.js';
import { load, now, dayKey } from '../store.js';
import { streakWeeks, workoutsOn } from '../historyLogic.js';
import { plural } from '../format.js';
import { t } from '../i18n.js';

injectCss('og-home', `
  .og-home-day { aspect-ratio: auto; padding: 0.35rem 0 0.3rem; text-align: center; }
  .og-home-day[data-today] { outline: 1px solid var(--og-accent); outline-offset: -1px; }
  .og-home-dow { display: block; font-size: 0.6rem; color: var(--og-muted); }
  .og-home-num { display: block; font-size: 0.85rem; font-weight: 700; margin-top: 1px; }
  .og-home-cta { margin-bottom: 0.9rem; }
  .og-home-cta-hint { text-align: center; font-size: 0.78rem; color: var(--og-muted); margin: -0.55rem 0 0.9rem; }
`);

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const ICONS = {
  workout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11"/></svg>',
  routines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  library: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21v-7M10.5 21V8M16 21v-10"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
  checkin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3h-3z"/></svg>',
  coach: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
};

const NAV = [
  { name: 'workout', label: 'Тренировки', icon: 'workout' },
  { name: 'routines', label: 'Шаблоны', icon: 'routines' },
  { name: 'library', label: 'Упражнения', icon: 'library' },
  { name: 'stats', label: 'Статистика', icon: 'stats' },
  { name: 'history', label: 'История', icon: 'history' },
  { name: 'settings', label: 'Настройки', icon: 'settings' },
  { name: 'checkin', label: 'Киоск', icon: 'checkin' },
  { name: 'coach', label: 'Тренер', icon: 'coach' },
];

/** t() с русским фолбэком: ключи — русские строки, при отсутствии перевода возвращаем ключ. */
function tr(key, params) {
  try {
    const s = t(key, params);
    if (s != null && s !== '' && s !== key) return s;
  } catch (err) {
    console.error('og-home: i18n t()', err);
  }
  return key;
}

function levelOf(count) {
  if (!count) return 0;
  return Math.min(4, count);
}

export function render(appEl, params) {
  const S = load();
  const tNow = now(S);
  const todayStr = dayKey(tNow);

  // Недельная полоса: последние 7 дней (вчера → сегодня).
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const ts = tNow - i * 86400000;
    const d = dayKey(ts);
    const count = (workoutsOn(S, d) || []).length;
    days.push({ d, dow: DOW[new Date(ts).getDay()], num: new Date(ts).getDate(), count, level: levelOf(count) });
  }

  const streak = streakWeeks(S) || 0;
  const hasRoutines = Array.isArray(S.routines) && S.routines.length > 0;

  const weekCells = days.map((day) => `
    <div class="og-heat-cell og-home-day${day.level ? ' og-heat-' + day.level : ''}"
         data-level="${day.level}"${day.d === todayStr ? ' data-today' : ''}
         title="${day.d} · ${day.count ? day.count + ' ' + plural(day.count, ['тренировка', 'тренировки', 'тренировок']) : 'нет тренировки'}">
      <span class="og-home-dow">${day.dow}</span>
      <span class="og-home-num">${day.num}</span>
    </div>`).join('');

  const navCards = NAV.map((n) => `
    <a class="og-nav-card" href="#og/${n.name}">
      <span class="og-nav-icon">${ICONS[n.icon]}</span>
      <span class="og-nav-label">${tr(n.label)}</span>
    </a>`).join('');

  appEl.innerHTML = `
    <div class="og-screen">
      <header class="og-hdr">
        <button class="og-back" id="og-home-back" type="button">${tr('← В приложение')}</button>
        <h2>${tr('Главная')}<span class="og-hdr-sub">${streak > 0 ? streak + ' ' + tr('недель подряд') : tr('Нет серии')}</span></h2>
      </header>

      <div class="og-card">
        <p class="og-card-title">${tr('Эта неделя')}</p>
        <div class="og-heatmap og-home-week">${weekCells}</div>
      </div>

      <button class="og-btn og-btn-primary og-btn-xl og-home-cta" id="og-home-start" type="button">${tr('Начать тренировку')}</button>
      ${hasRoutines ? '' : `<p class="og-home-cta-hint">${tr('Создайте шаблон, чтобы начать')}</p>`}

      <div class="og-card">
        <div class="og-row">
          <span class="og-lrow-i">${ICONS.history}</span>
          <span class="og-row-label og-muted">${streak > 0 ? tr('недель подряд') : tr('Нет серии')}</span>
          <span class="og-stat-val og-accent-text">${streak}</span>
        </div>
      </div>

      <div class="og-sect">
        <p class="og-sect-t">${tr('Экраны')}</p>
        <div class="og-nav-grid">${navCards}</div>
      </div>
    </div>`;

  const back = appEl.querySelector('#og-home-back');
  if (back) back.onclick = () => backToApp();

  const start = appEl.querySelector('#og-home-start');
  if (start) start.onclick = () => go(hasRoutines ? 'workout' : 'routines');
}

register('home', render);