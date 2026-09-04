/**
 * Workout builder module.
 * Auto-build: picks balanced exercises for target muscle/calories/time.
 * Manual: user picks exercises + reps with over-limit guard.
 */
import { EXERCISES, getExercise, calcExerciseCalories, isRepsOverLimit } from '../../../data/exercises.js';

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** Filter exercises by category or muscle group. */
export function filterExercises({ category, muscleGroup } = {}) {
  return EXERCISES.filter(e => {
    if (category && e.category !== category) return false;
    if (muscleGroup && !e.muscleGroup.includes(muscleGroup)) return false;
    return true;
  });
}

/**
 * Auto-build a workout.
 * mode = 'muscle': target a specific muscle group
 * mode = 'calories': target a calorie amount
 * mode = 'time': target a duration in minutes
 */
export function autoBuild({ mode, muscle, calories, targetTime, bodyWeightKg = 75 }) {
  let candidates;
  if (mode === 'muscle' && muscle) {
    candidates = EXERCISES.filter(e => e.muscleGroup.includes(muscle));
    // if too few, supplement with general exercises
    if (candidates.length < 3) {
      const extras = EXERCISES.filter(e => !candidates.includes(e) && e.difficulty <= 2);
      candidates = [...candidates, ...shuffle(extras)];
    }
  } else {
    // calories or time mode: pick from all bodyweight exercises for variety
    candidates = EXERCISES.filter(e => e.equipment === 'bodyweight');
  }

  candidates = shuffle(candidates);
  const items = [];
  let totalCalories = 0;
  let totalDuration = 0;

  const restSec = 20; // default, will be overwritten by runner from settings

  if (mode === 'calories' && calories) {
    // pick exercises until we hit calorie target
    let idx = 0;
    while (totalCalories < calories && idx < candidates.length * 2) {
      const ex = candidates[idx % candidates.length];
      const reps = pickReps(ex);
      const kcal = calcExerciseCalories(ex, reps, 1, bodyWeightKg);
      const duration = exerciseDuration(ex, reps);
      items.push({ exerciseId: ex.id, reps, sets: 1, restAfterSec: restSec });
      totalCalories += kcal;
      totalDuration += duration + restSec;
      idx++;
    }
  } else if (mode === 'time' && targetTime) {
    // pick exercises until we hit time target (in minutes)
    const targetSec = targetTime * 60;
    let idx = 0;
    while (totalDuration < targetSec && idx < candidates.length * 3) {
      const ex = candidates[idx % candidates.length];
      const reps = pickReps(ex);
      const duration = exerciseDuration(ex, reps);
      if (totalDuration + duration + restSec > targetSec + 30) {
        // try next exercise if this one is too long
        idx++;
        continue;
      }
      items.push({ exerciseId: ex.id, reps, sets: 1, restAfterSec: restSec });
      totalDuration += duration + restSec;
      const kcal = calcExerciseCalories(ex, reps, 1, bodyWeightKg);
      totalCalories += kcal;
      idx++;
    }
  } else {
    // muscle mode or fallback: pick 5-8 exercises
    const count = Math.min(candidates.length, 6);
    for (let i = 0; i < count; i++) {
      const ex = candidates[i];
      const reps = pickReps(ex);
      items.push({ exerciseId: ex.id, reps, sets: 1, restAfterSec: restSec });
      totalCalories += calcExerciseCalories(ex, reps, 1, bodyWeightKg);
      totalDuration += exerciseDuration(ex, reps) + restSec;
    }
  }

  // Calculate actual totals
  for (const item of items) {
    if (!item._counted) {
      const ex = getExercise(item.exerciseId);
      // already counted above
    }
  }

  const totalCal = items.reduce((sum, it) => {
    const ex = getExercise(it.exerciseId);
    return sum + calcExerciseCalories(ex, it.reps, it.sets, bodyWeightKg);
  }, 0);

  return {
    id: uid(),
    title: buildTitle(mode, muscle, calories, targetTime),
    date: new Date().toISOString(),
    items,
    source: 'auto',
    estimatedCalories: Math.round(totalCal),
    estimatedDuration: Math.round(totalDuration),
  };
}

/** Create a manual workout from user-selected items. */
export function createManualWorkout(title, items, bodyWeightKg = 75) {
  const totalCal = items.reduce((sum, it) => {
    const ex = getExercise(it.exerciseId);
    return sum + calcExerciseCalories(ex, it.reps, it.sets, bodyWeightKg);
  }, 0);
  const totalDur = items.reduce((sum, it) => {
    const ex = getExercise(it.exerciseId);
    return sum + exerciseDuration(ex, it.reps) + it.restAfterSec;
  }, 0);
  return {
    id: uid(),
    title: title || 'Тренировка',
    date: new Date().toISOString(),
    items,
    source: 'manual',
    estimatedCalories: Math.round(totalCal),
    estimatedDuration: Math.round(totalDur),
  };
}

/** Check over-limit for a single exercise + reps. */
export function checkRepsLimit(exerciseId, reps) {
  const ex = getExercise(exerciseId);
  if (!ex) return false;
  return isRepsOverLimit(ex, reps);
}

/** Get exercise time window in seconds. */
export function exerciseDuration(exercise, reps) {
  if (exercise.isHold) {
    return (exercise.holdSeconds || 30) * (reps || 1);
  }
  if (exercise.isTime) {
    return (exercise.timeSeconds || 20) * (reps || 1);
  }
  return (reps || 1) * (exercise.sets || 1) * exercise.secondsPerRep;
}

function pickReps(ex) {
  const min = ex.typicalReps.min;
  const max = ex.typicalReps.max;
  return min + Math.floor(Math.random() * (max - min + 1));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildTitle(mode, muscle, calories, targetTime) {
  if (mode === 'muscle') return `Тренировка: ${muscle}`;
  if (mode === 'calories') return `Цель: ${calories} ккал`;
  if (mode === 'time') return `Цель: ${targetTime} мин`;
  return 'Тренировка';
}
