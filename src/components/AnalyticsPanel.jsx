import { useMemo, useState } from 'react';
import {
  AlarmClock,
  BarChart3,
  CheckCircle2,
  Clock3,
  ListChecks,
  SlidersHorizontal,
  TrendingUp,
  Users,
} from 'lucide-react';
import Avatar from './Avatar';
import AnalyticsFiltersModal from './AnalyticsFiltersModal';
import { computeAnalytics, defaultAnalyticsFilters } from '../lib/analytics';
import { PRIORITIES } from '../lib/priority';

const CHART_COLORS = {
  done: '#10b981',
  late: '#f59e0b',
};

function formatRange(fromKey, toKey) {
  const format = (key) => {
    const date = new Date(`${key}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? key
      : date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  return `${format(fromKey)} — ${format(toKey)}`;
}

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function KpiCard({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className="glass-card rounded-2xl p-3">
      <p className="flex items-center gap-1.5 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
        <Icon size={12} className={tone} /> {label}
      </p>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
      <p className="mt-0.5 truncate text-[0.62rem] text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  );
}

function EmptyChart({ text }) {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center rounded-xl border border-dashed border-slate-300/70 px-3 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
      {text}
    </div>
  );
}

export default function AnalyticsPanel({ tasks = [], archivedTasks = [], columns = [], members = [] }) {
  const [filters, setFilters] = useState(defaultAnalyticsFilters);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const analytics = useMemo(
    () => computeAnalytics({ tasks, archivedTasks, columns, members, filters }),
    [tasks, archivedTasks, columns, members, filters],
  );

  const employeeName =
    filters.employeeId === 'all'
      ? 'Все сотрудники'
      : members.find((member) => member.id === filters.employeeId)?.full_name || 'Сотрудник';

  const statusItems = [
    {
      key: 'done',
      label: 'Выполнено',
      count: analytics.completed,
      color: 'bg-emerald-500',
      dot: 'bg-emerald-500',
      text: 'text-emerald-700 dark:text-emerald-300',
    },
    {
      key: 'progress',
      label: 'В работе',
      count: analytics.inProgress,
      color: 'bg-amber-400',
      dot: 'bg-amber-400',
      text: 'text-amber-700 dark:text-amber-300',
    },
    {
      key: 'todo',
      label: 'К выполнению',
      count: analytics.todo,
      color: 'bg-indigo-500',
      dot: 'bg-indigo-500',
      text: 'text-indigo-700 dark:text-indigo-300',
    },
  ];

  const donutBackground = analytics.scored
    ? `conic-gradient(${CHART_COLORS.done} 0 ${analytics.onTimePct}%, ${CHART_COLORS.late} ${analytics.onTimePct}% 100%)`
    : 'conic-gradient(#cbd5e1 0 100%)';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-300/50 px-6 py-3 dark:border-white/10">
        <div>
          <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
            <BarChart3 size={12} /> Аналитика задач
          </p>
          <p className="mt-0.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
            {formatRange(filters.from, filters.to)} · {employeeName} · по сроку задачи
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsFilterOpen(true)}
          className="glass-btn !px-2.5 !py-1.5 !text-xs"
        >
          <SlidersHorizontal size={14} /> Настроить
        </button>
      </div>

      <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <KpiCard
            icon={ListChecks}
            label="Всего задач"
            value={analytics.total}
            hint="со сроком в периоде"
            tone="text-indigo-500"
          />
          <KpiCard
            icon={CheckCircle2}
            label="Выполнено"
            value={analytics.completed}
            hint={`${analytics.completionPct}% от всех`}
            tone="text-emerald-500"
          />
          <KpiCard
            icon={Clock3}
            label="В работе"
            value={analytics.inProgress}
            hint="активные сейчас"
            tone="text-amber-500"
          />
          <KpiCard
            icon={AlarmClock}
            label="Просрочено"
            value={analytics.overdue}
            hint={`${analytics.overduePct}% от всех`}
            tone="text-rose-500"
          />
          <KpiCard
            icon={TrendingUp}
            label="В срок"
            value={analytics.onTimePct === null ? '—' : `${analytics.onTimePct}%`}
            hint={
              analytics.scored
                ? `${analytics.onTime} из ${analytics.scored} с оценкой`
                : 'нет завершённых с датой'
            }
            tone="text-sky-500"
          />
        </div>

        {analytics.total === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-300/80 px-4 py-10 text-center dark:border-white/15">
            <BarChart3 size={28} className="mx-auto mb-2 text-slate-400 opacity-60" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              За выбранный период задач нет
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Измените период или сотрудника в настройках аналитики.
            </p>
            <button
              type="button"
              onClick={() => setIsFilterOpen(true)}
              className="glass-btn glass-btn-primary mt-3 !px-3 !py-1.5 !text-xs"
            >
              <SlidersHorizontal size={13} /> Настроить период
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <section className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Структура задач</h4>
                  <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">{analytics.total} всего</span>
                </div>

                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  {statusItems.map((item) => (
                    <span
                      key={item.key}
                      className={item.color}
                      style={{ width: `${pct(item.count, analytics.total)}%` }}
                      title={`${item.label}: ${item.count}`}
                    />
                  ))}
                </div>

                <div className="mt-3 space-y-2">
                  {statusItems.map((item) => (
                    <div key={item.key} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                        <span className={`h-2 w-2 rounded-full ${item.dot}`} /> {item.label}
                      </span>
                      <span className="font-semibold text-slate-800 dark:text-slate-100">
                        {item.count}
                        <span className="ml-1 font-normal text-slate-500 dark:text-slate-400">
                          · {pct(item.count, analytics.total)}%
                        </span>
                      </span>
                    </div>
                  ))}
                </div>

                {analytics.overdue > 0 && (
                  <p className="mt-3 rounded-xl border border-rose-400/35 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                    <AlarmClock size={11} className="mr-1 inline" />
                    Просрочено: {analytics.overdue} — это {analytics.overduePct}% задач периода.
                  </p>
                )}
              </section>

              <section className="glass-card rounded-2xl p-4">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Выполнение в срок</h4>
                  <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                    {analytics.scored} с оценкой
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-4">
                  <div
                    className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full"
                    style={{ background: donutBackground }}
                  >
                    <div className="absolute inset-[9px] flex flex-col items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95">
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {analytics.onTimePct === null ? '—' : `${analytics.onTimePct}%`}
                      </span>
                      <span className="text-[0.55rem] text-slate-500 dark:text-slate-400">в срок</span>
                    </div>
                  </div>

                  <div className="min-w-0 space-y-2 text-xs">
                    <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      В срок: <b>{analytics.onTime}</b>
                    </p>
                    <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400" />
                      С опозданием: <b>{analytics.late}</b>
                    </p>
                    <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Считается по задачам, у которых есть дата завершения.
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <section className="mt-3 glass-card rounded-2xl p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">По приоритетам</h4>
                <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {analytics.overdue > 0 ? `просрочено: ${analytics.overdue}` : 'все задачи периода'}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {PRIORITIES.map((priority) => {
                  const count = analytics.byPriority.find((item) => item.priority === priority.value)?.count || 0;
                  return (
                    <div key={priority.key} className="rounded-xl border border-slate-300/50 px-2.5 py-2 dark:border-white/10">
                      <div className="flex items-center justify-between gap-1 text-[0.68rem]">
                        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                          <span className={`h-1.5 w-1.5 rounded-full ${priority.dot}`} /> {priority.short}
                        </span>
                        <b className="text-slate-800 dark:text-slate-100">{count}</b>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                        <div
                          className={`h-full rounded-full bg-gradient-to-r ${priority.bar}`}
                          style={{ width: `${pct(count, analytics.total)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="mt-3 glass-card overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between gap-2 border-b border-slate-300/50 px-4 py-3 dark:border-white/10">
                <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                  <Users size={14} /> По сотрудникам
                </h4>
                <span className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {employeeName}
                </span>
              </div>

              {analytics.byEmployee.length === 0 ? (
                <EmptyChart text="Нет задач с исполнителями за этот период" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-xs">
                    <thead className="bg-white/45 text-[0.62rem] tracking-wide text-slate-500 uppercase dark:bg-white/5 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Сотрудник</th>
                        <th className="px-2 py-2 text-right font-semibold">Всего</th>
                        <th className="px-2 py-2 text-right font-semibold">В работе</th>
                        <th className="px-2 py-2 text-right font-semibold">Выполнено</th>
                        <th className="px-2 py-2 text-right font-semibold">Просрочено</th>
                        <th className="px-4 py-2 text-right font-semibold">В срок</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.byEmployee.map((employee) => {
                        const rate = employee.onTimePct;
                        const rateClass =
                          rate === null
                            ? 'text-slate-400'
                            : rate >= 80
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : rate >= 50
                                ? 'text-amber-600 dark:text-amber-300'
                                : 'text-rose-600 dark:text-rose-300';
                        return (
                          <tr
                            key={employee.id}
                            className="border-t border-slate-300/40 dark:border-white/10"
                          >
                            <td className="px-4 py-2">
                              <span className="flex items-center gap-2">
                                <Avatar
                                  name={employee.name}
                                  color={employee.color}
                                  src={employee.avatar_url}
                                  className="h-6 w-6 text-[0.5rem]"
                                />
                                <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                                  {employee.name}
                                </span>
                              </span>
                            </td>
                            <td className="px-2 py-2 text-right text-slate-600 dark:text-slate-300">{employee.total}</td>
                            <td className="px-2 py-2 text-right text-amber-600 dark:text-amber-300">{employee.inProgress}</td>
                            <td className="px-2 py-2 text-right text-emerald-600 dark:text-emerald-300">{employee.completed}</td>
                            <td className={`px-2 py-2 text-right ${employee.overdue ? 'font-semibold text-rose-600 dark:text-rose-300' : 'text-slate-400'}`}>
                              {employee.overdue}
                            </td>
                            <td className={`px-4 py-2 text-right font-semibold ${rateClass}`}>
                              {rate === null ? '—' : `${rate}%`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
          <span>Период по сроку задачи</span>
          <span>· личные задачи не учитываются</span>
          {analytics.noDue > 0 && <span>· без срока: {analytics.noDue} (вне периода)</span>}
        </div>
      </div>

      {isFilterOpen && (
        <AnalyticsFiltersModal
          isOpen
          onClose={() => setIsFilterOpen(false)}
          filters={filters}
          onApply={(next) => setFilters(next)}
          members={members}
        />
      )}
    </div>
  );
}
