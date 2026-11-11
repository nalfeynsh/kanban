import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, Inbox, CheckSquare } from 'lucide-react';
import TaskCard from './TaskCard';

const ACCENTS = [
  'from-indigo-500 via-violet-500 to-sky-400',
  'from-amber-400 via-orange-400 to-rose-400',
  'from-emerald-400 via-teal-400 to-sky-400',
  'from-fuchsia-500 via-violet-500 to-indigo-400',
];

export default function Column({
  column,
  tasks,
  index = 0,
  numberById,
  authorById,
  selectionMode = false,
  selectedIds,
  onTaskClick,
  onAddNewTask,
  onDeleteTask,
  onToggleSelect,
  onSelectColumn,
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'Column', columnId: column.id },
  });

  const taskIds = tasks.map((task) => task.id);
  const accent = ACCENTS[index % ACCENTS.length];
  const allSelected = tasks.length > 0 && tasks.every((task) => selectedIds?.has(task.id));

  return (
    <section
      ref={setNodeRef}
      className={`column-shell flex h-[calc(100vh-200px)] max-h-[calc(100vh-150px)] w-[19rem] shrink-0 flex-col overflow-hidden rounded-3xl transition-all ${
        isOver ? 'column-drop-active' : ''
      }`}
    >
      <div className={`h-[3px] w-full bg-gradient-to-r ${accent}`} aria-hidden="true" />

      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100">
            {column.title}
          </h2>
          <span className="glass-chip font-mono">{tasks.length}</span>
        </div>

        <div className="flex items-center gap-0.5">
          {selectionMode && (
            <button
              type="button"
              onClick={() => onSelectColumn?.(column.id)}
              className={`rounded-lg p-1.5 transition hover:bg-white/70 dark:hover:bg-white/10 ${
                allSelected ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'
              }`}
              title={allSelected ? 'Снять выделение колонки' : 'Выбрать все задачи колонки'}
            >
              <CheckSquare size={15} />
            </button>
          )}

          <button
            type="button"
            onClick={onAddNewTask}
            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white/70 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-indigo-300"
            title="Добавить задачу"
          >
            <Plus size={16} />
          </button>
        </div>
      </header>

      <div className="scrollbar-slim flex-1 overflow-y-auto px-3 pt-1 pb-2">
        <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              number={numberById?.get(task.id)}
              author={authorById?.get(task.created_by)}
              assignee={task.assignee_id ? authorById?.get(task.assignee_id) : null}
              onClick={() => onTaskClick(task)}
              onDelete={onDeleteTask}
              selectionMode={selectionMode}
              selected={Boolean(selectedIds?.has(task.id))}
              onToggleSelect={onToggleSelect}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-400/35 px-3 py-8 text-center text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            <Inbox size={18} className="opacity-60" />
            <span>Перетащите задачу сюда</span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onAddNewTask}
        className="mx-3 mb-3 flex items-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium text-slate-500 transition hover:bg-white/60 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-indigo-300"
      >
        <Plus size={14} /> Добавить задачу
      </button>
    </section>
  );
}
