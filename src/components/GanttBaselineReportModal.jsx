import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { BarChart3, Download, X } from 'lucide-react';
import { getTaskSchedule, startOfDay } from '../lib/gantt';

const DAY = 86400000;

function shortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  return Math.round((startOfDay(new Date(a)) - startOfDay(new Date(b))) / DAY);
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function GanttBaselineReportModal({
  isOpen,
  onClose,
  baseline,
  tasks = [],
  baselineTasks = [],
}) {
  const rows = useMemo(() => {
    if (!baseline) return [];
    const saved = new Map(baselineTasks.filter((item) => item.baseline_id === baseline.id).map((item) => [item.task_id, item]));
    return tasks.map((task) => {
      const current = getTaskSchedule(task);
      const base = saved.get(task.id);
      const baselineSchedule = base ? getTaskSchedule({ start_at: base.start_at, due_at: base.due_at, is_milestone: task.is_milestone }) : null;
      const startDeviation = current && baselineSchedule ? daysBetween(current.start, baselineSchedule.start) : null;
      const finishDeviation = current && baselineSchedule ? daysBetween(current.finish, baselineSchedule.finish) : null;
      const planHours = num(base?.effort_hours ?? task.effort_hours);
      const progress = Math.max(0, Math.min(100, num(task.progress_percent)));
      const factHours = task.actual_hours != null ? num(task.actual_hours) : planHours * progress / 100;
      return {
        id: task.id,
        title: task.title || 'Без названия',
        hasBaseline: Boolean(base && baselineSchedule),
        baselineStart: baselineSchedule?.start || null,
        baselineFinish: baselineSchedule?.finish || null,
        currentStart: current?.start || null,
        currentFinish: current?.finish || null,
        startDeviation,
        finishDeviation,
        planHours,
        factHours,
        hoursDeviation: planHours > 0 ? factHours - planHours : null,
      };
    });
  }, [baseline, baselineTasks, tasks]);

  const summary = useMemo(() => {
    const measured = rows.filter((row) => row.hasBaseline);
    const planFinish = measured
      .map((row) => row.baselineFinish)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .reduce((max, value) => Math.max(max, value), 0);
    const currentFinish = measured
      .map((row) => row.currentFinish)
      .filter(Boolean)
      .map((value) => new Date(value).getTime())
      .reduce((max, value) => Math.max(max, value), 0);
    return {
      measured: measured.length,
      shifted: measured.filter((row) => (row.finishDeviation || 0) !== 0).length,
      late: measured.filter((row) => (row.finishDeviation || 0) > 0).length,
      finishShift: planFinish && currentFinish ? Math.round((currentFinish - planFinish) / DAY) : null,
      planHours: rows.reduce((sum, row) => sum + row.planHours, 0),
      factHours: rows.reduce((sum, row) => sum + row.factHours, 0),
    };
  }, [rows]);

  if (!isOpen) return null;

  const exportCsv = () => {
    const header = ['Задача', 'План начало', 'План финиш', 'Текущее начало', 'Текущий финиш', 'Сдвиг старта, дн', 'Сдвиг финиша, дн', 'План, ч', 'Факт, ч', 'Отклонение, ч'];
    const lines = rows.map((row) => [
      row.title,
      shortDate(row.baselineStart),
      shortDate(row.baselineFinish),
      shortDate(row.currentStart),
      shortDate(row.currentFinish),
      row.startDeviation ?? '',
      row.finishDeviation ?? '',
      row.planHours || '',
      Math.round(row.factHours * 10) / 10,
      row.hoursDeviation == null ? '' : Math.round(row.hoursDeviation * 10) / 10,
    ]);
    const csv = [header, ...lines]
      .map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';'))
      .join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `baseline-${baseline?.name || 'report'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return createPortal(
    <div className="modal-overlay !z-[90]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white"><BarChart3 size={18} className="text-indigo-500" /> План / факт по baseline</h2>
            <p className="mt-0.5 text-xs text-slate-500">{baseline?.name || 'Базовый план'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCsv} className="glass-btn !px-2.5 !py-1.5 !text-xs"><Download size={13} /> CSV</button>
            <button type="button" onClick={onClose} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"><X size={18} /></button>
          </div>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-auto p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Сдвиг финиша</p>
              <p className={`text-lg font-bold ${summary.finishShift > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{summary.finishShift == null ? '—' : `${summary.finishShift > 0 ? '+' : ''}${summary.finishShift} дн`}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Задач со сдвигом</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{summary.shifted}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Позже плана</p>
              <p className="text-lg font-bold text-rose-600">{summary.late}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">План / факт, ч</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{Math.round(summary.planHours * 10) / 10} / {Math.round(summary.factHours * 10) / 10}</p>
            </div>
            <div className="rounded-xl border border-white/45 bg-white/40 p-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.6rem] text-slate-500">Задач в отчёте</p>
              <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{summary.measured}</p>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-300/50 dark:border-white/10">
            <table className="w-full min-w-[820px] text-left text-[0.68rem]">
              <thead className="bg-slate-500/5 text-[0.6rem] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Задача</th>
                  <th className="px-2 py-2">План</th>
                  <th className="px-2 py-2">Сейчас</th>
                  <th className="px-2 py-2 text-right">Сдвиг</th>
                  <th className="px-2 py-2 text-right">План, ч</th>
                  <th className="px-2 py-2 text-right">Факт, ч</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-300/40 dark:border-white/10">
                    <td className="max-w-56 truncate px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{row.title}</td>
                    <td className="px-2 py-1.5 text-slate-500">{shortDate(row.baselineFinish)}</td>
                    <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">{shortDate(row.currentFinish)}</td>
                    <td className={`px-2 py-1.5 text-right font-semibold ${row.finishDeviation > 0 ? 'text-rose-600' : row.finishDeviation < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {row.finishDeviation == null ? '—' : `${row.finishDeviation > 0 ? '+' : ''}${row.finishDeviation} дн`}
                    </td>
                    <td className="px-2 py-1.5 text-right text-slate-500">{row.planHours ? Math.round(row.planHours * 10) / 10 : '—'}</td>
                    <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-300">{Math.round(row.factHours * 10) / 10}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && <p className="mt-3 text-center text-xs text-slate-500">Для этого baseline нет сохранённых задач.</p>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
