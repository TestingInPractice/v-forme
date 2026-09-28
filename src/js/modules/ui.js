/**
 * UI module — thin SPA router + screen rendering + event wiring.
 * All Russian UI text.
 */
import { init as catalogInit, getExercises, getExercise, calcExerciseCalories, getMuscleGroups, getCategories } from './catalog.js';
import { renderAdmin } from './admin.js';
import { autoBuild, defaultReps } from './workout.js';
import * as runner from './runner.js';
import * as music from './music.js';
import * as history from './history.js';
import * as plans from './plans.js';
import * as settings from './settings.js';
import * as backup from './backup.js';

const app = () => document.getElementById('app');
let _currentScreen = 'home';
let _currentWorkout = null;   // workout being built
let _setItems = [];           // items for set build: [{exerciseId, reps}]

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Initialize: load settings, show home. */
export async function init() {
  await catalogInit();
  await settings.loadAll();
  showScreen('home');
}

export function showScreen(name) {
  _currentScreen = name;
  const renderer = screens[name];
  if (renderer) renderer();
}

function getBodyWeight() {
  return settings._cache?.bodyWeight || 75;
}

/* ─── Screen Renderers ─── */

const screens = {
  home: renderHome,
  build: renderBuild,
  music: renderMusic,
  settings: renderSettings,
  history: renderHistory,
  run: renderRun,
  runSet: renderRunSet,
  plans: renderPlans,
  admin: renderAdmin,
};

function renderHome() {
  app().innerHTML = `
    <div class="screen home-screen">
      <div class="home-hero">
        <div class="home-icon">💪</div>
        <h1>Тренажёр</h1>
        <p class="home-subtitle">Персональная тренировка</p>
      </div>
      <button class="btn btn-primary btn-xl" id="btn-build">Собрать тренировку</button>
      <div class="home-nav">
        <button class="nav-card" id="nav-history">
          <span class="nav-card-icon">📋</span>
          <span class="nav-card-label">История</span>
        </button>
        <button class="nav-card" id="nav-plans">
          <span class="nav-card-icon">📁</span>
          <span class="nav-card-label">Мои тренировки</span>
        </button>
        <button class="nav-card" id="nav-music">
          <span class="nav-card-icon">🎵</span>
          <span class="nav-card-label">Музыка</span>
        </button>
        <button class="nav-card" id="nav-settings">
          <span class="nav-card-icon">⚙️</span>
          <span class="nav-card-label">Настройки</span>
        </button>
        <button class="nav-card" id="nav-og">
          <span class="nav-card-icon">🚀</span>
          <span class="nav-card-label">Новый интерфейс</span>
        </button>
      </div>
    </div>
  `;
  document.getElementById('btn-build').onclick = () => showScreen('build');
  document.getElementById('nav-history').onclick = () => showScreen('history');
  document.getElementById('nav-plans').onclick = () => showScreen('plans');
  document.getElementById('nav-music').onclick = () => showScreen('music');
  document.getElementById('nav-settings').onclick = () => showScreen('settings');
  document.getElementById('nav-og').onclick = () => { location.hash = '#og/home'; };
}

function renderBuild() {
  _currentWorkout = null;
  _setItems = [
    { exerciseId: 'pull_up', reps: 5 },
    { exerciseId: 'push_up', reps: 10 },
    { exerciseId: 'squat', reps: 15 },
  ];
  app().innerHTML = `
    <div class="screen build-screen">
      <div class="screen-header">
        <button class="btn-back" id="build-back">← Назад</button>
        <h2>Новая тренировка</h2>
      </div>
      <div class="tabs">
        <button class="tab active" id="tab-auto">Авто</button>
        <button class="tab" id="tab-set">Набор</button>
      </div>
      <div id="build-content"></div>
    </div>
  `;
  document.getElementById('build-back').onclick = () => showScreen('home');
  document.getElementById('tab-auto').onclick = () => _switchBuildTab('auto');
  document.getElementById('tab-set').onclick = () => _switchBuildTab('set');
  _switchBuildTab('auto');
}

function _switchBuildTab(tab) {
  document.getElementById('tab-auto').classList.toggle('active', tab === 'auto');
  document.getElementById('tab-set').classList.toggle('active', tab === 'set');
  const content = document.getElementById('build-content');
  if (tab === 'auto') {
    _renderAutoBuild(content);
  } else {
    _renderSetBuild(content);
  }
}

function _renderAutoBuild(container) {
  const categories = [...new Set(getExercises().map(e => e.category))];
  container.innerHTML = `
    <div class="auto-build">
      <div class="form-group">
        <label>Режим сборки</label>
        <div class="radio-group">
          <label class="radio"><input type="radio" name="auto-mode" value="muscle" checked> По мышце</label>
          <label class="radio"><input type="radio" name="auto-mode" value="calories"> По калориям</label>
          <label class="radio"><input type="radio" name="auto-mode" value="time"> По времени</label>
        </div>
      </div>
      <div id="auto-params"></div>
      <div class="form-group">
        <label>Вес тела (кг)</label>
        <input type="number" id="auto-weight" value="${getBodyWeight()}" min="30" max="200" step="0.5">
      </div>
      <button class="btn btn-primary" id="auto-generate">Сгенерировать</button>
      <div id="auto-result"></div>
    </div>
  `;

  const paramsDiv = document.getElementById('auto-params');
  _updateAutoParams();

  document.querySelectorAll('input[name="auto-mode"]').forEach(r => {
    r.onchange = _updateAutoParams;
  });

  document.getElementById('auto-generate').onclick = _doAutoGenerate;

  function _updateAutoParams() {
    const mode = document.querySelector('input[name="auto-mode"]:checked').value;
    if (mode === 'muscle') {
      paramsDiv.innerHTML = `
        <div class="form-group">
          <label>Группа мышц</label>
          <select id="auto-muscle">
            ${getMuscleGroups().map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
      `;
    } else if (mode === 'calories') {
      paramsDiv.innerHTML = `
        <div class="form-group">
          <label>Цель по калориям (ккал)</label>
          <input type="number" id="auto-calories" value="200" min="50" max="1500" step="10">
        </div>
      `;
    } else {
      paramsDiv.innerHTML = `
        <div class="form-group">
          <label>Время (минут)</label>
          <input type="number" id="auto-time" value="20" min="5" max="90" step="5">
        </div>
      `;
    }
  }
}

async function _doAutoGenerate() {
  const mode = document.querySelector('input[name="auto-mode"]:checked').value;
  const weight = parseFloat(document.getElementById('auto-weight').value) || 75;
  await settings.set('bodyWeight', weight);

  let opts = { mode, bodyWeightKg: weight };
  if (mode === 'muscle') {
    opts.muscle = document.getElementById('auto-muscle').value;
  } else if (mode === 'calories') {
    opts.calories = parseInt(document.getElementById('auto-calories').value, 10);
  } else {
    opts.targetTime = parseInt(document.getElementById('auto-time').value, 10);
  }

  _currentWorkout = autoBuild(opts);
  _renderWorkoutResult();
}

function _renderSetBuild(container) {
  container.innerHTML = `
    <div class="set-build">
      <div class="form-group">
        <label>Название</label>
        <input type="text" id="set-title" value="Быстрый набор" placeholder="Введите название">
      </div>
      <div id="set-items-list"></div>
      <button class="btn btn-secondary btn-block" id="set-add-exercise" style="margin-top:0.75rem">+ Добавить упражнение</button>
      <div id="set-picker" class="picker-panel hidden"></div>
      <div class="form-group" style="margin-top:1rem">
        <label>Режим</label>
        <div class="radio-group">
          <label class="radio"><input type="radio" name="set-mode" value="rounds" checked> По кругам</label>
          <label class="radio"><input type="radio" name="set-mode" value="time"> AMRAP (время)</label>
        </div>
      </div>
      <div id="set-params"></div>
      <div class="form-group">
        <label>Отдых между упражнениями (сек)</label>
        <input type="number" id="set-rest" value="${settings._cache?.restBetweenSec || 20}" min="5" max="180" step="5">
      </div>
      <div id="set-summary"></div>
    </div>
  `;

  document.getElementById('set-add-exercise').onclick = () => _renderSetPicker();
  document.querySelectorAll('input[name="set-mode"]').forEach(r => {
    r.onchange = _updateSetParams;
  });
  _updateSetParams();
  _updateSetItemsList();
}

function _updateSetParams() {
  const mode = document.querySelector('input[name="set-mode"]:checked').value;
  const paramsDiv = document.getElementById('set-params');
  if (mode === 'rounds') {
    paramsDiv.innerHTML = `
      <div class="form-group">
        <label>Кругов</label>
        <input type="number" id="set-rounds" value="3" min="1" max="50">
      </div>
    `;
  } else {
    paramsDiv.innerHTML = `
      <div class="form-group">
        <label>Лимит времени (минут)</label>
        <input type="number" id="set-time" value="20" min="1" max="120">
      </div>
    `;
  }
}

function _updateSetItemsList() {
  const list = document.getElementById('set-items-list');
  if (!list) return;

  if (_setItems.length === 0) {
    list.innerHTML = '<p class="muted">Добавьте упражнения — например, подтягивания и приседания.</p>';
  } else {
    list.innerHTML = `
      <div class="set-list">
        ${_setItems.map((it, i) => {
          const ex = getExercise(it.exerciseId);
          return `
            <div class="set-card">
              <div class="set-card-top">
                <span class="set-card-name">${i + 1}. ${ex?.name || it.exerciseId}</span>
                <button class="btn-icon btn-sm" data-set-del="${i}">✕</button>
              </div>
              <div class="set-stepper">
                <button class="btn-stepper" data-reps-dec="${i}">−</button>
                <span class="set-reps">${it.reps}</span>
                <button class="btn-stepper" data-reps-inc="${i}">+</button>
                <span class="set-reps-label">повторений</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    list.querySelectorAll('[data-set-del]').forEach(btn => {
      btn.onclick = () => {
        _setItems.splice(parseInt(btn.dataset.setDel, 10), 1);
        _updateSetItemsList();
      };
    });
    list.querySelectorAll('[data-reps-dec]').forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.repsDec, 10);
        _setItems[i].reps = Math.max(1, _setItems[i].reps - 1);
        _updateSetItemsList();
      };
    });
    list.querySelectorAll('[data-reps-inc]').forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.repsInc, 10);
        _setItems[i].reps = Math.min(200, _setItems[i].reps + 1);
        _updateSetItemsList();
      };
    });
  }
  _updateSetSummary();
}

function _updateSetSummary() {
  const summary = document.getElementById('set-summary');
  if (!summary) return;
  const weight = getBodyWeight();
  const totalReps = _setItems.reduce((s, it) => s + it.reps, 0);
  const totalCal = _setItems.reduce((s, it) => {
    const ex = getExercise(it.exerciseId);
    return s + (ex ? calcExerciseCalories(ex, it.reps, 1, weight) : 0);
  }, 0);
  summary.innerHTML = `
    <div class="set-summary-bar">
      <span>${_setItems.length} упр. · ${totalReps} повт. за круг · ~${Math.round(totalCal)} ккал</span>
      <button class="btn btn-primary" id="set-start">Начать тренировку</button>
      <button class="btn btn-secondary" id="set-save">💾 Сохранить</button>
    </div>
  `;
  document.getElementById('set-start').onclick = _startSetWorkout;
  document.getElementById('set-save').onclick = _saveSetPlan;
}

function _renderSetPicker() {
  const picker = document.getElementById('set-picker');
  if (!picker) return;
  if (!picker.classList.contains('hidden')) {
    picker.classList.add('hidden');
    return;
  }
  picker.classList.remove('hidden');
  picker.innerHTML = `
    <div class="picker-search">
      <input type="search" id="picker-search" placeholder="Поиск упражнения..." autocomplete="off">
    </div>
    <div class="picker-list" id="picker-list"></div>
  `;

  const fill = (query) => {
    const q = (query || '').trim().toLowerCase();
    const listEl = document.getElementById('picker-list');
    const filtered = getExercises().filter(e =>
      !q || e.name.toLowerCase().includes(q) ||
      (e.muscleGroup || []).some(m => m.toLowerCase().includes(q)) ||
      (e.description || '').toLowerCase().includes(q)
    );
    const catName = (id) => (getCategories().find(c => c.id === id) || {}).name || id;
    listEl.innerHTML = filtered.map(e => `
      <button class="picker-row" data-pick="${e.id}">
        <span class="picker-name">${e.name}</span>
        <span class="picker-meta">${catName(e.category)} · ${e.typicalReps.min}–${e.typicalReps.max} повт.</span>
      </button>
    `).join('');
    listEl.querySelectorAll('[data-pick]').forEach(btn => {
      btn.onclick = () => {
        const ex = getExercise(btn.dataset.pick);
        if (!ex) return;
        _setItems.push({ exerciseId: ex.id, reps: defaultReps(ex) });
        picker.classList.add('hidden');
        _updateSetItemsList();
      };
    });
  };

  document.getElementById('picker-search').oninput = (e) => fill(e.target.value);
  fill('');
}

function _collectSetCfg() {
  const mode = document.querySelector('input[name="set-mode"]:checked').value;
  const rest = parseInt(document.getElementById('set-rest').value, 10) || 20;
  const cfg = {
    title: document.getElementById('set-title').value || 'Быстрый набор',
    items: _setItems.map(it => ({ ...it })),
    mode,
    restBetweenSec: rest,
  };
  if (mode === 'rounds') {
    cfg.rounds = parseInt(document.getElementById('set-rounds').value, 10) || 3;
    cfg.timeLimitSec = 0;
  } else {
    cfg.timeLimitSec = (parseInt(document.getElementById('set-time').value, 10) || 20) * 60;
    cfg.rounds = Infinity;
  }
  return cfg;
}

function _startSetWorkout() {
  if (_setItems.length === 0) return;
  runner.startSet(_collectSetCfg(), { onUpdate: _updateSetRunScreen, onFinish: _onSetFinish });
  showScreen('runSet');
}

async function _saveSetPlan() {
  if (_setItems.length === 0) return;
  await plans.save({ ..._collectSetCfg(), kind: 'set', date: new Date().toISOString() });
  const btn = document.getElementById('set-save');
  if (btn) {
    btn.textContent = '✓ Сохранено';
    btn.disabled = true;
  }
}

function _renderWorkoutResult() {
  if (!_currentWorkout) return;
  const content = document.getElementById('build-content') || document.getElementById('auto-result');
  const container = content.id === 'auto-result' ? content : content;

  const itemsHtml = _currentWorkout.items.map((it, i) => {
    const ex = getExercise(it.exerciseId);
    return `
      <div class="item-row">
        <span class="item-num">${i + 1}</span>
        <span>${ex?.name || it.exerciseId}: ${it.reps} повт.</span>
      </div>
    `;
  }).join('');

  const html = `
    <div class="workout-result">
      <h3>${_currentWorkout.title}</h3>
      <div class="workout-stats">
        <div class="stat"><span class="stat-val">${_currentWorkout.items.length}</span><span class="stat-label">Упражнений</span></div>
        <div class="stat"><span class="stat-val">${_currentWorkout.estimatedCalories}</span><span class="stat-label">ккал</span></div>
        <div class="stat"><span class="stat-val">${Math.round(_currentWorkout.estimatedDuration / 60)}</span><span class="stat-label">мин</span></div>
      </div>
      <div class="items-list">${itemsHtml}</div>
      <div class="btn-row">
        <button class="btn btn-primary btn-xl" id="btn-start-workout" style="flex:1">Запустить тренировку</button>
        <button class="btn btn-secondary" id="btn-save-plan">💾 Сохранить в Мои тренировки</button>
      </div>
    </div>
  `;

  if (content.id === 'auto-result') {
    content.innerHTML = html;
  } else {
    // Replace entire build-content
    const buildContent = document.getElementById('build-content');
    if (buildContent) buildContent.innerHTML = html;
  }

  document.getElementById('btn-start-workout').onclick = () => _startWorkout();
  document.getElementById('btn-save-plan').onclick = async () => {
    const btn = document.getElementById('btn-save-plan');
    if (btn.disabled) return;
    await plans.save({ ..._currentWorkout });
    btn.textContent = '✓ Сохранено';
    btn.disabled = true;
  };
}

function _startWorkout() {
  if (!_currentWorkout) return;
  runner.start(_currentWorkout, {
    onUpdate: _updateRunScreen,
    onFinish: _onWorkoutFinish,
  });
  showScreen('run');
}

function renderRun() {
  const state = runner._getState ? runner._getState() : { phase: 'idle', remaining: 0, exerciseName: '' };
  app().innerHTML = `
    <div class="screen run-screen">
      <div class="run-phase" id="run-phase">${_phaseLabel(state.phase)}</div>
      <div class="run-exercise" id="run-exercise">${state.exerciseName || 'Подготовка...'}</div>
      <div class="run-gif" id="run-gif"><img id="run-gif-img" alt="" hidden></div>
      <div class="run-timer" id="run-timer">${state.remaining}</div>
      <div class="run-progress">
        <div class="progress-bar"><div class="progress-fill" id="run-progress-fill" style="width:${state.progress}%"></div></div>
        <span class="progress-label" id="run-progress-label">${state.currentIndex + 1}/${state.totalItems}</span>
      </div>
      <div class="run-controls">
        <button class="btn-run btn-pause" id="btn-pause">⏸ Пауза</button>
        <button class="btn-run btn-skip" id="btn-skip">⏭ Далее</button>
        <button class="btn-run btn-stop" id="btn-stop">⏹ Стоп</button>
      </div>
    </div>
  `;
  document.getElementById('btn-pause').onclick = () => {
    if (runner.isPaused()) {
      runner.resume();
      document.getElementById('btn-pause').textContent = '⏸ Пауза';
    } else {
      runner.pause();
      document.getElementById('btn-pause').textContent = '▶ Продолжить';
    }
  };
  document.getElementById('btn-skip').onclick = () => runner.skip();
  document.getElementById('btn-stop').onclick = () => runner.stop();
}

function _updateRunScreen(state) {
  const phaseEl = document.getElementById('run-phase');
  const exerciseEl = document.getElementById('run-exercise');
  const timerEl = document.getElementById('run-timer');
  const progressFill = document.getElementById('run-progress-fill');
  const progressLabel = document.getElementById('run-progress-label');
  const pauseBtn = document.getElementById('btn-pause');

  if (phaseEl) phaseEl.textContent = _phaseLabel(state.phase);
  if (exerciseEl) exerciseEl.textContent = state.exerciseName || '';
  if (timerEl) timerEl.textContent = state.remaining;
  if (progressFill) progressFill.style.width = state.progress + '%';
  if (progressLabel) progressLabel.textContent = `${state.currentIndex + 1}/${state.totalItems}`;
  _applyRunGif(document.getElementById('run-gif-img'), state.exerciseId);
  if (pauseBtn) {
    if (state.isPaused) {
      pauseBtn.textContent = '▶ Продолжить';
    } else {
      pauseBtn.textContent = '⏸ Пауза';
    }
  }

  // If finished, redirect to history
  if (state.phase === 'finished') {
    setTimeout(() => showScreen('history'), 2000);
  }
}

function renderRunSet() {
  app().innerHTML = `
    <div class="screen run-screen set-run-screen">
      <div class="run-phase" id="setrun-phase">Подготовка</div>
      <div class="run-exercise" id="setrun-exercise"></div>
      <div class="run-gif" id="setrun-gif"><img id="setrun-gif-img" alt="" hidden></div>
      <div class="run-timer" id="setrun-timer"></div>
      <div class="setrun-reps" id="setrun-reps"></div>
      <button class="btn-run btn-done" id="setrun-done">✓ Сделано</button>
      <div class="setrun-meta" id="setrun-meta"></div>
      <div class="run-controls">
        <button class="btn-run btn-pause" id="setrun-pause">⏸ Пауза</button>
        <button class="btn-run btn-skip" id="setrun-skip">⏭ Дальше</button>
        <button class="btn-run btn-stop" id="setrun-stop">⏹ Стоп</button>
      </div>
    </div>
  `;
  document.getElementById('setrun-pause').onclick = () => {
    if (runner.getSetState().isPaused) {
      runner.resumeSet();
    } else {
      runner.pauseSet();
    }
  };
  document.getElementById('setrun-skip').onclick = () => runner.skipSetRest();
  document.getElementById('setrun-stop').onclick = () => runner.stopSet();
  _updateSetRunScreen(runner.getSetState());
}

function _setPhaseLabel(phase) {
  switch (phase) {
    case 'working': return 'Выполняйте';
    case 'resting': return 'Отдых';
    case 'paused': return 'Пауза';
    case 'finished': return 'Готово!';
    default: return '';
  }
}

function _fmtClock(sec) {
  sec = Math.max(0, sec || 0);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function _updateSetRunScreen(state) {
  const phaseEl = document.getElementById('setrun-phase');
  const exEl = document.getElementById('setrun-exercise');
  const timerEl = document.getElementById('setrun-timer');
  const repsEl = document.getElementById('setrun-reps');
  const doneBtn = document.getElementById('setrun-done');
  const metaEl = document.getElementById('setrun-meta');
  const pauseBtn = document.getElementById('setrun-pause');
  const skipBtn = document.getElementById('setrun-skip');
  if (!phaseEl) return;

  phaseEl.textContent = _setPhaseLabel(state.phase);
  if (exEl) exEl.textContent = state.exerciseName || '';
  if (repsEl) repsEl.textContent = state.reps ? `${state.reps} повторов` : '';
  _applyRunGif(document.getElementById('setrun-gif-img'), state.exerciseId);

  const roundLabel = state.roundsTotal
    ? `Круг ${state.round}/${state.roundsTotal}`
    : `Круг ${state.round}`;
  if (metaEl) {
    metaEl.textContent = `${roundLabel} · подход ${state.index}/${state.itemsTotal} · сделано ${state.doneSets}`;
  }

  if (timerEl) {
    if (state.phase === 'resting') {
      timerEl.textContent = `${state.restRemaining} с`;
      timerEl.classList.add('resting');
    } else {
      timerEl.classList.remove('resting');
      timerEl.textContent = state.timeLimitSec
        ? `⏱ ${_fmtClock(state.elapsedSec)} / ${_fmtClock(state.timeLimitSec)}`
        : `⏱ ${_fmtClock(state.elapsedSec)}`;
    }
  }

  if (doneBtn) {
    if (state.phase === 'working') {
      doneBtn.textContent = '✓ Сделано';
      doneBtn.classList.remove('btn-resting');
      doneBtn.onclick = () => runner.completeSet();
    } else if (state.phase === 'resting') {
      doneBtn.textContent = '⏭ Дальше';
      doneBtn.classList.add('btn-resting');
      doneBtn.onclick = () => runner.skipSetRest();
    } else {
      doneBtn.onclick = null;
    }
  }

  if (pauseBtn) pauseBtn.textContent = state.isPaused ? '▶ Продолжить' : '⏸ Пауза';
  if (skipBtn) skipBtn.disabled = state.phase !== 'resting';

  if (state.phase === 'finished') {
    setTimeout(() => showScreen('history'), 2000);
  }
}

async function _onSetFinish(result) {
  if (result) {
    await history.save(result);
  }
  showScreen(result ? 'history' : 'home');
}

function _phaseLabel(phase) {
  switch (phase) {
    case 'announcing': return 'Подготовка';
    case 'working': return 'Работа';
    case 'resting': return 'Отдых';
    case 'paused': return 'Пауза';
    case 'finished': return 'Готово!';
    default: return '';
  }
}

/** Показ GIF-демонстрации на run-экранах. Управляет URL.createObjectURL (revoke старого). */
function _applyRunGif(imgEl, exerciseId) {
  if (!imgEl) return;
  const previous = imgEl.dataset.ex;
  if (!exerciseId || !previous) {
    if (previous) {
      URL.revokeObjectURL(imgEl.src);
      imgEl.removeAttribute('src');
      imgEl.hidden = true;
      delete imgEl.dataset.ex;
    }
    if (!exerciseId) return;
  }
  const ex = getExercise(exerciseId);
  if (!ex || !ex.gifBlob) {
    if (imgEl.src && imgEl.dataset.ex) URL.revokeObjectURL(imgEl.src);
    imgEl.removeAttribute('src');
    imgEl.hidden = true;
    delete imgEl.dataset.ex;
    return;
  }
  if (imgEl.dataset.ex === exerciseId) {
    imgEl.hidden = false;
    return;
  }
  if (imgEl.dataset.ex) URL.revokeObjectURL(imgEl.src);
  imgEl.src = URL.createObjectURL(ex.gifBlob);
  imgEl.dataset.ex = exerciseId;
  imgEl.hidden = false;
}

async function _onWorkoutFinish(result) {
  if (result) {
    await history.save(result);
  }
  showScreen('history');
}

function renderMusic() {
  app().innerHTML = `
    <div class="screen music-screen">
      <div class="screen-header">
        <button class="btn-back" id="music-back">← Назад</button>
        <h2>Музыка</h2>
      </div>
      <div class="form-group">
        <label class="btn btn-secondary btn-block" for="music-import">导入音乐文件 (Импорт)</label>
        <input type="file" id="music-import" accept="audio/*" multiple hidden>
      </div>
      <div id="music-controls" class="music-controls hidden">
        <button class="btn-icon" id="music-prev">⏮</button>
        <button class="btn-icon btn-play" id="music-play">▶</button>
        <button class="btn-icon" id="music-next">⏭</button>
      </div>
      <div id="music-now-playing" class="muted"></div>
      <div id="music-list"></div>
    </div>
  `;

  document.getElementById('music-back').onclick = () => showScreen('home');
  document.getElementById('music-import').onchange = async (e) => {
    if (e.target.files.length > 0) {
      await music.importFiles(e.target.files);
      _refreshMusicList();
    }
  };
  document.getElementById('music-play').onclick = async () => {
    if (music.isPlaying()) {
      music.pause();
      document.getElementById('music-play').textContent = '▶';
    } else {
      await music.play();
      document.getElementById('music-play').textContent = '⏸';
    }
  };
  document.getElementById('music-prev').onclick = () => { music.prev(); _refreshMusicList(); };
  document.getElementById('music-next').onclick = () => { music.next(); _refreshMusicList(); };

  _refreshMusicList();
}

async function _refreshMusicList() {
  const listEl = document.getElementById('music-list');
  const controlsEl = document.getElementById('music-controls');
  const npEl = document.getElementById('music-now-playing');
  if (!listEl) return;

  const tracks = await music.getTracks();
  if (tracks.length === 0) {
    listEl.innerHTML = '<p class="muted" style="padding:2rem;text-align:center">Нет музыки. Нажмите «Импорт» выше.</p>';
    if (controlsEl) controlsEl.classList.add('hidden');
    return;
  }

  if (controlsEl) controlsEl.classList.remove('hidden');

  const playing = music.isPlaying();
  const currentIdx = music.currentIndex();
  const playBtn = document.getElementById('music-play');
  if (playBtn) playBtn.textContent = playing ? '⏸' : '▶';

  if (currentIdx >= 0 && currentIdx < tracks.length) {
    npEl.textContent = `Сейчас: ${tracks[currentIdx].displayName}`;
  } else {
    npEl.textContent = '';
  }

  listEl.innerHTML = tracks.map((t, i) => `
    <div class="track-row ${i === currentIdx ? 'active' : ''}" data-index="${i}">
      <span class="track-name">${t.displayName}</span>
      <div class="track-actions">
        <button class="btn-icon btn-sm" data-play="${i}">▶</button>
        <button class="btn-icon btn-sm" data-delete="${i}">✕</button>
      </div>
    </div>
  `).join('');

  listEl.querySelectorAll('[data-play]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.play, 10);
      await music.playIndex(idx);
      _refreshMusicList();
    };
  });

  listEl.querySelectorAll('[data-delete]').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.delete, 10);
      const tracks = await music.getTracks();
      if (tracks[idx]) {
        await music.removeTrack(tracks[idx].name);
        _refreshMusicList();
      }
    };
  });
}

async function renderSettings() {
  const s = await settings.loadAll();
  app().innerHTML = `
    <div class="screen settings-screen">
      <div class="screen-header">
        <button class="btn-back" id="settings-back">← Назад</button>
        <h2>Настройки</h2>
      </div>
      <div class="settings-list">
        <div class="setting-row">
          <label>Отдых между упражнениями (сек)</label>
          <input type="number" id="set-rest" value="${s.restBetweenSec}" min="5" max="120" step="5">
       </div>
        <div class="setting-row">
          <label>Приглушение музыки (%)</label>
          <input type="number" id="set-duck" value="${s.musicDuckPercent}" min="0" max="100" step="5">
          <span class="muted">Музыка снижается до ${100 - s.musicDuckPercent}%</span>
        </div>
        <div class="setting-row">
          <label>Голосовые подсказки</label>
          <label class="toggle">
            <input type="checkbox" id="set-voice" ${s.voiceOn ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <label>Блокировка экрана</label>
          <label class="toggle">
            <input type="checkbox" id="set-wakelock" ${s.wakeLockOn ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>
        <div class="setting-row">
          <label>Вес тела (кг)</label>
          <input type="number" id="set-weight" value="${s.bodyWeight}" min="30" max="200" step="0.5">
        </div>
        <div class="setting-row">
          <label>Данные</label>
          <div class="btn-row" style="margin-top:0">
            <button class="btn btn-sm btn-secondary" id="btn-export-all">⇩ Экспортировать все данные</button>
            <button class="btn btn-sm btn-secondary" id="btn-import-data">⇧ Импорт данных</button>
          </div>
        </div>
        <div class="setting-row">
          <label>Каталог упражнений</label>
          <div class="btn-row" style="margin-top:0">
            <button class="btn btn-sm btn-secondary" id="btn-admin">🏋️ Управлять упражнениями</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('settings-back').onclick = async () => {
    await _saveSettings();
    showScreen('home');
  };

  // Auto-save on change
  ['set-rest', 'set-duck', 'set-weight'].forEach(id => {
    document.getElementById(id).onchange = () => _saveSettings();
  });
  ['set-voice', 'set-wakelock'].forEach(id => {
    document.getElementById(id).onchange = () => _saveSettings();
  });

  document.getElementById('btn-export-all').onclick = _exportAllData;
  document.getElementById('btn-import-data').onclick = () => _importFromFile(renderSettings);
  document.getElementById('btn-admin').onclick = () => showScreen('admin');
}

async function _saveSettings() {
  const rest = parseInt(document.getElementById('set-rest')?.value, 10);
  const duck = parseInt(document.getElementById('set-duck')?.value, 10);
  const voice = document.getElementById('set-voice')?.checked;
  const wakelock = document.getElementById('set-wakelock')?.checked;
  const weight = parseFloat(document.getElementById('set-weight')?.value);

  if (!isNaN(rest)) await settings.set('restBetweenSec', rest);
  if (!isNaN(duck)) {
    await settings.set('musicDuckPercent', duck);
    music.setDuckPercent(duck);
  }
  if (voice !== undefined) await settings.set('voiceOn', voice);
  if (wakelock !== undefined) await settings.set('wakeLockOn', wakelock);
  if (!isNaN(weight)) await settings.set('bodyWeight', weight);
}

async function renderHistory() {
  const grouped = await history.getGroupedByDate();
  const dates = Object.keys(grouped);

  app().innerHTML = `
    <div class="screen history-screen">
      <div class="screen-header">
        <button class="btn-back" id="history-back">← Назад</button>
        <h2>История</h2>
      </div>
      <div id="history-content">
        ${dates.length === 0 ? '<p class="muted" style="padding:2rem;text-align:center">Нет записей. Завершите тренировку!</p>' : ''}
        ${dates.map(dateKey => {
          const records = grouped[dateKey];
          const totalCal = records.reduce((s, r) => s + (r.totalCalories || 0), 0);
          return `
            <div class="history-date-group">
              <div class="history-date">${history.formatDate(dateKey)}</div>
              <div class="history-date-summary">${records.length} трен. · ${Math.round(totalCal)} ккал</div>
              ${records.map(r => `
                <div class="history-record">
                  <div class="record-header">
                    <strong>${r.title || 'Тренировка'}</strong>
                    <span class="record-time">${history.formatDuration(r.durationSec || 0)}</span>
                  </div>
                  <div class="record-details">
                    ${r.exercises?.length || 0} упр. · ${Math.round(r.totalCalories || 0)} ккал
                    ${r.itemsCompleted ? `(${r.itemsCompleted}/${r.itemsTotal} выполнено)` : ''}
                  </div>
                  <div class="btn-row" style="margin-top:0.5rem">
                    <button class="btn btn-sm btn-secondary" data-replay-id="${r.id}">↻ Повторить</button>
                    <button class="btn btn-sm btn-secondary" data-export-record="${r.id}">⇩</button>
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('history-back').onclick = () => showScreen('home');

  document.querySelectorAll('[data-replay-id]').forEach(btn => {
    btn.onclick = async () => {
      const r = await history.getById(btn.dataset.replayId);
      if (!r) return;
      const workout = {
        id: _uid(),
        title: r.title || 'Тренировка',
        date: new Date().toISOString(),
        items: (r.exercises || []).map(e => ({
          exerciseId: e.id,
          reps: e.reps,
          sets: e.sets,
          restAfterSec: 20,
        })),
        source: 'replay',
        estimatedCalories: Math.round(r.totalCalories || 0),
        estimatedDuration: r.durationSec || 0,
      };
      runner.start(workout, {
        onUpdate: _updateRunScreen,
        onFinish: _onWorkoutFinish,
      });
      showScreen('run');
    };
  });

  document.querySelectorAll('[data-export-record]').forEach(btn => {
    btn.onclick = () => _exportItem('history', btn.dataset.exportRecord);
  });
}

async function renderPlans() {
  const allPlans = await plans.getAll();

  app().innerHTML = `
    <div class="screen plans-screen">
      <div class="screen-header">
        <button class="btn-back" id="plans-back">← Назад</button>
        <h2>Мои тренировки</h2>
      </div>
      <div id="plans-content">
        ${allPlans.length === 0 ? '<p class="muted" style="padding:2rem;text-align:center">Нет сохранённых тренировок. Соберите и сохраните.</p>' : ''}
        ${allPlans.map(p => `
          <div class="history-record">
            <div class="record-header">
              <strong>${p.title || 'Тренировка'}</strong>
            </div>
            <div class="record-details">
              ${p.kind === 'set'
                ? `${(p.items?.length || 0)} упр. · ${p.mode === 'rounds' ? `${p.rounds} круг.` : `${Math.round((p.timeLimitSec || 0) / 60)} мин`} · отдых ${p.restBetweenSec}с`
                : `${(p.items?.length || 0)} упр. · ${p.estimatedCalories || 0} ккал · ${Math.round((p.estimatedDuration || 0) / 60)} мин`}
            </div>
            <div class="btn-row" style="margin-top:0.5rem">
              <button class="btn btn-sm btn-primary" data-plan-launch="${p.id}">▶ Запустить</button>
              <button class="btn btn-sm btn-secondary" data-plan-delete="${p.id}">🗑 Удалить</button>
              <button class="btn btn-sm btn-secondary" data-export-plan="${p.id}">⇩</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('plans-back').onclick = () => showScreen('home');

  document.querySelectorAll('[data-plan-launch]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.planLaunch;
      const p = allPlans.find(x => x.id === id);
      if (!p) return;
      if (p.kind === 'set') {
        runner.startSet({ ...p }, { onUpdate: _updateSetRunScreen, onFinish: _onSetFinish });
        showScreen('runSet');
      } else {
        runner.start(
          { ...p, id: _uid(), date: new Date().toISOString() },
          { onUpdate: _updateRunScreen, onFinish: _onWorkoutFinish },
        );
        showScreen('run');
      }
    };
  });

  document.querySelectorAll('[data-plan-delete]').forEach(btn => {
    btn.onclick = async () => {
      await plans.remove(btn.dataset.planDelete);
      renderPlans();
    };
  });

  document.querySelectorAll('[data-export-plan]').forEach(btn => {
    btn.onclick = () => _exportItem('plan', btn.dataset.exportPlan);
  });
}

async function _exportAllData() {
  try {
    const data = await backup.buildAppExport();
    backup.downloadJson(data, backup.backupFilename('app'));
  } catch (err) {
    alert(err instanceof backup.BackupError ? err.message : 'Не удалось экспортировать данные');
  }
}

async function _exportItem(type, id) {
  try {
    if (type === 'history') {
      const r = await history.getById(id);
      if (!r) return;
      backup.downloadJson(backup.exportRecordJson('history', r), backup.backupFilename('history', r.id));
    } else {
      const p = await plans.getById(id);
      if (!p) return;
      backup.downloadJson(backup.exportRecordJson('plan', p), backup.backupFilename('plan', p.id));
    }
  } catch (err) {
    alert(err instanceof backup.BackupError ? err.message : 'Не удалось экспортировать запись');
  }
}

function _importFromFile(afterImport) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = backup.parseImport(text);
      if (!confirm(parsed.summary)) return;
      await backup.applyImport(parsed);
      alert('Импорт завершён');
      if (afterImport) afterImport();
    } catch (err) {
      alert(err instanceof backup.BackupError ? err.message : 'Не удалось импортировать файл');
    } finally {
      input.remove();
    }
  };
  input.click();
}
