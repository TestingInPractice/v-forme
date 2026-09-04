/**
 * History module — save and retrieve workout records.
 */
import * as db from './db.js';

const STORE = 'history';

export async function save(record) {
  // Ensure id
  if (!record.id) {
    record.id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  await db.put(STORE, record);
  return record;
}

export async function getAll() {
  return db.getAll(STORE);
}

export async function getById(id) {
  return db.get(STORE, id);
}

export async function remove(id) {
  return db.del(STORE, id);
}

export async function getByDate(dateStr) {
  const all = await db.getAll(STORE);
  return all.filter(r => r.date.startsWith(dateStr));
}

/** Group records by date (YYYY-MM-DD), most recent first. */
export async function getGroupedByDate() {
  const all = await db.getAll(STORE);
  all.sort((a, b) => new Date(b.date) - new Date(a.date));

  const groups = {};
  for (const record of all) {
    const dateKey = record.date.slice(0, 10);
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(record);
  }
  return groups;
}

/** Format date for Russian display. */
export function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Format duration seconds to MM:SS or HH:MM:SS. */
export function formatDuration(sec) {
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
