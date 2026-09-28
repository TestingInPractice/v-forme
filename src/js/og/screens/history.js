/**
 * og/screens/history.js — экран «История» (og-history).
 *
 * Записи тренировок, сгруппированные по дням (byDay, по убыванию). Карточка
 * записи раскрывается по клику: упражнения, сеты (вес × повторы), effort-чипы
 * с цветами, PR-бейджи, суперсет-группы (SG). Пустое состояние — без ошибок.
 */
import { register, go, backToApp, injectCss } from '../router.js';
import { load } from '../store.js';
import { byDay, formatDate, formatDuration, workoutVolume } from '../historyLogic.js';
import { fmtNum, plural } from '../format.js';
import { rirOf, effortColor, displayScale, scaleName, toScale } from '../effort.js';
import { t } from '../i18n.js';

injectCss('og-history', `
  .og-history-day-vol { margin-left: 0.35rem; font-size: 0.78rem; color: var(--og-muted); text-transform: none; }
  .og-history-rec { margin-bottom: 0.5rem; }
  .og-history-rec:last-child { margin-bottom: 0; }
  .og-history-rec .og-lrow { user-select: none; }
  .og-history-rec .og-lrow-che { transition: transform var(--og-fast) var(--og-ease); }
  .og-history-rec.open .og-lrow-che { transform: rotate(90deg); }
  .og-history-rec-body { display: none; border-top: 1px solid var(--og-border); padding: 0.65rem 0.8rem; }
  .og-history-rec.open .og-history-rec-body { display: block; }
  .og-history-entry { margin-bottom: 0.75rem; }
  .og-history-entry:last-child { margin-bottom: 0; }
  .og-history-sg { border-color: var(--og-accent); color: var(--og-accent); }
  .og-history-sg-group { border-left: 3px solid var(--og-accent); padding-left: 0.55rem; }
  .og-history-set { display: flex; align-items: center; gap: 0.45rem; padding: 0.32rem 0.45rem; background: var(--og-bg2); border-radius: 6px; margin-bottom: 0.25rem; font-size: 0.82rem; flex-wrap: wrap; }
  .og-history-set-main { flex: 1; font-variant-numeric: tabular-nums; }
`);

/** t() с русским фолбэком: ключи — русские строки, при отсутствии перевода возвращаем ключ. */
function tr(key, params) {
  try {
    const s = t(key, params);
    if (s != null && s !== '' && s !== key) return s;
  } catch (err) {
    console.error('og-history: i18n t()', err);
  }
  return key;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Безопасное форматирование числа (fmtNum из format.js может отсутствовать/падать). */
function fmt(n, unit) {
  try {
    const s = fmtNum(n, unit);
    if (s != null && s !== '') return s;
  } catch (err) {
    console.error('og-history: fmtNum', err);
  }
  return String(Math.round(n * 10) / 10);
}

/** Число с единицей (не дублируем unit, если fmtNum уже добавил). */
function fmtW(n, unit) {
  const s = fmt(n, unit);
  return s.includes(unit) ? s : s + ' ' + unit;
}

/** PR-отметка: record.prId (строка или массив) или флаги pr/e1prs на сетах. */
function isPr(record, entry) {
  if (!record || !entry) return false;
  const prId = record.prId;
  if (Array.isArray(prId)) {
    if (prId.includes(entry.id)) return true;
  } else if (prId != null && entry.id === prId) {
    return true;
  }
  return (Array.isArray(entry.sets) ? entry.sets : []).some((s) => s && (s.pr || s.e1prs));
}

function setRow(s, unit, scale, sname) {
  if (!s) return '';
  const rir = rirOf(s);
  const color = rir != null ? effortColor(rir) : null;
  const effortChip = color ? `<span class="og-chip effort" style="background:${color}">${sname} ${toScale(scale, rir)}</span>` : '';

  const badges = [];
  if (s.warmup) badges.push('<span class="og-chip">разминка</span>');
  if (s.dropset) badges.push('<span class="og-chip">дроп</span>');
  if (s.burst) badges.push('<span class="og-chip">burst</span>');
  if (s.pr || s.e1prs) badges.push('<span class="og-pr">⭐ PR</span>');

  let main;
  if (s.reps != null) {
    const w = s.w != null ? fmtW(s.w, unit) : '';
    main = w ? `${w} × ${s.reps}` : `${s.reps} повт.`;
  } else if (s.sec != null) {
    main = `${s.sec} с${s.w != null ? ' · ' + fmtW(s.w, unit) : ''}`;
  } else if (s.dist != null) {
    main = `${s.sec != null ? s.sec + ' с · ' : ''}${s.dist} м`;
  } else {
    main = '—';
  }

  return `
    <div class="og-history-set">
      <span class="og-history-set-main">${main}</span>
      ${badges.join('')}
      ${effortChip}
    </div>`;
}

function entryHtml(e, unit, scale, sname, record) {
  const name = (e.target && e.target.name) || 'Упражнение';
  const sets = Array.isArray(e.sets) ? e.sets : [];
  const sg = e.sg || null;
  const prEntry = isPr(record, e);

  const setRows = sets.map((s) => setRow(s, unit, scale, sname)).join('');

  return `
    <div class="og-history-entry${sg ? ' og-history-sg-group' : ''}">
      <div class="og-row">
        <span class="og-row-label">${esc(name)}</span>
        ${sg ? '<span class="og-chip og-history-sg">SG</span>' : ''}
        ${prEntry ? '<span class="og-pr">⭐ PR</span>' : ''}
        <span class="og-row-value">${sets.length} ${plural(sets.length, ['подход', 'подхода', 'подходов'])}</span>
      </div>
      ${setRows}
    </div>`;
}

function recordCard(r, unit, scale, sname, open) {
  const dur = formatDuration(Math.round((r.totalTime || 0) / 1000));
  const vol = fmtW(r.volume || 0, unit);
  let date = '—';
  try {
    if (r.d) date = formatDate(r.d);
  } catch (err) {
    console.error('og-history: formatDate', err);
  }
  const entries = Array.isArray(r.entries) ? r.entries : [];
  const totalSets = entries.reduce((a, e) => a + (Array.isArray(e.sets) ? e.sets.length : 0), 0);

  const body = entries.map((e) => entryHtml(e, unit, scale, sname, r)).join('');

  return `
    <div class="og-sect-b og-history-rec${open ? ' open' : ''}" data-rec>
      <div class="og-lrow" data-rec-head>
        <span class="og-lrow-i" aria-hidden="true">◷</span>
        <span class="og-lrow-tt">
          ${esc(r.name || 'Тренировка')}
          <span class="og-lrow-ss">${date}<br>${dur} · ${vol} · ${totalSets} ${plural(totalSets, ['подход', 'подхода', 'подходов'])}</span>
        </span>
        <span class="og-lrow-che" aria-hidden="true"></span>
      </div>
      <div class="og-history-rec-body">${body}</div>
    </div>`;
}

function wireBack(appEl) {
  const back = appEl.querySelector('.og-back');
  if (back) back.onclick = () => backToApp();
}

function wireExpand(appEl) {
  appEl.addEventListener('click', (ev) => {
    const head = ev.target.closest('[data-rec-head]');
    if (!head) return;
    const rec = head.closest('[data-rec]');
    if (rec) rec.classList.toggle('open');
  });
}

export function render(appEl, params) {
  const S = load();
  const unit = (S.profile && S.profile.unit) || 'kg';
  const workouts = Array.isArray(S.workouts) ? S.workouts : [];

  if (workouts.length === 0) {
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" id="og-history-back" type="button">${tr('← В приложение')}</button>
        <h2>${tr('История')}</h2>
      </header>
      <div class="og-empty">
          <p>${tr('Нет завершённых тренировок')}</p>
          <button class="og-btn og-btn-primary og-btn-block" id="og-history-empty-cta" type="button">${tr('Начать тренировку')}</button>
        </div>
      </div>`;
    wireBack(appEl);
    const cta = appEl.querySelector('#og-history-empty-cta');
    if (cta) cta.onclick = () => go(Array.isArray(S.routines) && S.routines.length ? 'workout' : 'routines');
    return;
  }

  let scale = 'rir';
  let sname = 'RIR';
  try {
    scale = displayScale(S);
    sname = scaleName(scale);
  } catch (err) {
    console.error('og-history: displayScale/scaleName', err);
  }

  let byDayMap = {};
  try {
    byDayMap = byDay(workouts) || {};
  } catch (err) {
    console.error('og-history: byDay', err);
  }
  const dayKeys = Object.keys(byDayMap).sort().reverse();

  const daysHtml = dayKeys.map((d, di) => {
    const recs = [...(byDayMap[d] || [])].sort((a, b) => (b.start || 0) - (a.start || 0));
    const dayVol = recs.reduce((a, r) => a + (workoutVolume(r) || 0), 0);
    const recsHtml = recs.map((r, ri) => recordCard(r, unit, scale, sname, di === 0 && ri === 0)).join('');
    return `
      <div class="og-sect">
        <p class="og-sect-t">${formatDate(d)}<span class="og-history-day-vol">${fmtW(dayVol, unit)}</span></p>
        ${recsHtml}
      </div>`;
  }).join('');

  appEl.innerHTML = `
    <div class="og-screen">
      <header class="og-hdr">
        <button class="og-back" id="og-history-back" type="button">${tr('← В приложение')}</button>
        <h2>${tr('История')}<span class="og-hdr-sub">${workouts.length} ${plural(workouts.length, ['тренировка', 'тренировки', 'тренировок'])}</span></h2>
      </header>
      <button class="og-btn og-btn-primary og-btn-block" id="og-history-backfill" type="button">${tr('✎ Записать прошлую тренировку')}</button>
      ${daysHtml}
    </div>`;

  wireBack(appEl);
  wireExpand(appEl);

  const bf = appEl.querySelector('#og-history-backfill');
  if (bf) bf.onclick = () => go('backfill');
}

register('history', render);