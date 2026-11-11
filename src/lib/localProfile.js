/**
 * Локальный резерв для полей профиля, которых ещё нет в схеме БД.
 * Нужен, чтобы Telegram можно было указать до применения миграции:
 * значение живёт в браузере и автоматически уезжает в базу, как только
 * колонка `profiles.telegram` появится.
 */

const STORAGE_KEY = 'kanban.profile.extras';

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* приватный режим — просто не сохраняем */
  }
}

export function getLocalTelegram(userId) {
  if (!userId) return '';
  const entry = readAll()[userId];
  return typeof entry?.telegram === 'string' ? entry.telegram : '';
}

export function setLocalTelegram(userId, telegram) {
  if (!userId) return;
  const map = readAll();
  map[userId] = { ...(map[userId] || {}), telegram: telegram || '' };
  writeAll(map);
}

export function clearLocalTelegram(userId) {
  if (!userId) return;
  const map = readAll();
  if (!map[userId]) return;
  delete map[userId].telegram;
  if (Object.keys(map[userId]).length === 0) delete map[userId];
  writeAll(map);
}
