/**
 * Правила доступа к задачам.
 *
 * Личная задача (is_private) видна ТОЛЬКО автору — и в активном состоянии,
 * и в архиве. Командная задача видна всем участникам команды.
 * Архив подчиняется тем же правилам, что и активная доска
 * (требование: «удалённые задачи команды видны в соответствии
 * с правами доступа к задаче в активном состоянии»).
 */

export function isPersonal(task) {
  return task?.is_private === true;
}

export function isOwner(task, userId) {
  if (!task || !userId) return false;
  return task.created_by === userId;
}

export function canSeeTask(task, userId) {
  if (!task) return false;
  if (isPersonal(task)) return isOwner(task, userId);
  return true;
}

export function canEditTask(task, userId) {
  if (!task || !userId) return false;
  if (isPersonal(task)) return isOwner(task, userId);
  return true;
}

/** Задачи, которые текущий пользователь вправе видеть */
export function filterVisibleTasks(tasks, userId) {
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((task) => canSeeTask(task, userId));
}

/**
 * Фильтр по режиму доски.
 * all      — командные + свои личные
 * team     — только командные
 * personal — только свои личные
 */
export function matchesMode(task, mode, userId) {
  if (!task) return false;
  if (!canSeeTask(task, userId)) return false;
  if (mode === 'personal') return isPersonal(task) && isOwner(task, userId);
  if (mode === 'team') return !isPersonal(task);
  return true;
}

/** Подпись постановщика в архиве */
export function authorLabel(author) {
  if (!author) return 'неизвестен';
  return author.full_name || author.work_email || 'сотрудник';
}
