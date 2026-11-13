import { parseDateValue, toDateInputValue } from './format.js';

export const RECURRENCE_OPTIONS = [
  { value: 'daily', label: 'Ежедневно' },
  { value: 'weekly', label: 'Еженедельно' },
  { value: 'monthly', label: 'Ежемесячно' },
];

const WEEKDAYS = [
  'воскресенье',
  'понедельник',
  'вторник',
  'среда',
  'четверг',
  'пятница',
  'суббота',
];

/** Следующая дата серии; время сохраняется, конец месяца не «съезжает» */
export function nextRecurrenceDate(value, freq, interval = 1) {
  const date = parseDateValue(value);
  const step = Math.max(1, Number(interval) || 1);
  if (!date || !['daily', 'weekly', 'monthly'].includes(freq)) return null;

  const next = new Date(date);
  if (freq === 'daily') {
    next.setDate(next.getDate() + step);
  } else if (freq === 'weekly') {
    next.setDate(next.getDate() + 7 * step);
  } else {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + step);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

export function recurrenceLabel(freq, dueValue) {
  const date = parseDateValue(dueValue);
  if (!date) return '';
  if (freq === 'daily') return 'Каждый день';
  if (freq === 'weekly') return `Каждый ${WEEKDAYS[date.getDay()]}`;
  if (freq === 'monthly') return `Каждый месяц, ${date.getDate()}-го числа`;
  return '';
}

export function recurrenceNextValue(dueValue, freq, interval = 1) {
  const next = nextRecurrenceDate(dueValue, freq, interval);
  return next ? toDateInputValue(next) : '';
}
