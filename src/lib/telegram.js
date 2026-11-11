/** Работа с Telegram-ником сотрудника. */

/** Приводит любой ввод к виду «@nick» */
export function normalizeTelegram(value) {
  if (!value) return '';
  let handle = String(value).trim();
  handle = handle.replace(/^https?:\/\//i, '').replace(/^t\.me\//i, '').replace(/^@/, '');
  handle = handle.split(/[?#/]/)[0];
  return handle ? `@${handle}` : '';
}

/** Ссылка на чат: https://t.me/nick */
export function telegramUrl(handle) {
  if (!handle) return null;
  const clean = String(handle)
    .replace(/^@/, '')
    .replace(/^https?:\/\/t\.me\//i, '')
    .trim();
  return clean ? `https://t.me/${clean}` : null;
}
