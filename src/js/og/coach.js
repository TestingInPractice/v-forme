/**
 * og/coach.js — AI-коуч BYOK (порт lib/coach.js, урезанно: клиент + валидация).
 *
 * Чистая логика: CHANGE_TYPES, validateProposal, applyProposal, снапшоты, лог,
 * buildPromptPayload. Единственная функция с побочным эффектом — generateProposal
 * (fetch к провайдеру). Импортирует ТОЛЬКО ./store.js. Без DOM.
 */

import { uid, now, update } from './store.js';

export const MAX_INC = 50;
export const CONSENT_VERSION = 1;
export const SNAPSHOT_MAX = 3;
export const LOG_MAX = 50;

/**
 * 17 допустимых типов правок. `fields` — доп. поля сверх общих
 * {type, rid, exId, field, value, note, week, day}.
 */
export const CHANGE_TYPES = [
  { type: 'add_exercise', label: 'Добавить упражнение', fields: ['name', 'mode', 'sets', 'reps', 'repsMin', 'weight', 'sec', 'dist', 'restSec', 'warmupRestSec', 'inc', 'sg', 'intensifier', 'index'] },
  { type: 'remove_exercise', label: 'Убрать упражнение', fields: [] },
  { type: 'reorder_exercise', label: 'Изменить порядок', fields: ['index'] },
  { type: 'set_sets', label: 'Изменить подходы', fields: [] },
  { type: 'set_reps', label: 'Изменить повторы', fields: [] },
  { type: 'set_reps_range', label: 'Диапазон повторов', fields: [] },
  { type: 'set_weight', label: 'Изменить вес', fields: [] },
  { type: 'set_rest', label: 'Изменить отдых', fields: [] },
  { type: 'set_mode', label: 'Изменить режим', fields: [] },
  { type: 'set_sec', label: 'Изменить время', fields: [] },
  { type: 'set_dist', label: 'Изменить дистанцию', fields: [] },
  { type: 'set_superset', label: 'Изменить суперсет', fields: [] },
  { type: 'set_intensifier', label: 'Изменить интенсификатор', fields: [] },
  { type: 'set_warmup', label: 'Изменить разминочный отдых', fields: [] },
  { type: 'set_inc', label: 'Изменить шаг инкремента', fields: [] },
  { type: 'set_exclude_progression', label: 'Исключить из прогрессии', fields: [] },
  { type: 'set_routine_rest', label: 'Изменить отдых рутины', fields: [] },
];

const COMMON_KEYS = ['type', 'rid', 'exId', 'field', 'value', 'note', 'week', 'day'];
const MODES = ['reps', 'time', 'cardio'];
const INTENSIFIERS = ['drop', 'burst', 'ramp'];

/** Какой числовой field itemCfg меняет тип правки. */
const FIELD_BY_TYPE = {
  set_sets: 'sets',
  set_reps: 'reps',
  set_weight: 'weight',
  set_rest: 'restSec',
  set_sec: 'sec',
  set_dist: 'dist',
  set_warmup: 'warmupRestSec',
  set_inc: 'inc',
};

/** Типы, которые ссылаются на конкретное упражнение внутри рутины. */
const ITEM_LEVEL_TYPES = new Set([
  'remove_exercise', 'reorder_exercise', 'set_sets', 'set_reps', 'set_reps_range',
  'set_weight', 'set_rest', 'set_mode', 'set_sec', 'set_dist', 'set_superset',
  'set_intensifier', 'set_warmup', 'set_inc',
]);

// ─────────────────────────── helpers ───────────────────────────

/** Нормализованный coach-блок состояния (snapshots + log). */
function ensureCoach(S) {
  const c = S && S.coach && typeof S.coach === 'object' ? S.coach : {};
  return {
    snapshots: Array.isArray(c.snapshots) ? c.snapshots : [],
    log: Array.isArray(c.log) ? c.log : [],
  };
}

function appendLog(log, entry) {
  const next = [...log, entry];
  if (next.length > LOG_MAX) next.splice(0, next.length - LOG_MAX);
  return next;
}

function plural(n, forms) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// ─────────────────────────── validateProposal ───────────────────────────

/**
 * Строгая валидация предложения LLM.
 * Возвращает ВСЕ ошибки, а не первую.
 * proposal = { intent, changes: [{ type, rid, exId?, value, ... }] }
 */
export function validateProposal(proposal, S) {
  const errors = [];
  const state = S || {};
  if (!proposal || typeof proposal !== 'object') {
    return { ok: false, errors: ['Предложение не является объектом'] };
  }
  if (typeof proposal.intent !== 'string') {
    errors.push('Отсутствует intent (строка)');
  }
  if (!Array.isArray(proposal.changes)) {
    errors.push('Отсутствует changes (массив)');
    return { ok: false, errors };
  }
  if (proposal.changes.length === 0) {
    errors.push('Предложение не содержит изменений');
  }

  proposal.changes.forEach((ch, i) => {
    const prefix = `Правка #${i + 1}: `;
    if (!ch || typeof ch !== 'object') {
      errors.push(prefix + 'не объект');
      return;
    }

    // 1. Тип из белого списка.
    const typeDef = CHANGE_TYPES.find((td) => td.type === ch.type);
    if (!typeDef) {
      errors.push(prefix + (ch.type ? `неизвестный тип правки «${ch.type}»` : 'отсутствует тип правки'));
      return;
    }

    // 2. Нет неизвестных полей.
    const allowed = new Set([...COMMON_KEYS, ...typeDef.fields]);
    for (const key of Object.keys(ch)) {
      if (!allowed.has(key)) errors.push(prefix + `неизвестное поле «${key}»`);
    }
    if (ch.field != null && typeof ch.field !== 'string') {
      errors.push(prefix + 'поле «field» должно быть строкой');
    }

    // 3. rid обязателен и существует.
    if (ch.rid == null) {
      errors.push(prefix + 'отсутствует rid');
    } else {
      const routine = state.routines ? state.routines.find((r) => r.id === ch.rid) : null;
      if (!routine) {
        errors.push(prefix + `рутина не найдена: ${ch.rid}`);
      } else if (ITEM_LEVEL_TYPES.has(ch.type)) {
        // 4. exId обязателен и существует в целевой рутине.
        if (ch.exId == null) {
          errors.push(prefix + 'отсутствует exId');
        } else if (!(routine.items || []).some((it) => it.id === ch.exId)) {
          errors.push(prefix + `упражнение не найдено в рутине: ${ch.exId}`);
        }
      }
    }

    // 5. Неделя/день в допустимых диапазонах (если присутствуют).
    if (ch.week != null && (!Number.isInteger(ch.week) || ch.week < 0 || ch.week > 52)) {
      errors.push(prefix + `неделя вне диапазона: ${ch.week}`);
    }
    if (ch.day != null && (!Number.isInteger(ch.day) || ch.day < 0 || ch.day > 6)) {
      errors.push(prefix + `день вне диапазона: ${ch.day}`);
    }

    // 6. Значения по типу.
    validateValue(ch, typeDef, state, errors, prefix);
  });

  return { ok: errors.length === 0, errors };
}

function validateValue(ch, typeDef, S, errors, prefix) {
  const routine = S.routines ? S.routines.find((r) => r.id === ch.rid) : null;
  const item = routine ? (routine.items || []).find((it) => it.id === ch.exId) : null;

  switch (ch.type) {
    case 'add_exercise': {
      if (typeof ch.exId !== 'string' || !ch.exId.trim()) errors.push(prefix + 'exId обязателен (строка)');
      if (typeof ch.name !== 'string' || !ch.name.trim()) errors.push(prefix + 'name обязателен (строка)');
      if (ch.mode != null && !MODES.includes(ch.mode)) errors.push(prefix + `недопустимый режим: ${ch.mode}`);
      checkNum(ch, 'sets', errors, prefix, true);
      checkNum(ch, 'reps', errors, prefix, true);
      checkNum(ch, 'repsMin', errors, prefix, true);
      checkNum(ch, 'weight', errors, prefix, false);
      checkNum(ch, 'sec', errors, prefix, false);
      checkNum(ch, 'dist', errors, prefix, false);
      checkNum(ch, 'restSec', errors, prefix, false);
      checkNum(ch, 'warmupRestSec', errors, prefix, false);
      checkNum(ch, 'inc', errors, prefix, false);
      if (ch.intensifier != null && !INTENSIFIERS.includes(ch.intensifier)) {
        errors.push(prefix + `недопустимый интенсификатор: ${ch.intensifier}`);
      }
      if (ch.index != null && !Number.isInteger(ch.index)) errors.push(prefix + 'index должен быть целым числом');
      break;
    }
    case 'remove_exercise':
      break;
    case 'reorder_exercise': {
      if (!Number.isInteger(ch.index)) errors.push(prefix + 'index обязателен (целое число)');
      break;
    }
    case 'set_sets':
    case 'set_reps': {
      if (!isNum(ch.value) || ch.value <= 0) {
        errors.push(prefix + 'value должно быть положительным числом');
      } else {
        checkMaxInc(ch.value, item ? item[FIELD_BY_TYPE[ch.type]] : null, FIELD_BY_TYPE[ch.type], errors, prefix);
      }
      break;
    }
    case 'set_reps_range': {
      const v = ch.value;
      if (!v || typeof v !== 'object' || !isNum(v.reps) || !isNum(v.repsMin)) {
        errors.push(prefix + 'value должен быть объектом {reps, repsMin}');
      } else {
        if (v.reps <= 0 || v.repsMin <= 0) errors.push(prefix + 'reps/repsMin должны быть положительными');
        if (v.repsMin > v.reps) errors.push(prefix + 'repsMin не может быть больше reps');
        checkMaxInc(v.reps, item ? item.reps : null, 'reps', errors, prefix);
        checkMaxInc(v.repsMin, item ? (item.repsMin ?? item.reps) : null, 'repsMin', errors, prefix);
      }
      break;
    }
    case 'set_weight':
    case 'set_rest':
    case 'set_sec':
    case 'set_dist':
    case 'set_warmup': {
      if (!isNum(ch.value) || ch.value < 0) {
        errors.push(prefix + 'value должно быть неотрицательным числом');
      } else {
        checkMaxInc(ch.value, item ? item[FIELD_BY_TYPE[ch.type]] : null, FIELD_BY_TYPE[ch.type], errors, prefix);
      }
      break;
    }
    case 'set_inc': {
      if (!isNum(ch.value) || ch.value <= 0) {
        errors.push(prefix + 'value должно быть положительным числом');
      } else {
        checkMaxInc(ch.value, item ? item.inc : null, 'inc', errors, prefix);
      }
      break;
    }
    case 'set_routine_rest': {
      if (!isNum(ch.value) || ch.value < 0) {
        errors.push(prefix + 'value должно быть неотрицательным числом');
      } else {
        checkMaxInc(ch.value, routine ? routine.restSec : null, 'restSec', errors, prefix);
      }
      break;
    }
    case 'set_mode': {
      if (!MODES.includes(ch.value)) errors.push(prefix + `недопустимый режим: ${ch.value}`);
      break;
    }
    case 'set_superset': {
      if (ch.value != null && typeof ch.value !== 'string') {
        errors.push(prefix + 'value должен быть строкой (id группы) или null');
      }
      break;
    }
    case 'set_intensifier': {
      if (ch.value != null && !INTENSIFIERS.includes(ch.value)) {
        errors.push(prefix + `недопустимый интенсификатор: ${ch.value}`);
      }
      break;
    }
    case 'set_exclude_progression': {
      if (typeof ch.value !== 'boolean') errors.push(prefix + 'value должен быть true/false');
      break;
    }
    default:
      // Недостижимо: тип уже проверен по CHANGE_TYPES.
      break;
  }
}

function checkNum(ch, key, errors, prefix, positive) {
  const v = ch[key];
  if (v == null) return;
  if (!isNum(v)) {
    errors.push(prefix + `поле «${key}» должно быть числом`);
  } else if (positive && v <= 0) {
    errors.push(prefix + `поле «${key}» должно быть положительным`);
  } else if (!positive && v < 0) {
    errors.push(prefix + `поле «${key}» не может быть отрицательным`);
  }
}

/** Лимит MAX_INC% вверх/вниз от текущего значения (null/0 = нет базиса). */
function checkMaxInc(value, current, field, errors, prefix) {
  if (current == null || current === 0) return;
  const pct = Math.abs(value - current) / current;
  if (pct > MAX_INC / 100) {
    errors.push(prefix + `изменение «${field}» выходит за лимит ±${MAX_INC}% (${current} → ${value})`);
  }
}

// ─────────────────────────── applyProposal / снапшоты ───────────────────────────

/**
 * Применить предложение: снапшот рутин (до SNAPSHOT_MAX), правки, запись в лог.
 * Возвращает новое состояние через store.update.
 */
export function applyProposal(S, proposal) {
  return update((prev) => {
    const c = ensureCoach(prev);
    const snapshots = [...c.snapshots, JSON.parse(JSON.stringify(prev.routines))];
    if (snapshots.length > SNAPSHOT_MAX) snapshots.splice(0, snapshots.length - SNAPSHOT_MAX);

    const routines = JSON.parse(JSON.stringify(prev.routines));
    for (const ch of (proposal && proposal.changes) || []) {
      if (!ch || typeof ch !== 'object') continue;
      const routine = routines.find((r) => r.id === ch.rid);
      applyChange(routine, ch);
    }

    const log = appendLog(c.log, {
      ts: now(prev),
      task: (proposal && proposal.intent) || '',
      action: 'apply',
      summary: summarize(prev, proposal),
    });
    return { ...prev, routines, coach: { snapshots, log } };
  });
}

/** Снапшот рутин (стек, максимум SNAPSHOT_MAX). */
export function snapshotPush(S) {
  return update((prev) => {
    const c = ensureCoach(prev);
    const snapshots = [...c.snapshots, JSON.parse(JSON.stringify(prev.routines))];
    if (snapshots.length > SNAPSHOT_MAX) snapshots.splice(0, snapshots.length - SNAPSHOT_MAX);
    return { ...prev, coach: { ...c, snapshots } };
  });
}

/** Откат: восстановить рутины из верхнего снапшота + запись в лог. */
export function snapshotPop(S) {
  return update((prev) => {
    const c = ensureCoach(prev);
    if (!c.snapshots.length) return prev;
    const snapshots = c.snapshots.slice(0, -1);
    const routines = c.snapshots[c.snapshots.length - 1];
    const log = appendLog(c.log, {
      ts: now(prev),
      task: 'revert',
      action: 'revert',
      summary: 'Откат к предыдущему состоянию',
    });
    return { ...prev, routines, coach: { snapshots, log } };
  });
}

function applyChange(routine, ch) {
  if (!routine) return;
  const idx = () => (routine.items || []).findIndex((it) => it.id === ch.exId);

  switch (ch.type) {
    case 'add_exercise': {
      const item = {
        id: ch.exId,
        name: ch.name || ch.exId,
        type: ch.mode || 'reps',
        sets: isNum(ch.sets) ? ch.sets : 3,
        reps: isNum(ch.reps) ? ch.reps : 10,
        repsMin: ch.repsMin ?? null,
        weight: ch.weight ?? null,
        sec: ch.sec ?? null,
        dist: ch.dist ?? null,
        restSec: ch.restSec ?? null,
        warmupRestSec: ch.warmupRestSec ?? null,
        inc: ch.inc ?? null,
        sg: ch.sg === 'new' ? uid('sg') : (ch.sg ?? null),
        intensifier: ch.intensifier ?? null,
      };
      const at = Number.isInteger(ch.index) && ch.index >= 0 && ch.index <= routine.items.length
        ? ch.index
        : routine.items.length;
      routine.items.splice(at, 0, item);
      break;
    }
    case 'remove_exercise': {
      const i = idx();
      if (i !== -1) routine.items.splice(i, 1);
      break;
    }
    case 'reorder_exercise': {
      const i = idx();
      if (i === -1) break;
      const [it] = routine.items.splice(i, 1);
      const to = Math.min(Math.max(Number.isInteger(ch.index) ? ch.index : i, 0), routine.items.length);
      routine.items.splice(to, 0, it);
      break;
    }
    case 'set_sets':
    case 'set_reps':
    case 'set_weight':
    case 'set_rest':
    case 'set_sec':
    case 'set_dist':
    case 'set_warmup':
    case 'set_inc': {
      const i = idx();
      if (i === -1) break;
      routine.items[i][FIELD_BY_TYPE[ch.type]] = ch.value;
      break;
    }
    case 'set_reps_range': {
      const i = idx();
      if (i === -1) break;
      routine.items[i].reps = ch.value.reps;
      routine.items[i].repsMin = ch.value.repsMin;
      break;
    }
    case 'set_mode': {
      const i = idx();
      if (i === -1) break;
      routine.items[i].type = ch.value;
      break;
    }
    case 'set_superset': {
      const i = idx();
      if (i === -1) break;
      routine.items[i].sg = ch.value ?? null;
      break;
    }
    case 'set_intensifier': {
      const i = idx();
      if (i === -1) break;
      routine.items[i].intensifier = ch.value ?? null;
      break;
    }
    case 'set_exclude_progression': {
      routine.excludeFromProgression = !!ch.value;
      break;
    }
    case 'set_routine_rest': {
      routine.restSec = ch.value;
      break;
    }
    default:
      break;
  }
}

/** Короткое русское резюме правок для лога. */
function summarize(S, proposal) {
  const state = S || {};
  const changes = (proposal && proposal.changes) || [];
  const parts = changes.map((ch) => {
    const routine = state.routines ? state.routines.find((r) => r.id === ch.rid) : null;
    const item = routine ? (routine.items || []).find((it) => it.id === ch.exId) : null;
    const name = (item && item.name) || ch.name || ch.exId || '—';
    switch (ch.type) {
      case 'add_exercise': return `+${ch.name || ch.exId}`;
      case 'remove_exercise': return `−${name}`;
      case 'reorder_exercise': return `${name} → позиция ${ch.index}`;
      case 'set_sets': return `${name}: подходы ${item ? item.sets : '?'}→${ch.value}`;
      case 'set_reps': return `${name}: повторы ${item ? item.reps : '?'}→${ch.value}`;
      case 'set_reps_range': return `${name}: диапазон ${ch.value ? ch.value.repsMin : '?'}–${ch.value ? ch.value.reps : '?'}`;
      case 'set_weight': return `${name}: вес ${item ? item.weight : '?'}→${ch.value}`;
      case 'set_rest': return `${name}: отдых ${item ? item.restSec : '?'}→${ch.value}`;
      case 'set_mode': return `${name}: режим ${item ? item.type : '?'}→${ch.value}`;
      case 'set_sec': return `${name}: время ${item ? item.sec : '?'}→${ch.value}`;
      case 'set_dist': return `${name}: дистанция ${item ? item.dist : '?'}→${ch.value}`;
      case 'set_superset': return `${name}: суперсет ${item ? item.sg : '?'}→${ch.value ?? '—'}`;
      case 'set_intensifier': return `${name}: интенсификатор ${item ? item.intensifier : '?'}→${ch.value ?? '—'}`;
      case 'set_warmup': return `${name}: разминка ${item ? item.warmupRestSec : '?'}→${ch.value}`;
      case 'set_inc': return `${name}: шаг ${item ? item.inc : '?'}→${ch.value}`;
      case 'set_exclude_progression': return `прогрессия: ${ch.value ? 'выкл' : 'вкл'}`;
      case 'set_routine_rest': return `отдых рутины: ${routine ? routine.restSec : '?'}→${ch.value}`;
      default: return ch.type;
    }
  });
  return `${parts.length} ${plural(parts.length, ['правка', 'правки', 'правок'])}: ${parts.join('; ')}`;
}

// ─────────────────────────── buildPromptPayload ───────────────────────────

/**
 * Компактный JSON-дайджест состояния для LLM.
 * Ключи — английские, значения — числа. Без ключей API и личных данных.
 */
export function buildPromptPayload(S) {
  const state = S || {};
  const profile = state.profile || {};
  const payload = {
    contract: 1,
    week: state.week || 0,
    profile: {
      unit: profile.unit || 'kg',
      effort: profile.effort || 'rir',
      restSec: profile.restSec ?? 90,
      bodyWeight: profile.bodyWeight ?? null,
    },
    routines: (state.routines || []).map((r) => ({
      id: r.id,
      name: r.name,
      excludeFromProgression: !!r.excludeFromProgression,
      restSec: r.restSec ?? null,
      items: (r.items || []).map((it) => ({
        id: it.id,
        name: it.name,
        mode: it.type || 'reps',
        sets: it.sets ?? null,
        reps: it.reps ?? null,
        repsMin: it.repsMin ?? null,
        weight: it.weight ?? null,
        sec: it.sec ?? null,
        dist: it.dist ?? null,
        restSec: it.restSec ?? null,
        warmupRestSec: it.warmupRestSec ?? null,
        inc: it.inc ?? null,
        sg: it.sg ?? null,
        intensifier: it.intensifier ?? null,
      })),
    })),
    workouts: (state.workouts || []).slice(-10).map((w) => ({
      d: w.d,
      name: w.name,
      entries: (w.entries || []).map((e) => ({
        id: e.id,
        name: (e.target && e.target.name) || null,
        sets: (e.sets || []).map((s) => ({
          done: !!s.done,
          reps: s.reps ?? null,
          w: s.w ?? null,
          sec: s.sec ?? null,
          dist: s.dist ?? null,
          rir: s.rir ?? null,
          rpe: s.rpe ?? null,
          warmup: !!s.warmup,
        })),
      })),
    })),
  };
  return JSON.stringify(payload);
}

// ─────────────────────────── generateProposal ───────────────────────────

const SYSTEM_PROMPT = `Ты — AI-коуч по силовым тренировкам. Пользователь просит улучшить свой тренировочный план.
Ответь ТОЛЬКО валидным JSON без пояснений и без markdown-разметки, в формате:
{"intent": "краткое описание того, что ты сделал", "changes": [ ... ]}

Каждая правка — объект с полем type (обязательно) и полями по типу:
- add_exercise: добавить упражнение. Поля: rid, exId, name, mode (reps|time|cardio), sets, reps, repsMin, weight, sec, dist, restSec, warmupRestSec, inc, sg, intensifier, index (позиция, необязательно).
- remove_exercise: убрать упражнение. Поля: rid, exId.
- reorder_exercise: изменить порядок. Поля: rid, exId, index (новая позиция).
- set_sets: изменить подходы. Поля: rid, exId, value.
- set_reps: изменить повторы. Поля: rid, exId, value.
- set_reps_range: задать диапазон повторов. Поля: rid, exId, value = {"reps": N, "repsMin": M}.
- set_weight: изменить вес. Поля: rid, exId, value.
- set_rest: изменить отдых (сек). Поля: rid, exId, value.
- set_mode: изменить режим. Поля: rid, exId, value (reps|time|cardio).
- set_sec: изменить время (сек). Поля: rid, exId, value.
- set_dist: изменить дистанцию. Поля: rid, exId, value.
- set_superset: изменить суперсет-группу. Поля: rid, exId, value (id группы или null).
- set_intensifier: изменить интенсификатор. Поля: rid, exId, value (null|drop|burst|ramp).
- set_warmup: изменить разминочный отдых (сек). Поля: rid, exId, value.
- set_inc: изменить шаг инкремента. Поля: rid, exId, value.
- set_exclude_progression: исключить рутину из прогрессии. Поля: rid, value (true|false).
- set_routine_rest: изменить отдых рутины (сек). Поля: rid, value.

Правила:
1. Изменения веса/повторов/подходов/отдыха — не более чем на 50% от текущего значения.
2. Используй только существующие id упражнений из данных (поле id в items рутин).
3. Не выдумывай поля — только перечисленные выше.
4. Не добавляй пояснений вне JSON.`;

const REQUEST_TIMEOUT_MS = 60000;

/** Вытащить JSON из ответа LLM: прямой parse → ```json-фенсы → первый {...}. */
function extractJSON(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (!t) return null;
  try {
    return JSON.parse(t);
  } catch {
    /* пробуем дальше */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* пробуем дальше */
    }
  }
  const start = t.indexOf('{');
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < t.length; i++) {
      const c = t[i];
      if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/** Достать текстовый контент из ответа провайдера (anthropic/openai/compatible). */
function contentOf(body) {
  if (!body || typeof body !== 'object') return null;
  if (Array.isArray(body.content) && typeof body.content[0]?.text === 'string') {
    return body.content[0].text; // anthropic messages
  }
  if (body.choices && Array.isArray(body.choices) && body.choices[0]?.message?.content != null) {
    return body.choices[0].message.content; // openai / compatible
  }
  if (typeof body.response === 'string') return body.response;
  return null;
}

/**
 * Вызвать LLM и вернуть нормализованное предложение.
 * opts: { apiKey, provider: 'anthropic'|'openai'|'compatible', task, baseUrl?, model? }
 * Возврат: { ok, proposal?, raw?, error?, errors? }.
 */
export async function generateProposal(S, opts = {}) {
  const { apiKey, provider, task, baseUrl, model } = opts;
  if (!task || !task.trim()) return { ok: false, error: 'Опишите задачу' };
  if (!apiKey && provider !== 'compatible') return { ok: false, error: 'Введите API-ключ' };

  const userContent = `Задача пользователя: ${task}\n\nДанные тренировок (JSON):\n${buildPromptPayload(S)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let res;
  try {
    if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-5',
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userContent }],
        }),
      });
    } else if (provider === 'openai') {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          max_tokens: 2000,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      });
    } else {
      // compatible (Ollama и др.) — OpenAI-форма тела.
      res = await fetch(baseUrl || 'http://localhost:11434/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: model || 'llama3.1:8b',
          max_tokens: 2000,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
          ],
        }),
      });
    }
  } catch (err) {
    clearTimeout(timer);
    console.error('og/coach: сетевая ошибка', err);
    if (err && err.name === 'AbortError') {
      return { ok: false, error: `Превышено время ожидания ответа (${REQUEST_TIMEOUT_MS / 1000} с)` };
    }
    return { ok: false, error: `Сетевая ошибка: ${(err && err.message) || 'нет соединения'}` };
  }
  clearTimeout(timer);

  let text;
  try {
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: `Ошибка API (${res.status}): ${body.slice(0, 300) || 'нет ответа'}` };
    }
    text = await res.text();
  } catch (err) {
    console.error('og/coach: ошибка чтения ответа', err);
    return { ok: false, error: `Ошибка чтения ответа: ${(err && err.message) || 'неизвестно'}` };
  }

  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* ниже пробуем сырой текст */
  }
  const content = contentOf(body) || text;
  const parsed = extractJSON(content);
  if (!parsed) {
    return { ok: false, error: 'Не удалось разобрать JSON из ответа модели', raw: text };
  }
  if (typeof parsed.intent !== 'string' || !Array.isArray(parsed.changes)) {
    return { ok: false, error: 'Ответ модели не соответствует формату {intent, changes}', raw: text };
  }
  const v = validateProposal(parsed, S);
  if (!v.ok) {
    return { ok: false, errors: v.errors, raw: text };
  }
  return { ok: true, proposal: parsed, raw: text };
}