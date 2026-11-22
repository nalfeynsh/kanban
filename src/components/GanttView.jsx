import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarClock,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileCode2,
  Printer,
  UserRound,
  ZoomIn,
  Clock,
  AlertTriangle,
  Check,
  Flag,
  GitBranch,
  Layers3,
  ListChecks,
  Users,
  Diamond,
  Save,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  GANTT_SCALES,
  addDays,
  barGeometry,
  buildGanttRows,
  buildHeader,
  buildWeekends,
  computeRange,
  formatDayMonth,
  formatRange,
  shiftSchedule,
  startOfDay,
  daysBetween,
  durationDays,
  getTaskSchedule,
} from '../lib/gantt';
import { buildResourceLoad, computeCriticalPath, sprintLabel, taskProgress, taskStoryPoints } from '../lib/ganttAdvanced';
import { getPriority } from '../lib/priority';
import Avatar from './Avatar';
import { formatDueLong } from '../lib/format';
import {
  buildCsv,
  buildMsProjectXml,
  buildScheduleRows,
  describePeriod,
  downloadTextFile,
  scheduleFileName,
} from '../lib/export';

const ROW_HEIGHT = 46;

const BAR_STYLES = {
  3: 'from-rose-500 via-rose-500 to-orange-400',
  2: 'from-amber-400 via-amber-400 to-yellow-300',
  1: 'from-emerald-400 via-emerald-400 to-teal-300',
  0: 'from-indigo-500 via-violet-500 to-sky-400',
};

const BASE_COLUMNS = [
  { key: 'number', title: '№', width: 50 },
  { key: 'title', title: 'Задача', width: 232 },
  { key: 'assignee', title: 'Исполнитель', width: 122 },
  { key: 'start', title: 'Начало', width: 90 },
  { key: 'finish', title: 'Срок', width: 90 },
  { key: 'days', title: 'Дней', width: 48, align: 'center' },
  { key: 'progress', title: '%', width: 44, align: 'center' },
];

export default function GanttView({
  tasks = [],
  columns = [],
  authorById,
  numberById,
  onTaskClick,
  onScheduleChange,
  canEditSchedule = false,
  project = null,
  sprints = [],
  dependencies = [],
  baselines = [],
  baselineTasks = [],
  activeBaselineId = null,
  onSelectBaseline,
  doneColumnId = null,
  canManageProject = false,
  onProjectSettingsChange,
  onSaveBaseline,
  onDeleteBaseline,
  onSprintsClick,
  onScrumClick,
}) {
  const [scaleKey, setScaleKey] = useState('week');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [showResources, setShowResources] = useState(false);
  const [showCritical, setShowCritical] = useState(false);
  const [showBaseline, setShowBaseline] = useState(true);
  const [sprintFilter, setSprintFilter] = useState('all');
  const scrollRef = useRef(null);
  const movedRef = useRef(false);

  const scale = GANTT_SCALES[scaleKey];
  const storyPointsEnabled = project?.story_points_enabled === true;
  const isAgile = project?.methodology === 'agile';

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const filteredTasks = useMemo(() => {
    if (!isAgile || sprintFilter === 'all') return tasks;
    if (sprintFilter === 'none') return tasks.filter((task) => !task.sprint_id);
    return tasks.filter((task) => task.sprint_id === sprintFilter);
  }, [tasks, isAgile, sprintFilter]);

  const rows = useMemo(() => buildGanttRows(filteredTasks), [filteredTasks]);
  const range = useMemo(() => {
    const base = computeRange(rows);
    const neededDays = Math.ceil((viewportWidth - 500) / scale.px);
    if (!Number.isFinite(neededDays) || neededDays <= base.days) return base;
    const days = Math.min(730, neededDays);
    return { from: base.from, to: addDays(base.from, days - 1), days };
  }, [rows, viewportWidth, scale.px]);
  const header = useMemo(() => buildHeader(range, scaleKey), [range, scaleKey]);
  const weekends = useMemo(() => buildWeekends(range, scale.px), [range, scale.px]);
  const totalWidth = range.days * scale.px;
  const todayOffset = daysBetween(range.from, startOfDay(new Date()));
  const todayVisible = todayOffset >= 0 && todayOffset < range.days;

  const leftColumns = useMemo(
    () => [
      ...BASE_COLUMNS,
      ...(storyPointsEnabled ? [{ key: 'sp', title: 'SP', width: 44, align: 'center' }] : []),
      ...(isAgile ? [{ key: 'sprint', title: 'Спринт', width: 100 }] : []),
    ],
    [storyPointsEnabled, isAgile],
  );
  const leftWidth = leftColumns.reduce((sum, column) => sum + column.width, 0);

  const critical = useMemo(
    () => computeCriticalPath(filteredTasks, dependencies),
    [filteredTasks, dependencies],
  );
  const criticalEnabled = showCritical && critical.criticalIds.size > 0;
  const resourceLoad = useMemo(
    () =>
      buildResourceLoad(filteredTasks, {
        storyPointsEnabled,
        dailyHours: Number(project?.daily_hours) || 8,
      }),
    [filteredTasks, storyPointsEnabled, project?.daily_hours],
  );

  const activeBaseline = useMemo(
    () => baselines.find((baseline) => baseline.id === activeBaselineId) || null,
    [baselines, activeBaselineId],
  );
  const baselineByTask = useMemo(() => {
    const map = new Map();
    baselineTasks
      .filter((item) => item.baseline_id === activeBaselineId)
      .forEach((item) => map.set(item.task_id, item));
    return map;
  }, [baselineTasks, activeBaselineId]);

  const scheduleRows = useMemo(
    () => buildScheduleRows({ tasks: filteredTasks, columns, authorById, numberById }),
    [filteredTasks, columns, authorById, numberById],
  );

  const exportCsv = () => {
    const csv = buildCsv(scheduleRows, { name: 'План задач', period: describePeriod(scheduleRows) });
    downloadTextFile(scheduleFileName('csv'), csv, 'text/csv');
    setIsExportOpen(false);
  };

  const exportXml = () => {
    const xml = buildMsProjectXml(scheduleRows, { name: 'Мой Канбан — план задач' });
    downloadTextFile(scheduleFileName('xml'), xml, 'application/xml');
    setIsExportOpen(false);
  };

  const exportPdf = () => {
    setIsExportOpen(false);
    setTimeout(() => window.print(), 120);
  };

  const scrollToToday = () => {
    if (!scrollRef.current) return;
    const left = Math.max(0, (todayOffset - 3) * scale.px);
    scrollRef.current.scrollTo({ left, behavior: 'smooth' });
  };

  const handlePointerDown = (event, row, mode) => {
    if (!canEditSchedule || row.task.is_milestone) return;
    event.preventDefault();
    event.stopPropagation();
    movedRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({ id: row.task.id, mode, startX: event.clientX, delta: 0 });
  };

  const handlePointerMove = (event) => {
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.startX) / scale.px);
    if (delta !== drag.delta) {
      movedRef.current = true;
      setDrag((prev) => (prev ? { ...prev, delta } : prev));
    }
  };

  const handlePointerUp = () => {
    if (!drag) return;
    const row = rows.find((item) => item.task.id === drag.id);
    if (row && drag.delta !== 0) {
      const next = shiftSchedule(row.schedule, drag.delta, drag.mode);
      onScheduleChange?.(drag.id, next);
    }
    setDrag(null);
  };

  const updateSetting = (patch) => {
    if (!canManageProject) return;
    onProjectSettingsChange?.(patch);
  };

  const saveBaseline = () => {
    const name = window.prompt(
      'Название базового плана',
      `Базовый план ${baselines.length + 1}`,
    );
    if (name == null) return;
    onSaveBaseline?.(name.trim() || `Базовый план ${baselines.length + 1}`);
  };

  const baselineVisible = showBaseline && Boolean(activeBaseline);

  return (
    <div className="gantt-shell flex max-h-[calc(100vh-150px)] min-h-[360px] flex-col overflow-hidden rounded-3xl">
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-300/50 px-4 py-2.5 dark:border-white/10">
        <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">
          <BarChart3 size={17} className="text-indigo-500 dark:text-indigo-300" />
          Диаграмма Ганта
        </h2>
        <span className="glass-chip hidden sm:inline-flex">
          {formatRange(range.from, addDays(range.from, range.days - 1))}
        </span>
        <span className="glass-chip hidden md:inline-flex">
          <Clock size={10} /> {rows.length} задач
        </span>
        {storyPointsEnabled && (
          <span className="glass-chip hidden md:inline-flex" title="Сумма story points в выборке">
            <Layers3 size={10} /> {filteredTasks.reduce((sum, task) => sum + taskStoryPoints(task), 0)} SP
          </span>
        )}

        <div className="glass-segment">
          {Object.values(GANTT_SCALES).map((item) => (
            <button
              key={item.key}
              type="button"
              className="glass-segment-btn"
              data-active={scaleKey === item.key}
              onClick={() => setScaleKey(item.key)}
              title={`Масштаб: ${item.label}`}
            >
              <ZoomIn size={13} />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={scrollToToday} className="glass-btn !px-2.5 !py-1.5 !text-xs">
          <CalendarClock size={14} /> Сегодня
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsExportOpen((prev) => !prev)}
            className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-xs"
            title="Выгрузить план в файл"
          >
            <Download size={14} /> Экспорт
            <ChevronDown size={13} className={`transition ${isExportOpen ? 'rotate-180' : ''}`} />
          </button>
          {isExportOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsExportOpen(false)} aria-hidden="true" />
              <div className="glass-panel absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl p-1.5">
                <p className="px-2.5 py-1 text-[0.62rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  Выгрузка плана
                </p>
                <button type="button" onClick={exportXml} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10">
                  <FileCode2 size={16} className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">MS Project (.xml)</span>
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">MSPDI — открывается в MS Project</span>
                  </span>
                </button>
                <button type="button" onClick={exportCsv} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10">
                  <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Excel / CSV</span>
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">Даты, длительность и исполнители</span>
                  </span>
                </button>
                <button type="button" onClick={exportPdf} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10">
                  <Printer size={16} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">PDF (печать)</span>
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">Диалог печати → «Сохранить как PDF»</span>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select
            value={project?.methodology || 'waterfall'}
            onChange={(event) => updateSetting({ methodology: event.target.value })}
            disabled={!canManageProject}
            className="glass-input !w-auto !py-1.5 !text-xs"
            title="Методология проекта"
          >
            <option value="waterfall">Waterfall</option>
            <option value="agile">Agile / Scrum</option>
          </select>
          <button
            type="button"
            onClick={() => updateSetting({ story_points_enabled: !storyPointsEnabled })}
            disabled={!canManageProject}
            className={`glass-btn !px-2 !py-1.5 !text-[0.68rem] ${storyPointsEnabled ? 'glow-indigo' : ''}`}
            title="Включить story points"
          >
            <Layers3 size={13} /> SP
          </button>
          <button
            type="button"
            onClick={() => setShowResources((value) => !value)}
            className={`glass-btn !px-2 !py-1.5 !text-[0.68rem] ${showResources ? 'glow-indigo' : ''}`}
            title="Загрузка ресурсов"
          >
            <Users size={13} /> Ресурсы
          </button>
          <button
            type="button"
            onClick={() => setShowCritical((value) => !value)}
            className={`glass-btn !px-2 !py-1.5 !text-[0.68rem] ${showCritical ? 'glow-indigo' : ''}`}
            title="Критический путь"
          >
            <GitBranch size={13} /> Критический путь
          </button>
          {canManageProject && (
            <button
              type="button"
              onClick={saveBaseline}
              className="glass-btn !px-2 !py-1.5 !text-[0.68rem]"
              title="Зафиксировать базовый план"
            >
              <Save size={13} /> Базовый план
            </button>
          )}
          {baselines.length > 0 && (
            <select
              value={activeBaselineId || ''}
              onChange={(event) => onSelectBaseline?.(event.target.value || null)}
              className="glass-input !w-auto !py-1.5 !text-[0.65rem]"
              title="Выбрать базовый план"
            >
              <option value="">Без плана</option>
              {baselines.map((baseline) => (
                <option key={baseline.id} value={baseline.id}>
                  {baseline.name}
                </option>
              ))}
            </select>
          )}
          {activeBaseline && (
            <button
              type="button"
              onClick={() => setShowBaseline((value) => !value)}
              className={`glass-btn !px-2 !py-1.5 !text-[0.68rem] ${showBaseline ? 'glow-indigo' : ''}`}
              title="Показать/скрыть базовый план"
            >
              <RotateCcw size={13} /> План
            </button>
          )}
          {activeBaseline && canManageProject && (
            <button
              type="button"
              onClick={() => onDeleteBaseline?.(activeBaseline.id)}
              className="glass-btn !px-2 !py-1.5 !text-[0.68rem]"
              title="Удалить выбранный базовый план"
            >
              <X size={13} />
            </button>
          )}
          {isAgile && (
            <button
              type="button"
              onClick={onSprintsClick}
              className="glass-btn !px-2 !py-1.5 !text-[0.68rem]"
              title="Спринты"
            >
              <ListChecks size={13} /> Спринты
            </button>
          )}
          {isAgile && (
            <button
              type="button"
              onClick={onScrumClick}
              className="glass-btn !px-2 !py-1.5 !text-[0.68rem]"
              title="Scrum-доска: бэклог и скорость"
            >
              <BarChart3 size={13} /> Scrum
            </button>
          )}
        </div>
      </div>

      {showResources && (
        <div className="no-print border-b border-slate-300/50 bg-white/35 px-4 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-1.5 flex items-center gap-2 text-[0.65rem] font-semibold text-slate-600 dark:text-slate-300">
            <Users size={12} /> Загрузка исполнителей
            <span className="font-normal text-slate-400">норма:</span>
            <select
              value={Number(project?.daily_hours) || 8}
              onChange={(event) => updateSetting({ daily_hours: Number(event.target.value) })}
              disabled={!canManageProject}
              className="glass-input !w-auto !py-0.5 !text-[0.62rem]"
              title="Рабочих часов в день"
            >
              {[6, 7, 8, 9, 10, 12].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <span className="font-normal text-slate-400">ч/день</span>
          </div>
          {resourceLoad.length === 0 ? (
            <p className="text-[0.65rem] text-slate-500">Нет задач с исполнителями.</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {resourceLoad.map((item) => {
                const manager = authorById?.get(item.id);
                return (
                  <div
                    key={item.id}
                    className={`min-w-[170px] rounded-xl border px-2.5 py-1.5 ${
                      item.overloadDays > 0
                        ? 'border-rose-400/50 bg-rose-500/10'
                        : 'border-white/45 bg-white/40 dark:border-white/10 dark:bg-white/5'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Avatar
                        name={manager?.full_name}
                        color={manager?.color}
                        src={manager?.avatar_url}
                        className="h-5 w-5 text-[0.5rem]"
                      />
                      <span className="truncate text-[0.68rem] font-semibold text-slate-800 dark:text-slate-100">
                        {manager?.full_name || 'Сотрудник'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
                      {item.tasks.length} задач · max {Math.round(item.maxHours * 10) / 10} ч
                      {storyPointsEnabled ? ` · ${item.storyPoints} SP` : ''}
                    </p>
                    {item.overloadDays > 0 && (
                      <p className="text-[0.58rem] font-medium text-rose-600 dark:text-rose-300">
                        перегрузка: {item.overloadDays} дн.
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showCritical && critical.criticalIds.size === 0 && (
        <div className="no-print border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-[0.68rem] text-amber-800 dark:text-amber-200">
          <AlertTriangle size={11} className="mr-1 inline" />
          Критический путь не построен: добавьте зависимости «задача зависит от» в карточке задачи.
        </div>
      )}

      {isAgile && (
        <div className="no-print border-b border-slate-300/50 px-4 py-1.5 dark:border-white/10">
          <select
            value={sprintFilter}
            onChange={(event) => setSprintFilter(event.target.value)}
            className="glass-input !w-auto !py-1 !text-[0.65rem]"
          >
            <option value="all">Все спринты</option>
            <option value="none">Без спринта</option>
            {sprints.map((sprint) => (
              <option key={sprint.id} value={sprint.id}>
                {sprint.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {!canEditSchedule && rows.length > 0 && (
        <div className="no-print border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-[0.68rem] text-amber-800 dark:text-amber-200">
          Перетаскивание полос станет доступно после миграции БД (колонка <code>tasks.start_at</code>).
        </div>
      )}

      <div ref={scrollRef} className="gantt-scroll scrollbar-slim flex-1 overflow-auto">
        <div className="relative" style={{ width: leftWidth + totalWidth, minWidth: '100%' }}>
          <div
            className="pointer-events-none absolute top-0 bottom-0"
            style={{
              left: leftWidth,
              width: totalWidth,
              backgroundImage: `repeating-linear-gradient(to right, rgba(148,163,184,0.11) 0 1px, transparent 1px ${scale.px}px)`,
            }}
          >
            {weekends.map((weekend, index) => (
              <div
                key={`w-${index}`}
                className="absolute inset-y-0 bg-slate-500/[0.07] dark:bg-white/[0.04]"
                style={{ left: weekend.left, width: weekend.width }}
              />
            ))}
            {todayVisible && (
              <div className="absolute inset-y-0 w-[2px] bg-rose-500/70" style={{ left: todayOffset * scale.px }} />
            )}
          </div>

          <div className="gantt-head sticky top-0 z-30 flex border-b border-white/45 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end gap-0 border-r border-white/45 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85"
              style={{ width: leftWidth }}
            >
              {leftColumns.map((column) => (
                <div
                  key={column.key}
                  className={`truncate px-2 py-2 text-[0.62rem] font-semibold tracking-[0.08em] text-slate-500 uppercase dark:text-slate-400 ${
                    column.align === 'center' ? 'text-center' : ''
                  }`}
                  style={{ width: column.width }}
                >
                  {column.title}
                </div>
              ))}
            </div>

            <div style={{ width: totalWidth }}>
              <div className="flex h-7">
                {header.months.map((month) => (
                  <div
                    key={`${month.label}-${month.index}`}
                    className="flex shrink-0 items-center border-r border-slate-300/50 px-2 text-[0.68rem] font-semibold tracking-wide text-slate-600 dark:border-white/10 dark:text-slate-300"
                    style={{ width: month.width }}
                  >
                    <span className="truncate">{month.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative h-6 border-t border-slate-300/50 dark:border-white/10">
                {header.ticks.map((tick) => (
                  <span
                    key={tick.index}
                    className={`absolute top-1/2 -translate-y-1/2 pl-1 text-[0.6rem] tabular-nums ${
                      tick.isToday ? 'font-bold text-rose-600 dark:text-rose-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                    style={{ left: tick.index * scale.px }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <BarChart3 size={30} className="text-indigo-400/60" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Пока нечего планировать</p>
              <p className="max-w-sm text-xs text-slate-500 dark:text-slate-400">
                Добавьте задачам срок — и они появятся на диаграмме. Задача без срока строится от даты создания.
              </p>
            </div>
          )}

          {rows.map((row) => {
            const task = row.task;
            const isDragging = drag?.id === task.id;
            const schedule = isDragging ? shiftSchedule(row.schedule, drag.delta, drag.mode) : row.schedule;
            const preview = {
              ...row,
              schedule,
              startDay: startOfDay(schedule.start),
              finishDay: startOfDay(schedule.finish),
            };
            const geometry = barGeometry(preview, range, scale.px);
            const days = durationDays(schedule);
            const priority = getPriority(task.priority);
            const author = authorById?.get(task.created_by);
            const assignee = task.assignee_id ? authorById?.get(task.assignee_id) : null;
            const isHovered = hoveredId === task.id;
            const canShowLabel = geometry.width > 54;
            const progress = taskProgress(task, doneColumnId);
            const isCritical = criticalEnabled && critical.criticalIds.has(task.id);
            const dimmed = criticalEnabled && !isCritical;
            const baselineItem = baselineByTask.get(task.id);
            const baselineSchedule =
              baselineVisible && (baselineItem?.start_at || baselineItem?.due_at)
                ? getTaskSchedule({
                    start_at: baselineItem.start_at,
                    due_at: baselineItem.due_at,
                    is_milestone: task.is_milestone,
                  })
                : null;
            const baselineGeometry = baselineSchedule
              ? barGeometry(
                  {
                    startDay: startOfDay(baselineSchedule.start),
                    finishDay: startOfDay(baselineSchedule.finish),
                  },
                  range,
                  scale.px,
                )
              : null;

            return (
              <div
                key={task.id}
                className={`gantt-row group flex border-b border-white/25 transition-colors hover:bg-white/35 dark:border-white/[0.06] dark:hover:bg-white/5 ${
                  dimmed ? 'opacity-35' : ''
                }`}
                style={{ height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center border-r border-slate-300/50 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75"
                  style={{ width: leftWidth }}
                >
                  <div className="px-2 text-center font-mono text-[0.65rem] text-slate-500 dark:text-slate-400" style={{ width: 50 }}>
                    {numberById?.get(task.id) ?? '—'}
                  </div>

                  <button
                    type="button"
                    onClick={() => onTaskClick?.(task)}
                    className="min-w-0 px-1.5 text-left"
                    style={{ width: 232 }}
                    title={task.title}
                  >
                    <span className="flex items-center gap-1.5">
                      {task.is_private && (
                        <span className="shrink-0 rounded-full bg-violet-500/15 p-0.5 text-violet-600 dark:text-violet-300" title="Личная задача">
                          <UserRound size={10} />
                        </span>
                      )}
                      {task.is_milestone && <Diamond size={10} className="shrink-0 text-amber-500" />}
                      <span className="truncate text-[0.74rem] font-medium text-slate-800 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
                        {task.title || 'Без названия'}
                      </span>
                    </span>
                  </button>

                  <div className="min-w-0 px-1.5" style={{ width: 122 }}>
                    {assignee || author ? (
                      <span className="flex items-center gap-1.5">
                        <Avatar
                          name={(assignee || author)?.full_name}
                          color={(assignee || author)?.color}
                          src={(assignee || author)?.avatar_url}
                          className="h-4 w-4 text-[0.45rem]"
                        />
                        <span className="truncate text-[0.66rem] text-slate-600 dark:text-slate-300">
                          {(assignee || author)?.full_name || '—'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[0.66rem] text-slate-400">—</span>
                    )}
                  </div>

                  <div className="px-1.5 text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 90 }}>
                    {task.is_milestone ? '—' : formatDayMonth(schedule.start)}
                  </div>
                  <div className="px-1.5 text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 90 }}>
                    {formatDayMonth(schedule.finish)}
                  </div>
                  <div className="px-1.5 text-center text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 48 }}>
                    {task.is_milestone ? 'веха' : days}
                  </div>
                  <div className="px-1 text-center text-[0.62rem] tabular-nums text-slate-500 dark:text-slate-400" style={{ width: 44 }}>
                    {progress}%
                  </div>
                  {storyPointsEnabled && (
                    <div className="px-1 text-center text-[0.62rem] tabular-nums text-slate-500 dark:text-slate-400" style={{ width: 44 }}>
                      {task.story_points ?? '—'}
                    </div>
                  )}
                  {isAgile && (
                    <div className="truncate px-1.5 text-[0.62rem] text-slate-500 dark:text-slate-400" style={{ width: 100 }}>
                      {sprintLabel(sprints, task.sprint_id) || '—'}
                    </div>
                  )}
                </div>

                <div className="relative" style={{ width: totalWidth }}>
                  {baselineGeometry && !task.is_milestone && (
                    <div
                      className="absolute top-[calc(50%+9px)] h-[3px] rounded-full bg-slate-400/45 dark:bg-slate-300/35"
                      style={{ left: baselineGeometry.left, width: baselineGeometry.width }}
                      title="Базовый план"
                    />
                  )}
                  {task.is_milestone ? (
                    <button
                      type="button"
                      onClick={() => onTaskClick?.(task)}
                      className={`absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border-2 border-white shadow ${
                        isCritical ? 'bg-rose-500 ring-2 ring-rose-300' : 'bg-amber-400'
                      } ${isHovered ? 'scale-110' : ''}`}
                      style={{ left: geometry.left }}
                      title={`Веха: ${task.title}\n${formatDueLong(schedule.finish)}`}
                      aria-label={`Веха ${task.title}`}
                    />
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onPointerDown={(event) => handlePointerDown(event, row, 'move')}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={() => setDrag(null)}
                      onMouseEnter={() => setHoveredId(task.id)}
                      onMouseLeave={() => setHoveredId(null)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') onTaskClick?.(task);
                      }}
                      onClick={() => {
                        if (movedRef.current) {
                          movedRef.current = false;
                          return;
                        }
                        onTaskClick?.(task);
                      }}
                      title={`${task.title}\n${formatDueLong(schedule.start)} — ${formatDueLong(schedule.finish)} · ${days} дн.`}
                      className={`absolute top-1/2 flex h-[26px] -translate-y-1/2 items-center gap-1.5 overflow-hidden rounded-lg bg-gradient-to-r ${BAR_STYLES[priority.value]} px-2 text-white shadow-md transition-shadow ${
                        canEditSchedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                      } ${task.is_private ? 'ring-2 ring-violet-400/70' : ''} ${
                        isCritical ? 'ring-2 ring-rose-300 ring-offset-1' : ''
                      } ${isDragging ? 'z-30 !shadow-2xl ring-2 ring-indigo-300' : 'hover:shadow-lg'} ${
                        isHovered ? 'brightness-110' : ''
                      }`}
                      style={{ left: geometry.left, width: geometry.width, minWidth: 12 }}
                    >
                      <span
                        className="absolute inset-y-0 left-0 bg-white/30"
                        style={{ width: `${progress}%` }}
                        aria-hidden="true"
                      />
                      {canShowLabel && (
                        <span className="relative z-10 truncate text-[0.62rem] font-semibold drop-shadow-sm">
                          {numberById?.get(task.id) ? `№${numberById.get(task.id)}` : ''}
                          {geometry.width > 120 ? ` · ${days} дн.` : ''}
                        </span>
                      )}
                      {task.links?.length > 0 && geometry.width > 90 && (
                        <span className="relative z-10 ml-auto rounded bg-white/25 px-1 text-[0.55rem] font-bold">
                          {task.links.length}
                        </span>
                      )}
                      {isCritical && (
                        <span className="relative z-10 ml-auto" title="Критическая задача">
                          <Flag size={10} />
                        </span>
                      )}
                      {canEditSchedule && (
                        <span
                          onPointerDown={(event) => handlePointerDown(event, row, 'resize')}
                          onClick={(event) => event.stopPropagation()}
                          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize rounded-r-lg bg-white/0 transition hover:bg-white/40"
                          title="Изменить длительность"
                        />
                      )}
                    </div>
                  )}

                  {isDragging && (
                    <div
                      className="absolute top-1/2 z-40 -translate-y-[calc(100%+22px)] rounded-lg border border-slate-300/50 bg-slate-900/90 px-2 py-1 text-[0.6rem] font-medium whitespace-nowrap text-white shadow-lg"
                      style={{ left: geometry.left }}
                    >
                      {formatDayMonth(schedule.start)} — {formatDayMonth(schedule.finish)} · {days} дн.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="no-print flex flex-wrap items-center gap-3 border-t border-slate-300/50 px-4 py-2 text-[0.62rem] text-slate-500 dark:border-white/10 dark:text-slate-400">
        {[
          { color: 'bg-rose-500', label: 'Высокий' },
          { color: 'bg-amber-400', label: 'Средний' },
          { color: 'bg-emerald-400', label: 'Низкий' },
          { color: 'bg-indigo-500', label: 'Обычный' },
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1">
            <span className={`h-2 w-4 rounded-sm ${item.color}`} /> {item.label}
          </span>
        ))}
        <span className="flex items-center gap-1">
          <Diamond size={10} className="text-amber-500" /> веха
        </span>
        <span className="flex items-center gap-1">
          <span className="h-1.5 w-4 rounded-full bg-slate-400/60" /> базовый план
        </span>
        <span className="flex items-center gap-1">
          <Flag size={10} className="text-rose-500" /> критический путь
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Check size={11} /> Тяните полосу — сдвиг сроков, правый край — длительность
        </span>
      </div>
    </div>
  );
}
