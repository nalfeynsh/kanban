/**
 * Чистая логика переноса задач по доске.
 * Отдельно от React/DnD — чтобы можно было покрыть тестом и не ловить
 * регрессии в обработчике `onDragEnd`.
 */

/**
 * @param {object} params
 * @param {string} params.activeId            — id перетаскиваемой задачи
 * @param {string|null} params.overId         — id цели под курсором (задача или колонка)
 * @param {boolean} params.isColumnTarget     — overId это колонка, а не задача
 * @param {string} params.sourceColumnId      — колонка, откуда тащим
 * @param {string|null} params.overColumnId   — колонка задачи под курсором
 * @param {Record<string, string[]>} params.columnsToTaskIds — видимые задачи по колонкам по порядку
 * @returns {{ updates: Array<{id: string, column_id: string, position: number}>, destColumnId: string } | null}
 */
export function planTaskMove({
  activeId,
  overId,
  isColumnTarget,
  sourceColumnId,
  overColumnId,
  columnsToTaskIds,
}) {
  if (!activeId || !overId) return null;
  if (activeId === overId) return null;

  const destColumnId = isColumnTarget ? overId : overColumnId;
  if (!destColumnId) return null;

  const sourceIds = [...(columnsToTaskIds[sourceColumnId] ?? [])];
  const destIds = [...(columnsToTaskIds[destColumnId] ?? [])];

  const groups = [];

  if (sourceColumnId === destColumnId) {
    const oldIndex = sourceIds.indexOf(activeId);
    if (oldIndex === -1) return null;

    // Бросок в пустую область своей колонки — в конец
    const newIndex = isColumnTarget ? sourceIds.length - 1 : sourceIds.indexOf(overId);
    if (newIndex === -1 || oldIndex === newIndex) return null;

    const reordered = [...sourceIds];
    reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, activeId);
    groups.push({ column_id: destColumnId, ids: reordered });
  } else {
    const restOfSource = sourceIds.filter((id) => id !== activeId);
    const overIndex = isColumnTarget ? -1 : destIds.indexOf(overId);
    const insertAt = overIndex === -1 ? destIds.length : overIndex;

    const nextDest = [...destIds];
    nextDest.splice(insertAt, 0, activeId);

    groups.push({ column_id: destColumnId, ids: nextDest });
    groups.push({ column_id: sourceColumnId, ids: restOfSource });
  }

  const updates = [];
  groups.forEach((group) => {
    group.ids.forEach((id, index) => {
      updates.push({ id, column_id: group.column_id, position: index });
    });
  });

  if (updates.length === 0) return null;

  return { updates, destColumnId };
}

/** Применяет позиции к локальному списку задач (оптимистичное обновление) */
export function applyTaskUpdates(tasks, updates) {
  const byId = new Map(updates.map((update) => [update.id, update]));
  return tasks.map((task) => {
    const update = byId.get(task.id);
    return update ? { ...task, column_id: update.column_id, position: update.position } : task;
  });
}
