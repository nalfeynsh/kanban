const DEFAULT_WORKDAYS = [1, 2, 3, 4, 5];

export function normalizeCalendar(calendar) {
  return {
    year: Number(calendar?.year) || new Date().getFullYear(),
    workdays: Array.isArray(calendar?.workdays) && calendar.workdays.length ? calendar.workdays : DEFAULT_WORKDAYS,
    holidays: Array.isArray(calendar?.holidays) ? calendar.holidays.map((item) => String(item).slice(0, 10)) : [],
    shortDays: calendar?.short_days && typeof calendar.short_days === 'object'
      ? calendar.short_days
      : calendar?.shortDays && typeof calendar.shortDays === 'object'
        ? calendar.shortDays
        : {},
    source: calendar?.source || 'manual',
  };
}

export function isWorkingDay(date, calendar) {
  const value = normalizeCalendar(calendar);
  const iso = new Date(date).toISOString().slice(0, 10);
  if (value.holidays.includes(iso)) return false;
  return value.workdays.includes(new Date(date).getDay());
}

export function dayHours(date, calendar, baseHours = 8) {
  const value = normalizeCalendar(calendar);
  const iso = new Date(date).toISOString().slice(0, 10);
  if (!isWorkingDay(date, value)) return 0;
  return Number(value.shortDays[iso]) || Number(baseHours) || 8;
}

export function workingDaysBetween(start, finish, calendar) {
  const from = new Date(start);
  const to = new Date(finish);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let count = 0;
  for (let date = new Date(from); date <= to; date = new Date(date.getTime() + 86400000)) {
    if (isWorkingDay(date, calendar)) count += 1;
  }
  return count;
}

export function effectiveWorkdayHours({ profile, member, project }) {
  return Number(member?.workday_hours) || Number(profile?.workday_hours) || Number(project?.default_workday_hours) || 8;
}

export async function fetchRfCalendar(year) {
  const target = new Date().getFullYear();
  const value = Number(year) || target;
  if (import.meta.env.DEV) {
    const response = await fetch(`https://isdayoff.ru/api/getdata?year=${value}&pre=1`);
    if (!response.ok) throw new Error('Не удалось загрузить производственный календарь');
    const raw = (await response.text()).trim();
    const holidays = [];
    const shortDays = {};
    const start = new Date(Date.UTC(value, 0, 1));
    for (let index = 0; index < raw.length; index += 1) {
      const date = new Date(start.getTime() + index * 86400000);
      const iso = date.toISOString().slice(0, 10);
      if (raw[index] === '1') holidays.push(iso);
      if (raw[index] === '2') shortDays[iso] = 7;
    }
    return { year: value, workdays: DEFAULT_WORKDAYS, holidays, shortDays, source: 'isdayoff.ru' };
  }
  const response = await fetch(`/api/calendar/rf?year=${value}`);
  if (!response.ok) throw new Error('Не удалось загрузить производственный календарь');
  const data = await response.json();
  return { ...data, shortDays: data.shortDays || data.short_days || {} };
}
