/**
 * Hands-free workout runner.
 * Hard timer per exercise, Russian voice prompts, music ducking, wakeLock.
 */
import { getExercise, calcExerciseCalories } from '../../../data/exercises.js';
import { exerciseDuration } from './workout.js';
import * as music from './music.js';
import * as settings from './settings.js';

let _workout = null;
let _currentIndex = 0;
let _phase = 'idle';      // idle | announcing | working | resting | paused | finished
let _timer = null;
let _remaining = 0;       // seconds left in current phase
let _paused = false;
let _wakeLock = null;
let _startTime = 0;
let _onUpdate = null;     // callback for UI updates
let _onFinish = null;     // callback when workout finishes

export function getPhase() { return _phase; }
export function getRemaining() { return _remaining; }
export function getCurrentIndex() { return _currentIndex; }
export function getWorkout() { return _workout; }
export function isPaused() { return _paused; }

/** Start a workout. */
export async function start(workout, { onUpdate, onFinish } = {}) {
  _workout = workout;
  _currentIndex = 0;
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
    // null result when no item completed: still navigate away, but don't save to history
    const result = _currentIndex > 0 ? _buildResult() : null;
    _onFinish(result);
  }
  _workout = null;
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

  // Work phase
  _phase = 'working';
  const duration = exerciseDuration(exercise, item.reps);
  _remaining = duration;
  _notify();

  _startCountdown(() => {
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
  await _speak('Тренировка завершена!');
  _releaseWakeLock();
  const result = _buildResult();
  _onFinish(result);
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

  // Duck music during voice
  music.duck();

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
    exerciseDescription: exercise?.description || '',
    isPaused: _paused,
    progress: _workout ? (_currentIndex / _workout.items.length) * 100 : 0,
  };
}
