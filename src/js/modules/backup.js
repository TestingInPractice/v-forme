/**
 * Backup module — export/import app data as JSON files.
 */
import * as db from './db.js';
import * as history from './history.js';
import * as plans from './plans.js';
import * as settings from './settings.js';
import * as catalog from './catalog.js';

export class BackupError extends Error {}

export const VERSION = 1;

/** GIF-блобы в базовый base64-dataURL для JSON. */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** Обрезать запись упражнения до JSON-безопасной формы (без Blob). */
async function serializeExercise(ex) {
  const { gifBlob, ...rest } = ex;
  return { ...rest, gifBase64: gifBlob ? await blobToBase64(gifBlob) : null };
}

function base64ToBlob(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const bin = atob(match[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

export async function buildAppExport() {
  const [historyRecords, settingsPairs, planRecords, categories, exercises] = await Promise.all([
    history.getAll(),
    db.getAll('settings'),
    plans.getAll(),
    catalog.getCategories(),
    Promise.all(catalog.getExercises().map(serializeExercise)),
  ]);
  return {
    version: VERSION,
    exportedAt: new Date().toISOString(),
    type: 'app',
    history: historyRecords,
    settings: settingsPairs,
    plans: planRecords,
    categories,
    exercises,
  };
}

export function exportRecordJson(type, record) {
  return { version: VERSION, exportedAt: new Date().toISOString(), type, record };
}

export function downloadJson(json, filename) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const isValidHistoryRecord = (r) =>
  typeof r === 'object' && r !== null &&
  typeof r.id === 'string' && r.id.length > 0 &&
  typeof r.date === 'string' && !isNaN(new Date(r.date).getTime()) &&
  Array.isArray(r.exercises);

const isValidPlan = (p) =>
  typeof p === 'object' && p !== null &&
  typeof p.id === 'string' && p.id.length > 0 &&
  Array.isArray(p.items);

const isValidSettingsItem = (s) =>
  typeof s === 'object' && s !== null && typeof s.key === 'string';

function plural(n, forms) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return forms[1];
  return forms[2];
}

function dedupById(items) {
  const map = new Map();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

export function parseImport(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupError('Файл повреждён или это не JSON');
  }
  if (typeof raw !== 'object' || raw === null) throw new BackupError('Неверный формат файла');
  if (raw.version !== VERSION) {
    throw new BackupError(`Неподдерживаемая версия бэкапа: ${String(raw.version)}. Ожидается ${VERSION}`);
  }
  if (!raw.type) throw new BackupError('Неизвестный тип файла');

  if (raw.type === 'app') {
    const { history: h, settings: s, plans: p, categories: c, exercises: e } = raw;
    if (!Array.isArray(h) || !Array.isArray(s) || !Array.isArray(p)) {
      throw new BackupError('В файле нет данных приложения');
    }
    if (!h.every(isValidHistoryRecord) || !p.every(isValidPlan) || !s.every(isValidSettingsItem)) {
      throw new BackupError('Структура файла не соответствует формату бэкапа');
    }

    // Каталог опционален: секции есть только в новых бэкапах. null → не трогать при импорте.
    let categories = null;
    let exercises = null;
    if (c !== undefined || e !== undefined) {
      const catOk = Array.isArray(c) && c.every(x => x && typeof x.id === 'string' && typeof x.name === 'string');
      const exOk = Array.isArray(e) && e.every(x => x && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.category === 'string');
      if (!catOk || !exOk) {
        throw new BackupError('Структура файла не соответствует формату бэкапа');
      }
      categories = c;
      exercises = e;
    }

    const data = { history: dedupById(h), settings: s, plans: dedupById(p), categories, exercises };
    let summary =
      `Импорт: ${data.history.length} ${plural(data.history.length, ['запись', 'записи', 'записей'])} истории, ` +
      `${data.plans.length} ${plural(data.plans.length, ['план', 'плана', 'планов'])}, ` +
      `${data.settings.length} ${plural(data.settings.length, ['настройка', 'настройки', 'настроек'])}`;
    if (categories) {
      summary +=
        `, ${exercises.length} ${plural(exercises.length, ['упражнение', 'упражнения', 'упражнений'])}, ` +
        `${categories.length} ${plural(categories.length, ['категория', 'категории', 'категорий'])}`;
    }
    summary += '. Записи с совпадающими id будут перезаписаны. Продолжить?';
    return { type: 'app', data, summary };
  }

  if (raw.type === 'history') {
    const record = raw.record;
    if (!isValidHistoryRecord(record)) {
      throw new BackupError('Структура файла не соответствует формату бэкапа');
    }
    const summary =
      `Импорт записи «${record.title ?? ''}» от ${record.date.slice(0, 10)}. ` +
      'Существующая запись с тем же id будет перезаписана. Продолжить?';
    return { type: 'history', data: record, summary };
  }

  if (raw.type === 'plan') {
    const record = raw.record;
    if (!isValidPlan(record)) {
      throw new BackupError('Структура файла не соответствует формату бэкапа');
    }
    const summary =
      `Импорт плана «${record.title ?? ''}». ` +
      'Существующий план с тем же id будет перезаписан. Продолжить?';
    return { type: 'plan', data: record, summary };
  }

  throw new BackupError('Неизвестный тип файла');
}

export async function applyImport(parsed) {
  try {
    if (parsed.type === 'app') {
      await db.putMany('history', parsed.data.history);
      await db.putMany('plans', parsed.data.plans);
      for (const item of parsed.data.settings) {
        await settings.set(item.key, item.value);
      }
      if (parsed.data.categories && parsed.data.exercises) {
        await catalog.replaceAll({
          categories: parsed.data.categories,
          exercises: parsed.data.exercises.map(ex => {
            const { gifBase64, ...rest } = ex;
            return { ...rest, gifBlob: base64ToBlob(gifBase64) };
          }),
        });
      }
    } else if (parsed.type === 'history') {
      await db.putMany('history', [parsed.data]);
    } else if (parsed.type === 'plan') {
      await db.putMany('plans', [parsed.data]);
    }
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      throw new BackupError('Недостаточно места в хранилище браузера');
    }
    throw err;
  }
}

export function backupFilename(type, id) {
  const date = new Date().toISOString().slice(0, 10);
  if (type === 'app') return `fitness-backup-${date}.json`;
  return id ? `fitness-item-${date}-${id}.json` : `fitness-item-${date}.json`;
}