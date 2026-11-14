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
  return /^(в работе|в разработке|на тестировании|in progress|doing|in development|testing|qa)$/i.test(
    String(column?.title || '').trim(),
  );
}

function isTodoColumn(column) {
  return /^(сделать|к выполнению|todo|to do|бэклог|backlog|очередь)$/i.test(
    String(column?.title || '').trim(),
  );
}

function isDoneTitle(title) {
  return /^(готово|done|выполнено)$/i.test(String(title || '').trim());
}

function isInProgressTitle(title) {
  return /^(в работе|в разработке|на тестировании|in progress|doing|in development|testing|qa)$/i.test(
    String(title || '').trim(),
  );
}

function isTodoTitle(title) {
  return /^(сделать|к выполнению|todo|to do|бэклог|backlog|очередь)$/i.test(
    String(title || '').trim(),
  );
}

/**
 * Аналитика по задачам за период.
 *
 * Период считается по дате создания задачи (`created_at`), поэтому задачи без
 * срока из бэклога тоже попадают в выборку. Личные задачи исключены.
 *
 * Состояние («сейчас») считается по всем активным командным задачам, а
 * «выполнено» — с учётом завершённых задач в архиве. Перемещения считаются по
 * истории `task_status_events` за выбранный период.
 */
export function computeAnalytics({
  tasks = [],
  archivedTasks = [],
  columns = [],
  members = [],
  filters = {},
  statusEvents = [],
}) {
  const doneColumnIds = new Set(columns.filter(isDoneColumn).map((column) => column.id));
  const inProgressColumnIds = new Set(
    columns.filter(isInProgressColumn).map((column) => column.id),
  );
  const todoColumnIds = new Set(columns.filter(isTodoColumn).map((column) => column.id));
  const columnById = new Map(columns.map((column) => [column.id, column]));

  const from =
    fromDateKey(filters.from) || startOfDay(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000));
  const to = fromDateKey(filters.to, true) || endOfDay(new Date());
  const employeeId = filters.employeeId && filters.employeeId !== 'all' ? filters.employeeId : null;

  const byId = new Map();
  // Сначала архив, затем активные: активная версия задачи важнее.
  [...archivedTasks, ...tasks].forEach((task) => {
    if (!task?.id) return;
    if (task.is_private) return;
    byId.set(task.id, task);
  });

  const allRows = [...byId.values()];
  const matchesEmployee = (task) =>
    !employeeId || (task.assignee_id || 'unassigned') === employeeId;

  const allTeamRows = allRows.filter(matchesEmployee);
  const activeRows = allTeamRows.filter((task) => !task.deleted_at);
  const archivedRows = allTeamRows.filter((task) => task.deleted_at);

  const isCompleted = (task) =>
    Boolean(parseDateValue(task.done_at)) ||
    Boolean(task.column_id && doneColumnIds.has(task.column_id));

  const completedActiveRows = activeRows.filter(isCompleted);
  const completedArchivedRows = archivedRows.filter(isCompleted);
  const completedRows = [...completedActiveRows, ...completedArchivedRows];
  const inProgressRows = activeRows.filter(
    (task) => !isCompleted(task) && inProgressColumnIds.has(task.column_id),
  );
  const backlogRows = activeRows.filter(
    (task) => !isCompleted(task) && todoColumnIds.has(task.column_id),
  );
  const otherRows = activeRows.filter(
    (task) =>
      !isCompleted(task) &&
      !inProgressColumnIds.has(task.column_id) &&
      !todoColumnIds.has(task.column_id),
  );

  // Активные + завершённые в архиве. Незавершённый архив показываем отдельно.
  const statusRows = [...backlogRows, ...inProgressRows, ...completedRows, ...otherRows];
  const total = statusRows.length;
  const completed = completedRows.length;
  const inProgress = inProgressRows.length;
  const backlog = backlogRows.length;
  const other = otherRows.length;
  const archived = archivedRows.length;

  const overdueRows = activeRows.filter((task) => {
    const due = getDueValue(task);
    return !isCompleted(task) && Boolean(due) && isOverdue(due);
  });
  const overdue = overdueRows.length;

  const periodCreatedRows = allTeamRows.filter((task) => {
    const created = parseDateValue(task.created_at);
    return Boolean(created) && created >= from && created <= to;
  });

  const periodArchivedRows = archivedRows.filter((task) => {
    const deleted = parseDateValue(task.deleted_at);
    return Boolean(deleted) && deleted >= from && deleted <= to;
  });

  // «В срок» считаем по задачам, завершённым в выбранном периоде.
  const completedPeriodRows = completedRows.filter((task) => {
    const done = parseDateValue(task.done_at);
    return Boolean(done) && done >= from && done <= to;
  });
  const scoreRows = completedPeriodRows
    .map((task) => {
      const due = getDueValue(task);
      const dueDate = parseDateValue(due);
      const doneDate = parseDateValue(task.done_at);
      if (!dueDate || !doneDate) return null;
      const dueForCompare = isDateOnly(due) ? endOfDay(dueDate) : dueDate;
      return { onTime: doneDate <= dueForCompare };
    })
    .filter(Boolean);
  const onTime = scoreRows.filter((row) => row.onTime).length;
  const late = scoreRows.length - onTime;
  const scored = scoreRows.length;

  const statusEventsInPeriod = statusEvents.filter((event) => {
    const movedAt = parseDateValue(event.moved_at);
    if (!movedAt || movedAt < from || movedAt > to) return false;
    const task = byId.get(event.task_id);
    return Boolean(task) && matchesEmployee(task);
  });

  const eventFromTitle = (event) =>
    event.from_title || columnById.get(event.from_column_id)?.title || '';
  const eventToTitle = (event) =>
    event.to_title || columnById.get(event.to_column_id)?.title || '';

  let movedToProgress = 0;
  let movedToDone = 0;
  statusEventsInPeriod.forEach((event) => {
    const fromTitle = eventFromTitle(event);
    const toTitle = eventToTitle(event);
    if (!isTodoTitle(fromTitle)) return;
    if (isInProgressTitle(toTitle)) movedToProgress += 1;
    if (isDoneTitle(toTitle)) movedToDone += 1;
  });

  const groupByEmployee = new Map();
  statusRows.forEach((task) => {
    const id = task.assignee_id || 'unassigned';
    const current = groupByEmployee.get(id) || {
      id,
      total: 0,
      backlog: 0,
      inProgress: 0,
      completed: 0,
      overdue: 0,
      onTime: 0,
      late: 0,
    };
    current.total += 1;
    if (isCompleted(task)) {
      current.completed += 1;
      const done = parseDateValue(task.done_at);
      const due = getDueValue(task);
      const dueDate = parseDateValue(due);
      if (done && dueDate && done >= from && done <= to) {
        const dueForCompare = isDateOnly(due) ? endOfDay(dueDate) : dueDate;
        if (done <= dueForCompare) current.onTime += 1;
        else current.late += 1;
      }
    } else if (inProgressColumnIds.has(task.column_id)) {
      current.inProgress += 1;
    } else if (todoColumnIds.has(task.column_id)) {
      current.backlog += 1;
    }
    groupByEmployee.set(id, current);
  });
  overdueRows.forEach((task) => {
    const id = task.assignee_id || 'unassigned';
    const current = groupByEmployee.get(id);
    if (current) current.overdue += 1;
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
  statusRows.forEach((task) => {
    const priority = normalizePriority(task.priority);
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
    backlog,
    other,
    archived,
    overdue,
    onTime,
    late,
    scored,
    onTimePct: scored ? Math.round((onTime / scored) * 100) : null,
    completionPct: total ? Math.round((completed / total) * 100) : 0,
    overduePct: total ? Math.round((overdue / total) * 100) : 0,
    noDue: activeRows.filter((task) => !getDueValue(task)).length,
    createdPeriod: periodCreatedRows.length,
    archivedPeriod: periodArchivedRows.length,
    completedPeriod: completedPeriodRows.length,
    movedToProgress,
    movedToDone,
    byEmployee,
    byPriority,
  };
}
