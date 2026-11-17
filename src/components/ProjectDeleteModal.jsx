import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Download, Loader2, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { downloadProjectArchive } from '../lib/projects';

export default function ProjectDeleteModal({ project, ownerName, onClose, onDelete }) {
  const [step, setStep] = useState(1);
  const [checked, setChecked] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!project) return undefined;
    let alive = true;
    supabase
      .rpc('project_delete_preview', { p_project: project.id })
      .then(({ data, error: previewError }) => {
        if (!alive) return;
        if (previewError) setError(previewError.message);
        else setPreview(data);
      });
    return () => {
      alive = false;
    };
  }, [project]);

  if (!project) return null;

  const counts = preview || {};
  const exactName = confirmName.trim() === project.name.trim();

  const download = async () => {
    setDownloading(true);
    setError('');
    const { error: downloadError } = await downloadProjectArchive(project.id);
    if (downloadError) setError(downloadError.message || 'Не удалось скачать данные');
    setDownloading(false);
  };

  const remove = async () => {
    if (!exactName) return;
    setBusy(true);
    setError('');
    const { error: deleteError } = await onDelete(project.id);
    if (deleteError) {
      setError(deleteError.message || 'Не удалось переместить проект в корзину');
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose?.();
  };

  return createPortal(
    <div className="modal-overlay !z-[95]" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className="modal-panel glass-panel w-full max-w-xl overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Trash2 size={18} className="text-rose-500" />
              Удалить проект
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {step === 1 ? 'Проверьте последствия' : 'Подтвердите удаление'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/10" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim max-h-[65vh] space-y-4 overflow-y-auto px-5 py-4">
          {error && (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {step === 1 ? (
            <>
              <div className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-3 text-xs text-amber-900 dark:border-amber-400/30 dark:text-amber-100">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={15} /> Важно
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Проект <b>«{project.name}»</b> будет перемещён в корзину. Все блоки, задачи,
                  вложенные файлы и связанные чаты станут недоступны. Восстановить проект можно
                  <b> в течение 30 дней</b>, после чего данные будут удалены безвозвратно.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {[
                  ['Задачи', counts.tasks ?? '—'],
                  ['Архив', counts.archived_tasks ?? '—'],
                  ['Блоки', counts.columns ?? '—'],
                  ['Файлы', counts.files ?? '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-white/45 bg-white/35 p-2.5 dark:border-white/10 dark:bg-white/5">
                    <p className="text-[0.6rem] text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="mt-0.5 text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300">
                Ответственный: <b>{ownerName || 'не указан'}</b>. Ему будет отправлено уведомление
                о перемещении проекта в корзину и сроке восстановления.
              </p>

              <button
                type="button"
                onClick={download}
                disabled={downloading}
                className="glass-btn w-full !justify-center !text-xs"
              >
                {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                Скачать данные проекта (JSON)
              </button>
              <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                Резервная копия содержит проект, блоки, задачи, ссылки и метаданные файлов.
              </p>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-white/45 bg-white/30 p-3 text-xs text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                  className="mt-0.5 accent-rose-500"
                />
                <span>
                  Я понимаю, что проект, блоки, задачи, файлы и связанные чаты будут перемещены
                  в корзину и удалены через 30 дней.
                </span>
              </label>

              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="glass-btn !text-xs">Отмена</button>
                <button
                  type="button"
                  disabled={!checked || busy}
                  onClick={() => setStep(2)}
                  className="glass-btn glass-btn-danger !text-xs"
                >
                  Продолжить
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-rose-400/50 bg-rose-500/10 p-3 text-xs text-rose-800 dark:border-rose-400/30 dark:text-rose-200">
                <p className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle size={15} /> Точно удалить проект?
                </p>
                <p className="mt-1.5 leading-relaxed">
                  Блоки и вложенные файлы будут скрыты. Если нужные документы ещё не сохранены,
                  вернитесь назад и скачайте резервную копию.
                </p>
              </div>

              <label className="block text-xs text-slate-600 dark:text-slate-300">
                Для подтверждения введите название проекта:
                <span className="ml-1 font-mono font-semibold text-slate-900 dark:text-white">
                  {project.name}
                </span>
                <input
                  value={confirmName}
                  onChange={(event) => setConfirmName(event.target.value)}
                  className="glass-input mt-2 !text-sm"
                  autoFocus
                />
              </label>

              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" onClick={() => setStep(1)} className="glass-btn !text-xs">
                  Назад
                </button>
                <button type="button" onClick={onClose} className="glass-btn !text-xs">
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={!exactName || busy}
                  className="glass-btn glass-btn-danger !text-xs"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Удалить в корзину
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
