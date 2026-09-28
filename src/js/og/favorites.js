/**
 * og/favorites.js — Избранные упражнения (задача #54).
 *
 * Чистое зеркало оригинального openGym lib/favourites.js (issue #6):
 *   S.favorites — плоский массив id упражнений (личные, личные данные:
 *   в бэкап/резет входят автоматически через store).
 *
 * DESIGN (из УРЛ решения #54):
 *  - Хранение ТОЛЬКО id, НЕ полей упражнений (каталог — общий с легаси, IDB-бэкап
 *    избранное не знает — флаг юзера живёт в состоянии S).
 *  - toggle — только в карточке упражнения; в списках — неинтерактивный маркер.
 *  - sortFavoritesFirst: избранные всплывают вверх, порядок внутри половин СТАБИЛЕН.
 *  - Функции ЧИСТЫЕ: возвращают новое состояние/новый список, ничего не мутируют.
 */

/** Безопасное чтение списка избранного: всегда массив строк. */
export function favIds(S) {
  const f = S && Array.isArray(S.favorites) ? S.favorites : [];
  return f.filter((x) => typeof x === 'string');
}

/** Входит ли упражнение в избранное. */
export function isFavorite(S, exId) {
  return favIds(S).includes(exId);
}

/**
 * Переключение избранного. ЧИСТАЯ: возвращает НОВОЕ состояние;
 * исходное не мутируется. Порядок добавления сохраняется (v1.3.3 original: новое в конец).
 */
export function toggleFavorite(S, exId) {
  const cur = favIds(S);
  const next = cur.includes(exId) ? cur.filter((id) => id !== exId) : cur.concat(exId);
  return { ...(S || {}), favorites: next };
}

/**
 * Стабильное разделение: избранные первыми, остальные после;
 * порядок ВНУТРИ каждой половины не меняется. Мутаций нет — возвращает новый массив.
 * id-провал: если в S фаворитов нет — возвращает копию списка как есть (no-op).
 */
export function sortFavoritesFirst(list, S) {
  const fav = favIds(S);
  if (fav.length === 0) return list.slice();
  return list.slice().sort((a, b) => {
    const af = fav.includes(a.id) ? 1 : 0;
    const bf = fav.includes(b.id) ? 1 : 0;
    return bf - af;
  });
}