import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, CalendarDays, CheckCircle2, Layers3, X } from 'lucide-react';
import { supabase } from '../supabaseClient';

function taskPoints(task) {
  const value = Number(task?.story_points);
  return Number.isFinite(value) ? value : 0;
}

function isDone(task, doneColumnId) {
  return Boolean(doneColumnId && task.column_id === doneColumnId);
}

export default function GanttScrumModal({
  isOpen,
  onClose,
  sprints = [],
  tasks = [],
  doneColumnId,
  canManage = false,
  onChanged,
  onOpenSprints,
}) {
  const [movingId, setMovingId] = useState(null);

  const backlog = useMemo(
    () => tasks.filter((task) => !isDone(task, doneColumnId) && !task.sprint_id),
    [tasks, doneColumnId],
  );

  const sprintStats = useMemo(
    () =>
      sprints.map((sprint) => {
        const items = tasks.filter((task) => task.sprint_id === sprint.id);
        const totalSp = items.reduce((sum, task) => sum + taskPoints(task), 0);
        const doneSp = items
          .filter((task) => isDone(task, doneColumnId))
          .reduce((sum, task) => sum + taskPoints(task), 0);
        return { sprint, items, totalSp, doneSp, remainingSp: Math.max(0, totalSp - doneSp) };
      }),
    [sprints, tasks, doneColumnId],
  );

  const completed = sprintStats.filter((item) => item.sprint.status === 'completed');
  const velocitySource = completed.length > 0 ? completed : sprintStats.filter((item) => item.doneSp > 0);
  const velocity = velocitySource.length
    ? Math.round(
        (velocitySource.reduce((sum, item) => sum + item.doneSp, 0) / velocitySource.length) * 10,
      ) / 10
    : 0;
  const active = sprintStats.find((item) => item.sprint.status === 'active') || sprintStats[0] || null;

  if (!isOpen) return null;

  const moveTask = async (task, sprintId) => {
    if (!canManage) return;
    setMovingId(task.id);
    const { error } = await supabase
      .from('tasks')
      .update({ sprint_id: sprintId || null })
      .eq('id', task.id);
    setMovingId(null);
    if (!error) await onChanged?.();
  };

  const sprintColumn = (item) => {
    const { sprint, items, totalSp, doneSp, remainingSp } = item;
    return (
      <div key={sprint.id} className="min-w-[220px] flex-1 rounded-2xl border border-white/45 bg-white/35 p-2.5 dark:border-white/10 dark:bg-white/5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{sprint.name}</p>
            <p className="text-[0.6rem] text-slate-500 dark:text-slate-400">
              {sprint.start_date} — {sprint.end_date}
            </p>
          </div>
          <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] font-semibold ${
            sprint.status === 'active'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
              : sprint.status === 'completed'
                ? 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
          }`}>
            {sprint.status === 'active' ? 'активный' : sprint.status === 'completed' ? 'завершён' : 'план'}
          </span>
        </div>
        {sprint.goal && <p className="mt-1 text-[0.62rem] text-slate-600 dark:text-slate-300">Цель: {sprint.goal}</p>}
        <div className="mt-2 flex items-center gap-2 text-[0.62rem] text-slate-500 dark:text-slate-400">
          <Layers3 size={10} /> {doneSp}/{totalSp} SP
          <span className="ml-auto">{remainingSp} осталось</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-400/20">
          <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totalSp ? (doneSp / totalSp) * 100 : 0}%` }} />
        </div>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
          {items.map((task) => (
            <div key={task.id} className="flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/50 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isDone(task, doneColumnId) ? 'bg-emerald-500' : 'bg-indigo-400'}`} />
              <span className={`min-w-0 flex-1 truncate text-[0.65rem] ${isDone(task, doneColumnId) ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>
                {task.title || 'Без названия'}
              </span>
              <span className="text-[0.58rem] font-semibold text-slate-500">{taskPoints(task)} SP</span>
              {canManage && (
                <select
                  value={task.sprint_id || ''}
                  onChange={(event) => moveTask(task, event.target.value)}
                  disabled={movingId === task.id}
                  className="glass-input !w-16 !px-1 !py-0.5 !text-[0.55rem]"
                  title="Спринт"
                >
                  <option value="">Бэклог</option>
                  {sprints.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
              )}
            </div>
          ))}
          {items.length === 0 && <p className="px-1 py-3 text-center text-[0.62rem] text-slate-400">Пусто</p>}
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="modal-overlay !z-[90]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between border-b border-slate-300/50 px-5 py-3.5 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <BarChart3 size={18} className="text-emerald-500" /> Scrum-доска
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Бэклог, спринты, скорость и остаток работы.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onOpenSprints} className="glass-btn !px-2.5 !py-1.5 !text-xs">
              <CalendarDays size={14} /> Спринты
            </button>
            <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-300/50 px-5 py-3 sm:grid-cols-4 dark:border-white/10">
          <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
            <p className="text-[0.6rem] text-slate-500">Бэклог</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{backlog.length} задач</p>
            <p className="text-[0.6rem] text-slate-500">{backlog.reduce((sum, task) => sum + taskPoints(task), 0)} SP</p>
          </div>
          <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
            <p className="text-[0.6rem] text-slate-500">Скорость</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{velocity} SP</p>
            <p className="text-[0.6rem] text-slate-500">в среднем за спринт</p>
          </div>
          <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
            <p className="text-[0.6rem] text-slate-500">Активный спринт</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{active?.sprint?.name || '—'}</p>
            <p className="text-[0.6rem] text-slate-500">{active ? `${active.remainingSp} SP осталось` : 'нет активного'}</p>
          </div>
          <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
            <p className="text-[0.6rem] text-slate-500">Готово</p>
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">
              {sprintStats.reduce((sum, item) => sum + item.doneSp, 0)} SP
            </p>
            <p className="text-[0.6rem] text-slate-500">по всем спринтам</p>
          </div>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-auto px-5 py-4">
          <div className="flex min-w-[760px] gap-2">
            <div className="min-w-[220px] flex-1 rounded-2xl border border-amber-400/30 bg-amber-400/[0.06] p-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Бэклог</p>
                  <p className="text-[0.6rem] text-slate-500">задачи без спринта</p>
                </div>
                <span className="text-[0.62rem] font-semibold text-amber-700 dark:text-amber-300">
                  {backlog.reduce((sum, task) => sum + taskPoints(task), 0)} SP
                </span>
              </div>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {backlog.map((task) => (
                  <div key={task.id} className="flex items-center gap-1.5 rounded-lg border border-white/40 bg-white/50 px-2 py-1.5 dark:border-white/10 dark:bg-white/5">
                    <span className="min-w-0 flex-1 truncate text-[0.65rem] text-slate-700 dark:text-slate-200">{task.title}</span>
                    <span className="text-[0.58rem] font-semibold text-slate-500">{taskPoints(task)} SP</span>
                    {canManage && (
                      <select
                        value=""
                        onChange={(event) => moveTask(task, event.target.value)}
                        disabled={movingId === task.id}
                        className="glass-input !w-16 !px-1 !py-0.5 !text-[0.55rem]"
                        title="В спринт"
                      >
                        <option value="">В спринт</option>
                        {sprints.filter((sprint) => sprint.status !== 'completed').map((sprint) => (
                          <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
                {backlog.length === 0 && <p className="px-1 py-4 text-center text-[0.62rem] text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={13} className="mr-1 inline" /> Бэклог пуст</p>}
              </div>
            </div>
            {sprintStats.map(sprintColumn)}
            {sprintStats.length === 0 && (
              <div className="flex min-w-[260px] flex-1 items-center justify-center rounded-2xl border border-dashed border-slate-300/70 text-xs text-slate-500 dark:border-white/15">
                Спринтов пока нет — создайте их в окне «Спринты».
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
