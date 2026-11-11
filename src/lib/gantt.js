/**
 * Расчёты для диаграммы Ганта.
 * Задача имеет начало (start_at) и срок (due_at). Если начало не задано —
 * берём дату создания, чтобы полоса всегда была видимой.
 */
import { getDueValue, parseDateValue } from './format';

export const DAY_MS = 24 * 60 * 60 * 1000;

export const GANTT_SCALES = {
  day: { key: 'day', label: 'Дни', px: 42 },
  week: { key: 'week', label: 'Недели', px: 20 },
  month: { key: 'month', label: 'Месяцы', px: 8 },
};

const MONTHS_FULL = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

const pad = (n) => String(n).padStart(2, '0');

export function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date, amount) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

/** Целых дней между локальными полуночами */
export function daysBetween(from, to) {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
}

/**
 * Плановые даты задачи:
 * начало — start_at, иначе created_at, иначе срок − 1 день;
 * окончание — due_at/date, иначе начало + 1 день.
 */
export function getTaskSchedule(task) {
  if (!task) return null;

  let start = parseDateValue(task.start_at) || parseDateValue(task.created_at);
  let finish = parseDateValue(getDueValue(task));

  if (!start && finish) start = addDays(finish, -1);
  if (!start) return null;

  if (!finish) finish = addDays(start, 1);
  if (finish.getTime() <= start.getTime()) finish = addDays(start, 1);

  return { start, finish };
}

export function durationDays(schedule) {
  if (!schedule) return 1;
  return Math.max(1, daysBetween(schedule.start, schedule.finish) + 1);
}

/** Строка диаграммы */
export function buildGanttRow(task) {
  const schedule = getTaskSchedule(task);
  if (!schedule) return null;
  return {
    task,
    schedule,
    startDay: startOfDay(schedule.start),
    finishDay: startOfDay(schedule.finish),
    days: durationDays(schedule),
  };
}

export function buildGanttRows(tasks = []) {
  return tasks
    .map(buildGanttRow)
    .filter(Boolean)
    .sort((a, b) => a.startDay.getTime() - b.startDay.getTime());
}

/** Общий диапазон дат: от минимального начала до максимального срока + запас */
export function computeRange(rows, paddingDays = 3) {
  const today = startOfDay(new Date());

  if (rows.length === 0) {
    const from = addDays(today, -7);
    return { from, to: addDays(today, 21), days: 29 };
  }

  let min = rows[0].startDay;
  let max = rows[0].finishDay;

  rows.forEach((row) => {
    if (row.startDay < min) min = row.startDay;
    if (row.finishDay > max) max = row.finishDay;
  });

  if (today < min) min = today;
  if (today > max) max = today;

  const from = addDays(min, -paddingDays);
  const to = addDays(max, paddingDays);
  const days = Math.min(730, Math.max(21, daysBetween(from, to) + 1));

  return { from, to, days };
}

/** Колонки заголовка: месяцы и подписи дней/недель */
export function buildHeader(range, scaleKey) {
  const px = GANTT_SCALES[scaleKey]?.px ?? 20;
  const months = [];
  const ticks = [];

  for (let i = 0; i < range.days; i += 1) {
    const day = addDays(range.from, i);

    const label = `${MONTHS_FULL[day.getMonth()]} ${day.getFullYear()}`;
    const last = months[months.length - 1];
    if (!last || last.label !== label) {
      months.push({ label, index: i, count: 1 });
    } else {
      last.count += 1;
    }

    let tickLabel = '';
    if (scaleKey === 'day') {
      tickLabel = String(day.getDate());
    } else if (scaleKey === 'week') {
      if (day.getDay() === 1) tickLabel = `${day.getDate()} ${MONTHS_SHORT[day.getMonth()]}`;
    } else if (day.getDate() === 1) {
      tickLabel = MONTHS_SHORT[day.getMonth()];
    }

    if (tickLabel) {
      ticks.push({
        index: i,
        label: tickLabel,
        isToday: startOfDay(new Date()).getTime() === day.getTime(),
      });
    }
  }

  return {
    px,
    months: months.map((month) => ({ ...month, width: month.count * px })),
    ticks,
  };
}

/** Выходные для подсветки */
export function buildWeekends(range, px) {
  const out = [];
  for (let i = 0; i < range.days; i += 1) {
    const day = addDays(range.from, i);
    const dow = day.getDay();
    if (dow === 0 || dow === 6) {
      out.push({ left: i * px, width: px });
    }
  }
  return out;
}

export function startDayIndex(range, date) {
  return daysBetween(range.from, date);
}

/** Геометрия полосы */
export function barGeometry(row, range, px) {
  const left = startDayIndex(range, row.startDay) * px;
  const widthDays = Math.max(1, daysBetween(row.startDay, row.finishDay) + 1);
  return { left, width: Math.max(px, widthDays * px) };
}

/** Сдвиг/изменение срока на delta дней */
export function shiftSchedule(schedule, deltaDays, mode = 'move') {
  if (!schedule || !deltaDays) return schedule;
  if (mode === 'resize') {
    const finish = addDays(schedule.finish, deltaDays);
    if (finish.getTime() <= schedule.start.getTime()) {
      return { start: schedule.start, finish: addDays(schedule.start, 1) };
    }
    return { start: schedule.start, finish };
  }
  return {
    start: addDays(schedule.start, deltaDays),
    finish: addDays(schedule.finish, deltaDays),
  };
}

export function formatDayMonth(date) {
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function formatRange(start, finish) {
  const sameYear = start.getFullYear() === finish.getFullYear();
  const left = `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]}${sameYear ? '' : ` ${start.getFullYear()}`}`;
  const right = `${finish.getDate()} ${MONTHS_SHORT[finish.getMonth()]} ${finish.getFullYear()}`;
  return `${left} — ${right}`;
}

export { MONTHS_SHORT, MONTHS_FULL, pad };
