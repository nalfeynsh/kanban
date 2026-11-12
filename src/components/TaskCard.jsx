import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  CalendarClock,
  Paperclip,
  Link2,
  Trash2,
  UserRound,
  Flag,
  AlertCircle,
  Check,
} from 'lucide-react';
import { formatDueBadge, getDueValue, isOverdue } from '../lib/format';
import { getPriority } from '../lib/priority';
import Avatar from './Avatar';

/** Чистая презентационная карточка — используется и в доске, и в DragOverlay */
export function TaskCardView({
  task,
  number,
  author,
  assignee,
  onOpen,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelect,
  isDragging = false,
  isOverlay = false,
  innerRef,
  style,
  listeners,
  attributes,
}) {
  const priority = getPriority(task.priority);
  const due = getDueValue(task);
  const overdue = due ? isOverdue(due) : false;
  const linksCount = Array.isArray(task.links) ? task.links.length : 0;
  const filesCount = Array.isArray(task.files) ? task.files.length : 0;
  const person = assignee || author;
  const personLabel = assignee
    ? `Исполнитель: ${assignee.full_name || 'сотрудник'}`
    : author
      ? `Постановщик: ${author.full_name || 'сотрудник'}`
      : '';

  const handleClick = () => {
    if (selectionMode) onToggleSelect?.(task.id);
    else onOpen?.();
  };

  return (
    <div
      ref={innerRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={handleClick}
      className={[
        'glass-card group relative mb-2.5 flex cursor-grab flex-col rounded-2xl p-3 pr-3 select-none',
        selectionMode ? 'cursor-pointer' : '',
        isDragging ? 'opacity-40' : '',
        isOverlay ? 'drag-ghost cursor-grabbing' : '',
        selected ? 'ring-2 ring-indigo-500 bg-indigo-500/10' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* Полоска приоритета */}
      <span
        className={`absolute top-3 bottom-3 left-0 w-[3px] rounded-full bg-gradient-to-b ${priority.bar}`}
        aria-hidden="true"
      />

      <div className="mb-1.5 flex items-start justify-between gap-2 pl-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {selectionMode && (
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition ${
                selected
                  ? 'border-indigo-500 bg-indigo-500 text-white'
                  : 'border-slate-400/60 bg-white/60 dark:border-white/25 dark:bg-white/10'
              }`}
              aria-hidden="true"
            >
              {selected && <Check size={11} strokeWidth={3} />}
            </span>
          )}
          {number != null && (
            <span
              className="glass-chip font-mono text-[0.65rem] tracking-tight"
              title="Номер задачи"
            >
              №{number}
            </span>
          )}
          {task.tags?.map((tag, index) => (
            <span
              key={index}
              className={`${tag.color || 'bg-indigo-500'} rounded-md px-2 py-0.5 text-[0.65rem] font-semibold text-white shadow-sm`}
            >
              {tag.text}
            </span>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {task.is_private && (
            <span
              className="flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-1.5 py-0.5 text-[0.62rem] font-semibold text-violet-700 dark:text-violet-300"
              title="Личная задача — видна только вам"
            >
              <UserRound size={11} />
              Личная
            </span>
          )}
        </div>
      </div>

      <p className="mb-2.5 pl-1 text-sm leading-snug font-medium text-slate-800 dark:text-slate-100">
        {task.title || 'Без названия'}
      </p>

      <div className="mt-auto flex items-end justify-between gap-2 pl-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {due && (
            <span
              className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium ${
                overdue
                  ? 'border border-rose-400/60 bg-rose-500/15 text-rose-700 dark:text-rose-300'
                  : 'glass-chip'
              }`}
              title={overdue ? 'Срок истёк' : 'Срок'}
            >
              {overdue ? <AlertCircle size={11} /> : <CalendarClock size={11} />}
              {formatDueBadge(due)}
            </span>
          )}

          {linksCount > 0 && (
            <span className="glass-chip" title="Ссылки">
              <Link2 size={11} />
              {linksCount}
            </span>
          )}

          {filesCount > 0 && (
            <span className="glass-chip" title="Файлы">
              <Paperclip size={11} />
              {filesCount}
            </span>
          )}

          {priority.value > 0 && (
            <span
              className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.68rem] font-medium ${priority.chip}`}
              title={`Приоритет: ${priority.label}`}
            >
              <Flag size={11} />
              {priority.short}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {person && (
            <Avatar
              name={person.full_name}
              color={person.color}
              src={person.avatar_url}
              className="h-6 w-6 text-[0.6rem] avatar-ring"
              title={personLabel}
            />
          )}

          {onDelete && !selectionMode && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onDelete(task.id);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              className="rounded-md p-1 text-slate-400 opacity-0 transition-all group-hover:opacity-100 hover:bg-rose-500/10 hover:text-rose-500"
              title="В архив"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TaskCard({
  task,
  number,
  author,
  assignee,
  onClick,
  onDelete,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: selectionMode,
    data: { type: 'Task', columnId: task.column_id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 1,
    position: 'relative',
  };

  return (
    <TaskCardView
      task={task}
      number={number}
      author={author}
      assignee={assignee}
      onOpen={onClick}
      onDelete={onDelete}
      selectionMode={selectionMode}
      selected={selected}
      onToggleSelect={onToggleSelect}
      isDragging={isDragging}
      innerRef={setNodeRef}
      style={style}
      listeners={listeners}
      attributes={attributes}
    />
  );
}
