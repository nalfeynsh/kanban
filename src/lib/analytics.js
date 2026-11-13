import {
  getDueValue,
  isDateOnly,
  isOverdue,
  parseDateValue,
  startOfDay,
} from './format.js';
import { normalizePriority } from './priority.js';

const pad = (value) => String(value).padStart(2, '0');

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateKey(key, endOfDay = false) {
  if (!key) return null;
  const date = new Date(`${key}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return date;
}

function endOfDay(date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

/** Готовый период для фильтра: последние N дней, включая сегодня */
export function periodPresetRange(days = 30) {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = startOfDay(new Date());
  from.setDate(from.getDate() - Math.max(1, days) + 1);
  return { from: toDateKey(from), to: toDateKey(to) };
}

export function defaultAnalyticsFilters() {
  return { ...periodPresetRange(30), employeeId: 'all' };
}

function isDoneColumn(column) {
  return /^(готово|done|выполнено)$/i.test(String(column?.title || '').trim());
}

function isInProgressColumn(column) {
  return /^(в работе|in progress|doing)$/i.test(String(column?.title || '').trim());
}

/**
 * Аналитика по задачам за период.
 *
 * Период считается по сроку задачи (`due_at` / `date`). В выборку попадают
 * командные задачи; личные задачи исключены. Архивные задачи учитываются,
 * если они были завершены (есть `done_at`), удалённые без завершения — нет.
 */
export function computeAnalytics({
  tasks = [],
  archivedTasks = [],
  columns = [],
  members = [],
  filters = {},
}) {
  const doneColumnId = columns.find(isDoneColumn)?.id || null;
  const inProgressColumnIds = new Set(columns.filter(isInProgressColumn).map((column) => column.id));

  const from = fromDateKey(filters.from) || startOfDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const to = fromDateKey(filters.to, true) || endOfDay(new Date());
  const employeeId = filters.employeeId && filters.employeeId !== 'all' ? filters.employeeId : null;

  const byId = new Map();
  // Сначала архив, затем активные: активная версия задачи важнее, если запись ещё не удалена.
  [...archivedTasks, ...tasks].forEach((task) => {
    if (!task?.id) return;
    if (task.is_private) return;
    // Удалённая задача без завершения — это не выполненная работа, в аналитику не идёт
    if (task.deleted_at && !task.done_at) return;
    byId.set(task.id, task);
  });

  const rows = [...byId.values()].map((task) => {
    const due = getDueValue(task);
    const dueDate = parseDateValue(due);
    const doneDate = parseDateValue(task.done_at);
    const completed = Boolean(doneDate) || Boolean(doneColumnId && task.column_id === doneColumnId);
    const inProgress = !completed && inProgressColumnIds.has(task.column_id);
    const overdue = !completed && Boolean(due) && isOverdue(due);
    const dueForCompare = dueDate && isDateOnly(due) ? endOfDay(dueDate) : dueDate;
    const onTime = Boolean(completed && doneDate && dueForCompare && doneDate <= dueForCompare);
    const late = Boolean(completed && doneDate && dueForCompare && doneDate > dueForCompare);
    const assigneeId = task.assignee_id || 'unassigned';

    return {
      task,
      dueDate,
      doneDate,
      completed,
      inProgress,
      overdue,
      onTime,
      late,
      assigneeId,
    };
  });

  const employeeRows = employeeId ? rows.filter((row) => row.assigneeId === employeeId) : rows;
  const periodRows = employeeRows.filter(
    (row) => row.dueDate && row.dueDate >= from && row.dueDate <= to,
  );

  const total = periodRows.length;
  const completed = periodRows.filter((row) => row.completed).length;
  const inProgress = periodRows.filter((row) => row.inProgress).length;
  const overdue = periodRows.filter((row) => row.overdue).length;
  const onTime = periodRows.filter((row) => row.onTime).length;
  const late = periodRows.filter((row) => row.late).length;
  const scored = onTime + late;
  const todo = Math.max(0, total - completed - inProgress);

  const groupByEmployee = new Map();
  periodRows.forEach((row) => {
    const current = groupByEmployee.get(row.assigneeId) || {
      id: row.assigneeId,
      total: 0,
      completed: 0,
      inProgress: 0,
      overdue: 0,
      onTime: 0,
      late: 0,
    };
    current.total += 1;
    if (row.completed) current.completed += 1;
    if (row.inProgress) current.inProgress += 1;
    if (row.overdue) current.overdue += 1;
    if (row.onTime) current.onTime += 1;
    if (row.late) current.late += 1;
    groupByEmployee.set(row.assigneeId, current);
  });

  const memberById = new Map(members.map((member) => [member.id, member]));
  const byEmployee = [...groupByEmployee.values()]
    .map((item) => {
      const member = memberById.get(item.id);
      const employeeScored = item.onTime + item.late;
      return {
        ...item,
        name: member?.full_name || (item.id === 'unassigned' ? 'Без исполнителя' : 'Сотрудник'),
        color: member?.color || '#94a3b8',
        avatar_url: member?.avatar_url || null,
        onTimePct: employeeScored ? Math.round((item.onTime / employeeScored) * 100) : null,
      };
    })
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total || a.name.localeCompare(b.name, 'ru'));

  const priorityMap = new Map();
  periodRows.forEach((row) => {
    const priority = normalizePriority(row.task.priority);
    priorityMap.set(priority, (priorityMap.get(priority) || 0) + 1);
  });
  const byPriority = [3, 2, 1, 0].map((priority) => ({
    priority,
    count: priorityMap.get(priority) || 0,
  }));

  return {
    from,
    to,
    total,
    completed,
    inProgress,
    todo,
    overdue,
    onTime,
    late,
    scored,
    onTimePct: scored ? Math.round((onTime / scored) * 100) : null,
    completionPct: total ? Math.round((completed / total) * 100) : 0,
    overduePct: total ? Math.round((overdue / total) * 100) : 0,
    noDue: employeeRows.filter((row) => !row.dueDate).length,
    byEmployee,
    byPriority,
  };
}
