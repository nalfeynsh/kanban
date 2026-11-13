import { useEffect, useMemo, useState } from 'react';import { createPortal } from 'react-dom';
import { CalendarPlus, Check, Loader, Users, X } from 'lucide-react';
import Avatar from './Avatar';
import DateTimeField from './DateTimeField';

function defaultTimes() {
  const start = new Date();
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() < 30 ? 30 : 0);
  if (start.getMinutes() === 0) start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export default function MeetingModal({ onClose, onSave, members = [], currentUserId }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startAt, setStartAt] = useState(() => defaultTimes().start);
  const [endAt, setEndAt] = useState(() => defaultTimes().end);
  const [participantIds, setParticipantIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const candidates = useMemo(
    () =>
      members
        .filter((member) => member.id !== currentUserId && member.is_active !== false)
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ru')),
    [members, currentUserId],
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const toggleParticipant = (id) => {
    setParticipantIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Укажите название встречи');
      return;
    }
    if (!startAt || !endAt) {
      setError('Укажите начало и окончание');
      return;
    }
    if (new Date(endAt) <= new Date(startAt)) {
      setError('Окончание должно быть позже начала');
      return;
    }

    setError('');
    setSaving(true);
    const ok = await onSave({
      title: title.trim(),
      description: description.trim(),
      start_at: startAt,
      end_at: endAt,
      participantIds,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return createPortal(
    <div className="modal-overlay !z-[80]">
      <div className="modal-panel glass-panel max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <CalendarPlus size={18} className="text-indigo-500 dark:text-indigo-300" />
              Новая встреча
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Участники увидят встречу в календаре
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
          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              Название
            </span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например, планёрка команды"
              className="glass-input !py-1.5 !text-xs"
              autoFocus
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Начало
              </span>
              <DateTimeField value={startAt} onChange={setStartAt} />
            </div>
            <div>
              <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Окончание
              </span>
              <DateTimeField value={endAt} onChange={setEndAt} />
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              Описание
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder="Повестка или ссылка на материалы"
              className="glass-input resize-none !py-1.5 !text-xs"
            />
          </label>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              <Users size={12} /> Пригласить
            </p>
            {candidates.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-3 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                В команде пока нет других активных сотрудников.
              </p>
            ) : (
              <div className="scrollbar-slim max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-300/60 p-1.5 dark:border-white/10">
                {candidates.map((member) => {
                  const checked = participantIds.includes(member.id);
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleParticipant(member.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${
                        checked
                          ? 'bg-indigo-500/12 text-indigo-800 dark:text-indigo-200'
                          : 'hover:bg-white/60 dark:hover:bg-white/10'
                      }`}
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                          checked
                            ? 'border-indigo-500 bg-indigo-500 text-white'
                            : 'border-slate-400/60 bg-white/60 dark:border-white/25 dark:bg-white/10'
                        }`}
                      >
                        {checked && <Check size={11} strokeWidth={3} />}
                      </span>
                      <Avatar
                        name={member.full_name}
                        color={member.color}
                        src={member.avatar_url}
                        className="h-6 w-6 text-[0.5rem]"
                      />
                      <span className="truncate text-xs text-slate-700 dark:text-slate-200">
                        {member.full_name || 'Сотрудник'}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <p className="mt-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
              Вы — организатор, добавитесь автоматически.
            </p>
          </div>

          {error && (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
          >
            {saving ? <Loader size={14} className="animate-spin" /> : <CalendarPlus size={14} />}
            Создать встречу
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
