/**
 * Settings module — reads/writes to IndexedDB 'settings' store.
 * Keys are stored as { key, value } objects.
 */
import * as db from './db.js';

const DEFAULTS = {
  restBetweenSec: 20,
  musicDuckPercent: 90,   // music drops to 10%
  voiceOn: true,
  wakeLockOn: true,
  bodyWeight: 75,
};

let _cache = null;

export async function loadAll() {
  if (_cache) return { ..._cache };
  const stored = await db.getAll('settings');
  _cache = { ...DEFAULTS };
  for (const item of stored) {
    if (item.key in DEFAULTS) _cache[item.key] = item.value;
  }
  return { ..._cache };
}

export async function get(key) {
  if (!_cache) await loadAll();
  return _cache[key];
}

export async function set(key, value) {
  if (!_cache) await loadAll();
  _cache[key] = value;
  await db.put('settings', { key, value });
}

export async function getAll() {
  if (!_cache) await loadAll();
  return { ..._cache };
}
