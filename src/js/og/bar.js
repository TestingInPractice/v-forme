/**
 * og/bar.js — раскладка пластин на гриф и округление до шага грифа (A1).
 * Чистые функции.
 */

const BARS = {
  kg: { bar: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25], step: 1.25 },
  lb: { bar: 45, plates: [45, 35, 25, 10, 5, 2.5], step: 2.5 },
};

/** Пластины на одну сторону, крупные -> мелкие; [] при w <= веса грифа. */
export function plateSplit(w, unit) {
  const cfg = BARS[unit] || BARS.kg;
  const weight = Number(w);
  if (!Number.isFinite(weight) || weight <= cfg.bar) return [];
  let rest = (weight - cfg.bar) / 2;
  const out = [];
  for (const p of cfg.plates) {
    while (rest >= p - 1e-9) {
      out.push(p);
      rest -= p;
    }
  }
  return out;
}

/** Округление до шага грифа (не ниже веса грифа). */
export function roundToBar(w, unit) {
  const cfg = BARS[unit] || BARS.kg;
  const weight = Number(w);
  if (!Number.isFinite(weight) || weight <= 0) return cfg.bar;
  return Math.max(cfg.bar, Math.round(weight / cfg.step) * cfg.step);
}