/**
 * og/sound.js — звук и вибрация таймера отдыха (A1).
 * Ленивый AudioContext; все операции в try/catch с console.warn (без пустых catch).
 */

let ctx = null;

function audio() {
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    } catch (err) {
      console.warn('og: AudioContext недоступен', err);
    }
  }
  return ctx;
}

function beep(freq, durMs, gainVal, when) {
  const ac = audio();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + (when || 0);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainVal, t0 + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.02);
  } catch (err) {
    console.warn('og: beep', err);
  }
}

/** Разблокировать аудио по жесту пользователя. */
export function unlockAudio() {
  const ac = audio();
  if (!ac) return;
  try {
    if (ac.state === 'suspended') ac.resume();
  } catch (err) {
    console.warn('og: unlockAudio', err);
  }
}

/** Сигнал конца отдыха: двойной бип (880 затем 1320 Гц). */
export function restEndSound() {
  beep(880, 120, 0.25, 0);
  beep(1320, 160, 0.25, 0.18);
}

/** Тик отдыха: 3 -> 880, 2 -> 660, 1 -> 440 Гц. */
export function restTickSound(secLeft) {
  const freq = secLeft >= 3 ? 880 : secLeft === 2 ? 660 : 440;
  beep(freq, 100, 0.15, 0);
}

/** Вибрация (если поддерживается). */
export function vibrate(pattern) {
  try {
    if (navigator.vibrate) navigator.vibrate(pattern || [200, 100, 200]);
  } catch (err) {
    console.warn('og: vibrate', err);
  }
}