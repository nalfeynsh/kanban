import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Check, Copy, ExternalLink, RefreshCw, ShieldAlert, X } from 'lucide-react';

export default function CalendarFeedModal({ token, onClose }) {
  const [copied, setCopied] = useState(false);
  const feedUrl = `${window.location.origin}/calendar/${token}.ics`;

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // буфер обмена может быть недоступен — ссылка остаётся выделяемой
    }
  };

  return createPortal(
    <div className="modal-overlay !z-[85]">
      <div className="modal-panel glass-panel w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <CalendarPlus size={18} className="text-indigo-500 dark:text-indigo-300" />
              Календарь по ссылке
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Встречи будут обновляться в Google Calendar и Outlook автоматически
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-xl bg-indigo-500/8 px-3 py-2.5 text-xs leading-relaxed text-slate-700 dark:bg-indigo-400/10 dark:text-slate-200">
            Ваши встречи — в отдельном календаре. Ссылка обновляется автоматически при создании,
            переносе и отмене встречи. Добавьте её один раз.
          </div>

          <div>
            <p className="mb-1 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              Ссылка для подписки
            </p>
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1 rounded-xl border border-slate-300/60 bg-white/45 px-2.5 py-2">
                <span className="block truncate font-mono text-[0.68rem] text-slate-600 dark:text-slate-300">
                  {feedUrl}
                </span>
              </div>
              <button type="button" onClick={handleCopy} className="glass-btn shrink-0 !px-2.5 !py-1.5 !text-xs">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-300/60 bg-white/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <CalendarPlus size={13} className="text-indigo-500" /> Google Calendar
              </p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[0.68rem] leading-relaxed text-slate-600 dark:text-slate-300">
                <li>Откройте «Другие календари».</li>
                <li>Выберите «Добавить по URL».</li>
                <li>Вставьте ссылку выше.</li>
              </ol>
              <a
                href="https://calendar.google.com/calendar/u/0/r/settings/addbyurl"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[0.65rem] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
              >
                Открыть Google Calendar <ExternalLink size={10} />
              </a>
            </div>

            <div className="rounded-xl border border-slate-300/60 bg-white/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                <CalendarPlus size={13} className="text-sky-500" /> Outlook
              </p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-[0.68rem] leading-relaxed text-slate-600 dark:text-slate-300">
                <li>Откройте «Добавить календарь».</li>
                <li>Выберите «Подписаться из интернета».</li>
                <li>Вставьте ссылку выше.</li>
              </ol>
              <a
                href="https://outlook.live.com/calendar/0/addcalendar"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1 text-[0.65rem] font-medium text-sky-600 hover:underline dark:text-sky-300"
              >
                Открыть Outlook <ExternalLink size={10} />
              </a>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-[0.68rem] text-amber-800 dark:text-amber-200">
            <ShieldAlert size={13} className="mt-0.5 shrink-0" />
            <span>
              Ссылка содержит секретный токен. Не публикуйте её: любой, кто её получит, увидит ваши встречи.
            </span>
          </div>

          <p className="flex items-center gap-1 text-[0.62rem] text-slate-400 dark:text-slate-500">
            <RefreshCw size={10} /> Google и Outlook обновляют подписку с задержкой до 15–60 минут.
          </p>
        </div>

        <div className="flex justify-end border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
