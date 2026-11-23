import { addDays, daysBetween, getTaskSchedule, startOfDay } from './gantt.js';
import { dayHours, isWorkingDay } from './productionCalendar.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(date) {
  return startOfDay(date).getTime();
}

export function taskProgress(task, doneColumnId) {
  if (doneColumnId && task?.column_id === doneColumnId) return 100;
  const value = Number(task?.progress_percent);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export function taskStoryPoints(task) {
  const value = Number(task?.story_points);
  return Number.isFinite(value) ? value : 0;
}

/** Загрузка исполнителей: человеко-часы по рабочим дням + story points. */
export function buildResourceLoad(
  tasks = [],
  {
    storyPointsEnabled = false,
    dailyHours = 8,
    storyPointsPerDay = 2,
    hoursByUser = {},
    defaultWorkdayHours = 8,
    calendar = null,
  } = {},
) {
  const defaultCapacity = Number(defaultWorkdayHours) || Number(dailyHours) || 8;
  const spCapacity = Number(storyPointsPerDay) || 2;
  const byUser = new Map();
  const loadByDay = new Map();
  const spByDay = new Map();
  const dayDates = new Map();

  tasks.forEach((task) => {
    if (!task?.assignee_id) return;
    const schedule = getTaskSchedule(task);
    if (!schedule) return;
    const capacity = Number(hoursByUser[task.assignee_id]) || defaultCapacity;

    if (!byUser.has(task.assignee_id)) {
      byUser.set(task.assignee_id, {
        id: task.assignee_id,
        tasks: [],
        storyPoints: 0,
        totalSp: 0,
        totalHours: 0,
        maxHours: 0,
        maxSp: 0,
        overloadDays: 0,
        activeDays: 0,
        capacity,
      });
    }
    const entry = byUser.get(task.assignee_id);
    entry.tasks.push(task);
    entry.storyPoints += taskStoryPoints(task);

    const first = startOfDay(schedule.start);
    const last = startOfDay(schedule.finish);
    const workdays = [];
    const totalDays = Math.max(0, daysBetween(first, last));
    for (let i = 0; i <= totalDays; i += 1) {
      const date = addDays(first, i);
      if (isWorkingDay(date, calendar)) workdays.push(date);
    }

    const effort = Number(task.effort_hours);
    const taskHours = Number.isFinite(effort) && effort > 0 ? effort : workdays.length * capacity;
    const hoursPerDay = workdays.length > 0 ? taskHours / workdays.length : 0;
    const points = taskStoryPoints(task);
    const spPerDay = workdays.length > 0 ? points / workdays.length : 0;
    entry.totalHours += taskHours;
    entry.totalSp += points;

    const rowKey = task.assignee_id;
    if (!loadByDay.has(rowKey)) loadByDay.set(rowKey, new Map());
    if (!spByDay.has(rowKey)) spByDay.set(rowKey, new Map());
    if (!dayDates.has(rowKey)) dayDates.set(rowKey, new Map());
    const days = loadByDay.get(rowKey);
    const spDays = spByDay.get(rowKey);
    const dates = dayDates.get(rowKey);
    workdays.forEach((date) => {
      const key = dayKey(date);
      dates.set(key, date);
      days.set(key, (days.get(key) || 0) + hoursPerDay);
      spDays.set(key, (spDays.get(key) || 0) + spPerDay);
    });
  });

  return [...byUser.values()]
    .map((entry) => {
      const days = loadByDay.get(entry.id) || new Map();
      const spDays = spByDay.get(entry.id) || new Map();
      const dates = dayDates.get(entry.id) || new Map();
      let maxHours = 0;
      let maxSp = 0;
      let overloadDays = 0;
      const activeKeys = new Set([...days.keys(), ...spDays.keys()]);
      activeKeys.forEach((key) => {
        const hours = days.get(key) || 0;
        const sp = spDays.get(key) || 0;
        maxHours = Math.max(maxHours, hours);
        maxSp = Math.max(maxSp, sp);
        const capacityForDay = dates.has(key) ? dayHours(dates.get(key), calendar, entry.capacity) : entry.capacity;
        if (storyPointsEnabled ? sp > spCapacity + 0.01 : hours > capacityForDay + 0.01) overloadDays += 1;
      });
      return {
        ...entry,
        capacity: storyPointsEnabled ? spCapacity : entry.capacity,
        unit: storyPointsEnabled ? 'sp' : 'hours',
        maxHours,
        maxSp,
        overloadDays,
        activeDays: activeKeys.size,
      };
    })
    .sort((a, b) =>
      b.overloadDays - a.overloadDays ||
      (storyPointsEnabled ? b.maxSp - a.maxSp : b.maxHours - a.maxHours) ||
      b.tasks.length - a.tasks.length,
    );
}

/**
 * CPM по зависимостям finish-to-start.
 * Даты задач используются как ограничения, длительность — как минимум.
 */
export function computeCriticalPath(tasks = [], dependencies = []) {
  const byId = new Map();
  tasks.forEach((task) => {
    const schedule = getTaskSchedule(task);
    if (schedule) byId.set(task.id, { task, schedule });
  });
  if (byId.size === 0) return { criticalIds: new Set(), projectEnd: null };

  const edges = dependencies.filter(
    (item) => byId.has(item.task_id) && byId.has(item.depends_on_task_id),
  );
  if (edges.length === 0) return { criticalIds: new Set(), projectEnd: null };
  const parents = new Map();
  const children = new Map();
  edges.forEach((edge) => {
    if (!parents.has(edge.task_id)) parents.set(edge.task_id, []);
    parents.get(edge.task_id).push(edge.depends_on_task_id);
    if (!children.has(edge.depends_on_task_id)) children.set(edge.depends_on_task_id, []);
    children.get(edge.depends_on_task_id).push(edge.task_id);
  });

  const duration = new Map();
  const es = new Map();
  const ef = new Map();
  const visiting = new Set();
  let cycle = false;

  const forward = (id) => {
    if (ef.has(id)) return ef.get(id);
    if (visiting.has(id)) {
      cycle = true;
      return null;
    }
    visiting.add(id);
    const item = byId.get(id);
    const start = dayKey(item.schedule.start);
    const finish = dayKey(item.schedule.finish);
    const days = Math.max(item.task.is_milestone ? 0 : 1, daysBetween(item.schedule.start, item.schedule.finish) + 1);
    duration.set(id, days);

    let earliest = start;
    (parents.get(id) || []).forEach((parentId) => {
      const parentEf = forward(parentId);
      if (parentEf != null) {
        const lag = Math.max(0, Number(item.task.dependency_lag_days) || 0);
        earliest = Math.max(earliest, parentEf + (1 + lag) * DAY_MS);
      }
    });
    const earliestFinish = Math.max(finish, earliest + Math.max(0, days - 1) * DAY_MS);
    es.set(id, earliest);
    ef.set(id, earliestFinish);
    visiting.delete(id);
    return earliestFinish;
  };

  byId.forEach((_, id) => forward(id));
  if (cycle) return { criticalIds: new Set(), projectEnd: null };

  const projectEnd = Math.max(...[...ef.values()]);
  const lf = new Map();
  const ls = new Map();
  const computeBackward = (id) => {
    if (lf.has(id)) return lf.get(id);
    const kids = children.get(id) || [];
    let latestFinish = projectEnd;
    kids.forEach((childId) => {
      computeBackward(childId);
      latestFinish = Math.min(latestFinish, ls.get(childId) - DAY_MS);
    });
    lf.set(id, latestFinish);
    const days = duration.get(id) || 1;
    ls.set(id, latestFinish - Math.max(0, days - 1) * DAY_MS);
    return latestFinish;
  };
  byId.forEach((_, id) => computeBackward(id));

  const criticalIds = new Set();
  byId.forEach((_, id) => {
    const slack = (ls.get(id) || 0) - (es.get(id) || 0);
    if (slack <= 0) criticalIds.add(id);
  });

  return { criticalIds, projectEnd: new Date(projectEnd) };
}

export function sprintLabel(sprints = [], sprintId) {
  return sprints.find((sprint) => sprint.id === sprintId)?.name || '';
}

export function methodologyLabel(value) {
  return value === 'agile' ? 'Agile / Scrum' : 'Waterfall';
}
