/**
 * Admin module — экран «Каталог упражнений»: категории, упражнения, GIF, MET.
 * Данные идут через catalog.js; рендер — в #app, как и остальные экраны.
 */
import * as catalog from './catalog.js';
import { showScreen } from './ui.js';

const EQUIPMENT_OPTIONS = [
  ['bodyweight', 'Свой вес'],
  ['barbell', 'Штанга'],
  ['dumbbell', 'Гантели'],
  ['bars', 'Брусья'],
  ['bar', 'Перекладина'],
  ['band', 'Эспандер'],
  ['kettlebell', 'Гиря'],
  ['other', 'Другое'],
];

const app = () => document.getElementById('app');

let _searchQuery = '';

export function renderAdmin() {
  const categories = catalog.getCategories();
  const exercises = catalog.getExercises();
  const q = _searchQuery.trim().toLowerCase();
  const filtered = exercises.filter(e =>
    !q ||
    e.name.toLowerCase().includes(q) ||
    (e.description || '').toLowerCase().includes(q) ||
    (e.muscleGroup || []).some(m => m.toLowerCase().includes(q))
  );
  const catName = (id) => (categories.find(c => c.id === id) || {}).name || id;

  app().innerHTML = `
    <div class="screen admin-screen">
      <div class="screen-header">
        <button class="btn-back" id="admin-back">← Назад</button>
        <h2>Каталог упражнений</h2>
      </div>
      <div class="settings-list">
        <div class="admin-section">
          <div class="admin-section-head">
            <span>Категории</span>
            <button class="btn btn-sm btn-secondary" id="cat-add">+ Категория</button>
          </div>
          ${categories.map((c, i) => `
            <div class="setting-row admin-cat-row">
              <span class="admin-cat-name">${c.name}</span>
              <span class="muted">${exercises.filter(e => e.category === c.id).length}</span>
              <div class="btn-row" style="margin:0">
                ${i > 0 ? `<button class="btn-icon btn-sm" data-cat-up="${c.id}">↑</button>` : ''}
                ${i < categories.length - 1 ? `<button class="btn-icon btn-sm" data-cat-down="${c.id}">↓</button>` : ''}
                <button class="btn-icon btn-sm" data-cat-edit="${c.id}">✎</button>
                <button class="btn-icon btn-sm" data-cat-del="${c.id}">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="admin-section">
          <div class="admin-section-head">
            <span>Упражнения (${exercises.length})</span>
            <button class="btn btn-sm btn-primary" id="ex-add">+ Упражнение</button>
          </div>
          <div class="picker-search" style="margin:0.5rem 0">
            <input type="search" id="admin-search" placeholder="Поиск упражнения..." value="${_searchQuery}" autocomplete="off">
          </div>
          <div id="admin-ex-list">
            ${filtered.map(e => `
              <div class="setting-row admin-ex-row">
                <div class="admin-ex-info">
                  <span class="admin-ex-name">${e.name}</span>
                  <span class="muted">${catName(e.category)} · MET ${e.metValue}${e.gifBlob ? ' · 🎞 GIF' : ''}</span>
                </div>
                <div class="btn-row" style="margin:0">
                  <button class="btn-icon btn-sm" data-ex-edit="${e.id}">✎</button>
                  <button class="btn-icon btn-sm" data-ex-del="${e.id}">✕</button>
                </div>
              </div>
            `).join('')}
            ${filtered.length === 0 ? '<p class="muted" style="padding:1rem">Ничего не найдено.</p>' : ''}
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('admin-back').onclick = () => showScreen('settings');
  document.getElementById('cat-add').onclick = _addCategory;
  document.getElementById('ex-add').onclick = () => _renderExerciseForm(null);
  document.getElementById('admin-search').oninput = (e) => {
    _searchQuery = e.target.value;
    renderAdmin();
  };

  document.querySelectorAll('[data-cat-up]').forEach(b => b.onclick = () => _moveCategory(b.dataset.catUp, -1));
  document.querySelectorAll('[data-cat-down]').forEach(b => b.onclick = () => _moveCategory(b.dataset.catDown, 1));
  document.querySelectorAll('[data-cat-edit]').forEach(b => b.onclick = () => _renameCategory(b.dataset.catEdit));
  document.querySelectorAll('[data-cat-del]').forEach(b => b.onclick = () => _deleteCategory(b.dataset.catDel));
  document.querySelectorAll('[data-ex-edit]').forEach(b => b.onclick = () => _renderExerciseForm(b.dataset.exEdit));
  document.querySelectorAll('[data-ex-del]').forEach(b => b.onclick = () => _deleteExercise(b.dataset.exDel));
}

async function _addCategory() {
  const name = prompt('Название категории');
  if (!name || !name.trim()) return;
  await catalog.saveCategory({ name: name.trim() });
  renderAdmin();
}

async function _renameCategory(id) {
  const cat = catalog.getCategories().find(c => c.id === id);
  if (!cat) return;
  const name = prompt('Название категории', cat.name);
  if (!name || !name.trim()) return;
  await catalog.saveCategory({ ...cat, name: name.trim() });
  renderAdmin();
}

async function _moveCategory(id, dir) {
  const cats = catalog.getCategories();
  const i = cats.findIndex(c => c.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= cats.length) return;
  await catalog.saveCategory({ ...cats[i], order: cats[j].order });
  await catalog.saveCategory({ ...cats[j], order: cats[i].order });
  renderAdmin();
}

async function _deleteCategory(id) {
  const cat = catalog.getCategories().find(c => c.id === id);
  if (!cat) return;
  try {
    await catalog.deleteCategory(id);
    renderAdmin();
  } catch (err) {
    alert(err.message);
  }
}

async function _deleteExercise(id) {
  const ex = catalog.getExercise(id);
  if (!ex) return;
  if (!confirm(`Удалить упражнение «${ex.name}»?`)) return;
  await catalog.deleteExercise(id);
  renderAdmin();
}

/** Форма добавления/редактирования упражнения. */
function _renderExerciseForm(exId) {
  const ex = exId ? catalog.getExercise(exId) : null;
  const categories = catalog.getCategories();
  const muscleGroups = catalog.getMuscleGroups();
  const type = ex?.isHold ? 'hold' : ex?.isTime ? 'time' : 'reps';
  _draftGif = null;

  app().innerHTML = `
    <div class="screen admin-screen">
      <div class="screen-header">
        <button class="btn-back" id="form-cancel">← Назад</button>
        <h2>${ex ? `✎ ${ex.name}` : 'Новое упражнение'}</h2>
      </div>
      <div class="settings-list">
        <div class="form-group">
          <label>Название *</label>
          <input type="text" id="f-name" value="${ex?.name || ''}" placeholder="Например, Подъём ног">
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea id="f-desc" rows="2" placeholder="Как выполнять...">${ex?.description || ''}</textarea>
        </div>
        <div class="form-group">
          <label>Категория *</label>
          <select id="f-cat">
            ${categories.map(c => `<option value="${c.id}" ${ex?.category === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Группы мышц</label>
          <div class="admin-chips">
            ${muscleGroups.map(m => `
              <label class="admin-chip">
                <input type="checkbox" value="${m}" ${(ex?.muscleGroup || []).includes(m) ? 'checked' : ''}> ${m}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>Оборудование</label>
          <select id="f-equip">
            ${EQUIPMENT_OPTIONS.map(([v, l]) => `<option value="${v}" ${ex?.equipment === v ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Сложность</label>
          <select id="f-diff">
            ${[1, 2, 3, 4, 5].map(d => `<option value="${d}" ${ex?.difficulty === d ? 'selected' : ''}>${d}${'·'.repeat(d)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Тип</label>
          <div class="radio-group">
            <label class="radio"><input type="radio" name="f-type" value="reps" ${type === 'reps' ? 'checked' : ''}> Повторения</label>
            <label class="radio"><input type="radio" name="f-type" value="hold" ${type === 'hold' ? 'checked' : ''}> Удержание</label>
            <label class="radio"><input type="radio" name="f-type" value="time" ${type === 'time' ? 'checked' : ''}> По времени</label>
          </div>
        </div>
        <div id="f-type-params"></div>
        <div class="form-group">
          <label>GIF-демонстрация</label>
          <input type="file" id="f-gif" accept="image/gif">
          <div id="f-gif-preview"></div>
          <span class="muted">Анимированный GIF, до 10 МБ</span>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="f-save">Сохранить</button>
          <button class="btn btn-secondary" id="f-cancel-btn">Отмена</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('form-cancel').onclick = renderAdmin;
  document.getElementById('f-cancel-btn').onclick = renderAdmin;
  document.querySelectorAll('input[name="f-type"]').forEach(r => {
    r.onchange = () => _renderTypeParams(ex, type, true);
  });
  document.getElementById('f-gif').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('Файл больше 10 МБ');
      e.target.value = '';
      return;
    }
    _draftGif = file;
    _renderGifPreview();
  };
  document.getElementById('f-save').onclick = () => _saveExerciseForm(ex);

  _renderTypeParams(ex, type, false);
}

/** Отдельно от формы: черновик GIF между выбором файла и сохранением. */
let _draftGif = null;

function _renderTypeParams(ex, currentType, keepCurrent) {
  const params = document.getElementById('f-type-params');
  if (!params) return;
  const type = keepCurrent
    ? document.querySelector('input[name="f-type"]:checked').value
    : currentType;
  if (type === 'reps') {
    params.innerHTML = `
      <div class="form-group">
        <label>MET * <span class="muted">(интенсивность: ходьба 3 · отжимания 7.5 · бег 10)</span></label>
        <input type="number" id="f-met" value="${ex?.metValue ?? 5}" min="1" max="30" step="0.1">
      </div>
      <div class="form-group">
        <label>Секунд на повтор</label>
        <input type="number" id="f-spr" value="${ex?.secondsPerRep ?? 3}" min="1" max="20" step="0.5">
      </div>
      <div class="form-group">
        <label>Диапазон повторений</label>
        <div class="btn-row" style="margin:0">
          <input type="number" id="f-min" value="${ex?.typicalReps?.min ?? 8}" min="1" max="200" style="flex:1">
          <span class="muted">до</span>
          <input type="number" id="f-max" value="${ex?.typicalReps?.max ?? 15}" min="1" max="200" style="flex:1">
        </div>
      </div>
    `;
  } else if (type === 'hold') {
    params.innerHTML = `
      <div class="form-group">
        <label>Длительность удержания (сек)</label>
        <input type="number" id="f-hold" value="${ex?.holdSeconds ?? 30}" min="5" max="300" step="5">
      </div>
    `;
  } else {
    params.innerHTML = `
      <div class="form-group">
        <label>Длительность (сек)</label>
        <input type="number" id="f-time" value="${ex?.timeSeconds ?? 20}" min="5" max="300" step="5">
      </div>
    `;
  }
}

function _renderGifPreview() {
  const el = document.getElementById('f-gif-preview');
  if (!el) return;
  el.innerHTML = '';
  if (!_draftGif) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(_draftGif);
  img.style.cssText = 'max-width:160px;border-radius:8px;margin-top:0.5rem;display:block';
  el.appendChild(img);
}

function _collectForm() {
  const type = document.querySelector('input[name="f-type"]:checked').value;
  const name = document.getElementById('f-name').value.trim();
  const category = document.getElementById('f-cat').value;
  if (!name) return alert('Введите название');
  if (!category) return alert('Выберите категорию');

  const muscles = [...document.querySelectorAll('input[type="checkbox"]:checked')].map(i => i.value);
  const base = {
    name,
    description: document.getElementById('f-desc').value.trim(),
    category,
    muscleGroup: muscles,
    equipment: document.getElementById('f-equip').value,
    difficulty: parseInt(document.getElementById('f-diff').value, 10),
  };

  if (type === 'reps') {
    const metValue = parseFloat(document.getElementById('f-met').value);
    const secondsPerRep = parseFloat(document.getElementById('f-spr').value);
    const min = parseInt(document.getElementById('f-min').value, 10);
    const max = parseInt(document.getElementById('f-max').value, 10);
    if (!(metValue > 0)) return alert('MET должен быть больше 0');
    if (min > max) return alert('Максимум повторов должен быть не меньше минимума');
    return {
      ...base,
      type: 'reps',
      metValue,
      secondsPerRep,
      typicalReps: { min, max },
      isHold: false,
      isTime: false,
    };
  }
  if (type === 'hold') {
    return {
      ...base,
      type: 'hold',
      isHold: true,
      isTime: false,
      holdSeconds: parseInt(document.getElementById('f-hold').value, 10) || 30,
      metValue: 2.8,
      secondsPerRep: 1,
      typicalReps: { min: 1, max: 5 },
    };
  }
  return {
    ...base,
    type: 'time',
    isTime: true,
    isHold: false,
    timeSeconds: parseInt(document.getElementById('f-time').value, 10) || 20,
    metValue: 6,
    secondsPerRep: 1,
    typicalReps: { min: 1, max: 10 },
  };
}

async function _saveExerciseForm(ex) {
  const collected = _collectForm();
  if (!collected) return;
  let gifBlob = _draftGif;
  if (!gifBlob && ex?.gifBlob) gifBlob = ex.gifBlob;
  const record = { ...ex, ...collected, gifBlob };
  await catalog.saveExercise(record);
  _draftGif = null;
  renderAdmin();
}