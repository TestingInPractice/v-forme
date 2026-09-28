/**
 * og/screens/settings.js — настройки og-контура (og-settings).
 *
 * Поля S.profile через store.update: имя, единицы (kg/lb), шкала усилия (rir/rpe/off),
 * тема (dark/light → body[data-og-theme]), акцент (→ --og-accent на :root),
 * restSec (0 = выкл), beep/vibrate/timerFlash, wc-флаги, вес тела.
 * Данные: экспорт JSON (og_state_v1), импорт с валидацией, полный сброс.
 */

import { register, injectCss, backToApp } from '../router.js';
import { load as loadState, save as saveState, update as updateState, reset as resetState, defaultState } from '../store.js';
import { resetActiveSession } from './_workout-core.js';
import * as catalog from '../../modules/catalog.js';
import { buildExport, validateImport } from '../backup.js';
import * as eq from '../equipment.js';

injectCss('og-settings', `
.og-settings-value { width: 58%; flex: 0 1 280px; }
.og-settings-select { width: 52%; flex: 0 1 220px; }
.og-settings-swatches { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.og-swatch { padding: 0; border-radius: 50%; }
.og-swatch:hover { transform: scale(1.06); }
.og-swatch.active { border-color: var(--og-text); box-shadow: 0 0 0 2px var(--og-card); }
.og-settings-action { width: 100%; border: 0; border-radius: 0; background: none; color: inherit; font: inherit; text-align: left; }
.og-settings-action-danger { color: var(--og-danger-text); }
.og-settings-modal-body { max-height: 50vh; overflow-y: auto; }
`);

/* ─── Русский словарь (fallback, если i18n.js ещё не готов) ─── */
const RU = {
  'settings.title': 'Настройки',
  'settings.profile': 'Профиль',
  'settings.name': 'Имя',
  'settings.gym': 'Зал',
  'settings.bodyWeight': 'Вес тела',
  'settings.unitsEffort': 'Единицы и усилие',
  'settings.unit': 'Единицы веса',
  'settings.unitKg': 'кг',
  'settings.unitLb': 'фунты (lb)',
  'settings.effort': 'Шкала усилия',
  'settings.off': 'Выкл',
  'settings.appearance': 'Внешний вид',
  'settings.theme': 'Тема',
  'settings.dark': 'Тёмная',
  'settings.light': 'Светлая',
  'settings.accent': 'Акцент',
  'settings.restTimer': 'Таймер отдыха',
  'settings.restSec': 'Отдых по умолчанию (сек, 0 = выкл)',
  'settings.beep': 'Звуковой сигнал',
  'settings.vibrate': 'Вибрация',
  'settings.timerFlash': 'Вспышка по окончании',
  'settings.wc': 'Управление тренировкой',
  'settings.wcSteppers': 'Кнопки +/− на полях',
  'settings.wcSetShortcuts': 'Быстрые чипы +Drop/+Burst',
  'settings.wcPairButtons': 'Кнопки «суперсет с соседом»',
  'settings.wcExerciseButtons': 'Кнопки перемещения/замены',
  'settings.data': 'Данные',
  'settings.export': 'Экспорт (JSON)',
  'settings.import': 'Импорт (JSON)',
  'settings.reset': 'Сбросить все данные',
  'settings.resetConfirm': 'Сбросить все данные og-контура? Это удалит шаблоны, историю, настройки, ключ коуча и каталог упражнений.',
  'settings.importInvalid': 'Файл не похож на резервную копию og_state_v1 (нет v / workouts)',
  'settings.importError': 'Ошибка импорта',
  'settings.dataNote': 'Резервная копия — полный JSON состояния (og_state_v1). Импорт заменит текущие данные.',
  // оборудование (профили)
  'settings.equipment': 'Оборудование',
  'settings.equipFilter': 'Фильтровать по моему оборудованию',
  'settings.equipNoProfiles': 'Профилей пока нет — добавьте, чтобы видеть только упражнения под ваше оборудование.',
  'settings.equipAdd': 'Добавить профиль',
  'settings.equipEdit': 'Изменить',
  'settings.equipDelete': 'Удалить',
  'settings.equipActive': 'Активный профиль',
  'settings.equipName': 'Название профиля',
  'settings.equipNamePlaceholder': 'Например: Мой зал',
  'settings.equipItems': 'Оборудование',
  'settings.equipCount': '{n} шт.',
  'settings.equipHint': 'Профиль — набор инвентаря. Упражнения вне набора скрываются (кроме «свой вес» — он доступен всегда).',
  'settings.equipDeleteConfirm': 'Удалить профиль «{name}»?',
};

let _t = (k, p = {}) => {
  let s = RU[k] ?? k;
  for (const [kk, vv] of Object.entries(p)) s = s.split(`{${kk}}`).join(String(vv));
  return s;
};
try {
  const m = await import('../i18n.js');
  if (m && typeof m.t === 'function') _t = m.t;
} catch (err) {
  console.warn('og: i18n.js недоступен — русский fallback', err);
}
function t(k, p = {}) {
  let s;
  try { s = _t(k, p); } catch { s = null; }
  if (s == null || s === k) s = RU[k] ?? k;
  if (typeof s !== 'string') s = String(s);
  for (const [kk, vv] of Object.entries(p)) s = s.split(`{${kk}}`).join(String(vv));
  return s;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const ACCENTS = [
  { id: 'purple', color: '#a78bfa', name: 'Фиолетовый' },
  { id: 'red', color: '#f87171', name: 'Красный' },
  { id: 'orange', color: '#fb923c', name: 'Оранжевый' },
  { id: 'yellow', color: '#facc15', name: 'Жёлтый' },
  { id: 'green', color: '#4ade80', name: 'Зелёный' },
  { id: 'blue', color: '#60a5fa', name: 'Синий' },
];

/** Применить тему и акцент к документу (мгновенно, без перезагрузки). */
function applyTheme(profile) {
  document.body.dataset.ogTheme = profile.theme === 'light' ? 'light' : 'dark';
  const accent = ACCENTS.some((a) => a.id === profile.accent) ? profile.accent : 'purple';
  document.documentElement.style.setProperty('--og-accent', `var(--og-${accent})`);
}

function dateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

const EQ_KEYS = {
  bodyweight: 'library.eq.bodyweight',
  barbell: 'library.eq.barbell',
  dumbbell: 'library.eq.dumbbell',
  bar: 'library.eq.bar',
  bars: 'library.eq.bars',
  band: 'library.eq.band',
  kettlebell: 'library.eq.kettlebell',
};

function eqName(eqVal) {
  return EQ_KEYS[eqVal] ? t(EQ_KEYS[eqVal]) : (eqVal || '—');
}

function toggleRow(field, label, checked) {
  return `
    <div class="og-lrow">
      <span class="og-lrow-tt">${label}</span>
      <span class="og-sw"><input class="og-sw-in" type="checkbox" data-field="${field}" ${checked ? 'checked' : ''}><span class="og-sw-kn"></span></span>
    </div>`;
}

export async function render(appEl, params) {
  try {
    const S = loadState();
    const p = S.profile;
    applyTheme(p);

    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr">
          <button class="og-back" data-act="back" aria-label="←">←</button>
          <h2>${t('settings.title')}</h2>
        </header>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.profile')}</h2>
          <div class="og-sect-b">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.name')}</span>
              <input class="og-input og-settings-value" data-field="name" value="${esc(p.name)}" autocomplete="off">
            </label>
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.gym')}</span>
              <input class="og-input og-settings-value" data-field="gym" value="${esc(p.gym ?? '')}" autocomplete="off" placeholder="${esc(t('settings.gym'))}">
            </label>
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.bodyWeight')}</span>
              <input class="og-input og-num" type="number" min="0" step="0.5" data-field="bodyWeight" value="${p.bodyWeight ?? 75}">
            </label>
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.unitsEffort')}</h2>
          <div class="og-sect-b">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.unit')}</span>
              <select class="og-select og-settings-select" data-field="unit">
                <option value="kg" ${p.unit === 'kg' ? 'selected' : ''}>${t('settings.unitKg')}</option>
                <option value="lb" ${p.unit === 'lb' ? 'selected' : ''}>${t('settings.unitLb')}</option>
              </select>
            </label>
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.effort')}</span>
              <select class="og-select og-settings-select" data-field="effort">
                <option value="rir" ${p.effort === 'rir' ? 'selected' : ''}>RIR</option>
                <option value="rpe" ${p.effort === 'rpe' ? 'selected' : ''}>RPE</option>
                <option value="off" ${p.effort === 'off' ? 'selected' : ''}>${t('settings.off')}</option>
              </select>
            </label>
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.appearance')}</h2>
          <div class="og-sect-b">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.theme')}</span>
              <select class="og-select og-settings-select" data-field="theme">
                <option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>${t('settings.dark')}</option>
                <option value="light" ${p.theme === 'light' ? 'selected' : ''}>${t('settings.light')}</option>
              </select>
            </label>
            <div class="og-lrow">
              <span class="og-lrow-tt">${t('settings.accent')}</span>
              <div class="og-settings-swatches" data-act="swatches">
                ${ACCENTS.map((a) => `<button class="og-iconbtn og-swatch ${p.accent === a.id ? 'active' : ''}" data-accent="${a.id}" style="background:${a.color}" title="${a.name}" aria-label="${a.name}"></button>`).join('')}
              </div>
            </div>
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.restTimer')}</h2>
          <div class="og-sect-b">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.restSec')}</span>
              <input class="og-input og-num" type="number" min="0" step="5" data-field="restSec" value="${p.restSec ?? 0}">
            </label>
            ${toggleRow('beep', t('settings.beep'), !!p.beep)}
            ${toggleRow('vibrate', t('settings.vibrate'), !!p.vibrate)}
            ${toggleRow('timerFlash', t('settings.timerFlash'), !!p.timerFlash)}
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.wc')}</h2>
          <div class="og-sect-b">
            ${toggleRow('wc.steppers', t('settings.wcSteppers'), !!p.wc?.steppers)}
            ${toggleRow('wc.setShortcuts', t('settings.wcSetShortcuts'), !!p.wc?.setShortcuts)}
            ${toggleRow('wc.pairButtons', t('settings.wcPairButtons'), !!p.wc?.pairButtons)}
            ${toggleRow('wc.exerciseButtons', t('settings.wcExerciseButtons'), !!p.wc?.exerciseButtons)}
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.equipment')}</h2>
          <div class="og-sect-b">
            <div class="og-lrow">
              <span class="og-lrow-tt">${t('settings.equipFilter')}</span>
              <span class="og-sw"><input class="og-sw-in" type="checkbox" data-act="equipFilterOn" ${S.equipFilterOn ? 'checked' : ''}><span class="og-sw-kn"></span></span>
            </div>
            ${!Array.isArray(S.equipProfiles) || S.equipProfiles.length === 0
              ? `<p class="og-sect-f">${t('settings.equipNoProfiles')}</p>`
              : `
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.equipActive')}</span>
              <select class="og-select og-settings-select" data-act="equipActive">
                <option value="" ${!S.activeEquipId ? 'selected' : ''}>—</option>
                ${S.equipProfiles.map((pr) => `<option value="${esc(pr.id)}" ${S.activeEquipId === pr.id ? 'selected' : ''}>${esc(pr.name)}</option>`).join('')}
              </select>
            </label>
            ${S.equipProfiles.map((pr) => `
              <div class="og-lrow">
                <span class="og-lrow-tt">${esc(pr.name)}<span class="og-lrow-ss"> — ${t('settings.equipCount', { n: String((pr.equipment || []).length) })}</span></span>
                <span class="og-settings-action og-lib-actions">
                  <button class="og-iconbtn" data-act="equipEdit" data-id="${esc(pr.id)}" aria-label="${t('settings.equipEdit')}">✎</button>
                  <button class="og-iconbtn" data-act="equipDel" data-id="${esc(pr.id)}" aria-label="${t('settings.equipDelete')}">🗑</button>
                </span>
              </div>`).join('')}
            `}
            <button class="og-lrow og-settings-action" data-act="equipAdd"><span class="og-lrow-tt">+ ${t('settings.equipAdd')}</span></button>
            <p class="og-sect-f">${t('settings.equipHint')}</p>
          </div>
        </section>

        <section class="og-sect">
          <h2 class="og-sect-t">${t('settings.data')}</h2>
          <div class="og-sect-b">
            <button class="og-lrow og-settings-action" data-act="export"><span class="og-lrow-tt">${t('settings.export')}</span></button>
            <button class="og-lrow og-settings-action" data-act="import"><span class="og-lrow-tt">${t('settings.import')}</span></button>
            <input type="file" accept="application/json,.json" data-act="file" hidden>
            <button class="og-lrow og-settings-action og-settings-action-danger" data-act="reset"><span class="og-lrow-tt">${t('settings.reset')}</span></button>
          </div>
          <p class="og-sect-f">${t('settings.dataNote')}</p>
        </section>
      </div>
      <div class="og-modal" data-act="eqmodal" hidden></div>
    `;

    appEl.querySelector('[data-act="back"]').onclick = () => backToApp();

    /** Обновить поле профиля через store.update и применить тему/акцент. */
    function updateProfile(field, value) {
      const next = updateState((prev) => {
        const profile = { ...prev.profile };
        if (field.startsWith('wc.')) {
          profile.wc = { ...profile.wc, [field.slice(3)]: !!value };
        } else {
          profile[field] = value;
        }
        return { ...prev, profile };
      });
      applyTheme(next.profile);
    }

// Текстовые/числовые поля (oninput-свойство: перезаписывает обработчик при ре-рендере).
    appEl.oninput = (e) => {
      const el = e.target;
      if (!el.dataset.field) return;
      let value = el.value;
      if (el.type === 'number') {
        const raw = el.value.trim();
        value = raw === '' ? null : Number(raw);
        if (value != null && !Number.isFinite(value)) value = null;
      }
      updateProfile(el.dataset.field, value);
    };

    // Селекты и чекбоксы.
    appEl.onchange = (e) => {
      const el = e.target;
      if (el.dataset.act === 'equipFilterOn') {
        updateState((prev) => ({ ...prev, equipFilterOn: el.checked }));
        return;
      }
      if (el.dataset.act === 'equipActive') {
        updateState((prev) => ({ ...prev, activeEquipId: el.value || null }));
        return;
      }
      if (!el.dataset.field) return;
      if (el.type === 'checkbox') updateProfile(el.dataset.field, el.checked);
      else updateProfile(el.dataset.field, el.value);
    };

    /** Модалка профиля оборудования: имя + чеклист значений инвентаря каталога. */
    async function renderEqModal(profileId) {
      if (catalog.getExercises().length === 0) await catalog.init();
      const S0 = loadState();
      const profiles = Array.isArray(S0.equipProfiles) ? S0.equipProfiles : [];
      const profile = profileId ? profiles.find((p) => p && p.id === profileId) : null;
      const opts = eq.equipmentOf(catalog.getExercises());
      const eqModalEl = appEl.querySelector('[data-act="eqmodal"]');
      eqModalEl.innerHTML = `
        <div class="og-modal-sheet">
          <div class="og-row">
            <h3 class="og-row-label">${profile ? esc(profile.name) : t('settings.equipAdd')}</h3>
            <button class="og-back" data-act="eqModalClose" aria-label="${t('settings.equipCancel')}">✕</button>
          </div>
          <div class="og-settings-modal-body">
            <label class="og-lrow">
              <span class="og-lrow-tt">${t('settings.equipName')}</span>
              <input class="og-input og-settings-value" data-eqname value="${profile ? esc(profile.name) : ''}" placeholder="${esc(t('settings.equipNamePlaceholder'))}" autocomplete="off">
            </label>
            <div class="og-lrow"><span class="og-lrow-tt">${t('settings.equipItems')}</span></div>
            ${opts.map((o) => `
              <label class="og-lrow">
                <span class="og-lrow-tt">${esc(eqName(o))}</span>
                <span class="og-sw"><input class="og-sw-in" type="checkbox" data-eqitem="${esc(o)}" ${profile && (profile.equipment || []).includes(o) ? 'checked' : ''}><span class="og-sw-kn"></span></span>
              </label>`).join('')}
            <p class="og-sect-f">${t('settings.equipHint')}</p>
          </div>
          <div class="og-spacer"></div>
          <button class="og-btn og-btn-primary og-btn-block" data-act="eqModalSave">${t('settings.equipSave')}</button>
        </div>`;
      eqModalEl.dataset.editId = profileId || '';
      eqModalEl.hidden = false;
    }

    // Оборудование: добавление/редактирование/удаление профиля + закрытие модалки.
    appEl.onclick = (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'equipAdd') { renderEqModal(''); return; }
      if (act === 'equipEdit') { renderEqModal(btn.dataset.id); return; }
      if (act === 'equipDel') {
        const S0 = loadState();
        const p = (S0.equipProfiles || []).find((x) => x && x.id === btn.dataset.id);
        if (!p) return;
        if (!confirm(t('settings.equipDeleteConfirm', { name: p.name }))) return;
        updateState((prev) => {
          const profiles = (prev.equipProfiles || []).filter((x) => x && x.id !== btn.dataset.id);
          const activeEquipId = prev.activeEquipId === btn.dataset.id ? (profiles[0]?.id || null) : prev.activeEquipId;
          return { ...prev, equipProfiles: profiles, activeEquipId };
        });
        render(appEl, params);
        return;
      }
      if (act === 'eqModalClose') { appEl.querySelector('[data-act="eqmodal"]').hidden = true; return; }
      if (act === 'eqModalSave') {
        const eqModalEl = appEl.querySelector('[data-act="eqmodal"]');
        const nameInput = eqModalEl.querySelector('[data-eqname]');
        const name = (nameInput.value || '').trim();
        if (!name) { nameInput.focus(); return; }
        const items = [...eqModalEl.querySelectorAll('[data-eqitem]:checked')].map((c) => c.dataset.eqitem);
        const editId = eqModalEl.dataset.editId || null;
        updateState((prev) => {
          const profiles = [...(prev.equipProfiles || [])];
          if (editId) {
            const i = profiles.findIndex((x) => x && x.id === editId);
            if (i >= 0) profiles[i] = { ...profiles[i], name, equipment: items };
          } else {
            const np = eq.newProfile(name);
            np.equipment = items;
            profiles.push(np);
          }
          return { ...prev, equipProfiles: profiles };
        });
        render(appEl, params);
      }
    };

    // Акцент-свотчи: НЕ трогаем клики из модалки оборудования.
    swatchesEl.onclick = (e) => {
      const sw = e.target.closest('[data-accent]');
      if (!sw) return;
      updateProfile('accent', sw.dataset.accent);
      swatchesEl.querySelectorAll('.og-swatch').forEach((s) => s.classList.toggle('active', s === sw));
    };

    // Экспорт: скачать JSON og_state_v1 + каталог (упражнения/категории).
    appEl.querySelector('[data-act="export"]').onclick = async () => {
      try {
        await catalog.init(); // гарантируем заполненный кэш каталога
        const data = buildExport(loadState(), {
          exercises: catalog.getExercises(),
          categories: catalog.getCategories(),
        });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `og-state-backup-${dateStamp()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error('og-settings: экспорт', err);
        alert(`${t('settings.importError')}: ${err.message}`);
      }
    };

    // Импорт: файл → JSON.parse → validateImport → save(state) + каталог → перерисовка.
    const fileEl = appEl.querySelector('[data-act="file"]');
    appEl.querySelector('[data-act="import"]').onclick = () => fileEl.click();
    fileEl.onchange = () => {
      const file = fileEl.files && fileEl.files[0];
      fileEl.value = '';
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        (async () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            const { state, catalog: catalogData } = validateImport(parsed);
            saveState(state);
            if (catalogData) await catalog.replaceAll(catalogData);
            const next = loadState();
            applyTheme(next.profile);
            render(appEl, params);
          } catch (err) {
            console.error('og-settings: импорт', err);
            alert(`${t('settings.importError')}: ${err.message}`);
          }
        })();
      };
      reader.onerror = () => {
        console.error('og-settings: чтение файла', reader.error);
        alert(t('settings.importError'));
      };
      reader.readAsText(file);
    };

    // Сброс: подтверждение → reset() → defaultState() → save → перерисовка.
    // Полная очистка: og_state_v1 + coach-ключи + pending (store.reset),
    // активная сессия (resetActiveSession), каталог упражнений (IDB + кэш).
    appEl.querySelector('[data-act="reset"]').onclick = async () => {
      if (!confirm(t('settings.resetConfirm'))) return;
      resetState();
      resetActiveSession();
      try {
        catalog.resetCache();
        const { clear } = await import('../../modules/db.js');
        await Promise.allSettled([clear('exercises'), clear('categories')]);
      } catch (err) {
        console.error('og-settings: сброс каталога', err);
      }
      const fresh = defaultState();
      saveState(fresh);
      applyTheme(fresh.profile);
      render(appEl, params);
    };
  } catch (err) {
    console.error('og-settings:', err);
    appEl.innerHTML = `
      <div class="og-screen">
        <header class="og-hdr"><button class="og-back" id="og-set-err-back">←</button><h2>${t('settings.title')}</h2></header>
        <div class="og-empty">${esc(String(err?.message || err))}</div>
      </div>`;
    const btn = appEl.querySelector('#og-set-err-back');
    if (btn) btn.onclick = () => backToApp();
  }
}

register('settings', render);