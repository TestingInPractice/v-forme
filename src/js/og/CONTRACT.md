# og-контур fitness-app — контракт API портирования openGym

> Все модули порта живут в `/Users/halapinvv/Documents/fitness-app/src/js/og/`.
> Ванильный JS (ES modules). НИКАКИХ зависимостей, никакого React/frameworks.
> Существующие экраны fitness-app (`src/js/modules/ui.js` и др.) НЕ ИЗМЕНЯТЬ.
> Расширение файлов: `.js`, стили экранов инжектятся через `injectCss` (router.js).
> Имена всех экспортов и сигнатуры — ТОЛЬКО по этому контракту (агенты пишут независимо и
> стыкуются через него).

## Общие правила

- Все функции чистые, где возможно; мутации состояния — только через `store.update(fn)`.
- Формы данных (state/workout/entry/set) — строго по разделу «Формы данных».
- Единицы: `unit: 'kg' | 'lb'` в `S.settings.unit`.
- Даты: `d: 'YYYY-MM-DD'`; timestamps — ms.
- Усилие: у сета ровно ОДНО из `rir` / `rpe`; внутренний агрегат — RIR.
- Комментарии и UI-строки — на русском.

## Формы данных (state S — хранится в localStorage `og_state_v1`)

```js
S = {
  v: 1,
  profile: {
    name: 'Тренажёр',
    uid: '',             // стабильный ID владельца для QR-чекина (генерится лениво, og/checkin.js)
    gym: '',             // название зала для QR-чекина (настраивается в профиле)
    unit: 'kg',            // 'kg' | 'lb'
    effort: 'rir',         // 'rir' | 'rpe' | 'off'
    theme: 'dark',         // 'dark' | 'light'
    accent: 'purple',      // 'purple' | 'red' | 'orange' | 'yellow' | 'green' | 'blue'
    restSec: 90,           // глобальный дефолт отдыха (0 = выключен)
    beep: true, vibrate: true, timerFlash: true,
    wc: { steppers: true, setShortcuts: false, pairButtons: false, exerciseButtons: false },
    bodyWeight: 75,
  },
  routines: [ routine ],   // шаблоны тренировок
  workouts: [ record ],    // ЗАВЕРШЁННЫЕ сессии (история), sorted by start asc
  checkins: [ checkinEv ], // журнал QR-чекинов (запись при успешном сканировании)
  week: 0, weekStart: 0,   // текущая неделя (для прогрессии), weekStart = ts понедельника
  bodyweight: [ { d, w } ],              // замеры тела
  exWeights: { [exId]: { w } },          // последний рабочий вес упражнения
  customExercises: [ customEx ],
  favorites: [ exId ],                   // избранные упражнения: плоский массив id (og/favorites.js)
  equipProfiles: [ equipProfile ],       // профили оборудования (og/equipment.js)
  activeEquipId: null,                   // активный профиль оборудования (профиль-гейт в списках)
  equipFilterOn: false,                  // мастер-выключатель профилей оборудования
  _now: 0,                 // замороженное "сейчас" (для тестов/стабильности), 0 = реальное время
}

equipProfile = {   // профиль оборудования в S.equipProfiles
  id,                // 'eqp_…' (генерируется og/equipment.js: newProfileId)
  name,              // название профиля, напр. «Мой зал»
  equipment: [ eq ], // значения инвентаря каталога, напр. ['dumbbell','bar']
}
// eq — строка из каталога: bodyweight | barbell | dumbbell | bar | bars | band | kettlebell
// ('bodyweight' — одним словом; в порте НЕ 'body weight' как в upstream openGym)

checkinEv = {   // событие QR-чекина в S.checkins
  id, ts, d,               // ts — момент чекина (ms), d — локальный день 'YYYY-MM-DD'
  uid, name, gym,          // данные гостя из распознанного payload
}

routine = {
  id, name,
  excludeFromProgression: false,   // rehab: policy off для всех
  restSec: null,                   // null = использовать профиль
  items: [ itemCfg ],              // ПЛОСКИЙ список; суперсеты через sg
}

itemCfg = {          // "cfg" из openGym session-start
  id,                // exercise id (наш каталог /data/exercises.js)
  name,              // display name
  type: 'reps'|'time'|'cardio',  // режим; дефолт 'reps'
  sets: 3, reps: 10, repsMin: null, weight: null, sec: null, dist: null,
  restSec: null,     // свой отдых (перебивает профиль); null = профиль
  warmupRestSec: null,
  inc: null,         // свой шаг инкремента; null = defaultIncrement
  sg: null,          // superset group id; упражнения с одинаковым sg — один суперсет
  intensifier: null, // null | 'drop' | 'burst' | 'ramp'
}

record = {   // завершённая тренировка в S.workouts
  id, rid, name, start, end, d,     // start/end — реальные ts; d — день
  source: 'live' | 'backfill' | undefined,  // откуда запись; backfill помечается явно
  volume, totalTime,                // по формулам historyLogic
  entries: [ entry ],               // flat; суперсеты разворачиваются в тот же массив
  prId,                             // е. exercise id первой достигнутой PR-отметки (live)
}

entry = {    // "сессионная запись упражнения" (как в активной сессии, так и в history)
  id, sg: null, rid: null,          // rid для combined-workout группировки
  target: { ...itemCfg },           // "план" упражнения (weight/reps/... назначенные)
  plan: { policy, kind, weight?, reps?, sec?, sets? },   // что прогрессия назначила
  sets: [ set ], noProg: false,
}

set = {
  done: false,
  reps: null, sec: null, dist: null,   // одно из (по типу упражнения)
  w: null,           // вес (для reps/time с отягощением); не null для bodyweight
  rir: null, rpe: null,   // усилия: одно из, никогда оба
  warmup: false, dropset: false, burst: false,
  ts: 0,             // ts завершения подхода
}
```

## Файлы и их API (сигнатуры обязательны)

### og/store.js — состояние + localStorage
```js
export const KEY = 'og_state_v1'
export function defaultState() -> S                     // чистый дефолт
export function load() -> S                             // merge дефолта + localStorage
export function save(S)                                 // запись в localStorage (+ JSON)
export function update(fn) -> S                         // fn(prevS) -> nextS; save; return nextS
export function uid(prefix = 'id') -> string
export function now(S) -> number                        // S._now || Date.now()
export function dayKey(ts) -> 'YYYY-MM-DD'              // локальный день
export function setNow(S, ts)                           // заморозить время (тесты/демо)
export const LS_KEYS = ['og_coach_key', 'og_coach_consent', 'og_coach_prefs']  // coach-ключи вне S (screens/coach.js)
export const SS_KEYS = ['og_workout_pending']                                  // pending из библиотеки (screens/_workout-core.js)
export function reset()                                 // полная очистка: og_state_v1 + LS_KEYS + SS_KEYS (try/catch)
```

### og/backup.js — экспорт/импорт JSON (каталог + состояние)
```js
// Бэкап = {...S, exercises: [...], categories: [...]} — каталог из IDB (через catalog.js).
// gifBlob (Blob) НЕ сериализуется — вырезается при экспорте; на импорте gif отсутствует (null).
export function buildExport(S, { exercises=[], categories=[] }) -> {...S, exercises, categories}
export function validateImport(raw) -> { state, catalog }
//   бросает Error (сообщение внятное) при: не объект / нет v (число) / workouts не массив /
//   exercises/categories не массив / элемент упражнения без id+name / категории без id+name
//   catalog = { exercises, categories } | null (null — легаси-бэкап без секций каталога)
//   state — это raw без ключей exercises/categories (extra-ключи сохраняются)
```
Экран `og/screens/settings.js`: экспорт — `await catalog.init()` → `buildExport(loadState(), { exercises: catalog.getExercises(), categories: catalog.getCategories() })`;
импорт — `validateImport(JSON.parse(text))` → `saveState(state)` → `if (catalogData) await catalog.replaceAll(catalogData)` → перерисовка.

### og/onerm.js — оценка 1RM (порт lib/onerm.js)
```js
export const REP_CAP = 12
export function estimate1RM(w, reps) -> number|null
// репс: formula по REP_CAP: reps <= 12 → Эпли (w*(1+reps/30)); reps > 12 → компромисс
//   Ломбарди-подобный (w * reps^0.1) — точно: w * Math.pow(reps, 0.1); null при w<=0/reps<=0
export function bestSetOf(entries, exId) -> set|null    // лучший сет упражнения по e1RM
export function e1rmSeries(entries, exId) -> [{ d, e1rm }]   // по дню, сортировка по d
export function is1RMRecord(S, exId, e1rm) -> boolean   // e1rm > любой предыдущей
```

### og/progression.js — движок прогрессии (порт lib/progression.js)
```js
export const DELOAD_FACTOR = 0.10
export function defaultIncrement(exId, unit) -> number  // кг: 1.25/2.5, lb: 2.5/5 (по весу/без)
export function weightIncrement(cfg, unit) -> number    // cfg.inc ?? defaultIncrement, reps-режим
export function normalizeRepRange(reps, repsMin, stride=1) -> { reps, repsMin }  // как rep-range
export function nextPrescription(S, cfg, routine) -> { policy, kind, weight?, reps?, sec?, sets? }
// политики: 'off' | 'linear' | 'greyskull' | 'double' | 'time'
//   linear:    weight = lastWeight(cfg) + inc (если в прошлой сессии план выполнен)
//   greyskull: linear + при стагнации (stallCount >= 2) weight *= (1 - DELOAD_FACTOR)
//   double:    диапазон [repsMin, reps]; достигли reps → прибавить вес, сбросить reps на repsMin+; иначе тот же вес
//   time:      для time-режимов: +sec при выполнении, иначе -sec
//   off:       kind 'off', ничего не менять (noProg/rehab)
// lastWeight: S.exWeights[cfg.id]?.w ?? cfg.weight ?? (cfg.type==='bodyweight' ? персональный вес : 0)
export function stallCount(S, cfg) -> number            // сколько сессий подряд план не выполнен
export function applyPrescription(sets, plan, step) -> sets  // применяет plan к рабочим сетам
```

### og/supersetFlow.js — суперсеты/навигация/отдых (порт lib/supersetFlow.js + history.js units)
```js
export function supersetUnits(entries) -> [ [idx,...], ... ]  // группы индексов суперсетов
export function unitOf(units, idx) -> [idx,...]|null
export function hasWork(entries, idx) -> boolean
export function nextUnfinishedUnit(entries, units, fromIdx) -> unit|null   // с wrap
export function insertionIndexAfterCurrentUnit(units, currentIndex, entryCount) -> number
export function setProgressHighWater(entry, previous=0) -> { isNew, highWater }
export function restAfterSet({ unitDone, lastUnit }) -> boolean           // !unitDone || !lastUnit
export function restOnRecheck({ timerRunning, unitDone, lastUnit }) -> boolean
export function restSecFor(entries, unit, defaultRestSec) -> number       // макс по группе; 0=выкл
export function warmupRestSecFor(entry, setIdx, workRestSec) -> number
export function supersetFlowStep(entries, unit, fromIdx) -> { unitDone, roundDone, nextIdx } | null
```

### og/sessionBuild.js — сборка сессии (порт lib/session-start.js + workout-model.js)
```js
export function modeOf(cfg) -> 'reps'|'time'|'cardio'
export function isWarmupRow(set) -> boolean              // set.warmup === true
export function buildSets(S, cfg, { step, useTarget }) -> [set]
//   рабочие сеты: cfg.sets штук (тип/повторы/вес по cfg или exWeights)
//   целевые значения: если useTarget && cfg.weight != null → sets несут cfg.weight/reps
//   warmup-рампа: если cfg.intensifier === 'ramp' — 3 разминочных сета 50/65/80% + рабочие
export function applyIntensifierPlan(sets, cfg) -> [set]  // 'drop': +сет -15% веса после каждого рабочего; 'burst': пометить burst:true
export function buildSessionEntries(S, routine) -> [entry]
//   на каждый itemCfg: plan = nextPrescription, step = weightIncrement,
//   sets = applyIntensifierPlan(applyPrescription(buildSets(...), plan, step), cfg),
//   target = {...cfg} + назначенные plan-значения (weight/reps/sec/sets)
//   entry = { id, sg, target, plan, sets, noProg }
```

### og/workoutFinish.js — финализация (порт lib/finish-workout.js)
```js
export function buildCompletedWorkout(S, active) -> record
//   active = { id, rid, name, start, entries } (активная сессия); end = now(S)
//   volume = Σ (w * reps) по done-сетам работающим (не warmup), totalTime = end - start
//   переносит sg/rid, выставлет d
export function applyCompletedWorkout(S, record, opts={}) -> S
//   opts.backfill === true → запись прошлой сессии:
//     • record.source = 'backfill'
//     • вставка insertChronological (по d, затем start asc; стабильно при равных)
//     • прогрессия/PR НЕ выполняются (нельзя двигать 1RM задним числом)
//   иначе (live):
//     1) record в S.workouts: push в конец
//     2) прогрессия по каждому entry (кроме noProg/off): readSession выполнен → записать
//        новый целевой вес/повторы в exWeights/target следующей сессии (или stall++)
//     3) PR-детект: bestSetOf до/после, пометить record-сеты pr/e1prs, record.prId
//     4) week/weekStart продвижение
//     5) bodyweight: если в активной сессии введён замер — добавить в S.bodyweight
export function insertChronological(S, record) -> S      // вставка в сортированный S.workouts: по d, затем start asc; стабильно при равных (d, start)
export function readSession(S, fullEntry) -> boolean     // все рабочие (не warmup) сеты done
```

### og/historyLogic.js — статистика/бэкфилл (порт lib/history.js + format.js)
```js
export function weekKey(d, weekStart) -> string          // 'YYYY-W##'
export function startOfWeek(ts, weekStart) -> ts         // ts понедельника
export function streakWeeks(S) -> number                 // непрерывные недели с тренировками
export function workoutVolume(record) -> number
export function loadOfWorkouts(S, muscle=null) -> number // tonnage; muscle → по доле
export function workoutsOn(S, dayStr) -> [record]
export function formatDate(dStr) -> string               // '24 сен 2026'
export function formatDuration(sec) -> string            // '1ч 05м' | '45с'
export function formatWeight(w, unit) -> string
export function byDay(records) -> { [dayStr]: [record] } // группировка для History
export function muscleBreakdown(S) -> [{ muscle, load, sets, share }]  // 18 мышц, доля
export function weekSummary(S, days=0) -> { workouts, volume, minutes, avgEffort }
```

### og/effort.js — усилие RIR/RPE (порт lib/effort.js)
```js
export const HARD_RIR = 3
export const MIN_RATED = 5
export const BUCKETS = 4
export const EFFORT_BANDS = [ /* как в openGym: rir, max, color, feel */ ]
export const EFFORT_PRESETS = [ /* то же + tail */ ]
export function rirOf(set) -> number|null                // s.rir ?? (s.rpe != null ? 10 - s.rpe : null)
export function toScale(kind, rir) -> number|null
export function displayScale(S) -> 'rir'|'rpe'
export function scaleName(kind) -> string                // 'RIR' | 'RPE'
export function effortSummary(S, days=0) -> { done, rated, hard, avg, hardPct }
export function effortWeeks(S, days=0) -> [{ t, rir, n, sets }]   // недели с n >= 2
export function effortHistogram(S, days=0) -> [{ rir, tail, n, pct }]
export function hasEffort(S) -> boolean
export function isHardSet(set) -> boolean
export function effortColor(rir) -> string|null          // css-переменная 'var(--og-purple)' и т.п.
```

### og/bar.js — бар и блины
```js
export function plateSplit(w, unit) -> number[]          // блины одной стороны, крупные→мелкие
export function roundToBar(w, unit) -> number            // округление до реальной комбинации
```

### og/format.js — форматирование
```js
export function fmtNum(n, unit) -> string
export function fmtClock(sec) -> 'M:SS'
export function plural(n, ['раз','раза','раз']) -> string
```

### og/i18n.js — минимальный (ru/en)
```js
export const LANGS = ['ru','en']
export function t(key, params={}) -> string
export function setLang(lang)
export function getLang() -> string
```

### og/sound.js — Web Audio бипы (как openGym useUI/audio)
```js
export function unlockAudio() -> void                    // по первому жесту (resume AudioContext)
export function beep(freq, durMs=120, gain=0.2) -> void
export function restEndSound() -> void                   // финальный сигнал таймера
export function restTickSound(secLeft) -> void           // тики на 3/2/1 секундах
export function vibrate(pattern=[200,100,200]) -> void
```

### og/coach.js — AI-коуч BYOK (порт lib/coach.js урезанно: клиент + валидация)
```js
export const CHANGE_TYPES = [ /* 17 типов правок */ ]
export const MAX_INC = 50
export const CONSENT_VERSION = 1
export const SNAPSHOT_MAX = 3
export const LOG_MAX = 50
export function validateProposal(proposal, S) -> { ok: boolean, errors: string[] }
//   proposal = { intent, changes: [{ type, exId?, field, value, ... }] }
//   правила: типы из CHANGE_TYPES, |value change| <= MAX_INC%, неделя в рамках дней,
//   типы вне списка → ошибка
export function applyProposal(S, proposal) -> S          // snapshot-и + применяет
export function snapshotPush(S) -> S; export function snapshotPop(S) -> S   // откат
export function buildPromptPayload(S) -> string          // JSON-дайджест для LLM
export async function generateProposal(S, { apiKey, provider, task }) -> { ok, proposal?, raw?, error? }
//   провайдеры: 'anthropic' | 'openai' | 'compatible' (совместимый http)
//   вызов через fetch; parse JSON из ответа; возврат нормализованного предложения
```

### og/qr.js — QR-код (lean-qr стиль, самодостаточный)
```js
export function renderQrToCanvas(canvas, text, size=256, ecc='M') -> void
// реализация компактного QR-энкодера (byte mode, версии 1–10, ECC L/M/Q/H)
// без внешних зависимостей
export function qrToDataUrl(text, size=256, ecc='M') -> string
```

### og/scan.js — сканирование QR
```js
export const scanSupported = () -> boolean               // ТОЛЬКО 'BarcodeDetector' in window
export async function scanFromVideo(videoEl, { intervalMs=150, onDecode }) -> void
// BarcodeDetector; fallback jsQR НЕ подключаем (нет deps) — только BarcodeDetector,
// иначе onDecode(null) помечает «не поддерживается».
// scanSupported НЕ зависит от getUserMedia: камера сама по себе не даёт декода.
```

### og/checkin.js — данные чекина (генерация/валидация payload) + журнал событий
```js
export const CHECKIN_V = 1
export function ensureProfileUid(S) -> S                   // чистая: копия S с гарантированным profile.uid
export function sigOf(fields) -> string                    // FNV-1a(32) hex от канонических полей (v,ts,uid,name,unit,gym)
export function buildCheckinPayload(S) -> string           // JSON: { v:1, ts, uid, name, unit, gym, sig }
//   v — версия схемы, ts — время генерации (ms), uid — profile.uid (см. ensureProfileUid),
//   sig — контрольная сумма FNV-1a (целостность/антиопечатка; НЕ криптоподпись — офлайн без секрета)
export function parseCheckinPayload(text) -> object|null   // валидный v=1 + совпавший sig; legacy {name,unit,gym} без v — принимается
export function recordCheckin(S, parsed) -> S              // чистая: копия S + событие в S.checkins (id, ts, d, uid, name, gym)
// Экран: перед buildCheckinPayload — updateState(ensureProfileUid);
// при успешном parse после сканирования — updateState((prev) => recordCheckin(prev, parsed)).
```

### og/favorites.js — избранные упражнения (личные данные, синкаются с состоянием S)
```js
export function favIds(S) -> string[]                    // S.favorites отфильтрованный (только строки); [] при отсутствии
export function isFavorite(S, exId) -> boolean           // exId в S.favorites
export function toggleFavorite(S, exId) -> S             // ЧИСТАЯ: копия S; add в конец (если нет) / remove (если есть)
export function sortFavoritesFirst(list, S) -> list      // НЕ мутирует: стабильно — избранные вперёд, порядок половин
                                                         //   как в исходном списке; no-op при пустых избранных
```
Хранение: `S.favorites` (см. «Формы данных») — плоский массив id упражнений каталога.
toggle ТОЛЬКО в карточке упражнения (модалка library); в списках — неинтерактивный маркер `★`
(`span.og-lrow-che` с классом `og-fav-star`); сортировка избранными вперёд в library /
routine-editor / workout (`sortFavoritesFirst`). В library — только сортировка+маркер;
чип-фильтр «Избранные (N)» — только в routine-editor picker и workout search.

### og/equipment.js — профили оборудования (фильтр по инвентарю, синкается с состоянием S)
```js
export const EQUIPMENT = ['bodyweight','barbell','dumbbell','bar','bars','band','kettlebell']
export function equipmentOf(S) -> string[]               // активный профиль: S.equipProfiles[activeEquipId]?.equipment ?? [];
                                                          //   пусто (нет S.activeEquipId / нет профиля / нет equipment) → []
export function activeProfile(S) -> equipProfile|null    // сам объект активного профиля (для settings/баннера)
export function exAvailable(ex, equipment) -> boolean    // упражнение доступно: !ex.equipment?.length || equipment.some(eq => ex.equipment.includes(eq))
                                                          //   нет инвентаря у упражнения (ex.equipment пусто/нет) → доступно всегда
export function newProfile(name, equipment=[]) -> equipProfile   // { id: 'eqp_…', name, equipment }
```
Хранение: `S.equipProfiles` — массив `{ id, name, equipment }`; `S.activeEquipId` — id активного
профиля или null; `S.equipFilterOn` — мастер-выключатель профиль-гейта (если false — фильтр
в списках выключен, показывается всё). Профиль-гейт применяется в library / routine-editor
picker / workout search: `const equip = equipmentOf(S)`; строка «N скрыто» + баннер
«Показать все» (`showAll` toggle) при активном профиле. Управление профилями — экран
`og/screens/settings.js` (секция «Оборудование»).

## Экраны (роутер + регистрация)

### og/router.js (каркас — уже написан, НЕ переписывать)
```js
export function register(name, renderFn)                 // renderFn(appEl, params)
export function go(name, params={})                      // location.hash = '#og/<name>' (+query)
export function route() -> boolean                       // рендер по текущему hash
export function boot() -> boolean                        // route() при старте; вернуть true если обработали
export function injectCss(name, cssText)                 // одноразовый <style>
export function backToApp()                              // выйти из og-контура в main ui (showScreen home)
export function link(name, label, params) -> string      // <a href="#og/<name>..."> для HTML
export function isOgHash() -> boolean
export function currentName() -> string
```
Экраны НЕ трогают router.js. Они регистрируются в **og/index.js** (см. ниже).

### og/index.js (агрегатор — смысл: собрать все экраны и зарегистрировать)
```js
export function initOg() {
  // импортирует и register() все экраны:
  //   og-home, og-library, og-workout, og-stats, og-history, og-settings, og-checkin, og-coach
  // потом router.boot()
}
```

## Ожидаемые экраны (файлы, которые должны создать агенты)

| Файл | Экран | Содержимое |
|---|---|---|
| `og/screens/home.js` | `og-home` | недельная полоса, CTA тренировки, streak, вход в остальные экраны (кнопки) |
| `og/screens/routines.js` | `og-routines` | список шаблонов (S.routines): создать/редактировать/удалить; старт тренировки по шаблону → `go('workout', {rid})` |
| `og/screens/routine-editor.js` | `og-routine-edit` | редактор ШАБЛОНА: название, упражнения (поиск по нашему каталогу), сеты/повторы/вес/отдых/режим (reps/time/cardio), суперсеты через общий `sg`, `excludeFromProgression`, `restSec`; сохранить в S.routines |
| `og/screens/library.js` | `og-library` | поиск/фильтр упражнений, мышцы, выбор в текущую сессию/рутину |
| `og/screens/workout.js` | `og-workout` | АКТИВНАЯ сессия: сеты, done, суперсеты, таймер отдыха (RestTimer overlay), усилие, добавление/удаление сетов, перестановка, swap, finish. params: `{rid}` — старт по шаблону, `{ex}` — свободная сессия с ОДНИМ упражнением (прямая тренировка из библиотеки) |
| `og/screens/backfill.js` | `og-backfill` | тот же workout-экран с датой в прошлом (log a past workout) |
| `og/screens/stats.js` | `og-stats` | тилы (тренировки/volume/время/streak), Heatmap, E1RM-график, effortSummary/Histogram, MuscleBreakdown |
| `og/screens/history.js` | `og-history` | список по дням, детализация записи, суперсеты, PR-бейджи, effort-цвета |
| `og/screens/settings.js` | `og-settings` | unit, effort шкала, тема/accent, restSec, beep/vibrate/flash, wc-флаги, имя/зал (profile.gym для чекина), экспорт/импорт og_state, сброс, вес тела |
| `og/screens/checkin.js` | `og-checkin` | QR генерация своего чекина + сканирование чужого (scan.js) |
| `og/screens/coach.js` | `og-coach` | BYOK-ключ, задача («улучши план»), генерация предложения, validate, apply/revert, лог |

Каждый экран: `export function render(appEl, params)`. Кнопки назад — `router.backToApp()` или `router.go(...)`.
Все экраны используют только imp-орт из `og/*` (никаких прямых импортов из `src/js/modules/*`,
кроме `router` и опционально `catalog` для нашего каталога упражнений!).

**ВАЖНО:** НЕ импортируем `data/exercises.js` напрямую — используем `src/js/modules/catalog.js`
(уже существует): `import * as catalog from '../../modules/catalog.js'` (из `src/js/og/screens/`).
API: `catalog.getExercises()` (массив, синхронный после init приложения), `catalog.getExercise(id)`,
`catalog.getMuscleGroups()`, `catalog.getCategories()`. Если кэш пуст ([]) — сделать
`await catalog.init()` перед чтением. ВНИМАНИЕ: упражнения в этом каталоге имеют свой формат
(поля: id, name, muscles/группы мышц и т.д.) — инспектируйте `data/exercises.js` и
`src/js/modules/catalog.js` У СЕБЯ перед написанием library-экрана.

## Стили

- Общий CSS-каркас og (переменные, .og-btn, .og-card, .og-screen, таймер, модалка) — в
  `src/css/og.css` (создаётся отдельно; агенты могут ДОПОЛНЯТЬ через `injectCss`).
- Цвета-переменные: `--og-purple`, `--og-red`, `--og-orange`, `--og-yellow`, `--og-green`,
  `--og-blue`, `--og-bg`, `--og-card`, `--og-text`, `--og-muted` (см. og.css).
- effort-цвета должны ссылаться на эти переменные.

## Порядок выполнения агентами

1. A1 (чистые библиотеки) — пишет store, onerm, progression, supersetFlow, sessionBuild,
   workoutFinish, historyLogic, effort, bar, format, i18n, sound.
2. A2 (workout/backfill) — экраны тренировки, использует A1 API из контракта.
3. A3 (stats/library/history/settings/home) — остальные экраны, использует A1 API.
4. A4 (coach/checkin/qr/scan) — самостоятельные доп.фичи.

Ограничение: НЕ трогать файлы друг друга. Каждый агент пишет только свои файлы.
Файлы A1 (библиотеки) могут импортировать только друг друга (без DOM).