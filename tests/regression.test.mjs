/**
 * Регрессионные тесты PWA «Тренажёр».
 * Ловят класс бага «серый экран og»: JS-модуль, достижимый из точек входа,
 * отсутствующий в SHELL-прекэше service worker'а (офлайн/флаки-сеть → контур не грузится).
 *
 * Запуск: node --test tests/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const SW = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

/** Регулярки статических импортов (импорты этого проекта — только относительные). */
const IMPORT_RE = /\b(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Все пути из `const SHELL = [...]` в sw.js (без './'). */
function shellEntries() {
  const m = SW.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js: блок SHELL не найден');
  const entries = [];
  for (const [, p] of m[1].matchAll(/['"]\.\/([^'"]+)['"]/g)) entries.push(p);
  return entries;
}

const SHELL = new Set(shellEntries());

/** Список JS-файлов в src/. */
function jsFiles(dir = 'src') {
  const abs = path.join(ROOT, dir);
  const out = [];
  for (const name of fs.readdirSync(abs)) {
    const full = path.join(abs, name);
    if (fs.statSync(full).isDirectory()) out.push(...jsFiles(path.join(dir, name)));
    else if (name.endsWith('.js')) out.push(path.join(dir, name));
  }
  return out;
}

const ALL_JS = jsFiles();

/** Граф статических импортов из заданных стартовых файлов. */
function reachableModules(entryRelPaths) {
  const seen = new Set();
  const queue = [...entryRelPaths];
  const resolveSpec = (fromRel, spec) => {
    if (!spec.startsWith('.')) throw new Error(`bare-импорт "${spec}" в ${fromRel} — не покрывается тестом`);
    const base = path.dirname(path.join(ROOT, fromRel));
    const resolved = path.resolve(base, spec);
    return path.relative(ROOT, resolved).replace(/\\/g, '/');
  };
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue;
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(`файл ${rel} не существует, но импортируется`);
    }
    seen.add(rel);
    const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const specs = [...code.matchAll(IMPORT_RE)].map((m) => m[1])
      .concat([...code.matchAll(DYNAMIC_RE)].map((m) => m[1]))
      .filter((s) => !s.includes('$')); // динамические с шаблоном — обрабатываются отдельно
    for (const spec of specs) queue.push(resolveSpec(rel, spec));
  }
  return seen;
}

const ENTRY_MAIN = ['src/js/app.js', 'src/js/og/index.js'];
const OGS_SCREENS = ALL_JS.filter((f) => f.startsWith('src/js/og/screens/') && !f.endsWith('/_workout-core.js'));

test('sw.js: SHELL-пути существуют на диске (install не упадёт)', () => {
  const missing = [...SHELL].filter((p) => !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(missing, [], `SHELL содержит несуществующие файлы (поймают 404 в install):\n  ${missing.join('\n  ')}`);
});

test('sw.js: каждый JS-модуль из точек входа покрыт SHELL (регрессия серого экрана og)', () => {
  const reachable = reachableModules([...ENTRY_MAIN, ...OGS_SCREENS]);
  const missing = [...reachable].sort().filter((f) => !SHELL.has(f));
  assert.deepEqual(
    missing,
    [],
    `Модули достижимы, но НЕ в SHELL-прекэше (офлайн/флаки-сеть = серый экран):\n  ${missing.join('\n  ')}`
  );
});

test('sw.js: критичные og-модули в SHELL (бывшая «дырявая» группа)', () => {
  const critical = [
    'src/js/og/favorites.js',
    'src/js/og/equipment.js',
    'src/js/og/backup.js',
    'src/js/og/checkin.js',
    'src/js/og/screens/routine-editor.js',
    'src/js/og/screens/routines.js',
    'src/js/og/router.js',
    'src/js/og/index.js',
  ];
  const missing = critical.filter((f) => !SHELL.has(f));
  assert.deepEqual(missing, [], `Отсутствуют в SHELL:\n  ${missing.join('\n  ')}`);
});

test('i18n: нет «рутин» в видимых ru-строках', () => {
  const i18n = fs.readFileSync(path.join(ROOT, 'src/js/og/i18n.js'), 'utf8');
  const dictBlock = i18n.match(/const DICT = \{([\s\S]*?)\n\};/);
  assert.ok(dictBlock, 'i18n.js: блок DICT не найден');
  const bad = [...dictBlock[1].matchAll(/ru:\s*'([^']*)'/g)]
    .map((m) => m[1])
    .filter((s) => /рутин/i.test(s));
  assert.deepEqual(bad, [], `ru-строки содержат «рутин»:\n  ${bad.join('\n  ')}`);
});

/** Все строковые литералы кода (вне комментариев), с учётом template-выражений ${...}. */
function jsStringLiterals(code) {
  const out = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i);
      i = nl === -1 ? code.length : nl + 1;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch;
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === q) break;
        if (q === '`' && code[j] === '$' && code[j + 1] === '{') {
          let depth = 1;
          j += 2;
          while (j < code.length && depth) {
            if (code[j] === '{') depth++;
            else if (code[j] === '}') depth--;
            j++;
          }
          continue;
        }
        j++;
      }
      if (j < code.length) {
        out.push(code.slice(i, j + 1));
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return out;
}

test('coach: нет «рутин» в видимых строках (label операций, summary лога)', () => {
  const coach = fs.readFileSync(path.join(ROOT, 'src/js/og/coach.js'), 'utf8');
  const bad = jsStringLiterals(coach).filter((t) => /рутин/i.test(t));
  assert.deepEqual(bad, [], `coach.js содержит видимые строки с «рутин»:\n  ${bad.join('\n  ')}`);
});

test('manifest: валиден и все иконки существуют (установка PWA)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.ok(manifest.name && manifest.short_name, 'manifest: name/short_name обязательны');
  assert.equal(manifest.display, 'standalone');
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest: минимум 2 иконки');
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, icon.src.replace(/^\.\//, ''))), `manifest: иконка не найдена: ${icon.src}`);
  }
});

test('синтаксис: все .js в src/ валидны (module mode)', () => {
  const bad = [];
  for (const rel of ALL_JS) {
    const tmp = path.join('/tmp', `vforme-synck-${rel.replace(/\//g, '_')}.mjs`);
    fs.copyFileSync(path.join(ROOT, rel), tmp);
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    fs.unlinkSync(tmp);
    if (r.status !== 0) bad.push(rel);
  }
  assert.deepEqual(bad, [], `Файлы с синтаксической ошибкой:\n  ${bad.join('\n  ')}`);
});