/**
 * Catalog module — упражнения и категории в IndexedDB с синхронным кэшем.
 * Сид: data/exercises.js (EXERCISES + CATEGORIES). После init() чтение синхронное.
 */
import * as db from './db.js';
import { EXERCISES as SEED_EXERCISES, CATEGORIES as SEED_CATEGORIES, MUSCLE_GROUPS, calcExerciseCalories, isRepsOverLimit } from '../../../data/exercises.js';

export { calcExerciseCalories, isRepsOverLimit };

let _exercises = null;
let _categories = null;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function init() {
  if (_exercises) return;
  const existing = await db.getAll('exercises');
  if (existing.length === 0) {
    await db.putMany('exercises', SEED_EXERCISES.map(e => ({ ...e, gifBlob: null })));
  }
  const cats = await db.getAll('categories');
  if (cats.length === 0) {
    await db.putMany('categories', SEED_CATEGORIES);
  }
  _exercises = await db.getAll('exercises');
  _categories = await db.getAll('categories');
}

export function getExercise(id) {
  if (!_exercises) return null;
  return _exercises.find(e => e.id === id) || null;
}

export function getExercises() {
  return [...(_exercises || [])];
}

export function getCategories() {
  return [...(_categories || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function getMuscleGroups() {
  return [...MUSCLE_GROUPS];
}

export async function saveExercise(ex) {
  const record = { ...ex };
  if (!record.id) record.id = uid();
  const idx = (_exercises || []).findIndex(e => e.id === record.id);
  if (idx >= 0) _exercises[idx] = record;
  else _exercises.push(record);
  await db.put('exercises', record);
  return record;
}

export async function deleteExercise(id) {
  _exercises = (_exercises || []).filter(e => e.id !== id);
  await db.del('exercises', id);
}

export async function saveCategory(cat) {
  const record = { ...cat };
  if (!record.id) record.id = uid();
  if (record.order == null) {
    const max = (_categories || []).reduce((m, c) => Math.max(m, c.order ?? 0), -1);
    record.order = max + 1;
  }
  const idx = (_categories || []).findIndex(c => c.id === record.id);
  if (idx >= 0) _categories[idx] = record;
  else _categories.push(record);
  await db.put('categories', record);
  return record;
}

export async function deleteCategory(id) {
  const inUse = (_exercises || []).some(e => e.category === id);
  if (inUse) throw new Error('Категория содержит упражнения');
  _categories = (_categories || []).filter(c => c.id !== id);
  await db.del('categories', id);
}

export async function replaceAll({ categories = [], exercises = [] }) {
  await db.clear('categories');
  if (categories.length > 0) await db.putMany('categories', categories);
  await db.clear('exercises');
  if (exercises.length > 0) await db.putMany('exercises', exercises);
  _categories = await db.getAll('categories');
  _exercises = await db.getAll('exercises');
}

/** Сброс кэша в памяти (полный reset): следующий init() перезасеет каталог из SEED. */
export function resetCache() {
  _exercises = null;
  _categories = null;
}