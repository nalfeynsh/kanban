import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Download, Loader2, Plus, Trash2, X } from 'lucide-react';
import { fetchRfCalendar, normalizeCalendar } from '../lib/productionCalendar';

export default function GanttCalendarModal({ isOpen, onClose, calendar, canManage = false, onSave }) {
  const initial = normalizeCalendar(calendar);
  const [year, setYear] = useState(initial.year);
  const [holidays, setHolidays] = useState(initial.holidays);
  const [shortDays, setShortDays] = useState(initial.shortDays);
  const [source, setSource] = useState(initial.source);
  const [newHoliday, setNewHoliday] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const loadRf = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchRfCalendar(year);
      setHolidays(data.holidays || []);
      setShortDays(data.shortDays || {});
      setSource(data.source || 'isdayoff.ru');
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  };

  const addHoliday = () => {
    if (!newHoliday || holidays.includes(newHoliday)) return;
    setHolidays((prev) => [...prev, newHoliday].sort());
    setNewHoliday('');
    setSource('manual');
  };

  const save = async () => {
    if (!canManage) return;
    setSaving(true);
    await onSave?.({
      year,
      workdays: [1, 2, 3, 4, 5],
      holidays,
      shortDays,
      source,
    });
    setSaving(false);
    onClose?.();
  };

  return createPortal(
    <div className="modal-overlay !z-[90]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal-panel glass-panel flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <CalendarDays size={18} className="text-indigo-500" /> Производственный календарь
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Один календарь на проект. Праздники и сокращённые дни учитываются в длительности и загрузке.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"><X size={18} /></button>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">{error}</p>}

          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-[0.62rem] font-semibold tracking-[0.1em] text-slate-500 uppercase">Год</span>
              <input type="number" min="2020" max="2035" value={year} onChange={(event) => setYear(Number(event.target.value))} className="glass-input !w-24 !py-1.5 !text-xs" />
            </label>
            <button type="button" onClick={loadRf} disabled={loading || !canManage} className="glass-btn !px-3 !py-1.5 !text-xs">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              Загрузить производственный календарь РФ
            </button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Нерабочих дней</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{holidays.length}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Сокращённых дней</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{Object.keys(shortDays).length}</p>
            </div>
          </div>

          <p className="mt-2 text-[0.6rem] text-slate-500">Источник: {source}. Рабочая неделя: пн–пт.</p>

          {canManage && (
            <div className="mt-3 flex gap-1.5">
              <input type="date" value={newHoliday} onChange={(event) => setNewHoliday(event.target.value)} className="glass-input !py-1.5 !text-xs" />
              <button type="button" onClick={addHoliday} disabled={!newHoliday} className="glass-btn !px-2 !py-1.5 !text-xs"><Plus size={13} /> Нерабочий день</button>
            </div>
          )}

          <div className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-slate-300/50 p-1.5 dark:border-white/10">
            {holidays.length === 0 ? (
              <p className="py-3 text-center text-[0.65rem] text-slate-400">Праздники не загружены</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {holidays.map((holiday) => (
                  <span key={holiday} className="flex items-center gap-1 rounded-md bg-slate-500/10 px-1.5 py-0.5 text-[0.6rem] text-slate-600 dark:text-slate-300">
                    {new Date(`${holiday}T00:00:00`).toLocaleDateString('ru-RU')}
                    {canManage && (
                      <button type="button" onClick={() => setHolidays((prev) => prev.filter((item) => item !== holiday))} className="text-slate-400 hover:text-rose-500"><Trash2 size={10} /></button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">Закрыть</button>
          {canManage && (
            <button type="button" onClick={save} disabled={saving} className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs">
              {saving ? <Loader2 size={13} className="animate-spin" /> : null} Сохранить
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
