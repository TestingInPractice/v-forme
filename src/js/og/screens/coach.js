/**
 * og/screens/coach.js — экран AI-коуча (BYOK).
 * Регистрирует 'og-coach'. Ключ хранится ТОЛЬКО в localStorage 'og_coach_key'
 * (не в og_state_v1). Все строки — через ../i18n.js (t) с русским fallback.
 */

import * as router from '../router.js';
import * as store from '../store.js';
import * as coach from '../coach.js';
import { t } from '../i18n.js';

const KEY_LS = 'og_coach_key';
const CONSENT_LS = 'og_coach_consent';
const PREFS_LS = 'og_coach_prefs';

const PROVIDERS = {
  anthropic: { label: 'Anthropic', model: 'claude-sonnet-4-5', baseUrl: null },
  openai: { label: 'OpenAI', model: 'gpt-4o-mini', baseUrl: null },
  compatible: { label: 'Совместимый (Ollama и др.)', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434/v1/chat/completions' },
};

const CSS = `
.og-coach-rows { margin: 0 -16px 12px; }
.og-coach-fieldrow[hidden] { display: none; }
.og-coach-val { width: 58%; flex: 0 1 280px; }
.og-coach-select { width: 52%; flex: 0 1 220px; }
.og-coach-taskwrap { margin-bottom: 12px; }
.og-coach-task { resize: vertical; min-height: 76px; }
.og-coach-hint { margin-top: 8px; min-height: 1.1em; }
.og-coach-error { background: var(--og-danger-bg); border-color: var(--og-danger-line); color: var(--og-danger-text); white-space: pre-wrap; }
.og-coach-success { background: color-mix(in srgb, var(--og-green) 14%, transparent); border-color: color-mix(in srgb, var(--og-green) 34%, transparent); color: var(--og-green); }
.og-coach-success .og-btn { margin-top: 12px; }
.og-coach-diff { margin-top: 8px; }
.og-coach-routine { margin-bottom: 10px; }
.og-coach-routine-name { margin-bottom: 4px; font-size: 15px; font-weight: 700; color: var(--og-accent); }
.og-coach-change { display: flex; gap: 8px; padding: 4px 0; font-size: 14px; align-items: baseline; }
.og-coach-sign { flex: none; width: 18px; text-align: center; font-weight: 800; }
.og-coach-change.add .og-coach-sign { color: var(--og-green); }
.og-coach-change.rem .og-coach-sign { color: var(--og-red); }
.og-coach-change.mod .og-coach-sign { color: var(--og-yellow); }
.og-coach-actions { display: flex; gap: 10px; margin-top: 12px; }
.og-coach-actions .og-btn { flex: 1; }
.og-coach-log-row { padding: 8px 0; border-bottom: var(--og-hair) solid var(--og-line); font-size: 13px; }
.og-coach-log-row:last-child { border-bottom: none; padding-bottom: 0; }
.og-coach-log-summary { margin-top: 2px; color: var(--og-text); }
.og-coach-spinner::before { content: ''; display: inline-block; width: 13px; height: 13px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: og-coach-spin .8s linear infinite; margin-right: 7px; vertical-align: -1px; }
@keyframes og-coach-spin { to { transform: rotate(360deg); } }
`;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtTs(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function render(appEl, params) {
  router.injectCss('og-coach', CSS);

  appEl.innerHTML = `
    <div class="og-screen">
      <header class="og-hdr">
        <button class="og-back" id="og-coach-prev" title="${t('К экранам og')}">←</button>
        <h2>${t('AI-коуч')}</h2>
        <button class="og-iconbtn" id="og-coach-exit" title="${t('Выйти в приложение')}">${t('Выход')}</button>
      </header>

      <div class="og-card">
        <div class="og-coach-rows">
          <label class="og-lrow" for="og-coach-key">
            <span class="og-lrow-tt">${t('API-ключ')}</span>
            <input type="password" class="og-input og-coach-val" id="og-coach-key" autocomplete="off"
                   placeholder="sk-..." value="">
          </label>
          <label class="og-lrow" for="og-coach-provider">
            <span class="og-lrow-tt">${t('Провайдер')}</span>
            <select class="og-select og-coach-select" id="og-coach-provider">
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="compatible">${t('Совместимый (Ollama и др.)')}</option>
            </select>
          </label>
          <label class="og-lrow og-coach-fieldrow" id="og-coach-baseurl-wrap" for="og-coach-baseurl" hidden>
            <span class="og-lrow-tt">${t('Base URL')}</span>
            <input class="og-input og-coach-val" id="og-coach-baseurl" autocomplete="off"
                   placeholder="http://localhost:11434/v1/chat/completions">
          </label>
          <label class="og-lrow og-coach-fieldrow" id="og-coach-model-wrap" for="og-coach-model" hidden>
            <span class="og-lrow-tt">${t('Модель')}</span>
            <input class="og-input og-coach-val" id="og-coach-model" autocomplete="off" placeholder="...">
          </label>
        </div>
        <div class="og-coach-taskwrap">
          <label class="og-label" for="og-coach-task">${t('Задача')}</label>
          <textarea class="og-input og-coach-task" id="og-coach-task" rows="3"
                    placeholder="${t('Например: добавь подтягивания в понедельник, уменьши отдых во вторник')}"></textarea>
        </div>
        <div class="og-coach-rows">
          <label class="og-lrow" for="og-coach-consent">
            <span class="og-lrow-tt">${t('Я понимаю, что предложения ИИ нужно проверять')}</span>
            <span class="og-sw"><input class="og-sw-in" type="checkbox" id="og-coach-consent"><span class="og-sw-kn"></span></span>
          </label>
        </div>
        <button class="og-btn og-btn-primary og-btn-block og-btn-xl" id="og-coach-gen" disabled>
          ${t('Сгенерировать')}
        </button>
        <div class="og-muted og-coach-hint" id="og-coach-hint"></div>
      </div>

      <div class="og-card og-coach-error" id="og-coach-error" hidden></div>
      <div class="og-card og-coach-success" id="og-coach-success" hidden></div>

      <div id="og-coach-proposal" hidden>
        <div class="og-card">
          <div class="og-card-title">${t('Предложение')}</div>
          <div class="og-muted" id="og-coach-intent"></div>
          <div class="og-coach-diff" id="og-coach-diff"></div>
          <div class="og-coach-actions">
            <button class="og-btn og-btn-primary" id="og-coach-apply">${t('Применить')}</button>
            <button class="og-btn" id="og-coach-revert">${t('Отменить')}</button>
          </div>
        </div>
      </div>

      <div class="og-card">
        <div class="og-card-title">${t('Журнал')}</div>
        <div id="og-coach-log"></div>
      </div>
    </div>`;

  const $ = (id) => appEl.querySelector('#' + id);
  const keyInput = $('og-coach-key');
  const providerSelect = $('og-coach-provider');
  const baseUrlWrap = $('og-coach-baseurl-wrap');
  const baseUrlInput = $('og-coach-baseurl');
  const modelWrap = $('og-coach-model-wrap');
  const modelInput = $('og-coach-model');
  const taskInput = $('og-coach-task');
  const consentInput = $('og-coach-consent');
  const genBtn = $('og-coach-gen');
  const hintEl = $('og-coach-hint');
  const errorEl = $('og-coach-error');
  const successEl = $('og-coach-success');
  const proposalEl = $('og-coach-proposal');
  const intentEl = $('og-coach-intent');
  const diffEl = $('og-coach-diff');
  const logEl = $('og-coach-log');

  let currentProposal = null;

  // Персист ключа/согласия (отдельные ключи localStorage, НЕ og_state_v1) ──
  keyInput.value = localStorage.getItem(KEY_LS) || '';
  if (localStorage.getItem(CONSENT_LS) === String(coach.CONSENT_VERSION)) {
    consentInput.checked = true;
  }
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_LS) || 'null');
    if (prefs && typeof prefs === 'object') {
      if (PROVIDERS[prefs.provider]) providerSelect.value = prefs.provider;
      if (typeof prefs.baseUrl === 'string') baseUrlInput.value = prefs.baseUrl;
      if (typeof prefs.model === 'string') modelInput.value = prefs.model;
    }
  } catch {
    /* битый JSON — игнор */
  }

  // ── провайдер: показать/скрыть baseUrl и модель ──
  function syncProviderFields() {
    const p = PROVIDERS[providerSelect.value] || PROVIDERS.compatible;
    baseUrlWrap.hidden = !p.baseUrl;
    modelWrap.hidden = false;
    modelInput.placeholder = p.model;
    if (!modelInput.value.trim()) modelInput.value = p.model;
    if (p.baseUrl && !baseUrlInput.value.trim()) baseUrlInput.value = p.baseUrl;
  }
  function savePrefs() {
    localStorage.setItem(PREFS_LS, JSON.stringify({
      provider: providerSelect.value,
      baseUrl: baseUrlInput.value.trim(),
      model: modelInput.value.trim(),
    }));
  }
  providerSelect.addEventListener('change', () => { syncProviderFields(); savePrefs(); });
  baseUrlInput.addEventListener('input', savePrefs);
  modelInput.addEventListener('input', savePrefs);
  syncProviderFields();

  // ── состояние кнопки «Сгенерировать» + подсказка ──
  function updateGenState() {
    const online = navigator.onLine !== false;
    const hasRoutines = (store.load().routines || []).length > 0;
    const ready = online && hasRoutines && consentInput.checked
      && (keyInput.value.trim() || providerSelect.value === 'compatible')
      && taskInput.value.trim();
    genBtn.disabled = !ready;
    let hint = '';
    if (!online) hint = t('Нет сети — генерация недоступна');
    else if (!hasRoutines) hint = t('Сначала создайте хотя бы одну рутину');
    else if (!consentInput.checked) hint = t('Подтвердите согласие, чтобы включить генерацию');
    else if (!keyInput.value.trim() && providerSelect.value !== 'compatible') hint = t('Введите API-ключ');
    else if (!taskInput.value.trim()) hint = t('Опишите задачу');
    hintEl.textContent = hint;
  }
  [keyInput, taskInput, consentInput, providerSelect].forEach((el) => {
    el.addEventListener('input', updateGenState);
    el.addEventListener('change', updateGenState);
  });
  // Персист ключа и согласия (отдельные ключи localStorage, НЕ og_state_v1).
  keyInput.addEventListener('input', () => localStorage.setItem(KEY_LS, keyInput.value.trim()));
  consentInput.addEventListener('change', () => {
    if (consentInput.checked) localStorage.setItem(CONSENT_LS, String(coach.CONSENT_VERSION));
    else localStorage.removeItem(CONSENT_LS);
  });
  window.addEventListener('online', updateGenState);
  window.addEventListener('offline', updateGenState);

  // ── сообщения ──
  function showError(msg) {
    errorEl.innerHTML = esc(msg);
    errorEl.hidden = false;
    successEl.hidden = true;
  }
  function hideError() {
    errorEl.hidden = true;
  }
  function showSuccess(msg, rid) {
    successEl.innerHTML = esc(msg)
      + (rid ? `<button class="og-btn og-btn-primary og-btn-block" id="og-coach-go-workout">${t('Перейти к тренировке')}</button>` : '');
    successEl.hidden = false;
    errorEl.hidden = true;
    const goBtn = appEl.querySelector('#og-coach-go-workout');
    if (goBtn) goBtn.onclick = () => router.go('workout', { rid });
  }

  // ── лог ──
  function renderLog(S) {
    const log = (S.coach && S.coach.log) || [];
    if (!log.length) {
      logEl.innerHTML = `<div class="og-muted">${t('Пока нет действий')}</div>`;
      return;
    }
    logEl.innerHTML = log.slice().reverse().map((e) => {
      const action = e.action === 'apply' ? t('Применено') : t('Откат');
      return `<div class="og-coach-log-row">
        <span class="og-chip">${action}</span>
        <span class="og-muted"> · ${esc(fmtTs(e.ts))}</span>
        <div class="og-coach-log-summary">${esc(e.summary || '')}</div>
      </div>`;
    }).join('');
  }

  // ── diff ──
  function changeRow(ch, routine) {
    const item = routine ? (routine.items || []).find((it) => it.id === ch.exId) : null;
    const name = (item && item.name) || ch.name || ch.exId || '—';
    const cls = ch.type === 'add_exercise' ? 'add' : ch.type === 'remove_exercise' ? 'rem' : 'mod';
    const sign = ch.type === 'add_exercise' ? '+' : ch.type === 'remove_exercise' ? '−' : '~';
    let text;
    switch (ch.type) {
      case 'add_exercise':
        text = `${name} (${ch.mode || 'reps'}, ${ch.sets ?? 3}×${ch.reps ?? 10})`;
        break;
      case 'remove_exercise':
        text = name;
        break;
      case 'reorder_exercise':
        text = `${name} → ${t('позиция')} ${ch.index}`;
        break;
      case 'set_sets': text = `${name}: ${t('подходы')} ${item ? item.sets : '?'} → ${ch.value}`; break;
      case 'set_reps': text = `${name}: ${t('повторы')} ${item ? item.reps : '?'} → ${ch.value}`; break;
      case 'set_reps_range': text = `${name}: ${t('диапазон')} ${ch.value ? ch.value.repsMin : '?'}–${ch.value ? ch.value.reps : '?'}`; break;
      case 'set_weight': text = `${name}: ${t('вес')} ${item ? item.weight : '?'} → ${ch.value}`; break;
      case 'set_rest': text = `${name}: ${t('отдых')} ${item ? item.restSec : '?'} → ${ch.value}`; break;
      case 'set_mode': text = `${name}: ${t('режим')} ${item ? item.type : '?'} → ${ch.value}`; break;
      case 'set_sec': text = `${name}: ${t('время')} ${item ? item.sec : '?'} → ${ch.value}`; break;
      case 'set_dist': text = `${name}: ${t('дистанция')} ${item ? item.dist : '?'} → ${ch.value}`; break;
      case 'set_superset': text = `${name}: ${t('суперсет')} ${item ? item.sg : '?'} → ${ch.value ?? '—'}`; break;
      case 'set_intensifier': text = `${name}: ${t('интенсификатор')} ${item ? item.intensifier : '?'} → ${ch.value ?? '—'}`; break;
      case 'set_warmup': text = `${name}: ${t('разминка')} ${item ? item.warmupRestSec : '?'} → ${ch.value}`; break;
      case 'set_inc': text = `${name}: ${t('шаг')} ${item ? item.inc : '?'} → ${ch.value}`; break;
      case 'set_exclude_progression': text = `${t('прогрессия')}: ${ch.value ? t('выкл') : t('вкл')}`; break;
      case 'set_routine_rest': text = `${t('отдых рутины')}: ${routine ? routine.restSec : '?'} → ${ch.value}`; break;
      default: text = ch.type;
    }
    return `<div class="og-coach-change ${cls}"><span class="og-coach-sign">${sign}</span><span>${esc(text)}</span></div>`;
  }

  function renderProposal(proposal, S) {
    intentEl.textContent = proposal.intent || '';
    const byRoutine = new Map();
    for (const ch of proposal.changes || []) {
      const rid = ch.rid || '';
      if (!byRoutine.has(rid)) byRoutine.set(rid, []);
      byRoutine.get(rid).push(ch);
    }
    let html = '';
    for (const [rid, changes] of byRoutine) {
      const routine = S.routines ? S.routines.find((r) => r.id === rid) : null;
      html += `<div class="og-coach-routine"><div class="og-coach-routine-name">${esc(routine ? routine.name : '—')}</div>`;
      for (const ch of changes) html += changeRow(ch, routine);
      html += '</div>';
    }
    diffEl.innerHTML = html || `<div class="og-muted">${t('Нет изменений')}</div>`;
    proposalEl.hidden = false;
  }

  function hideProposal() {
    proposalEl.hidden = true;
    currentProposal = null;
  }

  // ── генерация ──
  genBtn.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    const provider = providerSelect.value;
    const task = taskInput.value.trim();
    const baseUrl = baseUrlInput.value.trim() || null;
    const model = modelInput.value.trim() || null;

    if (!consentInput.checked) {
      showError(t('Подтвердите согласие на проверку предложений ИИ'));
      return;
    }
    if (!task) {
      showError(t('Опишите задачу'));
      return;
    }
    if (!key && provider !== 'compatible') {
      showError(t('Введите API-ключ'));
      return;
    }

    localStorage.setItem(KEY_LS, key);
    hideError();
    hideProposal();
    genBtn.disabled = true;
    genBtn.classList.add('og-coach-spinner');
    genBtn.textContent = t('Думаю...');

    const S = store.load();
    let res;
    try {
      res = await coach.generateProposal(S, { apiKey: key, provider, task, baseUrl, model });
    } catch (err) {
      console.error('og/coach: ошибка генерации', err);
      res = { ok: false, error: t('Неожиданная ошибка: ') + ((err && err.message) || '?') };
    }

    genBtn.classList.remove('og-coach-spinner');
    genBtn.textContent = t('Сгенерировать');
    updateGenState();

    if (!res.ok) {
      showError(res.errors && res.errors.length ? res.errors.join('\n') : (res.error || t('Ошибка')));
      return;
    }
    currentProposal = res.proposal;
    renderProposal(res.proposal, S);
  });

  // ── применить / отменить ──
  $('og-coach-apply').addEventListener('click', () => {
    if (!currentProposal) return;
    const S = store.load();
    const next = coach.applyProposal(S, currentProposal);
    const changedRid = (currentProposal.changes || []).find((ch) => ch.rid)?.rid || null;
    hideProposal();
    renderLog(next);
    showSuccess(t('Предложение применено. Снимок сохранён — можно откатить.'), changedRid);
  });

  $('og-coach-revert').addEventListener('click', () => {
    const S = store.load();
    const snapshots = (S.coach && S.coach.snapshots) || [];
    if (!snapshots.length) {
      showError(t('Нет снимков для отката'));
      return;
    }
    const next = coach.snapshotPop(S);
    hideProposal();
    renderLog(next);
    showSuccess(t('Изменения откачены.'));
  });

  // ── шапка ──
  $('og-coach-prev').addEventListener('click', () => router.go('home'));
  $('og-coach-exit').addEventListener('click', () => router.backToApp());

  // ── стартовый рендер ──
  updateGenState();
  renderLog(store.load());
}

router.register('coach', render);