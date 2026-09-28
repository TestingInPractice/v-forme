# openGym — технический референс для переноса в fitness-app

> **Назначение.** Документ-референс: как реализованы фичи openGym (AGPL-3.0, Copyright 2026,
> Duarte Santos), чтобы портировать их в наше vanilla-JS PWA **fitness-app**. Код openGym не
> копируется (AGPL §13: сетевая дистрибуция модификации = распространение, источники обязаны
> быть доступны) — фичи переписываются по этому описанию: структуры данных, функции,
> алгоритмы, константы, формулы.
>
> Источник: `/Users/halapinvv/Documents/openGym/frontend/src` (React 19 + Vite + Zustand),
> `api/`, `mcp/`. Наша цель: vanilla JS PWA без зависимостей (`src/{audio,css,js}`,
> `data/exercises.js`).

---

## 1. Архитектура (общая карта)

### 1.1 Стек openGym
- **Frontend**: React 19 + Vite + react-router-dom (HashRouter — работает с файловой раздачи
  без переписывания URL) + Zustand. Больше НИ ОДНОЙ зависимости (жёсткое правило
  CONTRIBUTING.md).
- **Backend** (`api/server.js`): один файл, `node:http` без фреймворка, dispatch по таблице
  `routes['METHOD /path']`. Хранилище — два плоских JSON-файла. Авторизация — passkey
  (WebAuthn) + HMAC-подписанная сессионная cookie. Web Push через `web-push` (VAPID).
- **Mobile**: `@capacitor/*` обёртки поверх той же веб-сборки (`frontend/android`,
  `frontend/ios`).
- **MCP** (`mcp/`): read-only stdio-мост для LLM-клиентов, читает те же JSON-файлы.
- **Инфраструктура**: Docker (api + web/nginx + media). nginx отдаёт статику и проксирует
  `/api` (single origin — требование passkey).

### 1.2 Карта frontend/src (файлы)
```
App.jsx              — роутинг, ErrorBoundary, ленивые загрузки экранов, theme/accent на body
main.jsx             — bootstrap: init существующего/демо-профиля, i18n, SW-регистрация
store/useStore.js    — ВЕСЬ персистентный стейт (localStorage, дебаунс-пуш на сервер)
store/useUI.js       — эфемерный UI-стейт (модалки, активный лист, таймеры UI)
lib/*                — чистые хелперы, каждый с *.test.js (доменная логика живёт ТУТ)
views/*              — один файл = один экран (Home, Workout, Plan, Library, Stats,
                       History, Settings, Admin, Login, RoutineEdit)
components/*         — общие UI (BodyMap, Heatmap, LineChart, Modals, RestTimer,
                       Stepper, TabBar, TimerFlash, Toast, SwipeToDelete, ...)
lib/locales + instr/ — i18n (16 языков) и текст инструкций по упражнениям
media/               — картинки упражнений (gitignored, тянется media-сервисом)
```

### 1.3 Ключевые паттерны, которые стоит перенять
1. **Вся доменная логика — чистые функции в `lib/`, каждая с unit-тестом рядом.**
   Правило из CONTRIBUTING: «всё, что решает, что ты поднимешь следующим, или читает
   обратно завершённую сессию — чистый хелпер с тестом». Два бага в движке прогрессии
   поймали только тесты.
2. **Zustand-стор как единственный источник состояния**, персист в localStorage
   (`gym_state_v1`) + дебаунс-пуш на сервер + (в мобильной сборке) зеркало в файл
   (`nativeSave`) — WebView может вычистить storage.
3. **Производная статистика не хранится** — пересчитывается из `S.workouts` чистыми
   функциями (effort, fatigue, strength, PR, heatmap).
4. **Интенсификаторы/суперсеты решаются чистыми функциями** (`supersetFlow.js`),
   чтобы правила «неровных раундов» и re-check были явными и тестируемыми.
5. **media-ассеты внешние** (gitignored), имена файлов = id упражнения с суффиксами.

---

## 2. Хранилище данных

### 2.1 Ключи localStorage (frontend)
| Ключ | Формат | Назначение |
|---|---|---|
| `gym_state_v1` | JSON | Весь персистентный стейт `S` (см. 2.3) |
| `gym_sync` | `{rev, ts}` | Последняя synced-ревизия для протокола синка |
| `gym_device` | JSON | Идентификатор устройства (для push/мобильного) |
| `gym_demo_seeded_v1` | flag | Демо-профиль посеян один раз |

### 2.2 Синхронизация (lib/api.js)
- Единственное место, где код говорит с бэкендом: обёртка над `fetch` + cookie-сессии.
- Протокол: клиент держит `rev`; перед пушем делает `PUT /api/data`; при конфликте получает
  `409`, перечитывает серверную копию, **мёржит** (правила мёржа см. ниже), ставит `rev=409-тело`, повторяет.
- `POLL_CONTEXT`/таймер ~30s поллинга для получения изменений с других устройств.
- **Мёржа** (критичная логика, переписать аккуратно): по сущностям new/updated/deleted.
  Клиентские и серверные изменения сохраняются оба; `deleted`-маркеры (tombstone) побеждают
  update с меньшей ревизией; workouts/выполненные сеты — last-write-wins по `start`/`ts`.
- Импорт даёт флаг `INITIAL_SYNC` — локальные данные считаются «свежее» до первого пуша.

### 2.3 Стейт S (форма персистентного стора) — ключевые поля
```js
S = {
  me: { name, uid, profile: { unit: 'kg'|'lb', effort: 'rir'|'rpe', theme, accent, ... } },
  routines: [{ id, name, excludeFromProgression?, items: [cfg], ... }],   // шаблоны
  workout: { plan: {...}, entries: [entry], start, cur, ... },            // активная сессия
  workouts: [ workoutRecord ],          // история завершённых
  week: 0, weekStart: ts,               // «текущая неделя» для прогрессии
  day: { plan: {...}, dayIndex, routineId },   // расписание
  bodyweight: [{ d, kg }],              // замеры веса
  exWeights: { [exId]: { w } },         // последние рабочие веса (для предзаполнения)
  customExercises: [ customEx ],
  settings + внутренние флаги: unit, effort, beep, unlock, timerSec, wc, ...
  sessionKey, sessionStart,             // синк-ревизии
}
```

### 2.4 Записи тренировок (workoutRecord, entry, set) — КАНОНИЧЕСКИЕ ФОРМЫ
`.workouts[]` — массив завершённых сессий:
```js
workoutRecord = {
  id: 'w_<uid>_<ts>',       // устойчивый id (для дедупликации синка)
  rid: routineId | null,    // из какой рутины (null = свободная сессия)
  name, start, end, d,      // d = день 'YYYY-MM-DD' (ключ календаря/бэкфила)
  volume, totalTime,        // производные, см. формулы в §5
  entries: [ entry ],       // flatten: суперсеты разворачиваются в тот же массив
}
entry = {
  id, sg | null,            // sg = id суперсет-группы (соседи с тем же sg — один суперсет)
  target: { id, name, sets, reps, weight|sec|dist, restSec?, warmupRestSec?, ... }, // «план»
  plan: { policy, kind, ... },  // что прогрессия назначила на эту сессию
  sets: [ set ], rid?, noProg?,
}
set = {
  done: true,               // НЕ empty-значение — done эксплицитно
  reps | sec | dist, w,     // w = вес (для weight-режимов)
  rir | rpe,                // одно из двух, набор не переписывается при смене шкалы
  warmup?,                  // флаг разминочного сета
  dropset?,                 // дроп-сет
  ts,                       // время завершения (для таймеров/бэкфила)
}
```
**Правила формы сетов** (workout-model.js):
- 4 режима упражнения: **reps** (`{reps, w}`), **time** (`{sec, w?}`), **cardio**
  (`{sec, dist}`), **per-side** (`{reps, w}` + флаг).
- `isWarmupRow(set)` — set.warmup или сет из разминочной части (номер < первого рабочего).
- `splitBurstReps` — флаг «burst» у сета (маленькие паузы внутри подхода); влияет на рендер
  и на подсчёт трофеев/vol.

### 2.5 Сервер (api/server.js)
- `DATA_DIR/db.json` — users/credentials/subscriptions/invites.
- `DATA_DIR/state-<uid>.json` — per-user данные (весь S целиком).
- Запись — `atomicWrite` (temp + rename), никаких частичных файлов.
- `data/audit.log` (JSONL, ротация) — события входа/admin.
- Гостевой режим: `ALLOW_GUEST` — клиент вообще не ходит на сервер.

### 2.6 Service Worker (frontend/public/sw.js)
- Имя кэша `opengym-rt-__BUILD__` (вшивается при сборке, версионирует кэш).
- **precache** основного корпуса (index.html + hash-бандлы) на install; **network-first**
  для навигации (сеть → кэш), **cache-first** для hash-статики и media (img/gif).
- Гостевой режим и оффлайн полностью работают из кэша.

### 2.7 Экспорт/импорт данных
- `plan-share.js`: экспорт/импорт рутины по ссылке-блоку (`PLAN_FMT` версия формата),
  вставка текстом из буфера.
- `import-hevy.js`: импорт CSV из Hevy (маппинг id через `hevy-id-map.js`).
- `import-csv.js`: универсальный CSV импорт с маппингом колонок.
- Резервная копия: полный JSON стейта (Settings → Export) / восстановление.

---

## 3. Ядро тренировок (экран Workout, сеты, суперсеты, таймеры)

### 3.1 Экран Workout (views/Workout.jsx) — что на нём
- Шапка: название сессии (выведено из плана/времени, `deriveSessionName`), таймер сессии.
- Список упражнений в порядке **displayOrder**: суперсетные группы показываются как
  «раунды» — упражнения группы чередуются по одному сету (см. `displayUnits`) + навигационные
  стрелки (next unfinished unit, оборачивается через конец списка).
- Сет-строка упражнения: поле reps/время/вес/усилие, кнопка done (галочка), раскрытие
  дополнительных сетов (warmup/add/remove), «more»-кнопка на упражнение (меню: move,
  swap, remove, superset-пары — по флагам `wc`, см. 3.6).
- Предзаполнение весов: из `exWeights`/`target.weight` (из прошлой сессии по `nextPrescription`).
- **Бэкфилл** (заполнение прошлых дней): меню «Log a past workout» — тот же экран,
  направленный на другую дату; по завершении сетов с `d < today` ставит их
  хронологически в `S.workouts` через `insertChronological`, помечая источник.
- Памятка: «выполнил лимит подходов на сегодня» для периодизационных сессий.

### 3.2 lifecycle сессии (store + session-start.js + finish-workout.js)
```
startFlow(plan, dayIndex)  →  beginWorkout(plan)  →  buildSessionEntries(S, routine)
  →  session идёт (сета отмечаются done)  →  doFinishWorkout(...)  →  buildCompletedWorkout()
  →  reduce back into S (прогрессия, PR, вес тела, exWeights, volume)
```

- `session-start.js / buildSessionEntries(st, r)` — **чистая функция**: строит массив
  `entries` из рутины. Алгоритм на каждое упражнение `cfg`:
  1. `plan = nextPrescription(st, cfg, r)` (или policy 'off', если у рутины
     `excludeFromProgression`).
  2. `step` = шаг весов: для reps-режима — инкремент упражнения (учитывая единицы),
     для time-режима — секунды.
  3. `sets = applyIntensifierPlan(applyPrescription(buildSets(st, cfg, {step, useTarget}),
     plan, step), cfg)` — цепочка: базовые сеты → прогрессионный план → план интенсификатора.
  4. В `target` копируется cfg + назначенные plan-значения (weight/reps/sec/sets), чтобы
     экран мог объяснить число.
  5. Возврат `{ id, sg, target, plan, sets, noProg? }`.
  - Общая для live-start и backfill (иначе пути разойдутся при изменении правил).

- `finish-workout.js / doFinishWorkout` (псевдо-алгоритм):
  1. Собрать `buildCompletedWorkout()`: записи сета, volume, totalTime, перенос `sg`.
  2. Прогрессия: для каждого упражнения проверить `readSession` — выполнил ли все сеты
     плана; если да и `plan.kind != 'off'` → повысить вес/повторы следующей сессии
     (см. §4.6); при делюаде — понизить.
  3. PR-детект: `bestWeightFor` по истории, сравнить с текущим максимумом → записать
     `pr`/`e1prs` на сет и `prId` первой достигнутой отметки (для конфетти/трофеев).
  4. Обновить `exWeights[id]` (последний рабочий вес), `bodyweight` (если замер на сессии),
     `week`/`weekStart` при переходе недели, сохранить в `S.workouts`.
  5. Если это backfill (`d < today`) — вставить `insertChronological` и **НЕ трогать**
     прогрессию (нельзя двигать 1RM задним числом по умолчанию).

### 3.3 Суперсеты — lib/supersetFlow.js (чистые функции «что дальше/сколько отдыхать»)
Ключевые экспорты и правила:
- `hasWork(entries, idx)` — есть ли в упражнении незакрытые сеты (`!set.done`).
- `nextUnfinishedUnit(entries, units, fromIdx)` — первый незавершённый navigation-юнит
  после текущего, **с wrap** через начало; юнит = массив индексов одной суперсет-группы.
- `insertionIndexAfterCurrentUnit(units, currentIndex, entryCount)` — куда вставить новое
  упражнение, чтобы не разорвать суперсет-группу (после полного юнита; fallback — конец).
- `setProgressHighWater(entry, prev=0)` — счёт done-сетов: `{isNew: done>prev, highWater}`.
  **High-water правило**: uncheck/re-check уже завершённого сета НЕ повторяет навигацию и
  НЕ запускает отдых заново; только когда добавлен новый сет — прогресс «новый».
- `restAfterSet({unitDone, lastUnit}) = !unitDone || !lastUnit` — отдых положен после
  КАЖДОГО завершённого сета, включая последний сет упражнения и последний сет суперсет-
  раунда; **не отдыхаем только после последнего сета последнего упражнения сессии**.
- `restOnRecheck({timerRunning, unitDone, lastUnit}) = !timerRunning && restAfterSet(...)` —
  re-check заполняет «дыру» (отдых истёк, пока правили повторы), но не сбрасывает уже
  тикающий таймер.
- `restSecFor(entries, unit, defaultRestSec)` — время отдыха для группы:
  - если у упражнения в target есть `restSec` — оно (issue #10: тяжёлая тройка и бёрпи
    не хотят одинаковой паузы);
  - суперсет-группа отдыхает один раз, **по МАКСИМАЛЬНОМУ restSec** участников;
  - `defaultRestSec = 0` = таймер выключен, но явный `restSec` упражнения всё равно работает.
- `warmupRestSecFor(entry, setIdx, workRestSec)` — отдых между разминочными сетами:
  `warmupRestSec` из target, только если СЛЕДУЮЩИЙ незакрытый сет тоже разминочный;
  переход «последний разминочный → первый рабочий» отдыхает `workRestSec`.
- `supersetFlowStep(entries, unit, fromIdx)` → `{unitDone, roundDone, nextIdx}` —
  куда идти после завершения сета в суперсете: скип spent-членов (включая wrap);
  `roundDone` = в display-порядке позже текущего уже нет незакрытых (граница — последний
  АКТИВНЫЙ член, не последний индекс массива).

### 3.4 Перестановка/замена упражнений в активной сессии
- `active-workout-order.js`:
  - `moveActiveWorkoutUnit(active, index, direction)` — переместить юнит (суперсет)
    целиком, пересобирая `entries` по новому порядку `indices`; `active.cur` обновляется
    на индекс выбранного упражнения.
  - `canMoveActiveWorkoutUnit(...)` — проверка границ (source/target существуют).
- `active-exercise-swap.js / swapActiveExercise(active, index, replacement, {loggedConfirmed, groupDisposition})`:
  - **Незалогированный** slot: замена in-place, сохраняются метаданные (кроме
    id/target/plan/sets/sg), `sg` переносится, `active.cur = index`.
  - **Залогированный** slot: `{needsConfirmation:true, grouped}` → после подтверждения
    замена **вставляется рядом** (никогда не переименовывает логи);
    группа (sg) требует выбора `keep` (вставить в группу) или `detach` (после группы);
    переносится `rid` слота (чтобы combined-workout группировка не разъезжалась).
- **Display order**: суперсет-группы рендерятся «внахлёст» по раундам — единый
  навигационный поток: next-unfinished-unit + wrap. Чистая логика отдельно от React.

### 3.5 Таймер отдыха (useUI.js + components/RestTimer.jsx + TimerFlash.jsx)
- `useUI.startRest(sec, onEnd)` — эфемерный UI-стейт таймера (не персистится); совмещён
  с окном-модалкой/бейджем поверх экрана.
- RestTimer: линейный прогресс (CSS width + `requestAnimationFrame` или интервал
  ~100–250ms; в мобильной сборке — `WakeLock` через `mobile.js`, чтобы экран не гас).
- По истечении: звуковой бип (см. §6.3), вибрация (`navigator.vibrate`), **Web Push** —
  таймер-овер посылается на устройство, если вкладка свернута (пуш с payload rest-timer).
- `TimerFlash.jsx` — полноэкранная вспышка с цветом темы (если включено в настройках).
- Rest timer continuation через high-water: переоткрытие окна не сбрасывает идущий таймер,
  но re-check не перезапускает уже считающий.

### 3.6 Workout controls (lib/workout-controls.js) — настройка «что показывать»
```js
WC_DEFAULT = { steppers: true, setShortcuts: false, pairButtons: false, exerciseButtons: false }
workoutControls(S) = { ...WC_DEFAULT, ...(S.wc || {}) }
```
- `steppers` — +/- кнопки на полях (вес/повторы/усилие) — **Stepper.jsx**.
- `setShortcuts` — быстрые чипы «+Drop» / «+Burst» на каждом сете и на панели add-подходов.
- `pairButtons` — «Make superset with previous/next» в шапке упражнения.
- `exerciseButtons` — Move up/down / Swap / Remove под упражнением.
- (Навигация стрелками и сами сеты — всегда; это только дополнительные группы кнопок.
  Настройки → During a workout → Workout controls.)

### 3.7 rep-range.js — нормализация диапазона (для double progression)
```js
normalizeRepRange(reps, repsMin, stride=1):
  upper = align(positiveInt(reps,10), stride)      // шаг кратен stride
  lower = align(positiveInt(repsMin, max(1,upper-2)), stride)
  if (lower >= upper) → { reps: lower+stride, repsMin: lower }   // инвариант lower < upper
  else → { reps: upper, repsMin: lower }
```

---

## 4. База упражнений, мышцы, 1RM, усилие, прогрессия

### 4.1 Каталог упражнений
- `lib/exercises-data.js`: **1324 встроенных** записи. Формат записи:
```js
ex = {
  id: 'benchpress', name: { ru: 'Жим лёжа', en: 'Bench press', ... },  // → exercise-names/
  type: 'reps'|'time'|'cardio',
  muscles: ['chest','triceps'],     // основные
  musclesSec: ['frontdeltoid'],     // вторичные (опционально)
  eq: 'barbell'|'dumbbell'|'bodyweight'|...,   // оборудование (equipment.js)
  bw: false,                        // bodyweight-only
  img?: 'benchpress.jpg', gif?: 'benchpress.gif',   // → media/{img,gif}/
  instr?: 'benchpress.ru.md',       // → instr/, инструкция
}
```
- `lib/exercises.js`: рантайм-каталог `CATALOGUE`, индекс `EXIDX`, `smOf(id)` — muscle-список;
  `registerCustom(ex)` — пользовательские (в `S.customExercises`).
- Мышцы: `lib/muscles.js` — 18 слогов-слаг (chest, back, shoulders, biceps, triceps,
  forearms, abs, obliques, quads, hamstrings, glutes, calves, traps, lats, neck...),
  полные названия + `ALIAS` (синонимы «pecs»→chest), `canonicalMuscle(s)` — нормализация
  (NFD, регистр), `muscleGroupsOf(ex)` — from primary+secondary.

### 4.2 Поиск упражнений (lib/exercises.js)
- `searchScore(ex, q)` — вес совпадения: точное имя/id = высокий, префикс, подстрока,
  совпадение по названию на текущем языке, по muscles/тэгам — ниже.
- `searchExercises(q, opts)` — fuzzy по NFD-нормализованным строкам, сортировка по score,
  фильтр по доступному оборудованию (`exAvailable(S, ex)`) и выбранным мышцам
  (`matchesMuscleGroups`).
- Классификаторы: `isCardio`, `isBodyweightEq`, `isAssisted(ex)` (резинки/тренажёры/ассист),
  `betterWeight(a,b)` — какой вес «лучше» (для сравнения подходов разных дней).

### 4.3 1RM (lib/onerm.js)
```js
REP_CAP = 12     // равенство: Epley при >12 повторов занижает, используются другие формулы
estimate1RM(w, reps)  // репс, формула по REP_CAP:
  // ≈ (w * (1 + reps/30)) · (1 + 0.0333·reps) — комбинированно; точные константы ниже
  Эпли:   1RM = w · (1 + reps/30)
  Бжицки: 1RM = w · (36 / (37 − reps))
  Ломбарди: 1RM = w · reps^0.10
bestSetOf(entries, exId)      // лучший выполненный сет по 1RM
e1rmSeries(entries, exId)     // ряд e1RM по датам (для графика)
is1RMRecord(S, exId, 1rm)     // рекорд ли
```
- `bestWeightFor(e, id)` — максимум по весу (не по 1RM) за историю упражнения; используется
  в PR-детекте и предзаполнении.

### 4.4 Усилие (lib/effort.js) — RIR внутренняя шкала, RPE display
- Сет несёт ОДНО из `{rir}` / `{rpe}`; смена настройки меняет только новые сеты, старые
  не переписываются. Для графиков всё агрегируется в RIR (единственная честная шкала:
  «0» = отказ существует, у RPE пол 6 — конвенция).
- `rirOf(s) = s.rir ?? (10 - s.rpe)` (null если не оценено; **0 — это оценка**, не пусто).
- `toScale(kind, rir) = kind == 'rpe' ? round1(10 - rir) : round1(rir)`.
- `displayScale(S)` — какая шкала для подписей агрегатов: настройка профиля, иначе по
  большинству реально записанных оценок в истории.
- Константы: `HARD_RIR = 3` (≤3 = «жёсткий» сет), `MIN_RATED = 5` (меньше оцененных сетов —
  среднее не показываем, «-»).
- `effortSummary(S, days)` → `{done, rated, hard, avg, hardPct}` (avg/hardPct = null если
  rated < MIN_RATED).
- `effortWeeks(S, days)` — средний RIR по календарной неделе + `sets` рядом; недели с
  одним оценённым сетом отбрасываются (n>=2).
- `effortHistogram(S, days)` — распределение по бакетам `BUCKETS=4` (0,1,2,3,4+tail).
- **Цветовые банды** (RIR-шкала, применяются к RPE через перевод):
```js
EFFORT_BANDS = [
  { rir:0,   max:0.25, color:'var(--purple)', feel:'Nothing left — went to failure' },
  { rir:0.5, max:0.75, color:'var(--red)',     feel:'Maybe half a rep left' },
  { rir:1,   max:1.5,  color:'var(--orange)',  feel:'One more rep in the tank' },
  { rir:2,   max:2.5,  color:'var(--yellow)',  feel:'Two more reps' },
  { rir:3,   max:3.5,  color:'var(--green)',   feel:'Three more reps' },
  { rir:4,   max:Inf,  color:'var(--acc-2)',   feel:'Easy — warm-up territory' },
]
EFFORT_PRESETS = bands + tail(последний = «4+», тап логирует 4)
effortColor(rir) — банда по порогу; null (не оценено) → без цвета
```
- `isHardSet(s)` = rirOf(s) != null && <= HARD_RIR (фильтр «жёсткие сеты» в карте мышц).
- Практика: усиление оценивается опционально (по умолчанию выключено), UI существует
  только если `hasEffort(S)`.

### 4.5 Интенсификаторы (applyIntensifierPlan — часть history.js/session-start)
- План интенсификатора на сессию: **Drop set** (после рабочего сета добавить -X% веса,
  тот же reps), **Burst** (флаг каждому сету — паузы-взрывы / роздых внутри подхода),
  warmup-рампа (ступенчатый разминочный ряд до рабочего веса).
- `applyIntensifierPlan(entries|setList, cfg)` — домножает/помечает сеты по типу
  интенсификатора, заданного в рутине (`cfg.intensifier`).

### 4.6 Движок прогрессии (lib/progression.js) — политики
Единый интерфейс политик (`policy`):
```js
POLICIES = {
  off:      () => null,                     // ничего не менять (rehab, excludeFromProgression)
  linear:   next = last + increment,        // +шаг каждый раз при выполнении плана
  greyskull: // линейный + делюад-откат: если план не выполнен N раз → -10% (-DELOAD_FACTOR)
  double:   // диапазон повторов: внутри диапазона повышаем вес на шаг,
            // выше диапазона — reps сбрасывается на repsMin+?; см. normalizeRepRange
  time:     // для time-режимов: +сек (inc в секундах), иначе -сек при невыполнении
}
DELOAD_FACTOR ≈ 0.10   // -10% при стагнации (грейскулл)
nextPrescription(st, cfg, r) → { policy, kind, weight?, reps?, sec?, sets? }  // что «прописано» на сессию
readSession(st, w)     // выполнен ли план сессии (все рабочие сеты done)
```
- Триггер понижения (грейскулл): `stallCount` — сколько сессий план не выполнен;
  при пороге (обычно 2) вес = вес − 10%, счётчик сбрасывается.
- Инкремент весов: `defaultIncrement(exId, unit)` и `weightIncrement(cfg, unit)` —
  по единицам: kg → 1.25/2.5; lb → 2.5/5; шаг кратен существующим блинам (см. bar).
- `excludeFromProgression` у рутины → policy 'off' для всех её упражнений (реабилитация,
  смешанные рутины).

### 4.7 Бар/блины (lib/bar.js)
- `BAR_EQ` — эквивалент веса пустого грифа (20 кг / 45 lb) с учётом unit.
- `plateSplit(w)` — раскладка по блинам для заданного unit (стандартный набор
  1.25/2.5/5/10/15/20/25 kg или lb-аналоги), минимальный шаг 1.25 kg.
- `roundToBar(w)` — округление до ближайшей реальной комбинации блинов.

### 4.8 Карта мышц и баланс (BodyMap, Heatmap, muscles)
- `components/BodyMap.jsx` — SVG-диаграмма тела (front/back), `lib/body-paths.js` —
  vector paths для каждой из 18 мышц; подсветка по нагрузке/усталости/силе.
- `lib/muscles.js`: `musclesOf(entry)` — распределение нагрузки сета по мышцам
  (основные = 1.0, вторичные = 0.4), `BY_BODYPART` — групповая таблица.
- Баланс мышц Stats: `loadOf(muscle)`, `rankOf`, `levelsOf` — процентильные уровни
  (низкий/средний/высокий) для цветовой шкалы heatmap; окно `muscleBalanceWindow`.

---

## 5. Статистика и история (Stats, History, графики)

### 5.1 Экраны
- **Home**: недельная полоса (текущий день/календарь), сегодняшняя тренировка / чек-ин,
  welcome, вес тела, полоса streak, вход в тренировку.
- **History**: плоский список тренировок (по дням, `byDay` группировка), WorkoutRow →
  WorkoutDetail (детализация сетов, суперсеты, усилия цветами, PR-бейджи).
- **Stats**: тилы (тренировок, volume, времени, streak), **Heatmap** активности
  (квантили по дням, 4 уровня), **MuscleBalance** (баланс мышц front/back), **EffortCard**
  (график усилия за окно), график веса тела, прогресс упражнений, Calendar.
- Компоненты графиков: `Heatmap.jsx` (календарная сетка), `LineChart.jsx` / `AreaChart`
  (SVG-полилинии; E1RM-ряд, вес тела), `SwipeToDelete.jsx` (удаление записей истории),
  `NumField.jsx` (поле «плюс-минус», дружелюбное к клавиатуре).

### 5.2 Ключевые формулы (lib/history.js, lib/format.js, lib/ranges)
```js
weekKey(d, weekStartOf)        // 'YYYY-W##' — ключ недели (для streak, weekly)
startOfWeek(d)                 // понедельник, unit-независимо
streakWeeks(S)                 // непрерывная серия недель с тренировками, с прошлой недели
workoutVolume(w) = Σ sets[].reps * w  // тоннаж по каждой записи (время-режим: sec вклад)
loadOfWorkouts(ws, muscle?)    // суммарный тоннаж, при muscle — только по мышечной доле
fatigueOf(muscle, ws, days)    // усталость = нагрузка_недавняя × скидка по времени
strengthOf(muscle, ws, days)   // сила = агрегат по e1RM/max вес в окне
estimate1RM / best1RM          // см. §4.3
```

### 5.3 Бэкфилл и чтение сессий
- `workoutsOn(S, d)` — записи за день 'YYYY-MM-DD' (для календаря, Home today-row).
- `insertChronological(S, record)` — вставка прошлой даты в правильную позицию массива,
  `completeBackfill` — финализация: пометка источника, НЕ трогает прогрессию.
- `sameDayChoice` — если тренировка на дату уже существует: «перезаписать/объединить/новая».

---

## 6. Мобильные фичи: QR-чекин, звук, уведомления, темы, i18n

### 6.1 QR-чекин и камера (views/CheckIn.jsx, lib/qr.js, lib/scan*.js)
- **Генерация**: `lib/qr.js` — компактный SQL-based QR (`lean-qr`, без зависимостей):
  `renderQrToCanvas(canvas, text, size, ecc)` — рисует QR прямо в canvas (без SVG-инжекта).
- **Сканирование**:
  - Web (десктоп/WebView): `scan-web.js` — `BarcodeDetector` (Chrome) → fallback
    `jsQR` (WebWorker + ImageData из `<video>`), цикл декода ~150 ms на кадр.
  - Камера: `components/CameraScan.jsx` — `getUserMedia({video:{facingMode:'environment'}})` +
    `requestVideoFrameCallback`/rAF, рисует в canvas для декода, показывает наложение
    рамки; периодические попытки decode с паузой для экономии CPU.
  - Mobile (Capacitor): `scan.js` — нативный ML Kit barcode scanner (плагин).
- Сценарий: владелец показывает QR своего зала/устройства → гость/посетитель чекинится
  (создаётся гостевая сессия без логина), данные тренировки привязываются к залу.

### 6.2 Capacitor-обёртка (docs/MOBILE.md)
- `capacitor.config.json`: appId `ch.duartesantos.opengym`, appName openGym.
- `lib/mobile.js` — гейт `MOBILE`:
  - `nativeLoad/nativeSave` — зеркало `gym_state_v1` в файл (`opengym-state.json` в
    Documents), т.к. WebView storage может быть вычищен; восстановление при загрузке.
  - Wake Lock (экран не гаснет во время таймера отдыха), локальные уведомления
    (rest-timer-over, day-reminder) через плагин.
  - `shareExport` — нативный share (экспорт данных), `printHtml` — печать.
- `lib/remote.js` — спаривание/удалённое управление между устройствами (показ QR и
  подключение).
- `lib/back.js` — обработка системной кнопки назад (Android): закрыть модалку → таймер →
  выйти из тренировки → приложение.
- **Автообновление** `lib/update.js`: проверка релизов (GitLab Releases — канонический
  remote) + **SHA-256** контроль целостности скачанного bundle; установка при следующем
  старте.

### 6.3 Звук и вибрация (useUI.js + lib/audio)
- Web Audio API (AudioContext, создаётся по первому жесту — autoplay policy).
- Бипы таймера отдыха: паттерн — короткие сигналы на последних 3/2/1 сек (разные частоты,
  обычно 880/660/440 Гц), длинный финальный бип на 0. Усилие/онбординг — одиночные.
- `unlock` — разблокировка звука по первому пользовательскому жесту (resume AudioContext).
- Вибрация: `navigator.vibrate([...])` на окончание таймера (если включено).
- Настройки: тональность/длительность шаблонов (`beep` on/off, preview кнопка).

### 6.4 Web Push (api + sw)
- `web-push` + VAPID (ключи авто-генерятся в `data/vapid.json` при первом буте).
- Подписки хранятся в `db.json` (`subscriptions`); пуш-сообщения:
  - **rest-timer-over** (таймер истёк, вкладка свёрнута) — payload содержит
    «Отдых закончился»;
  - **day-reminder** (напоминание о тренировке по расписанию).
- На клиенте SW обрабатывает `push` → показ notification; клик → фокус на нужный экран.

### 6.5 Темы и акценты
- `data-theme` / `data-accent` атрибуты на `<body>` (App.jsx, `useUI`), CSS-переменные
  `--purple/--red/--orange/--yellow/--green/--acc-2` и т.д.
- Палитры хранятся в `lib/theme.js` / `locales`-нейтральные константы; переключение —
  мгновенное, без перезагрузки; вспомогательный `TimerFlash.jsx` использует accent.
- Effort-цвета (§4.4) переиспользуют те же CSS-переменные — единая палитра.

### 6.6 i18n (lib/i18n.js, i18n-core.js, locales/)
- **16 языков** (ru/en/uk/de/fr/es/it/pt/pl/cs/tr/ar/zh/ja/ko/...), локаль в `locales/`.
- Формат ключей `t('key', {placeholders})`, плюрализация по правилам языка,
  ленивая подгрузка языкового пакета (code-split), fallback на en.
- Инструкции упражнений `instr/` — markdown/текст по языкам; спец. названия в
  `exercise-names/` (перевод имён упражнений отдельно от локалей UI).

### 6.7 Онбординг и вход
- Login: **passkey (WebAuthn)** — зарегистрировать устройство + подтверждение; гость
  (без логина) — `ALLOW_GUEST` режим, все данные локально.
- MobileOnboarding: разрешения (уведомления), спаривание, зеркало в файл.
- CoachIntake: «коуч-интервью» — серия вопросов (цели, опыт, частота, оборудование),
  ответы участвуют в промпте AI-коуча (§7.6).

---

## 7. AI-коуч и MCP-интеграция

### 7.1 Архитектура коуча (всё опционально, off by default)
- Провайдеры: 6 (Anthropic, OpenAI, Google Gemini, OpenCode-compatible,
  Codex, локальный/совместимый). Драйверы в `lib/coach-*.js` (клиент) и в
  `api/` (server-side jobs); активация по ключу → `coach-secrets.js` (пустой рантайм-маунт
  подпитывается твоим ключом, не хранится в коде).
- Режимы устройства (coach-device.js): `COACH_MODES` — who runs generation:
  - **BYOK** (bring-your-own-key): генерация идёт с клиента (localStorage ключ,
    `coach-local.js`);
  - **null** (undefined): только фронтенд-применение предложений, генерация отключена.

### 7.2 Пайплайн генерации (lib/coach.js + server)
```
prepare prompts → attemptOnce(provider) → validate (VALIDATE) → repair-цикл (1 попытка)
→ apply → snapshot → log
```
- Промпт = system (общий + task-специфичный) + user (payload данных). Payload:
  `CONTRACT=1`, `MAX_WEEKS=12`, `MAX_SESSIONS=60`, категории данных
  (routines/workouts/bodyweight/1RM/muscle-balance/effort).
- `extractJSON` — вытащить JSON из ответа LLM (fence-сниффер, обрезка до первого
  валидного объекта); `contractOK` — проверка схемы.
- **VALIDATE** (изменение плана одобряется только так):
  - `CHANGE_TYPES` — 17 типов допустимых правок (добавить/убрать упражнение, изменить
    sets/reps/weight/rest, добавить интенсификатор, сменить порядок, ...);
  - `MAX_INC=50` — лимит изменения веса сессии +50% (защита от бреда LLM);
  - недельный список сессий обязан оставаться в рамках целевых дней/частоты;
  - любые правки вне белого списка → предложение отклоняется.
- **Коуч-интервью** (CoachIntake) → профиль пользователя: цели, опыт, дни, оборудование,
  ограничения. Этот профиль — часть system prompt коуча (персонализация).

### 7.3 Снапшоты и откат
- Перед применением плана — снапшот `SNAPSHOT_MAX=3` последних состояний (можно откатить
  любой change), `CONSENT_VERSION=1` — версия согласия (при смене версии предложения не
  применяются без нового согласия), `LOG_MAX=50` — журнал применённых предложений.

### 7.4 Серверные jobs (api) — каденция
- `TICK_MS=60000` (каждую минуту проверять, кому пора).
- Каденции: **weekly** (по расписанию пользователя) и **everyWorkouts** (после N
  тренировок).
- Предложения создаются server-side, хранятся в `state-<uid>.json` (`coach.proposals`),
  клиент их подтягивает (`coach-api.js`) и показывает в UI — применить/отклонить/изменить.
- `hashPlan` — FR-32 хэш плана для дедупликации повторных предложений.

### 7.5 Адаптеры провайдеров (api/coach-*.js + lib)
- `http`-адаптер: `MAX_OUTPUT_TOKENS=16000`, timeout 5 мин, ретраи (backoff), payload
  common (chat completions).
- `anthropic`: messages API, `claude` SDK в режиме LOCKDOWN (только допустимые инструменты).
- `openai` / `gemini`: соответствующие SDK/HTTP.
- `compatible`: OpenAI-совместимые локальные эндпоинты (например, localhost).
- `codex`: для Codex CLI/spawn.
- Каждый адаптер возвращает единый нормализованный `{text, usage}`.

### 7.6 MCP-сервер (mcp/)
- Read-only stdio-мост (`@modelcontextprotocol/sdk`), НЕ часть Docker; запускается
  LLM-клиентом (Claude Desktop, Cursor...).
- Чтение напрямую из `DATA_DIR` (с `resolveUid` — какой пользователь), без сети.
- 8 read-only инструментов:
  routines/workouts/body-weight/1RM/muscle-balance/effort/... (zod-валидированные схемы,
  `tools.js`), `labels.js` — человекочитаемые подписи, `state.js` — загрузка/производные.
- `fs.watch` на data dir — инструменты возвращают свежие данные.
- Конфиг клиента — в `mcp/README.md`; env `OPENGYM_DATA` — путь к data.

---

## 8. Карта переноса в fitness-app (vanilla JS PWA)

### 8.1 Что переносим в первую очередь (MVP-срез ядра)
| Фича | Модуль-источник | Что перенести |
|---|---|---|
| Стейт + персист | store/useStore.js | localStorage key + reducer-подобная функция; JSON-формы §2.3–2.4 |
| Экран тренировки | views/Workout.jsx + workout-model | 4 режима сетов, done-трекинг, предзаполнение весов |
| Сессия | session-start.js, finish-workout.js | buildSessionEntries, buildCompletedWorkout (чистые функции) |
| Суперсеты | supersetFlow.js, active-workout-order.js | nextUnfinishedUnit, restSecFor, restAfterSet, moveActiveWorkoutUnit |
| Таймер отдыха | useUI.js + RestTimer | startRest + звук + вспышка (без Web Push на старте) |
| Упражнения | exercises-data.js → data/exercises.js | свой каталог (наши данные) по форме §4.1 |
| 1RM | onerm.js | estimate1RM (Epley/Brzycki/Lombardi) |
| Прогрессия | progression.js | linear/greyskull/double/time + stallCount + DELOAD |
| Статистика | history.js, effort.js, onerm.js | volume, streak, e1rm-ряд, effortSummary/histogram |
| i18n | i18n-core.js | ru/en минимум, t()-паттерн, plural |
| Экспорт/импорт | import-*.js, plan-share.js | JSON backup + CSV импорт |

### 8.2 Что имеет смысл на втором этапе
- Heatmap + BodyMap (SVG-пути мышц; упростить до 8 групп на старте).
- QR-чекин: lean-qr генерация + BarcodeDetector/jsQR сканирование.
- Web Push уведомления (VAPID + SW) — rest-timer-over, напоминания.
- AI-коуч: только BYOK-режим, VALIDATE с 17 типами и MAX_INC=50 — обязательно
  (без этого LLM может «улучшить» план в бред).
- Тема/акценты + TimerFlash.

### 8.3 Что осознанно НЕ переносим (лицензия/объём)
- AGPL-код как есть (переписываем по этому описанию; свои переводы, свои анимации).
- WebAuthn/passkey-сервер, Capacitor-сборка, MCP-сервер, парсинг Hevy — только если
  реально нужны и только с requirements.
- 1324-урочный каталог упражнений: берём свою `data/exercises.js`, форма та же.
- Система демо-профиля (gym_demo_seeded): не нужна.

### 8.4 Риски при переносе (проверенные в openGym)
1. **Высокий-water в суперсетах** — без него uncheck/re-check спавнит ложные переходы
   и таймеры (issue #3). Переносить вместе с restAfterSet/restOnRecheck.
2. **restSec по максимуму группы** — дефолт 0 выключает таймер, но явный restSec
   упражнения обязан перебивать дефолт.
3. **Бэкфилл не трогает прогрессию** — иначе задним числом «дёргается» 1RM/PR.
4. **Валидация LLM** — коэффициент MAX_INC=50 обязателен.
5. **Чистые функции + тесты** — прогрессия и чтение сессий были багами дважды; тесты
   ловили их, клики — нет.