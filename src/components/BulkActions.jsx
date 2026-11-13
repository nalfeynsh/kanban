import { useState } from 'react';
import {
  X,
  CheckSquare,
  Square,
  Trash2,
  Users,
  Flag,
  ArrowRightLeft,
  CheckCheck,
} from 'lucide-react';
import { PRIORITIES } from '../lib/priority';

/**
 * Плавающая панель массовых действий над выбранными задачами.
 * Появляется на доске в режиме выделения.
 */
export default function BulkActions({
  count,
  total,
  columns = [],
  members = [],
  canAssign = false,
  canPriority = false,
  onSelectAll,
  onClear,
  onExit,
  onMove,
  onAssign,
  onPriority,
  onArchive,
}) {
  const [assignee, setAssignee] = useState('');
  const [targetColumn, setTargetColumn] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (action) => {
    if (!action) return;
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
      setTargetColumn('');
      setAssignee('');
    }
  };

  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div className="pointer-events-auto glass-panel flex max-w-[calc(100vw-2rem)] flex-wrap items-center gap-2 rounded-2xl px-3 py-2 shadow-2xl">
        <span className="glass-chip !py-1 !text-[0.7rem] font-semibold">
          <CheckSquare size={12} /> Выбрано: {count}
        </span>

        <button
          type="button"
          onClick={count === total ? onClear : onSelectAll}
          className="glass-btn !px-2.5 !py-1.5 !text-[0.7rem]"
          title={count === total ? 'Снять выделение' : 'Выбрать все задачи на доске'}
        >
          {count === total ? <Square size={13} /> : <CheckCheck size={13} />}
          {count === total ? 'Снять' : 'Все'}
        </button>

        <span className="mx-0.5 h-5 w-px bg-white/40 dark:bg-white/10" />

        <label className={`flex items-center gap-1 text-[0.7rem] text-slate-600 dark:text-slate-300 ${count === 0 || busy ? 'opacity-50' : ''}`}>
          <ArrowRightLeft size={13} />
          <select
            value={targetColumn}
            disabled={count === 0 || busy}
            onChange={(event) => {
              const value = event.target.value;
              setTargetColumn(value);
              if (value) run(() => onMove?.(value));
            }}
            className="glass-input !w-auto !min-w-[8.5rem] !py-1 !text-[0.7rem]"
            title="Перенести выбранные задачи в колонку"
          >
            <option value="">Перенести в…</option>
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {column.title}
              </option>
            ))}
          </select>
        </label>

        {canAssign && (
          <label className={`flex items-center gap-1 text-[0.7rem] text-slate-600 dark:text-slate-300 ${count === 0 || busy ? 'opacity-50' : ''}`}>
            <Users size={13} />
            <select
              value={assignee}
              disabled={count === 0 || busy}
              onChange={(event) => {
                const value = event.target.value;
                setAssignee(value);
                run(() => onAssign?.(value || null));
              }}
              className="glass-input !w-auto !min-w-[8rem] !py-1 !text-[0.7rem]"
              title="Назначить исполнителя"
            >
              <option value="">Исполнитель…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || 'Сотрудник'}
                </option>
              ))}
            </select>
          </label>
        )}

        {canPriority && (
          <div className="flex items-center gap-1" title="Приоритет">
            <Flag size={13} className="text-slate-500 dark:text-slate-400" />
            {PRIORITIES.map((priority) => (
              <button
                key={priority.value}
                type="button"
                disabled={count === 0 || busy}
                onClick={() => run(() => onPriority?.(priority.value))}
                className={`h-6 w-6 rounded-lg border transition hover:scale-105 disabled:opacity-40 ${
                  priority.value === 0
                    ? 'border-slate-400/40 bg-slate-400/10'
                    : `border-slate-300/50 bg-gradient-to-br ${priority.bar}`
                }`}
                title={`Приоритет: ${priority.label}`}
              >
                <span className="sr-only">{priority.label}</span>
              </button>
            ))}
          </div>
        )}

        <span className="mx-0.5 h-5 w-px bg-white/40 dark:bg-white/10" />

        <button
          type="button"
          disabled={count === 0 || busy}
          onClick={() => run(onArchive)}
          className="glass-btn glass-btn-danger !px-2.5 !py-1.5 !text-[0.7rem]"
          title="Переместить выбранные задачи в архив"
        >
          <Trash2 size={13} /> В архив
        </button>

        <button
          type="button"
          onClick={onExit}
          className="glass-btn !rounded-full !p-1.5"
          title="Выйти из режима выделения (Esc)"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
