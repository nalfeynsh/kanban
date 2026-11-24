import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  AlarmClock,
  Bell,
  CalendarClock,
  CheckCheck,
  FolderKanban,
  Gift,
  MessageSquare,
  X,
} from 'lucide-react';

function NotificationIcon({ kind }) {
  if (kind === 'chat') return <MessageSquare size={16} />;
  if (kind === 'meeting') return <CalendarClock size={16} />;
  if (kind === 'task_due' || kind === 'task_overdue') return <AlarmClock size={16} />;
  if (kind === 'project') return <FolderKanban size={16} />;
  if (kind === 'secret_santa') return <Gift size={16} />;
  return <Bell size={16} />;
}

function notificationColor(kind) {
  if (kind === 'chat') return '#6366f1';
  if (kind === 'meeting') return '#0ea5e9';
  if (kind === 'task_overdue') return '#f43f5e';
  if (kind === 'task_due') return '#f59e0b';
  if (kind === 'secret_santa') return '#e11d48';
  return '#8b5cf6';
}

function whenLabel(value) {
  if (!value) return '';
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return 'только что';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} ч назад`;
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
}

export default function NotificationsModal({ isOpen, notifications = [], onClose, onReadAll, onOpenNotification }) {
  useEffect(() => {
    if (isOpen) onReadAll?.();
    // Открытие окна фиксирует текущие уведомления прочитанными.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="modal-overlay !z-[90]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Bell size={18} className="text-indigo-500 dark:text-indigo-300" />
              Уведомления
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              События, требующие внимания
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/10"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
              <Bell size={30} className="text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                Пока нет уведомлений
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Здесь появятся сообщения, сроки задач и напоминания о встречах.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {notifications.map((notification) => {
                const unread = !notification.read_at;
                return (
                  <button
                    key={notification.id}
                    type="button"
                    onClick={() => onOpenNotification?.(notification)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${
                      unread
                        ? 'border-indigo-400/40 bg-indigo-500/[0.08]'
                        : 'border-white/45 bg-white/30 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                      style={{ backgroundColor: notificationColor(notification.kind) }}
                    >
                      <NotificationIcon kind={notification.kind} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span
                          className={`min-w-0 truncate text-xs font-semibold ${
                            unread
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {notification.title}
                        </span>
                        <span className="shrink-0 text-[0.58rem] text-slate-400">
                          {whenLabel(notification.created_at)}
                        </span>
                      </span>
                      {notification.body && (
                        <span className="mt-0.5 block line-clamp-2 text-[0.7rem] text-slate-500 dark:text-slate-400">
                          {notification.body}
                        </span>
                      )}
                    </span>
                    {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button
            type="button"
            onClick={onReadAll}
            className="glass-btn !px-3 !py-1.5 !text-xs"
            disabled={!notifications.some((notification) => !notification.read_at)}
          >
            <CheckCheck size={14} /> Прочитать все
          </button>
          <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
