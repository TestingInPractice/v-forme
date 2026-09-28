/**
 * og/format.js — форматирование чисел, времени и русская плюрализация (A1).
 * Чистые функции, без состояния.
 */

/** Число с единицей веса: '60 кг' / '135 lb'. kg — до 2 знаков, lb — целые. */
export function fmtNum(n, unit) {
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  const u = unit === 'lb' ? 'lb' : 'кг';
  const v = unit === 'lb' ? Math.round(num) : Math.round(num * 100) / 100;
  return `${v} ${u}`;
}

/** Секунды -> 'M:SS'. */
export function fmtClock(sec) {
  const total = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Русская плюрализация: plural(3, ['раз','раза','раз']) -> '3 раза'.
 * Поддерживает и форму с отдельными аргументами: plural(3, 'раз', 'раза', 'раз').
 */
export function plural(n, forms) {
  const args = Array.isArray(forms) ? forms : Array.from(arguments).slice(1);
  const one = args[0] || '';
  const few = args[1] || one;
  const many = args[2] || few;
  const v = Math.abs(Math.round(Number(n) || 0));
  const mod10 = v % 10;
  const mod100 = v % 100;
  let form;
  if (mod10 === 1 && mod100 !== 11) form = one;
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = few;
  else form = many;
  return `${v} ${form}`;
}