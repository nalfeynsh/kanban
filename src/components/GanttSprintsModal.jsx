import { useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Loader2, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

function toDateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function GanttSprintsModal({
  isOpen,
  onClose,
  projectId,
  sprints = [],
  canManage = false,
  onChanged,
}) {
  const [form, setForm] = useState({ name: '', start_date: '', end_date: '', goal: '', capacity_hours: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const reload = async () => {
    await onChanged?.();
  };

  const createSprint = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.name.trim() || !form.start_date || !form.end_date) {
      setError('Заполните название и даты спринта.');
      return;
    }
    if (form.end_date < form.start_date) {
      setError('Дата окончания не может быть раньше начала.');
      return;
    }
    setSaving(true);
    const { error: insertError } = await supabase.from('gantt_sprints').insert({
      project_id: projectId,
      name: form.name.trim(),
      start_date: form.start_date,
      end_date: form.end_date,
      goal: form.goal.trim() || null,
      capacity_hours: Number(form.capacity_hours) || 0,
      status: 'planned',
    });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setForm({ name: '', start_date: '', end_date: '', goal: '', capacity_hours: '' });
    await reload();
  };

  const updateStatus = async (sprint, status) => {
    const { error: updateError } = await supabase
      .from('gantt_sprints')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', sprint.id);
    if (updateError) setError(updateError.message);
    else await reload();
  };

  const removeSprint = async (sprint) => {
    if (!window.confirm(`Удалить спринт «${sprint.name}»? Задачи останутся без спринта.`)) return;
    const { error: deleteError } = await supabase.from('gantt_sprints').delete().eq('id', sprint.id);
    if (deleteError) setError(deleteError.message);
    else await reload();
  };

  return createPortal(
    <div
      className="modal-overlay !z-[90]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <CalendarDays size={18} className="text-indigo-500" /> Спринты
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Agile / Scrum: распределите задачи по итерациям.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {canManage && (
            <form onSubmit={createSprint} className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.05] p-3">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Новый спринт</p>
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className="glass-input mt-2"
                placeholder="Например, Спринт 1"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, start_date: event.target.value }))}
                  className="glass-input !py-1.5 !text-xs"
                />
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(event) => setForm((prev) => ({ ...prev, end_date: event.target.value }))}
                  className="glass-input !py-1.5 !text-xs"
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <input
                  value={form.goal}
                  onChange={(event) => setForm((prev) => ({ ...prev, goal: event.target.value }))}
                  className="glass-input !py-1.5 !text-xs"
                  placeholder="Цель спринта (необязательно)"
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.capacity_hours}
                  onChange={(event) => setForm((prev) => ({ ...prev, capacity_hours: event.target.value }))}
                  className="glass-input !py-1.5 !text-xs"
                  placeholder="Ёмкость, ч"
                />
              </div>
              <button type="submit" disabled={saving} className="glass-btn glass-btn-primary mt-2 !px-3 !py-1.5 !text-xs">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Добавить спринт
              </button>
            </form>
          )}

          <div className="mt-3 space-y-2">
            {sprints.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/15">
                Спринтов пока нет.
              </p>
            ) : (
              sprints.map((sprint) => (
                <div key={sprint.id} className="flex items-center gap-2 rounded-2xl border border-white/45 bg-white/40 p-3 dark:border-white/10 dark:bg-white/5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{sprint.name}</p>
                    <p className="text-[0.62rem] text-slate-500 dark:text-slate-400">
                      {toDateInput(sprint.start_date)} — {toDateInput(sprint.end_date)}
                      {sprint.capacity_hours ? ` · ${sprint.capacity_hours} ч` : ''}
                    </p>
                    {sprint.goal && <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">{sprint.goal}</p>}
                  </div>
                  <select
                    value={sprint.status}
                    onChange={(event) => updateStatus(sprint, event.target.value)}
                    disabled={!canManage}
                    className="glass-input !w-auto !py-1 !text-[0.65rem]"
                  >
                    <option value="planned">Запланирован</option>
                    <option value="active">Активный</option>
                    <option value="completed">Завершён</option>
                  </select>
                  {canManage && (
                    <button type="button" onClick={() => removeSprint(sprint)} className="text-slate-400 hover:text-rose-500" title="Удалить спринт">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
