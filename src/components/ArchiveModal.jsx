import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  RotateCcw,
  Archive,
  Trash2,
  UserRound,
  Search,
  ShieldCheck,
  CalendarDays,
} from 'lucide-react';
import { formatCreated } from '../lib/format';
import { isPersonal, isOwner } from '../lib/access';
import Avatar from './Avatar';

export default function ArchiveModal({
  isOpen,
  onClose,
  archivedTasks = [],
  onRestore,
  onDeleteForever,
  authorById,
  numberById,
  currentUserId,
}) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return archivedTasks
      .filter((task) => {
        // Дублируем правила доступа на клиенте: личные — только автору
        if (isPersonal(task) && !isOwner(task, currentUserId)) return false;
        if (tab === 'personal') return isPersonal(task);
        if (tab === 'team') return !isPersonal(task);
        return true;
      })
      .filter((task) => !q || (task.title || '').toLowerCase().includes(q));
  }, [archivedTasks, tab, query, currentUserId]);

  if (!isOpen) return null;

  const handleRestore = async (taskId) => {
    setPendingId(taskId);
    try {
      await onRestore(taskId);
    } finally {
      setPendingId(null);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/30 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <Archive size={20} className="text-indigo-500 dark:text-indigo-300" />
              Архив задач
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {archivedTasks.length} удалённых · доступ по тем же правам, что и на доске
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          <div className="glass-segment">
            {[
              { key: 'all', label: 'Все' },
              { key: 'team', label: 'Команда' },
              { key: 'personal', label: 'Личные' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className="glass-segment-btn"
                data-active={tab === item.key}
                onClick={() => setTab(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="relative ml-auto min-w-[180px] flex-1 sm:max-w-xs">
            <Search size={14} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по названию…"
              className="glass-input !py-1.5 !pl-9 !text-xs"
            />
          </div>
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-4">
          {visible.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500 dark:text-slate-400">
              <Archive size={30} className="mx-auto mb-2 opacity-40" />
              {archivedTasks.length === 0 ? 'Архив пуст' : 'Ничего не найдено'}
              <p className="mt-1 text-[0.7rem] text-slate-400 dark:text-slate-500">
                Здесь появятся задачи, удалённые с доски
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {visible.map((task) => {
                const author = authorById?.get(task.created_by);
                const number = numberById?.get(task.id);
                const personal = isPersonal(task);

                return (
                  <li
                    key={task.id}
                    className="rounded-2xl border border-white/45 bg-white/35 p-3 transition hover:border-indigo-400/50 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          {number != null && (
                            <span className="glass-chip font-mono !text-[0.62rem]">№{number}</span>
                          )}
                          {personal ? (
                            <span className="flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-1.5 py-0.5 text-[0.6rem] font-semibold text-violet-700 dark:text-violet-300">
                              <UserRound size={10} /> Личная
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/12 px-1.5 py-0.5 text-[0.6rem] font-semibold text-sky-700 dark:text-sky-300">
                              <ShieldCheck size={10} /> Команда
                            </span>
                          )}
                        </div>

                        <h3 className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {task.title || 'Без названия'}
                        </h3>

                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.68rem] text-slate-500 dark:text-slate-400">
                          <span className="flex items-center gap-1.5">
                            {author && (
                              <Avatar
                                name={author.full_name}
                                color={author.color}
                                src={author.avatar_url}
                                className="h-4 w-4 text-[0.5rem]"
                              />
                            )}
                            Постановщик: <b className="font-semibold text-slate-700 dark:text-slate-200">
                              {author?.full_name || 'неизвестен'}
                            </b>
                          </span>

                          <span className="flex items-center gap-1">
                            <CalendarDays size={11} />
                            Создана: {formatCreated(task.created_at)}
                          </span>

                          {task.deleted_at && (
                            <span className="flex items-center gap-1 text-rose-600/90 dark:text-rose-300/90">
                              <Trash2 size={11} />
                              Удалена: {formatCreated(task.deleted_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleRestore(task.id)}
                          disabled={pendingId === task.id}
                          className="glass-btn !py-1.5 !px-2.5 !text-xs"
                          title="Вернуть на доску"
                        >
                          <RotateCcw size={13} className={pendingId === task.id ? 'animate-spin' : ''} />
                          Восстановить
                        </button>
                        {onDeleteForever && (
                          <button
                            type="button"
                            onClick={() => onDeleteForever(task.id)}
                            className="glass-btn glass-btn-danger !p-1.5"
                            title="Удалить навсегда"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
