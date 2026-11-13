/**
 * Цитирование задачи в чат.
 *
 * Сообщение чата — обычный текст, поэтому цитата оформляется префиксом «> »:
 * ChatView рисует такие строки как blockquote. Никакого HTML в БД не пишем.
 */

/** HTML описания задачи → простой текст (переносы строк сохраняются) */
export function htmlToText(html) {
  if (!html) return '';
  if (typeof document === 'undefined') {
    return String(html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|li|h[1-3]|div)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }

  const root = document.createElement('div');
  root.innerHTML = html;
  root.querySelectorAll('br').forEach((node) => node.replaceWith('\n'));
  root.querySelectorAll('p, li, h1, h2, h3').forEach((node) => node.append('\n'));

  return (root.textContent || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Убирает служебный маркер задачи из текста для превью и уведомлений */
export function stripTaskMarker(text) {
  return String(text || '')
    .replace(/\s*\[\[task:[0-9a-f-]{36}\]\]/gi, '')
    .trim();
}

/**
 * Собирает текст сообщения-цитаты.
 * @param {{taskId?: string, title?: string, number?: number, text?: string, limit?: number}} params
 */
export function buildTaskQuote({ taskId, title, number, text, limit = 600 }) {
  const clean = String(text || '').trim();
  const clipped = clean.length > limit ? `${clean.slice(0, limit).trimEnd()}…` : clean;
  const marker = taskId ? ` [[task:${taskId}]]` : '';
  const head = number
    ? `Цитата из задачи № ${number} «${title || 'Без названия'}»${marker}`
    : `Цитата из задачи «${title || 'Без названия'}»${marker}`;

  if (!clipped) return `${head}.`;
  return `${head}:\n${clipped
    .split('\n')
    .map((line) => `> ${line}`)
    .join('\n')}`;
}
