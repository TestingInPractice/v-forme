/**
 * og/qr.js — самодостаточный генератор QR-кодов.
 *
 * Byte mode, версии 1–10, ECC L/M/Q/H. Без внешних зависимостей.
 * Реализация по ISO/IEC 18004; таблицы ECC_PER_BLOCK / NUM_BLOCKS сверены
 * с эталоном Nayuki QR-Code-generator (MIT).
 */

'use strict';

/* ─── Таблицы (индекс = версия 1..10) ─── */

// Кодовых слов ECC на блок
const ECC_PER_BLOCK = {
  L: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [-1, 17, 28, 22, 16, 22, 28, 26, 26, 26, 26],
};

// Количество блоков
const NUM_BLOCKS = {
  L: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

// 2-битный код уровня ECC для format info
const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const MIN_VERSION = 1;
const MAX_VERSION = 10;
const QUIET_ZONE = 4;
const GF_POLY = 0x11d; // x^8 + x^4 + x^3 + x^2 + 1
const FORMAT_GEN = 0x537; // BCH(15,5)
const FORMAT_MASK = 0x5412;
const VERSION_GEN = 0x1f25; // BCH(18,6)

const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

/* ─── Битовые операции ─── */

function _getBit(x, i) {
  return ((x >>> i) & 1) !== 0;
}

function _appendBits(val, len, bits) {
  for (let i = len - 1; i >= 0; i--) {
    bits.push(_getBit(val, i));
  }
}

/* ─── UTF-8 ─── */

function _utf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.codePointAt(i);
    if (c > 0xffff) i++; // суррогатная пара
    if (c < 0x80) {
      bytes.push(c);
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >>> 6), 0x80 | (c & 0x3f));
    } else if (c < 0x10000) {
      bytes.push(0xe0 | (c >>> 12), 0x80 | ((c >>> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      bytes.push(0xf0 | (c >>> 18), 0x80 | ((c >>> 12) & 0x3f), 0x80 | ((c >>> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return bytes;
}

/* ─── Рида–Соломона над GF(256) ─── */

function _gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * GF_POLY);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function _reedSolomonDivisor(degree) {
  const result = new Array(degree - 1).fill(0);
  result.push(1); // стартуем с x^0
  let root = 1; // r = 0x02 — генератор поля GF(2^8/0x11D)
  for (let i = 0; i < degree; i++) {
    // Умножаем текущий полином на (x - r^i)
    for (let j = 0; j < result.length; j++) {
      result[j] = _gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = _gfMul(root, 0x02);
  }
  return result;
}

function _reedSolomonRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < result.length; i++) {
      result[i] ^= _gfMul(divisor[i], factor);
    }
  }
  return result;
}

/* ─── Ёмкости и позиции ─── */

function _numRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function _numDataCodewords(ver, ecc) {
  return Math.floor(_numRawDataModules(ver) / 8) - ECC_PER_BLOCK[ecc][ver] * NUM_BLOCKS[ecc][ver];
}

function _alignmentPositions(ver) {
  if (ver === 1) return [];
  const numAlign = Math.floor(ver / 7) + 2;
  const step = Math.floor((ver * 8 + numAlign * 3 + 5) / (numAlign * 4 - 4)) * 2;
  const result = [6];
  for (let pos = ver * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

/* ─── Данные: режим, паддинг, ECC, перемежение ─── */

function _buildDataCodewords(text, ver, ecc) {
  const data = _utf8Bytes(text);
  const numDataBits = _numDataCodewords(ver, ecc) * 8;
  const bits = [];
  _appendBits(0b0100, 4, bits); // byte mode
  _appendBits(data.length, ver <= 9 ? 8 : 16, bits);
  for (const b of data) _appendBits(b, 8, bits);
  _appendBits(0, Math.min(4, numDataBits - bits.length), bits); // терминатор
  _appendBits(0, (8 - (bits.length % 8)) % 8, bits); // выравнивание до байта
  for (let padByte = 0xec; bits.length < numDataBits; padByte ^= 0xec ^ 0x11) {
    _appendBits(padByte, 8, bits);
  }
  const result = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    result.push(b);
  }
  return result;
}

function _addEccAndInterleave(data, ver, ecc) {
  const numBlocks = NUM_BLOCKS[ecc][ver];
  const blockEccLen = ECC_PER_BLOCK[ecc][ver];
  const rawCodewords = Math.floor(_numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);

  const divisor = _reedSolomonDivisor(blockEccLen);
  const blocks = [];
  let k = 0;
  for (let i = 0; i < numBlocks; i++) {
    const datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
    const dat = data.slice(k, k + datLen);
    k += datLen;
    blocks.push({ data: dat, ecc: _reedSolomonRemainder(dat, divisor) });
  }

  // Перемежение: сначала данные всех блоков (короткие заканчиваются раньше),
  // затем ECC всех блоков. Итог = rawCodewords.
  const result = [];
  const maxDataLen = shortBlockLen - blockEccLen + 1;
  for (let i = 0; i < maxDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < blocks[j].data.length) result.push(blocks[j].data[i]);
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      result.push(blocks[j].ecc[i]);
    }
  }
  return result;
}

/* ─── Функциональные паттерны ─── */

function _setFunction(x, y, isDark, modules, isFunction) {
  modules[y][x] = isDark;
  isFunction[y][x] = true;
}

function _drawFinder(x, y, modules, isFunction) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const xx = x + dx;
      const yy = y + dy;
      if (0 <= xx && xx < modules.length && 0 <= yy && yy < modules.length) {
        _setFunction(xx, yy, dist !== 2 && dist !== 4, modules, isFunction);
      }
    }
  }
}

function _drawAlignment(x, y, modules, isFunction) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      _setFunction(x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, modules, isFunction);
    }
  }
}

function _drawFormatBits(ecc, mask, modules, isFunction) {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * FORMAT_GEN);
  const bits = ((data << 10) | rem) ^ FORMAT_MASK;

  const size = modules.length;
  for (let i = 0; i <= 5; i++) _setFunction(8, i, _getBit(bits, i), modules, isFunction);
  _setFunction(8, 7, _getBit(bits, 6), modules, isFunction);
  _setFunction(8, 8, _getBit(bits, 7), modules, isFunction);
  _setFunction(7, 8, _getBit(bits, 8), modules, isFunction);
  for (let i = 9; i < 15; i++) _setFunction(14 - i, 8, _getBit(bits, i), modules, isFunction);

  for (let i = 0; i < 8; i++) _setFunction(size - 1 - i, 8, _getBit(bits, i), modules, isFunction);
  for (let i = 8; i < 15; i++) _setFunction(8, size - 15 + i, _getBit(bits, i), modules, isFunction);
  _setFunction(8, size - 8, true, modules, isFunction); // тёмный модуль
}

function _drawVersion(ver, modules, isFunction) {
  if (ver < 7) return;
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * VERSION_GEN);
  const bits = (ver << 12) | rem;

  const size = modules.length;
  for (let i = 0; i < 18; i++) {
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    _setFunction(a, b, _getBit(bits, i), modules, isFunction);
    _setFunction(b, a, _getBit(bits, i), modules, isFunction);
  }
}

function _drawFunctionPatterns(ver, ecc, mask, modules, isFunction) {
  const size = modules.length;

  // Тайминг-паттерны
  for (let i = 0; i < size; i++) {
    _setFunction(6, i, i % 2 === 0, modules, isFunction);
    _setFunction(i, 6, i % 2 === 0, modules, isFunction);
  }

  // Три поисковых паттерна (с разделителями)
  _drawFinder(3, 3, modules, isFunction);
  _drawFinder(size - 4, 3, modules, isFunction);
  _drawFinder(3, size - 4, modules, isFunction);

  // Паттерны выравнивания (кроме трёх углов с поисковыми)
  const alignPos = _alignmentPositions(ver);
  const numAlign = alignPos.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if (!(i === 0 && j === 0) && !(i === 0 && j === numAlign - 1) && !(i === numAlign - 1 && j === 0)) {
        _drawAlignment(alignPos[i], alignPos[j], modules, isFunction);
      }
    }
  }

  _drawFormatBits(ecc, mask, modules, isFunction);
  _drawVersion(ver, modules, isFunction);
}

/* ─── Данные в матрицу (зигзаг) ─── */

function _drawCodewords(data, modules, isFunction) {
  const size = modules.length;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5; // пропуск колонки тайминга
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && i < data.length * 8) {
          modules[y][x] = _getBit(data[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
}

/* ─── Маски и штраф ─── */

function _applyMask(mask, modules, isFunction) {
  const size = modules.length;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break;
        case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        case 7: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        default: throw new Error('Недопустимая маска: ' + mask);
      }
      if (!isFunction[y][x] && invert) {
        modules[y][x] = !modules[y][x];
      }
    }
  }
}

function _finderPenaltyAddHistory(currentRunLength, runHistory, size) {
  if (runHistory[0] === 0) currentRunLength += size; // светлая граница начального рана
  runHistory.pop();
  runHistory.unshift(currentRunLength);
}

function _finderPenaltyCountPatterns(runHistory) {
  const n = runHistory[1];
  const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n;
  return ((core && runHistory[0] >= n * 4 && runHistory[6] >= n) ? 1 : 0)
       + ((core && runHistory[6] >= n * 4 && runHistory[0] >= n) ? 1 : 0);
}

function _finderPenaltyTerminateAndCount(currentRunColor, currentRunLength, runHistory, size) {
  if (currentRunColor) {
    _finderPenaltyAddHistory(currentRunLength, runHistory, size);
    currentRunLength = 0;
  }
  currentRunLength += size; // светлая граница финального рана
  _finderPenaltyAddHistory(currentRunLength, runHistory, size);
  return _finderPenaltyCountPatterns(runHistory);
}

function _penaltyScore(modules) {
  const size = modules.length;
  let result = 0;

  // Строки: раны одного цвета + finder-подобные паттерны
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runX = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let x = 0; x < size; x++) {
      if (modules[y][x] === runColor) {
        runX++;
        if (runX === 5) result += PENALTY_N1;
        else if (runX > 5) result++;
      } else {
        _finderPenaltyAddHistory(runX, runHistory, size);
        if (!runColor) result += _finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runX = 1;
      }
    }
    result += _finderPenaltyTerminateAndCount(runColor, runX, runHistory, size) * PENALTY_N3;
  }

  // Колонки: то же
  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runY = 0;
    const runHistory = [0, 0, 0, 0, 0, 0, 0];
    for (let y = 0; y < size; y++) {
      if (modules[y][x] === runColor) {
        runY++;
        if (runY === 5) result += PENALTY_N1;
        else if (runY > 5) result++;
      } else {
        _finderPenaltyAddHistory(runY, runHistory, size);
        if (!runColor) result += _finderPenaltyCountPatterns(runHistory) * PENALTY_N3;
        runColor = modules[y][x];
        runY = 1;
      }
    }
    result += _finderPenaltyTerminateAndCount(runColor, runY, runHistory, size) * PENALTY_N3;
  }

  // Блоки 2×2 одного цвета
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
        result += PENALTY_N2;
      }
    }
  }

  // Баланс тёмных модулей
  let dark = 0;
  for (const row of modules) {
    for (const color of row) {
      if (color) dark++;
    }
  }
  const total = size * size;
  const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
  result += k * PENALTY_N4;
  return result;
}

/* ─── Кодирование ─── */

function _normalizeEcc(ecc) {
  const e = String(ecc).toUpperCase();
  if (e !== 'L' && e !== 'M' && e !== 'Q' && e !== 'H') {
    throw new Error('Неподдерживаемый уровень коррекции: ' + ecc + ' (доступны L, M, Q, H)');
  }
  return e;
}

function _encode(text, ecc) {
  const data = _utf8Bytes(text);
  let best = null;
  for (let ver = MIN_VERSION; ver <= MAX_VERSION; ver++) {
    const capacityBits = _numDataCodewords(ver, ecc) * 8;
    const neededBits = 4 + (ver <= 9 ? 8 : 16) + data.length * 8;
    if (neededBits > capacityBits) continue;
    const allCodewords = _addEccAndInterleave(_buildDataCodewords(text, ver, ecc), ver, ecc);
    for (let mask = 0; mask < 8; mask++) {
      const size = ver * 4 + 17;
      const modules = Array.from({ length: size }, () => new Array(size).fill(false));
      const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));
      _drawFunctionPatterns(ver, ecc, mask, modules, isFunction);
      _drawCodewords(allCodewords, modules, isFunction);
      _applyMask(mask, modules, isFunction);
      const score = _penaltyScore(modules);
      if (best === null || score < best.score) {
        best = { ver, mask, modules, score };
      }
    }
    break; // первая подходящая версия
  }
  if (best === null) {
    throw new Error('Текст слишком длинный для QR-кода (версии 1–10)');
  }
  return best;
}

/* ─── Публичный API ─── */

function renderQrToCanvas(canvas, text, size = 256, ecc = 'M') {
  if (!canvas || typeof canvas.getContext !== 'function') {
    throw new TypeError('canvas должен быть HTMLCanvasElement');
  }
  const qr = _encode(String(text), _normalizeEcc(ecc));
  const n = qr.modules.length;
  const scale = Math.max(1, Math.floor(size / (n + QUIET_ZONE * 2)));
  const dim = scale * (n + QUIET_ZONE * 2);
  const ctx = canvas.getContext('2d');
  canvas.width = dim;
  canvas.height = dim;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, dim, dim);
  ctx.fillStyle = '#000000';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.modules[y][x]) {
        ctx.fillRect((x + QUIET_ZONE) * scale, (y + QUIET_ZONE) * scale, scale, scale);
      }
    }
  }
  return canvas;
}

function qrToDataUrl(text, size = 256, ecc = 'M') {
  const canvas = document.createElement('canvas');
  renderQrToCanvas(canvas, text, size, ecc);
  return canvas.toDataURL('image/png');
}

export { renderQrToCanvas, qrToDataUrl };