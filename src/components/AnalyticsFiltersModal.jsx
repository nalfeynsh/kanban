import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { defaultAnalyticsFilters, periodPresetRange } from '../lib/analytics';

const PRESETS = [
  { days: 7, label: '7 дней' },
  { days: 30, label: '30 дней' },
  { days: 90, label: '90 дней' },
  { days: 365, label: 'Год' },
];

export default function AnalyticsFiltersModal({
  isOpen,
  onClose,
  filters,
  onApply,
  members = [],
}) {
  const [draft, setDraft] = useState(filters);
  const [presetDays, setPresetDays] = useState(() => {
    const preset = periodPresetRange(30);
    return filters.from === preset.from && filters.to === preset.to ? 30 : null;
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const setPreset = (days) => {
    setPresetDays(days);
    setDraft((current) => ({ ...current, ...periodPresetRange(days) }));
    setError('');
  };

  const setDate = (key, value) => {
    setPresetDays(null);
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
  };

  const handleApply = () => {
    if (!draft.from || !draft.to) {
      setError('Укажите начало и конец периода');
      return;
    }
    if (draft.from > draft.to) {
      setError('Начало периода не может быть позже конца');
      return;
    }
    onApply({ ...draft, employeeId: draft.employeeId || 'all' });
    onClose();
  };

  const reset = () => {
    setDraft(defaultAnalyticsFilters());
    setPresetDays(30);
    setError('');
  };

  const selectedMember = members.find((member) => member.id === draft.employeeId);

  return createPortal(
    <div
      className="modal-overlay !z-[60]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel w-full max-w-lg overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <SlidersHorizontal size={18} className="text-indigo-500 dark:text-indigo-300" />
              Настройка аналитики
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Период считается по сроку задачи
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

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              <CalendarDays size={12} /> Период
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset.days}
                  type="button"
                  onClick={() => setPreset(preset.days)}
                  className={`glass-btn !px-2.5 !py-1 !text-[0.7rem] ${
                    presetDays === preset.days ? 'glass-btn-primary' : ''
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[0.65rem] text-slate-500 dark:text-slate-400">С</span>
                <input
                  type="date"
                  value={draft.from}
                  onChange={(event) => setDate('from', event.target.value)}
                  className="glass-input !py-1.5 !text-xs"
                />
              </label>
              <label>
                <span className="mb-1 block text-[0.65rem] text-slate-500 dark:text-slate-400">По</span>
                <input
                  type="date"
                  value={draft.to}
                  onChange={(event) => setDate('to', event.target.value)}
                  className="glass-input !py-1.5 !text-xs"
                />
              </label>
            </div>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              <UserRound size={12} /> Сотрудник
            </p>
            <select
              value={draft.employeeId || 'all'}
              onChange={(event) => setDraft((current) => ({ ...current, employeeId: event.target.value }))}
              className="glass-input !py-1.5 !text-xs"
            >
              <option value="all">Все сотрудники (отдел)</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name || 'Без имени'}
                  {member.is_active === false ? ' (неактивен)' : ''}
                </option>
              ))}
            </select>
            {selectedMember && (
              <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                Показатели только по задачам, назначенным на этого сотрудника
              </p>
            )}
          </div>

          {error && (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={reset} className="glass-btn !px-3 !py-1.5 !text-xs">
            Сбросить
          </button>
          <button type="button" onClick={handleApply} className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs">
            <Check size={14} /> Применить
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
