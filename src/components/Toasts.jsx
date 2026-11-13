import { MessageSquare, Users, X } from 'lucide-react';
import Avatar from './Avatar';

/** Всплывающие уведомления в правом нижнем углу */
export default function Toasts({ toasts = [], onDismiss, onOpen }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[90] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="glass-panel pointer-events-auto flex items-start gap-2.5 rounded-2xl border border-slate-300/50 p-3 shadow-xl dark:border-white/10"
        >
          <button
            type="button"
            onClick={() => onOpen?.(toast)}
            className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
            title="Открыть чат"
          >
            {toast.isTeam ? (
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
                style={{ backgroundColor: toast.color || '#6366f1' }}
              >
                <Users size={15} />
              </span>
            ) : (
              <Avatar
                name={toast.title}
                color={toast.color}
                src={toast.avatar}
                shape="rounded-xl"
                className="h-9 w-9 text-[0.6rem]"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[0.78rem] font-semibold text-slate-800 dark:text-slate-100">
                  {toast.title}
                </span>
                <MessageSquare size={11} className="shrink-0 text-indigo-400" />
              </span>
              <span className="mt-0.5 block line-clamp-2 text-[0.7rem] text-slate-600 dark:text-slate-300">
                {toast.body}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => onDismiss?.(toast.id)}
            className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
            title="Скрыть"
            aria-label="Скрыть уведомление"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
