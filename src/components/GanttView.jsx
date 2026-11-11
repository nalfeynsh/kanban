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
} from '../lib/gantt';
import { getPriority } from '../lib/priority';
import { formatDueLong } from '../lib/format';
import {
  buildCsv,
  buildMsProjectXml,
  buildScheduleRows,
  describePeriod,
  downloadTextFile,
  scheduleFileName,
} from '../lib/export';

const LEFT_COLUMNS = [
  { key: 'number', title: '№', width: 52 },
  { key: 'title', title: 'Задача', width: 252 },
  { key: 'assignee', title: 'Исполнитель', width: 132 },
  { key: 'start', title: 'Начало', width: 100 },
  { key: 'finish', title: 'Срок', width: 100 },
  { key: 'days', title: 'Дней', width: 58, align: 'center' },
];

const LEFT_WIDTH = LEFT_COLUMNS.reduce((sum, column) => sum + column.width, 0);
const ROW_HEIGHT = 44;

const BAR_STYLES = {
  3: 'from-rose-500 via-rose-500 to-orange-400',
  2: 'from-amber-400 via-amber-400 to-yellow-300',
  1: 'from-emerald-400 via-emerald-400 to-teal-300',
  0: 'from-indigo-500 via-violet-500 to-sky-400',
};

function initials(name) {
  if (!name) return '';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function GanttView({
  tasks = [],
  columns = [],
  authorById,
  numberById,
  onTaskClick,
  onScheduleChange,
  canEditSchedule = false,
}) {
  const [scaleKey, setScaleKey] = useState('week');
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [drag, setDrag] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollRef = useRef(null);
  const movedRef = useRef(false);

  const scale = GANTT_SCALES[scaleKey];

  // Ширина области прокрутки — чтобы таймлайн занимал весь блок
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;
    const observer = new ResizeObserver((entries) => {
      setViewportWidth(entries[0]?.contentRect.width ?? 0);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const rows = useMemo(() => buildGanttRows(tasks), [tasks]);

  const range = useMemo(() => {
    const base = computeRange(rows);
    const neededDays = Math.ceil((viewportWidth - LEFT_WIDTH) / scale.px);
    if (!Number.isFinite(neededDays) || neededDays <= base.days) return base;
    const days = Math.min(730, neededDays);
    return { from: base.from, to: addDays(base.from, days - 1), days };
  }, [rows, viewportWidth, scale.px]);
  const header = useMemo(() => buildHeader(range, scaleKey), [range, scaleKey]);
  const weekends = useMemo(() => buildWeekends(range, scale.px), [range, scale.px]);
  const totalWidth = range.days * scale.px;
  const todayOffset = daysBetween(range.from, startOfDay(new Date()));
  const todayVisible = todayOffset >= 0 && todayOffset < range.days;

  const scheduleRows = useMemo(
    () => buildScheduleRows({ tasks, columns, authorById, numberById }),
    [tasks, columns, authorById, numberById],
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
    if (!canEditSchedule) return;
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

  return (
    <div className="gantt-shell flex max-h-[calc(100vh-150px)] min-h-[320px] flex-col overflow-hidden rounded-3xl">
      {/* Панель инструментов */}
      <div className="no-print flex flex-wrap items-center gap-2 border-b border-white/40 px-4 py-2.5 dark:border-white/10">
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

        <div className="glass-segment ml-auto">
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
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Формат MSPDI — открывается в MS Project
                    </span>
                  </span>
                </button>
                <button type="button" onClick={exportCsv} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10">
                  <FileSpreadsheet size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">Excel / CSV</span>
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Таблица с датами и длительностью
                    </span>
                  </span>
                </button>
                <button type="button" onClick={exportPdf} className="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/10">
                  <Printer size={16} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-400" />
                  <span>
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">PDF (печать)</span>
                    <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Диалог печати → «Сохранить как PDF»
                    </span>
                  </span>
                </button>
                <p className="mt-1 flex items-start gap-1.5 px-2.5 py-1.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  Выгружаются задачи текущего фильтра: {scheduleRows.length} шт.
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {!canEditSchedule && rows.length > 0 && (
        <div className="no-print border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-[0.68rem] text-amber-800 dark:text-amber-200">
          Перетаскивание полос станет доступно после миграции БД (колонка <code>tasks.start_at</code>).
        </div>
      )}

      {/* Таблица + таймлайн */}
      <div ref={scrollRef} className="gantt-scroll scrollbar-slim flex-1 overflow-auto">
        <div className="relative" style={{ width: LEFT_WIDTH + totalWidth, minWidth: '100%' }}>
          {/* Фон таймлайна: сетка, выходные, линия «сегодня» */}
          <div
            className="pointer-events-none absolute top-0 bottom-0"
            style={{
              left: LEFT_WIDTH,
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
              <div
                className="absolute inset-y-0 w-[2px] bg-rose-500/70"
                style={{ left: todayOffset * scale.px }}
              />
            )}
          </div>

          {/* Заголовок */}
          <div className="gantt-head sticky top-0 z-30 flex border-b border-white/45 bg-white/75 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/80">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-end gap-0 border-r border-white/45 bg-white/85 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/85"
              style={{ width: LEFT_WIDTH }}
            >
              {LEFT_COLUMNS.map((column) => (
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
                    className="flex shrink-0 items-center border-r border-white/40 px-2 text-[0.68rem] font-semibold tracking-wide text-slate-600 dark:border-white/10 dark:text-slate-300"
                    style={{ width: month.width }}
                  >
                    <span className="truncate">{month.label}</span>
                  </div>
                ))}
              </div>
              <div className="relative h-6 border-t border-white/30 dark:border-white/10">
                {header.ticks.map((tick) => (
                  <span
                    key={tick.index}
                    className={`absolute top-1/2 -translate-y-1/2 pl-1 text-[0.6rem] tabular-nums ${
                      tick.isToday
                        ? 'font-bold text-rose-600 dark:text-rose-300'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                    style={{ left: tick.index * scale.px }}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Строки */}
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
            const isDragging = drag?.id === row.task.id;
            const schedule = isDragging
              ? shiftSchedule(row.schedule, drag.delta, drag.mode)
              : row.schedule;
            const preview = {
              ...row,
              schedule,
              startDay: startOfDay(schedule.start),
              finishDay: startOfDay(schedule.finish),
            };
            const geometry = barGeometry(preview, range, scale.px);
            const days = Math.max(1, daysBetween(schedule.start, schedule.finish) + 1);
            const priority = getPriority(row.task.priority);
            const author = authorById?.get(row.task.created_by);
            const assignee = row.task.assignee_id ? authorById?.get(row.task.assignee_id) : null;
            const isHovered = hoveredId === row.task.id;
            const canShowLabel = geometry.width > 54;

            return (
              <div
                key={row.task.id}
                className="gantt-row group flex border-b border-white/25 transition-colors hover:bg-white/35 dark:border-white/[0.06] dark:hover:bg-white/5"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Левая таблица */}
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center border-r border-white/40 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/75"
                  style={{ width: LEFT_WIDTH }}
                >
                  <div className="px-2 text-center text-[0.65rem] font-mono text-slate-500 dark:text-slate-400" style={{ width: 52 }}>
                    {numberById?.get(row.task.id) ?? '—'}
                  </div>

                  <button
                    type="button"
                    onClick={() => onTaskClick?.(row.task)}
                    className="min-w-0 px-1.5 text-left"
                    style={{ width: 252 }}
                    title={row.task.title}
                  >
                    <span className="flex items-center gap-1.5">
                      {row.task.is_private && (
                        <span className="shrink-0 rounded-full bg-violet-500/15 p-0.5 text-violet-600 dark:text-violet-300" title="Личная задача">
                          <UserRound size={10} />
                        </span>
                      )}
                      <span className="truncate text-[0.74rem] font-medium text-slate-800 group-hover:text-indigo-700 dark:text-slate-100 dark:group-hover:text-indigo-300">
                        {row.task.title || 'Без названия'}
                      </span>
                    </span>
                  </button>

                  <div className="min-w-0 px-1.5" style={{ width: 132 }}>
                    {assignee || author ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.45rem] font-bold text-white"
                          style={{ backgroundColor: (assignee || author)?.color || '#6366f1' }}
                        >
                          {initials((assignee || author)?.full_name)}
                        </span>
                        <span className="truncate text-[0.66rem] text-slate-600 dark:text-slate-300">
                          {(assignee || author)?.full_name || '—'}
                        </span>
                      </span>
                    ) : (
                      <span className="text-[0.66rem] text-slate-400">—</span>
                    )}
                  </div>

                  <div className="px-1.5 text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 100 }}>
                    {formatDayMonth(schedule.start)}
                  </div>
                  <div className="px-1.5 text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 100 }}>
                    {formatDayMonth(schedule.finish)}
                  </div>
                  <div className="px-1.5 text-center text-[0.66rem] tabular-nums text-slate-600 dark:text-slate-300" style={{ width: 58 }}>
                    {days}
                  </div>
                </div>

                {/* Полоса на таймлайне */}
                <div className="relative" style={{ width: totalWidth }}>
                  <div
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) => handlePointerDown(event, row, 'move')}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onMouseEnter={() => setHoveredId(row.task.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') onTaskClick?.(row.task);
                    }}
                    onClick={() => {
                      if (movedRef.current) {
                        movedRef.current = false;
                        return;
                      }
                      onTaskClick?.(row.task);
                    }}
                    title={`${row.task.title}\n${formatDueLong(schedule.start)} — ${formatDueLong(schedule.finish)} · ${days} дн.`}
                    className={`absolute top-1/2 flex h-[26px] -translate-y-1/2 items-center gap-1.5 rounded-lg bg-gradient-to-r ${BAR_STYLES[priority.value]} px-2 text-white shadow-md transition-shadow ${
                      canEditSchedule ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                    } ${row.task.is_private ? 'ring-2 ring-violet-400/70' : ''} ${
                      isDragging ? 'z-30 !shadow-2xl ring-2 ring-indigo-300' : 'hover:shadow-lg'
                    } ${isHovered ? 'brightness-110' : ''}`}
                    style={{ left: geometry.left, width: geometry.width, minWidth: 12 }}
                  >
                    {canShowLabel && (
                      <span className="truncate text-[0.62rem] font-semibold drop-shadow-sm">
                        {numberById?.get(row.task.id) ? `№${numberById.get(row.task.id)}` : ''}
                        {geometry.width > 120 ? ` · ${days} дн.` : ''}
                      </span>
                    )}

                    {row.task.links?.length > 0 && geometry.width > 90 && (
                      <span className="ml-auto rounded bg-white/25 px-1 text-[0.55rem] font-bold">
                        {row.task.links.length}
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

                  {/* Подпись с датами при перетаскивании */}
                  {isDragging && (
                    <div
                      className="absolute top-1/2 z-40 -translate-y-[calc(100%+22px)] rounded-lg border border-white/40 bg-slate-900/90 px-2 py-1 text-[0.6rem] font-medium whitespace-nowrap text-white shadow-lg"
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

      {/* Легенда */}
      <div className="no-print flex flex-wrap items-center gap-3 border-t border-white/40 px-4 py-2 text-[0.62rem] text-slate-500 dark:border-white/10 dark:text-slate-400">
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
          <span className="h-2 w-4 rounded-sm bg-violet-400/70 ring-1 ring-violet-400" /> личная
        </span>
        <span className="ml-auto flex items-center gap-1">
          <Check size={11} /> Тяните полосу — сдвиг сроков, правый край — длительность
        </span>
      </div>
    </div>
  );
}
