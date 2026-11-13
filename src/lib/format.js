/**
 * Форматирование дат и сроков.
 * Срок может прийти как timestamptz (ISO), как date (YYYY-MM-DD)
 * или как пустая строка — всё приводим к единому виду.
 */

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

const MONTHS_FULL = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const MONTHS_NOMINATIVE = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const pad = (n) => String(n).padStart(2, '0');

/** true, если значение — дата без времени ('2026-11-11') */
export function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/** Валидный Date или null */
export function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;

  // Чистая дата — трактуем как локальную полночь, а не UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Значение срока задачи: due_at имеет приоритет над legacy date */
export function getDueValue(task) {
  if (!task) return null;
  return task.due_at || task.date || null;
}

export function formatDayMonth(date) {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatTime(date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateShort(value, { withYear = false } = {}) {
  const date = parseDateValue(value);
  if (!date) return '';
  const needYear = withYear || date.getFullYear() !== new Date().getFullYear();
  return needYear
    ? `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`
    : formatDayMonth(date);
}

/** «11 ноя, 14:30» — срок в карточке */
export function formatDue(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  const day = formatDateShort(date);
  if (isDateOnly(value)) return day;
  return `${day}, ${formatTime(date)}`;
}

/** «11 ноября 2026, 14:30» — полный срок */
export function formatDueLong(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  const day = `${date.getDate()} ${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
  return isDateOnly(value) ? day : `${day}, ${formatTime(date)}`;
}

/** «11 ноября 2026, 14:30» — дата создания (только для справки / архива) */
export function formatCreated(value) {
  const date = parseDateValue(value);
  if (!date) return 'только что';
  const day = `${date.getDate()} ${MONTHS_FULL[date.getMonth()]} ${date.getFullYear()}`;
  return `${day}, ${formatTime(date)}`;
}

/** «11.11.2026 14:30» — компактно */
export function formatStamp(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${formatTime(date)}`;
}

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function isToday(value) {
  const date = parseDateValue(value);
  if (!date) return false;
  return startOfDay(date).getTime() === startOfDay(new Date()).getTime();
}

export function isTomorrow(value) {
  const date = parseDateValue(value);
  if (!date) return false;
  const tomorrow = startOfDay(new Date());
  tomorrow.setDate(tomorrow.getDate() + 1);
  return startOfDay(date).getTime() === tomorrow.getTime();
}

/** Просрочено ли (для дат без времени — просрочка со следующего дня) */
export function isOverdue(value) {
  const date = parseDateValue(value);
  if (!date) return false;
  if (isDateOnly(value)) {
    return startOfDay(date).getTime() < startOfDay(new Date()).getTime();
  }
  return date.getTime() < Date.now();
}

/** Просрочена ли активная задача (задачи в «Готово» не считаются висящими) */
export function isTaskOverdue(task, doneColumnId = null) {
  if (!task) return false;
  if (doneColumnId && task.column_id === doneColumnId) return false;
  return isOverdue(getDueValue(task));
}

/** Подпись срока для карточки: «Сегодня, 14:30» / «Завтра, 09:00» / «11 ноя, 14:30» */
export function formatDueBadge(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  const time = isDateOnly(value) ? '' : `, ${formatTime(date)}`;
  if (isToday(value)) return `Сегодня${time}`;
  if (isTomorrow(value)) return `Завтра${time}`;
  return `${formatDateShort(value)}${time}`;
}

/** «Ноябрь 2026 г.» */
export function formatMonthTitle(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${MONTHS_NOMINATIVE[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** Для <input type="datetime-local"> */
export function toDateTimeLocalValue(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (isDateOnly(value)) return `${day}T00:00`;
  return `${day}T${formatTime(date)}`;
}

/** Для <input type="date"> */
export function toDateInputValue(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Из <input type="datetime-local"> в ISO (UTC) */
export function fromDateTimeLocalValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** YYYY-MM-DD для календаря */
export function dayKey(value) {
  const date = parseDateValue(value);
  if (!date) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Сравнение задач по позиции (рейтингу), затем по сроку/созданию */
export function byPosition(a, b) {
  const posA = Number.isFinite(a?.position) ? a.position : 0;
  const posB = Number.isFinite(b?.position) ? b.position : 0;
  if (posA !== posB) return posA - posB;
  const createdA = parseDateValue(a?.created_at)?.getTime() ?? 0;
  const createdB = parseDateValue(b?.created_at)?.getTime() ?? 0;
  return createdA - createdB;
}

/** Русские названия месяцев для FullCalendar-подписей */
export function monthShort(index) {
  return MONTHS_SHORT[index] ?? '';
}

export { MONTHS_FULL, MONTHS_SHORT, MONTHS_NOMINATIVE };
