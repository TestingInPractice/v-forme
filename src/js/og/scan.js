/**
 * og/scan.js — сканирование QR-кодов через BarcodeDetector.
 *
 * Без внешних зависимостей (jsQR не подключаем). Если BarcodeDetector
 * недоступен — onDecode(null) помечает «не поддерживается».
 * Возвращает функцию stop() для остановки цикла и освобождения камеры.
 */

'use strict';

// Поддержка сканирования определяется ТОЛЬКО наличием BarcodeDetector:
// getUserMedia сама по себе не даёт декода (jsQR не подключаем), и раньше
// этот OR приводил к «сканирование доступно», хотя decrypt всё равно падал в unsupported.
export const scanSupported = () =>
  typeof window !== 'undefined' && 'BarcodeDetector' in window;

export async function scanFromVideo(videoEl, { intervalMs = 150, onDecode } = {}) {
  let stopped = false;
  let timer = null;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    if (videoEl && videoEl.srcObject) {
      const stream = videoEl.srcObject;
      if (typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((tr) => tr.stop());
      }
      videoEl.srcObject = null;
    }
  };

  const unsupported = () => {
    if (typeof onDecode === 'function') {
      queueMicrotask(() => {
        if (!stopped) onDecode(null);
      });
    }
    return stop;
  };

  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return unsupported();
  }

  let detector = null;
  try {
    detector = new BarcodeDetector({ formats: ['qr_code'] });
  } catch (err) {
    try {
      detector = new BarcodeDetector();
    } catch (err2) {
      console.error('og/scan: BarcodeDetector недоступен', err2);
      return unsupported();
    }
  }
  if (!detector || typeof detector.detect !== 'function') {
    console.error('og/scan: BarcodeDetector не поддерживает detect()');
    return unsupported();
  }

  timer = setInterval(async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(videoEl);
      if (stopped) return;
      if (codes && codes.length > 0 && codes[0].rawValue) {
        const value = codes[0].rawValue;
        stop();
        if (typeof onDecode === 'function') onDecode(value);
      }
    } catch (err) {
      console.error('og/scan: ошибка детекции', err);
    }
  }, intervalMs);

  return stop;
}