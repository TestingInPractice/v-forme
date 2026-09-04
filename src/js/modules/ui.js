/**
 * UI module — thin SPA router + screen rendering + event wiring.
 * All Russian UI text.
 */
import { EXERCISES, getExercise, calcExerciseCalories, isRepsOverLimit, MUSCLE_GROUPS } from '../../../data/exercises.js';
import { filterExercises, autoBuild, createManualWorkout, checkRepsLimit } from './workout.js';
import * as runner from './runner.js';
import * as music from './music.js';
import * as history from './history.js';
import * as plans from './plans.js';
import * as settings from './settings.js';

const app = () => document.getElementById('app');
let _currentScreen = 'home';
let _currentWorkout = null;   // workout being built
let _manualItems = [];        // items for manual build

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Initialize: load settings, show home. */
export async function init() {
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
  plans: renderPlans,
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
      </div>
    </div>
  `;
  document.getElementById('btn-build').onclick = () => showScreen('build');
  document.getElementById('nav-history').onclick = () => showScreen('history');
  document.getElementById('nav-plans').onclick = () => showScreen('plans');
  document.getElementById('nav-music').onclick = () => showScreen('music');
  document.getElementById('nav-settings').onclick = () => showScreen('settings');
}

function renderBuild() {
  _currentWorkout = null;
  _manualItems = [];
  app().innerHTML = `
    <div class="screen build-screen">
      <div class="screen-header">
        <button class="btn-back" id="build-back">← Назад</button>
        <h2>Новая тренировка</h2>
      </div>
      <div class="tabs">
        <button class="tab active" id="tab-auto">Авто</button>
        <button class="tab" id="tab-manual">Вручную</button>
      </div>
      <div id="build-content"></div>
    </div>
  `;
  document.getElementById('build-back').onclick = () => showScreen('home');
  document.getElementById('tab-auto').onclick = () => _switchBuildTab('auto');
  document.getElementById('tab-manual').onclick = () => _switchBuildTab('manual');
  _switchBuildTab('auto');
}

function _switchBuildTab(tab) {
  document.getElementById('tab-auto').classList.toggle('active', tab === 'auto');
  document.getElementById('tab-manual').classList.toggle('active', tab === 'manual');
  const content = document.getElementById('build-content');
  if (tab === 'auto') {
    _renderAutoBuild(content);
  } else {
    _renderManualBuild(content);
  }
}

function _renderAutoBuild(container) {
  const categories = [...new Set(EXERCISES.map(e => e.category))];
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
            ${MUSCLE_GROUPS.map(m => `<option value="${m}">${m}</option>`).join('')}
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

function _renderManualBuild(container) {
  const categories = [...new Set(EXERCISES.map(e => e.category))];
  container.innerHTML = `
    <div class="manual-build">
      <div class="form-group">
        <label>Категория</label>
        <select id="manual-category">
          <option value="">Все</option>
          ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Упражнение</label>
        <select id="manual-exercise"></select>
      </div>
      <div id="manual-exercise-info"></div>
      <div class="form-group">
        <label>Повторения</label>
        <input type="number" id="manual-reps" value="10" min="1" max="100">
      </div>
      <div id="manual-warning" class="warning hidden"></div>
      <button class="btn btn-primary btn-green" id="manual-add">Добавить</button>
      <div class="form-group" style="margin-top: 1rem">
        <label>Название тренировки</label>
        <input type="text" id="manual-title" value="Тренировка" placeholder="Введите название">
      </div>
      <div id="manual-items-list"></div>
      <div id="manual-result"></div>
    </div>
  `;

  const catSelect = document.getElementById('manual-category');
  const exSelect = document.getElementById('manual-exercise');
  const repsInput = document.getElementById('manual-reps');
  const warningDiv = document.getElementById('manual-warning');
  const infoDiv = document.getElementById('manual-exercise-info');

  function _updateExerciseList() {
    const cat = catSelect.value;
    const filtered = filterExercises(cat ? { category: cat } : {});
    exSelect.innerHTML = filtered.map(e =>
      `<option value="${e.id}">${e.name} (${e.category})</option>`
    ).join('');
    _updateExerciseInfo();
  }

  function _updateExerciseInfo() {
    const ex = getExercise(exSelect.value);
    if (!ex) { infoDiv.innerHTML = ''; return; }
    infoDiv.innerHTML = `
      <div class="exercise-info-card">
        <strong>${ex.name}</strong>
        <p>${ex.description}</p>
        <span class="badge">${ex.category}</span>
        <span class="badge">${ex.muscleGroup.join(', ')}</span>
        <span class="muted">Повторения: ${ex.typicalReps.min}–${ex.typicalReps.max}</span>
      </div>
    `;
    _checkWarning();
  }

  function _checkWarning() {
    const ex = getExercise(exSelect.value);
    const reps = parseInt(repsInput.value, 10);
    if (ex && reps && isRepsOverLimit(ex, reps)) {
      warningDiv.textContent = `⚠️ Повторения выше нормы! Максимум: ${ex.typicalReps.max}`;
      warningDiv.classList.remove('hidden');
    } else {
      warningDiv.classList.add('hidden');
    }
  }

  catSelect.onchange = _updateExerciseList;
  exSelect.onchange = _updateExerciseInfo;
  repsInput.oninput = _checkWarning;

  document.getElementById('manual-add').onclick = () => {
    const ex = getExercise(exSelect.value);
    const reps = parseInt(repsInput.value, 10);
    if (!ex || !reps) return;

    if (isRepsOverLimit(ex, reps)) {
      warningDiv.textContent = `⛔ Нельзя добавить! Повторения выше лимита (${ex.typicalReps.max}).`;
      warningDiv.classList.remove('hidden');
      return;
    }

    _manualItems.push({ exerciseId: ex.id, reps, sets: 1, restAfterSec: 20 });
    _updateManualItemsList();
  };

  _updateExerciseList();
  _updateManualItemsList();
}

function _updateManualItemsList() {
  const list = document.getElementById('manual-items-list');
  if (!list) return;
  if (_manualItems.length === 0) {
    list.innerHTML = '<p class="muted">Добавьте упражнения</p>';
    const result = document.getElementById('manual-result');
    if (result) result.innerHTML = '';
    return;
  }

  list.innerHTML = `
    <div class="items-list">
      ${_manualItems.map((it, i) => {
        const ex = getExercise(it.exerciseId);
        return `
          <div class="item-row">
            <span>${ex?.name || it.exerciseId}: ${it.reps} повт.</span>
            <button class="btn-icon" data-remove="${i}">✕</button>
          </div>
        `;
      }).join('')}
    </div>
  `;

  list.querySelectorAll('[data-remove]').forEach(btn => {
    btn.onclick = () => {
      _manualItems.splice(parseInt(btn.dataset.remove, 10), 1);
      _updateManualItemsList();
    };
  });

  // Show build button and summary
  const result = document.getElementById('manual-result');
  const weight = getBodyWeight();
  const totalCal = _manualItems.reduce((sum, it) => {
    const ex = getExercise(it.exerciseId);
    return sum + (ex ? calcExerciseCalories(ex, it.reps, it.sets, weight) : 0);
  }, 0);

  result.innerHTML = `
    <div class="workout-summary">
      <p>Упражнений: ${_manualItems.length} | Калории: ~${Math.round(totalCal)} ккал</p>
      <button class="btn btn-primary" id="manual-build-go">Собрать тренировку</button>
    </div>
  `;

  document.getElementById('manual-build-go').onclick = () => {
    const title = document.getElementById('manual-title').value || 'Тренировка';
    _currentWorkout = createManualWorkout(title, [..._manualItems], weight);
    _renderWorkoutResult();
  };
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
              ${(p.items?.length || 0)} упр. · ${p.estimatedCalories || 0} ккал · ${Math.round((p.estimatedDuration || 0) / 60)} мин
            </div>
            <div class="btn-row" style="margin-top:0.5rem">
              <button class="btn btn-sm btn-primary" data-plan-launch="${p.id}">▶ Запустить</button>
              <button class="btn btn-sm btn-secondary" data-plan-delete="${p.id}">🗑 Удалить</button>
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
      runner.start(
        { ...p, id: _uid(), date: new Date().toISOString() },
        { onUpdate: _updateRunScreen, onFinish: _onWorkoutFinish },
      );
      showScreen('run');
    };
  });

  document.querySelectorAll('[data-plan-delete]').forEach(btn => {
    btn.onclick = async () => {
      await plans.remove(btn.dataset.planDelete);
      renderPlans();
    };
  });
}
