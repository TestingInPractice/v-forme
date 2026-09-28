/**
 * Hands-free workout runner.
 * Hard timer per exercise, Russian voice prompts, music ducking, wakeLock.
 */
import { getExercise, calcExerciseCalories } from './catalog.js';
import { exerciseDuration } from './workout.js';
import * as music from './music.js';
import * as settings from './settings.js';
import * as voice from './voice.js';

let _workout = null;
let _currentIndex = 0;
let _completedItems = 0;  // exercises whose work phase fully finished
let _phase = 'idle';      // idle | announcing | working | resting | paused | finished
let _timer = null;
let _remaining = 0;       // seconds left in current phase
let _paused = false;
let _wakeLock = null;
let _startTime = 0;
let _onUpdate = null;     // callback for UI updates
let _onFinish = null;     // callback when workout finishes

// Set (circuit) runner state
let _setCfg = null;       // { title, items:[{exerciseId,reps}], mode, rounds, timeLimitSec, restBetweenSec }
let _setRound = 0;        // 0-based current round
let _setIndex = 0;        // index within current round
let _setElapsed = 0;      // general elapsed seconds (AMRAP clock)
let _setRestRemaining = 0;
let _setDoneCount = 0;
let _setPrevPhase = 'working';

export function getPhase() { return _phase; }
export function getRemaining() { return _remaining; }
export function getCurrentIndex() { return _currentIndex; }
export function getWorkout() { return _workout; }
export function isPaused() { return _paused; }

/** Start a workout. */
export async function start(workout, { onUpdate, onFinish } = {}) {
  _workout = workout;
  _currentIndex = 0;
  _completedItems = 0;
  _phase = 'idle';
  _paused = false;
  _startTime = Date.now();
  _onUpdate = onUpdate || (() => {});
  _onFinish = onFinish || (() => {});

  const s = await settings.loadAll();
  if (s.wakeLockOn) await _acquireWakeLock();

  // Start music if tracks exist
  const tracks = await music.getTracks();
  if (tracks.length > 0) {
    await music.play();
  }

  _processItem();
}

/** Pause the workout. */
export function pause() {
  if (_phase === 'paused') return;
  _paused = true;
  _phase = 'paused';
  clearInterval(_timer);
  _notify();
}

/** Resume from pause. */
export function resume() {
  if (_phase !== 'paused') return;
  _paused = false;
  _phase = _prevPhase || 'working';
  _startCountdown();
  _notify();
}

let _prevPhase = 'working';

/** Skip current exercise. */
export function skip() {
  clearInterval(_timer);
  if (_phase === 'resting') {
    // skip rest, go to next exercise
    _nextItem();
  } else {
    // skip exercise, go to rest
    _startRest();
  }
}

/** Stop the entire workout. */
export async function stop() {
  clearInterval(_timer);
  _phase = 'idle';
  _paused = false;
  music.unduck();
  _releaseWakeLock();
  _notify();
  if (_workout) {
    // null result when no exercise was actually completed: still navigate away, but don't save to history
    const result = _completedItems > 0 ? _buildResult() : null;
    _onFinish(result);
  }
  _workout = null;
}

/* ─── Set (circuit) runner ─────────────────────────────────────────── */

export function isSetRunning() {
  return !!_setCfg;
}

export function getSetState() {
  return _getSetState();
}

/** Start a set workout: exercises × rounds with rest between exercises. */
export async function startSet(cfg, { onUpdate, onFinish } = {}) {
  _setCfg = cfg;
  _setRound = 0;
  _setIndex = 0;
  _setElapsed = 0;
  _setRestRemaining = 0;
  _setDoneCount = 0;
  _phase = 'working';
  _paused = false;
  _startTime = Date.now();
  _onUpdate = onUpdate || (() => {});
  _onFinish = onFinish || (() => {});

  const s = await settings.loadAll();
  if (s.wakeLockOn) await _acquireWakeLock();

  const tracks = await music.getTracks();
  if (tracks.length > 0) await music.play();

  await _announceSet(true);
  _setTicker();
  _notifySet();
}

/** Mark current exercise as done → start rest or advance. */
export async function completeSet() {
  if (!_setCfg || _phase !== 'working') return;
  _setDoneCount++;
  const items = _setCfg.items;
  if (_setIndex < items.length - 1) {
    _phase = 'resting';
    _setRestRemaining = _setCfg.restBetweenSec || 20;
    const next = getExercise(items[_setIndex + 1].exerciseId);
    await _speak(next ? `Отдых. Далее: ${next.name}.` : 'Отдых.');
  } else if (_setCfg.mode === 'rounds' && _setRound + 1 >= _setCfg.rounds) {
    _finishSet();
    return;
  } else {
    _setRound++;
    _setIndex = 0;
    _phase = 'resting';
    _setRestRemaining = _setCfg.restBetweenSec || 20;
    await _speak('Круг завершён. Отдых.');
  }
  _notifySet();
}

/** Skip rest and move to the next exercise. */
export function skipSetRest() {
  if (!_setCfg || _phase !== 'resting') return;
  _setRestRemaining = 0;
  _advanceAfterRest();
}

/** Pause the set runner. */
export function pauseSet() {
  if (_phase === 'paused') return;
  _setPrevPhase = _phase;
  _paused = true;
  _phase = 'paused';
  _notifySet();
}

/** Resume the set runner. */
export function resumeSet() {
  if (_phase !== 'paused') return;
  _paused = false;
  _phase = _setPrevPhase || 'working';
  _notifySet();
}

/** Stop the set runner without saving. */
export async function stopSet() {
  clearInterval(_timer);
  _setCfg = null;
  _phase = 'idle';
  _paused = false;
  music.unduck();
  _releaseWakeLock();
  _onFinish(null);
}

function _setTicker() {
  clearInterval(_timer);
  _timer = setInterval(() => {
    if (_paused || !_setCfg) return;
    _setElapsed++;
    if (_phase === 'resting') {
      _setRestRemaining--;
      if (_setRestRemaining <= 0) _advanceAfterRest();
    }
    if (_setCfg.mode === 'time' && _setElapsed >= _setCfg.timeLimitSec) {
      _finishSet();
      return;
    }
    _notifySet();
  }, 1000);
}

function _advanceAfterRest() {
  if (!_setCfg) return;
  const items = _setCfg.items;
  if (_setIndex < items.length - 1) {
    _setIndex++;
  } else if (_setCfg.mode !== 'rounds' || _setRound + 1 < _setCfg.rounds) {
    _setRound++;
    _setIndex = 0;
  }
  _phase = 'working';
  _announceSet();
  _notifySet();
}

async function _announceSet() {
  const item = _setCfg.items[_setIndex];
  const ex = getExercise(item.exerciseId);
  if (!ex) return;
  const roundPrefix = _setRound > 0 ? `Круг ${_setRound + 1}. ` : '';
  await _speak(`${roundPrefix}${ex.name}. ${item.reps} повторов.`);
}

function _finishSet() {
  clearInterval(_timer);
  _phase = 'finished';
  _notifySet();
  music.unduck();
  _releaseWakeLock();
  _speak('Тренировка завершена!');
  const result = _buildSetResult();
  _onFinish(result);
}

function _buildSetResult() {
  if (!_setCfg) return null;
  const bodyWeight = settings._cache?.bodyWeight || 75;
  const exercises = _setCfg.items.map(it => ({
    id: it.exerciseId,
    reps: it.reps,
    sets: 1,
  }));
  const totalCalories = exercises.reduce((sum, e) => {
    const ex = getExercise(e.id);
    return sum + (ex ? calcExerciseCalories(ex, e.reps, 1, bodyWeight) : 0);
  }, 0);
  const durationSec = Math.round((Date.now() - _startTime) / 1000);
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    workoutId: 'set_' + Date.now().toString(36),
    date: new Date().toISOString(),
    durationSec,
    exercises,
    totalCalories: Math.round(totalCalories * 10) / 10,
    title: (_setCfg.title || 'Набор') + ` (${_setRound + 1} круг.)`,
    itemsCompleted: _setDoneCount,
    itemsTotal: _setCfg.items.length * Math.max(1, _setRound + 1),
  };
}

function _notifySet() {
  if (_onUpdate) _onUpdate(_getSetState());
}

function _getSetState() {
  const item = _setCfg?.items[_setIndex];
  const exercise = item ? getExercise(item.exerciseId) : null;
  return {
    active: !!_setCfg,
    phase: _phase,
    isPaused: _paused,
    round: _setRound + 1,
    roundsTotal: _setCfg?.mode === 'rounds' ? _setCfg.rounds : null,
    index: _setIndex + 1,
    itemsTotal: _setCfg?.items.length || 0,
    exerciseName: exercise?.name || '',
    exerciseId: exercise?.id || '',
    reps: item?.reps || 0,
    restRemaining: _setRestRemaining,
    restTotal: _setCfg?.restBetweenSec || 0,
    elapsedSec: _setElapsed,
    timeLimitSec: _setCfg?.mode === 'time' ? _setCfg.timeLimitSec : null,
    doneSets: _setDoneCount,
  };
}

async function _processItem() {
  if (!_workout || _currentIndex >= _workout.items.length) {
    _finishWorkout();
    return;
  }

  const item = _workout.items[_currentIndex];
  const exercise = getExercise(item.exerciseId);
  if (!exercise) {
    _nextItem();
    return;
  }

  // Announce exercise
  _phase = 'announcing';
  _notify();
  await _speak(`${exercise.name}. Начинайте.`);

  // Stopped/skipped while announcing: never continue into work phase
  if (!_workout || _phase !== 'announcing') return;

  // Work phase
  _phase = 'working';
  const duration = exerciseDuration(exercise, item.reps);
  _remaining = duration;
  _notify();

  _startCountdown(() => {
    _completedItems++;
    _startRest();
  });
}

function _startCountdown(onDone) {
  clearInterval(_timer);
  _timer = setInterval(() => {
    if (_paused) return;
    _remaining--;
    _notify();
    if (_remaining <= 0) {
      clearInterval(_timer);
      if (onDone) onDone();
    }
  }, 1000);
}

async function _startRest() {
  const item = _workout.items[_currentIndex];
  const restSec = item.restAfterSec || 20;

  if (_currentIndex >= _workout.items.length - 1) {
    // Last exercise — no rest needed
    _finishWorkout();
    return;
  }

  // Announce rest
  _phase = 'resting';
  const nextItem = _workout.items[_currentIndex + 1];
  const nextEx = getExercise(nextItem.exerciseId);
  _remaining = restSec;
  _notify();

  if (nextEx) {
    await _speak(`Отдых. Далее: ${nextEx.name}.`);
  } else {
    await _speak('Отдых.');
  }

  // Stopped/skipped while rest was announced: never start a ghost countdown
  if (!_workout || _phase !== 'resting') return;

  _startCountdown(() => {
    _nextItem();
  });
}

function _nextItem() {
  _currentIndex++;
  _processItem();
}

async function _finishWorkout() {
  clearInterval(_timer);
  _phase = 'finished';
  _notify();
  music.unduck();
  _releaseWakeLock();
  const result = _buildResult();
  _onFinish(result);
  _speak('Тренировка завершена!');
}

function _buildResult() {
  if (!_workout) return null;
  const doneItems = _workout.items.slice(0, _currentIndex + 1);
  // Try to get bodyWeight from settings (cached)
  const bodyWeight = settings._cache?.bodyWeight || 75;

  const exercises = doneItems.map(it => ({
    id: it.exerciseId,
    reps: it.reps,
    sets: it.sets,
  }));

  const totalCalories = doneItems.reduce((sum, it) => {
    const ex = getExercise(it.exerciseId);
    return sum + (ex ? calcExerciseCalories(ex, it.reps, it.sets, bodyWeight) : 0);
  }, 0);

  const durationSec = Math.round((Date.now() - _startTime) / 1000);

  return {
    id: _workout.id + '_result',
    workoutId: _workout.id,
    date: new Date().toISOString(),
    durationSec,
    exercises,
    totalCalories: Math.round(totalCalories * 10) / 10,
    title: _workout.title,
    itemsCompleted: _currentIndex + 1,
    itemsTotal: _workout.items.length,
  };
}

async function _speak(text) {
  const s = await settings.loadAll();
  if (!s.voiceOn) return;

  music.duck();
  const played = await voice.play(text);
  if (played) {
    music.unduck();
    return;
  }
  music.unduck();

  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = 'ru-RU';
    utter.rate = 0.9;
    utter.pitch = 1.0;

    // Try to find a Russian voice
    const voices = speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith('ru'));
    if (ruVoice) utter.voice = ruVoice;

    utter.onend = () => {
      music.unduck();
      resolve();
    };
    utter.onerror = () => {
      music.unduck();
      resolve();
    };
    music.duck();
    speechSynthesis.speak(utter);
  });
}

async function _acquireWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      _wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch {
    // Wake lock not supported or denied
  }
}

function _releaseWakeLock() {
  if (_wakeLock) {
    _wakeLock.release().catch(() => {});
    _wakeLock = null;
  }
}

function _notify() {
  if (_onUpdate) _onUpdate(_getState());
}

function _getState() {
  const item = _workout?.items[_currentIndex];
  const exercise = item ? getExercise(item.exerciseId) : null;
  return {
    phase: _phase,
    remaining: _remaining,
    currentIndex: _currentIndex,
    totalItems: _workout?.items.length || 0,
    exerciseName: exercise?.name || '',
    exerciseId: exercise?.id || '',
    exerciseDescription: exercise?.description || '',
    isPaused: _paused,
    progress: _workout ? (_currentIndex / _workout.items.length) * 100 : 0,
  };
}
