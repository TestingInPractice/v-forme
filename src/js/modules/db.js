/**
 * IndexedDB promise-based helper.
 * Stores: 'history' (keyPath 'id'), 'settings' (keyPath 'key'), 'plans' (keyPath 'id').
 */

const DB_NAME = 'fitnessApp';
const DB_VERSION = 2;

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('history')) {
        db.createObjectStore('history', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('plans')) {
        db.createObjectStore('plans', { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

async function _getStore(storeName, mode = 'readonly') {
  const db = await open();
  const tx = db.transaction(storeName, mode);
  return tx.objectStore(storeName);
}

function _promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const store = await _getStore(storeName);
  return _promisify(store.getAll());
}

export async function get(storeName, key) {
  const store = await _getStore(storeName);
  return _promisify(store.get(key));
}

export async function put(storeName, value) {
  const store = await _getStore(storeName, 'readwrite');
  return _promisify(store.put(value));
}

export async function del(storeName, key) {
  const store = await _getStore(storeName, 'readwrite');
  return _promisify(store.delete(key));
}

export async function clear(storeName) {
  const store = await _getStore(storeName, 'readwrite');
  return _promisify(store.clear());
}
