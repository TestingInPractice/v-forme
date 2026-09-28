/**
 * og/screens/stats.js — экран «Статистика» (og-stats).
 *
 * Тилы (тренировки / объём / минуты / streak), heatmap активности за ~12 недель,
 * E1RM-график на canvas (без библиотек), усилие (сводка + недельные бары +
 * гистограмма по бакетам RIR), разбивка нагрузки по мышцам.
 * Всё считается из S.workouts; пустое состояние рендерится без ошибок.
 */
import { register, go, backToApp, injectCss } from '../router.js';
import { load, now, dayKey } from '../store.js';
import { streakWeeks, loadOfWorkouts, byDay, weekKey, startOfWeek, muscleBreakdown } from '../historyLogic.js';
import { fmtNum, plural } from '../format.js';
import { bestSetOf, e1rmSeries, estimate1RM } from '../onerm.js';
import { hasEffort, effortSummary, effortWeeks, effortHistogram, effortColor, displayScale, scaleName, toScale } from '../effort.js';
import { t } from '../i18n.js';

injectCss('og-stats', `
  .og-stats-pane { margin-bottom: 0.5rem; }
  .og-stats-heat { display: grid; grid-template-columns: 2.2rem repeat(7, 1fr); gap: 3px; }
  .og-stats-heat-label { font-size: 0.6rem; color: var(--og-muted); display: flex; align-items: center; justify-content: flex-end; padding-right: 4px; }
  .og-stats-heat-dow { font-size: 0.6rem; color: var(--og-muted); text-align: center; padding-bottom: 2px; }
  .og-stats-chart-wrap { margin-bottom: 0.5rem; }
  .og-stats-canvas { width: 100%; height: 190px; display: block; }
  .og-stats-effort-bars { display: flex; align-items: flex-end; gap: 5px; height: 110px; padding: 0 2px; }
  .og-stats-effort-bar { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; min-width: 0; }
  .og-stats-effort-bar-fill { width: 100%; border-radius: 4px 4px 0 0; min-height: 2px; }
  .og-stats-effort-bar-label { font-size: 0.58rem; color: var(--og-muted); margin-top: 4px; white-space: nowrap; }
  .og-stats-hist-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
  .og-stats-hist-label { width: 3.4rem; font-size: 0.78rem; color: var(--og-muted); flex-shrink: 0; }
  .og-stats-hist-bar { flex: 1; height: 14px; background: var(--og-bg2); border-radius: 4px; overflow: hidden; }
  .og-stats-hist-fill { height: 100%; border-radius: 4px; }
  .og-stats-hist-val { width: 4.6rem; font-size: 0.72rem; color: var(--og-muted); text-align: right; flex-shrink: 0; }
  .og-stats-muscle-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.45rem; }
  .og-stats-muscle-name { width: 7.5rem; font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
  .og-stats-muscle-bar { flex: 1; height: 12px; background: var(--og-bg2); border-radius: 4px; overflow: hidden; }
  .og-stats-muscle-fill { height: 100%; background: var(--og-accent); border-radius: 4px; }
  .og-stats-muscle-val { width: 6rem; font-size: 0.72rem; color: var(--og-muted); text-align: right; flex-shrink: 0; }
  .og-stats-muscle-scroll { max-height: 220px; overflow-y: auto; margin-top: 0.2rem; }
`);

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'strength', label: 'Сила' },
  { id: 'effort', label: 'Усилие' },
  { id: 'muscles', label: 'Мышцы' },
];

/** t() с русским фолбэком: ключи — русские строки, при отсутствии перевода возвращаем ключ. */
function tr(key, params) {
  try {
    const s = t(key, params);
    if (s != null && s !== '' && s !== key) return s;
  } catch (err) {
    console.error('og-stats: i18n t()', err);
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
    console.error('og-stats: fmtNum', err);
  }
  return String(Math.round(n * 10) / 10);
}

/** Число с единицей (не дублируем unit, если fmtNum уже добавил). */
function fmtW(n, unit) {
  const s = fmt(n, unit);
  return s.includes(unit) ? s : s + ' ' + unit;
}

function countSets(record) {
  if (!record || !Array.isArray(record.entries)) return 0;
  return record.entries.reduce(
    (a, e) => a + (Array.isArray(e.sets) ? e.sets.filter((s) => s && s.done !== false && !s.warmup).length : 0),
    0,
  );
}

function heatLevel(sets) {
  if (!sets) return 0;
  if (sets <= 3) return 1;
  if (sets <= 7) return 2;
  if (sets <= 12) return 3;
  return 4;
}

function shortDate(v) {
  if (v == null) return '';
  let d;
  if (typeof v === 'number') d = new Date(v);
  else {
    const s = String(v);
    d = new Date(s.length === 10 ? s + 'T00:00:00' : s);
  }
  if (isNaN(d.getTime())) return String(v);
  return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Сетка heatmap: ~12 недель × 7 дней, уровень 0..4 по числу подходов. */
function buildHeatmap(S) {
  const workouts = Array.isArray(S.workouts) ? S.workouts : [];
  const byDayMap = byDay(workouts) || {};
  const tNow = now(S);

  let anchor;
  try {
    anchor = startOfWeek(tNow, S.weekStart);
  } catch (err) {
    console.error('og-stats: startOfWeek', err);
    anchor = tNow;
  }
  const anchorDow = new Date(anchor).getDay(); // 0=Вс..6=Сб — заголовок строим от него

  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const weekStartTs = anchor - w * 7 * 86400000;
    const cells = [];
    for (let i = 0; i < 7; i++) {
      const ts = weekStartTs + i * 86400000;
      const d = dayKey(ts);
      const recs = byDayMap[d] || [];
      const sets = recs.reduce((a, r) => a + countSets(r), 0);
      cells.push({ d, sets, level: heatLevel(sets) });
    }
    let key = '';
    try {
      key = weekKey(dayKey(weekStartTs), S.weekStart);
    } catch (err) {
      console.error('og-stats: weekKey', err);
    }
    weeks.push({ key, cells });
  }

  const dows = ['', ...Array.from({ length: 7 }, (_, i) => DOW[(anchorDow + i) % 7])]
    .map((d) => `<div class="og-stats-heat-dow">${d}</div>`)
    .join('');

  const rows = weeks.map((wk) => `
    <div class="og-stats-heat-label" title="${wk.key}">${wk.key ? 'W' + wk.key.split('-W')[1] : ''}</div>
    ${wk.cells.map((c) => `<div class="og-heat-cell${c.level ? ' og-heat-' + c.level : ''}" title="${c.d} · ${c.sets} подходов"></div>`).join('')}
  `).join('');

  return `<div class="og-stats-heat">${dows}${rows}</div>`;
}

/** Упражнения с историей подходов (e1rmSeries непустой), сортировка по длине ряда. */
function buildExOptions(allEntries) {
  const ids = [...new Set(allEntries.map((e) => e.target && e.target.id).filter(Boolean))];
  const options = [];
  for (const id of ids) {
    let series = [];
    try {
      series = e1rmSeries(allEntries, id) || [];
    } catch (err) {
      console.error('og-stats: e1rmSeries', err);
    }
    if (!series.length) continue;
    const last = [...allEntries].reverse().find((e) => e.target && e.target.id === id);
    const name = (last && last.target && last.target.name) || id;
    options.push({ id, name, series });
  }
  options.sort((a, b) => b.series.length - a.series.length);
  return options;
}

/** Ручной линейный график E1RM на canvas: оси, сетка, точки, маркер текущего 1RM. */
function drawE1rm(canvas, series, unit) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 320;
  const H = canvas.clientHeight || 190;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const css = getComputedStyle(document.documentElement);
  const text = css.getPropertyValue('--og-text').trim() || '#e6edf3';
  const muted = css.getPropertyValue('--og-muted').trim() || '#8b949e';
  const border = css.getPropertyValue('--og-border').trim() || '#30363d';
  const accent = css.getPropertyValue('--og-accent').trim() || '#a78bfa';
  const card = css.getPropertyValue('--og-card').trim() || '#1c2333';

  const padL = 40, padR = 14, padT = 16, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const pts = series.filter((p) => p && p.e1rm != null && isFinite(p.e1rm));
  if (!pts.length) {
    ctx.fillStyle = muted;
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Нет данных', W / 2, H / 2);
    return;
  }

  const vals = pts.map((p) => p.e1rm);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const lo = Math.floor(min * 0.92);
  const hi = Math.ceil(max * 1.06);
  const range = hi - lo || 1;

  const x = (i) => padL + (pts.length === 1 ? plotW / 2 : (i / (pts.length - 1)) * plotW);
  const y = (v) => padT + plotH - ((v - lo) / range) * plotH;

  // Подпись оси Y (единицы) + сетка + значения.
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = muted;
  ctx.fillText(unit, padL - 6, 8);
  for (let g = 0; g <= 4; g++) {
    const v = lo + (range * g) / 4;
    const gy = y(v);
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padL, gy);
    ctx.lineTo(W - padR, gy);
    ctx.stroke();
    ctx.fillStyle = muted;
    ctx.fillText(String(Math.round(v)), padL - 6, gy);
  }

  // Подписи оси X (даты, дд.мм).
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const step = Math.max(1, Math.ceil(pts.length / 5));
  pts.forEach((p, i) => {
    if (i % step !== 0 && i !== pts.length - 1) return;
    const d = String(p.d || '');
    const short = d.length >= 10 ? d.slice(8, 10) + '.' + d.slice(5, 7) : d;
    ctx.fillStyle = muted;
    ctx.fillText(short, x(i), padT + plotH + 6);
  });

  // Линия.
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = x(i), py = y(p.e1rm);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  // Точки.
  pts.forEach((p, i) => {
    ctx.fillStyle = card;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x(i), y(p.e1rm), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Маркер текущего 1RM (максимум ряда).
  let mi = 0;
  pts.forEach((p, i) => { if (p.e1rm > pts[mi].e1rm) mi = i; });
  const mx = x(mi), my = y(pts[mi].e1rm);
  ctx.strokeStyle = accent;
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(mx, my);
  ctx.lineTo(mx, padT + plotH);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = accent;
  ctx.font = 'bold 11px system-ui';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('1RM ' + fmtW(pts[mi].e1rm, unit), mx + 6, my - 2);
}

function renderEffort(eff) {
  const { summary, weeks, hist, scale } = eff;
  const sname = scaleName(scale);
  const avgStr = summary.avg != null ? `${sname} ${toScale(scale, summary.avg)}` : '—';
  const hardStr = summary.hardPct != null ? Math.round(summary.hardPct) + '%' : '—';

  const weekBars = (weeks || []).map((wk) => {
    const rir = wk.rir;
    const h = rir != null ? Math.max(4, Math.min(100, ((4 - rir) / 4) * 100)) : 0;
    const color = rir != null ? (effortColor(rir) || 'var(--og-bg2)') : 'var(--og-bg2)';
    const label = shortDate(wk.t);
    const sets = wk.sets ?? wk.n ?? 0;
    return `
      <div class="og-stats-effort-bar" title="${sname} ${rir != null ? toScale(scale, rir) : '—'} · ${sets} сетов">
        <div class="og-stats-effort-bar-fill" style="height:${h}%;background:${color}"></div>
        <span class="og-stats-effort-bar-label">${label}</span>
      </div>`;
  }).join('');

  const histRows = (hist || []).map((b) => {
    const label = b.tail ? '4+' : String(b.rir);
    const pct = Math.min(100, Math.max(0, b.pct || 0));
    const color = effortColor(b.rir) || 'var(--og-accent)';
    return `
      <div class="og-stats-hist-row">
        <span class="og-stats-hist-label">${sname} ${label}</span>
        <div class="og-stats-hist-bar"><div class="og-stats-hist-fill" style="width:${pct}%;background:${color}"></div></div>
        <span class="og-stats-hist-val">${b.n ?? 0} · ${Math.round(pct)}%</span>
      </div>`;
  }).join('');

  return `
    <div class="og-card">
      <p class="og-card-title">${tr('Усилие · сводка')}</p>
      <div class="og-stats-grid">
        <div class="og-tile"><span class="og-tile-val">${summary.rated ?? 0} / ${summary.done ?? 0}</span><span class="og-tile-lab">${tr('Оценено')}</span></div>
        <div class="og-tile"><span class="og-tile-val">${avgStr}</span><span class="og-tile-lab">${tr('Среднее')}</span></div>
        <div class="og-tile"><span class="og-tile-val">${hardStr}</span><span class="og-tile-lab">${tr('Жёстких')}</span></div>
      </div>
    </div>
    <div class="og-card">
      <p class="og-card-title">${tr('По неделям · высота = жёсткость')}</p>
      ${weekBars ? `<div class="og-stats-effort-bars">${weekBars}</div>` : `<p class="og-muted">${tr('Недостаточно оценённых сетов')}</p>`}
    </div>
    <div class="og-card">
      <p class="og-card-title">${tr('Распределение')}</p>
      ${histRows ? histRows : `<p class="og-muted">${tr('Нет данных')}</p>`}
    </div>`;
}

function renderMuscles(muscles, unit) {
  const sorted = [...muscles].sort((a, b) => (b.load || 0) - (a.load || 0));
  const top = sorted.slice(0, 10);
  const rest = sorted.slice(10);
  const row = (m) => {
    const pct = Math.min(100, Math.max(0, (m.share || 0) * 100));
    const name = esc(String(m.muscle == null ? '' : m.muscle));
    return `
      <div class="og-stats-muscle-row">
        <span class="og-stats-muscle-name" title="${name}">${name}</span>
        <div class="og-stats-muscle-bar"><div class="og-stats-muscle-fill" style="width:${pct}%"></div></div>
        <span class="og-stats-muscle-val">${fmtW(m.load || 0, unit)} · ${m.sets ?? 0}</span>
      </div>`;
  };
  return `
    <div class="og-card">
      <p class="og-card-title">${tr('Нагрузка по мышцам')}</p>
      ${top.map(row).join('')}
      ${rest.length ? `<div class="og-stats-muscle-scroll">${rest.map(row).join('')}</div>` : ''}
    </div>`;
}

function wireBack(appEl) {
  const back = appEl.querySelector('.og-back');
  if (back) back.onclick = () => backToApp();
}

function wireTabs(appEl, onShow) {
  const tabs = appEl.querySelectorAll('.og-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((tb) => tb.classList.toggle('active', tb === tab));
      const id = tab.dataset.tab;
      appEl.querySelectorAll('.og-stats-pane').forEach((pane) => {
        pane.hidden = pane.id !== 'og-stats-pane-' + id;
      });
      if (onShow) onShow(id);
    });
  });
}

/** Подключает select + canvas; возвращает функцию перерисовки (для табов/resize). */
function wireChart(appEl, options, allEntries, unit) {
  const select = appEl.querySelector('#og-stats-ex-select');
  const canvas = appEl.querySelector('#og-stats-e1rm-canvas');
  const bestLine = appEl.querySelector('#og-stats-best-line');
  if (!select || !canvas) return null;

  const draw = () => {
    const opt = options.find((o) => o.id === select.value) || options[0];
    if (!opt) return;
    drawE1rm(canvas, opt.series, unit);
    if (bestLine) {
      let best = null;
      try {
        best = bestSetOf(allEntries, opt.id);
      } catch (err) {
        console.error('og-stats: bestSetOf', err);
      }
      if (best) {
        let e1 = null;
        try {
          e1 = estimate1RM(best.w, best.reps);
        } catch (err) {
          console.error('og-stats: estimate1RM', err);
        }
        const wStr = best.w != null ? fmtW(best.w, unit) : '—';
        const rStr = best.reps != null ? best.reps : '—';
        bestLine.textContent = `${tr('Лучший подход')}: ${wStr} × ${rStr}${e1 != null ? ' · 1RM ≈ ' + fmtW(e1, unit) : ''}`;
      } else {
        bestLine.textContent = '';
      }
    }
  };

  select.addEventListener('change', draw);
  draw();
  return draw;
}

export function render(appEl, params) {
  const S = load();
  const unit = (S.profile && S.profile.unit) || 'kg';
  const workouts = Array.isArray(S.workouts) ? S.workouts : [];

  if (workouts.length === 0) {
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" id="og-stats-back" type="button">${tr('← В приложение')}</button>
          <h2>${tr('Статистика')}</h2>
        </header>
        <div class="og-empty">
          <p>${tr('Нет данных — тренировки ещё не завершены')}</p>
          <button class="og-btn og-btn-primary" id="og-stats-empty-cta" type="button">${tr('Начать тренировку')}</button>
        </div>
      </div>`;
    wireBack(appEl);
    const cta = appEl.querySelector('#og-stats-empty-cta');
    if (cta) cta.onclick = () => go(Array.isArray(S.routines) && S.routines.length ? 'workout' : 'routines');
    return;
  }

  const totalMinutes = Math.round(workouts.reduce((a, w) => a + (w.totalTime || 0), 0) / 60000);
  const volume = loadOfWorkouts(S) || 0;
  const streak = streakWeeks(S) || 0;

  const heatHtml = buildHeatmap(S);

  const allEntries = workouts.flatMap((w) => w.entries || []);
  const exOptions = buildExOptions(allEntries);

  let eff = null;
  try {
    if (hasEffort(S)) {
      eff = {
        summary: effortSummary(S),
        weeks: effortWeeks(S),
        hist: effortHistogram(S),
        scale: displayScale(S),
      };
    }
  } catch (err) {
    console.error('og-stats: effort', err);
  }

  let muscles = [];
  try {
    muscles = muscleBreakdown(S) || [];
  } catch (err) {
    console.error('og-stats: muscleBreakdown', err);
  }

  appEl.innerHTML = `
    <div class="og-screen">
      <header class="og-hdr">
        <button class="og-back" id="og-stats-back" type="button">${tr('← В приложение')}</button>
        <h2>${tr('Статистика')}</h2>
      </header>

      <div class="og-tabs" id="og-stats-tabs">
        ${TABS.map((tb, i) => `<button class="og-tab${i === 0 ? ' active' : ''}" data-tab="${tb.id}" type="button">${tr(tb.label)}</button>`).join('')}
      </div>

      <section id="og-stats-pane-overview" class="og-stats-pane">
        <div class="og-stats-grid">
          <div class="og-stat"><span class="og-stat-val">${workouts.length}</span><span class="og-stat-label">${tr('тренировок')}</span></div>
          <div class="og-stat"><span class="og-stat-val">${fmtW(volume, unit)}</span><span class="og-stat-label">${tr('объём')}</span></div>
          <div class="og-stat"><span class="og-stat-val">${fmt(totalMinutes, unit)}</span><span class="og-stat-label">${tr('минут')}</span></div>
          <div class="og-stat"><span class="og-stat-val">${streak}</span><span class="og-stat-label">${plural(streak, ['неделя', 'недели', 'недель'])}</span></div>
        </div>
        <div class="og-card">
          <p class="og-card-title">${tr('Активность · 12 недель')}</p>
          ${heatHtml}
        </div>
      </section>

      <section id="og-stats-pane-strength" class="og-stats-pane" hidden>
        ${exOptions.length ? `
          <div class="og-card">
            <p class="og-card-title">${tr('Прогресс 1RM')}</p>
            <div class="og-form-group">
              <select class="og-select" id="og-stats-ex-select">
                ${exOptions.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}
              </select>
            </div>
            <div class="og-stats-chart-wrap">
              <canvas class="og-stats-canvas" id="og-stats-e1rm-canvas"></canvas>
            </div>
            <p class="og-muted" id="og-stats-best-line"></p>
          </div>` : `
          <div class="og-card"><p class="og-muted">${tr('Нет упражнений с историей подходов')}</p></div>`}
      </section>

      <section id="og-stats-pane-effort" class="og-stats-pane" hidden>
        ${eff ? renderEffort(eff) : `
          <div class="og-card"><p class="og-muted">${tr('Усилия не оценивались — включите шкалу RIR/RPE в настройках')}</p></div>`}
      </section>

      <section id="og-stats-pane-muscles" class="og-stats-pane" hidden>
        ${muscles.length ? renderMuscles(muscles, unit) : `
          <div class="og-card"><p class="og-muted">${tr('Нет данных о мышцах')}</p></div>`}
      </section>
    </div>`;

  wireBack(appEl);
  let redraw = null;
  if (exOptions.length) redraw = wireChart(appEl, exOptions, allEntries, unit);
  wireTabs(appEl, (tabId) => {
    if (tabId === 'strength' && redraw) redraw();
  });
}

register('stats', render);