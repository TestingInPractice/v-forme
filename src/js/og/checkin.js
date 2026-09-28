/**
 * og/checkin.js — данные чекина (генерация/валидация payload) + журнал событий.
 *
 * Формат payload (v=1): { v, ts, uid, name, unit, gym, sig }.
 *   v   — версия схемы (1),
 *   ts  — время генерации (ms),
 *   uid — стабильный идентификатор профиля (profile.uid, см. ensureProfileUid),
 *   name/unit/gym — профиль владельца,
 *   sig — контрольная FNV-1a(32) от канонических полей (целостность/антиопечатка).
 *
 * ПРИМЕЧАНИЕ: sig — это контрольная сумма, а НЕ криптоподпись: приложение офлайновое,
 * общего секрета между владельцем и сканером нет (принцип openGym: секрет не лежит
 * в синкаемом состоянии). sig ловит случайную порчу/опечатку, не злонамеренную подделку.
 *
 * Событие чекина: recordCheckin(S, parsed) — чистая запись в S.checkins
 * (журнал посещений). Экран вызывает её через store.update при успешном сканировании.
 */

import { now, uid, dayKey } from './store.js';

export const CHECKIN_V = 1;

/** Гарантировать profile.uid: чистая функция, возвращает S-копию с заполненным uid. */
export function ensureProfileUid(S) {
  const profile = { ...(S && S.profile ? S.profile : {}) };
  if (!profile.uid) profile.uid = uid('u');
  return { ...S, profile };
}

/** FNV-1a 32-bit от канонических полей payload (без sig). */
export function sigOf(fields) {
  const canonical = JSON.stringify({
    v: fields && fields.v,
    ts: fields && fields.ts,
    uid: fields && fields.uid,
    name: fields && fields.name,
    unit: fields && fields.unit,
    gym: fields && fields.gym,
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Строка-пайлоад QR чекина (JSON). Профиль берётся из S; изготовление через store.update(ensureProfileUid). */
export function buildCheckinPayload(S) {
  const profile = ensureProfileUid(S).profile;
  const fields = {
    v: CHECKIN_V,
    ts: now(S),
    uid: profile.uid || '',
    name: profile.name ? String(profile.name) : 'Тренажёр',
    unit: profile.unit ? String(profile.unit) : '',
    gym: profile.gym ? String(profile.gym) : 'Зал',
  };
  fields.sig = sigOf(fields);
  return JSON.stringify(fields);
}

/** Разбор и валидация пайлоада: v=1 + корректный sig; legacy-пайлоад ({name,unit,gym}) без v принимается. */
export function parseCheckinPayload(text) {
  if (typeof text !== 'string') return null;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (err) {
    return null;
  }
  if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.name === 'string') {
    if (obj.v === undefined) return obj; // legacy (до v1): обратная совместимость
    if (obj.v !== CHECKIN_V) return null; // неизвестная версия схемы
    if (typeof obj.sig !== 'string' || sigOf(obj) !== obj.sig) return null; // подпись не сошлась
    return obj;
  }
  return null;
}

/** Чистая запись события чекина в журнал S.checkins (экран сохраняет через store.update). */
export function recordCheckin(S, parsed) {
  const ts = now(S);
  const ev = {
    id: uid('ci'),
    ts,
    d: dayKey(ts),
    uid: parsed && typeof parsed.uid === 'string' ? parsed.uid : '',
    name: parsed && typeof parsed.name === 'string' ? String(parsed.name) : '',
    gym: parsed && typeof parsed.gym === 'string' ? String(parsed.gym) : '',
  };
  return { ...S, checkins: [...((S && S.checkins) || []), ev] };
}