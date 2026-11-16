import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flag,
  LayoutGrid,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';

const INITIAL_COLUMNS = [
  {
    id: 'todo',
    title: 'Сделать',
    accent: '#818cf8',
    tasks: [
      {
        id: 't1',
        no: 112,
        title: 'Подготовить макет мобильной доски',
        due: 'Сегодня, 18:00',
        assignee: 'Владимир',
        priority: 'high',
        description:
          'Собрать компактный вариант доски: одна колонка на экран, крупные карточки, понятный переход в задачу.',
      },
      {
        id: 't2',
        no: 113,
        title: 'Проверить свайп между этапами',
        due: 'Завтра',
        assignee: 'Анна',
        priority: 'medium',
        description: 'Свайп влево/вправо переключает этапы. Проверить на Android и на узком экране.',
      },
      {
        id: 't3',
        no: 114,
        title: 'Добавить поиск по задачам',
        due: '20 ноя',
        assignee: 'Игорь',
        priority: 'low',
        description: 'Поиск по названию и номеру задачи в верхней части доски.',
      },
    ],
  },
  {
    id: 'progress',
    title: 'В работе',
    accent: '#fbbf24',
    tasks: [
      {
        id: 't4',
        no: 108,
        title: 'Мобильная карточка задачи',
        due: 'Сегодня, 20:00',
        assignee: 'Владимир',
        priority: 'high',
        description:
          'Full-screen карточка: название, срок, исполнитель, приоритет, описание и сохранение. Клавиатура не перекрывает поля.',
      },
      {
        id: 't5',
        no: 109,
        title: 'Нижняя навигация',
        due: '21 ноя',
        assignee: 'Анна',
        priority: 'medium',
        description: 'Пять разделов: Доска, Календарь, Чат, Команда, Ещё. Активный раздел подсвечен.',
      },
    ],
  },
  {
    id: 'testing',
    title: 'На тестировании',
    accent: '#38bdf8',
    tasks: [
      {
        id: 't6',
        no: 105,
        title: 'Проверка длинных названий',
        due: '19 ноя',
        assignee: 'Игорь',
        priority: 'medium',
        description: 'Название задачи в две строки, затем многоточие. Номер и срок не должны прыгать.',
      },
    ],
  },
  {
    id: 'done',
    title: 'Готово',
    accent: '#34d399',
    tasks: [
      {
        id: 't7',
        no: 101,
        title: 'Прототип мобильной доски',
        due: '17 ноя',
        assignee: 'Владимир',
        priority: 'low',
        description: 'Первая версия интерактивного прототипа без backend.',
      },
    ],
  },
];

const PRIORITIES = {
  high: { label: 'Высокий', color: '#fb7185' },
  medium: { label: 'Средний', color: '#fbbf24' },
  low: { label: 'Низкий', color: '#34d399' },
};

function Avatar({ name, size = 28 }) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-500/20 font-semibold text-indigo-200 ring-1 ring-indigo-300/30"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {initials}
    </span>
  );
}

function TaskCard({ task, onClick }) {
  const priority = PRIORITIES[task.priority];
  return (
    <button
      type="button"
      onClick={() => onClick(task)}
      className="w-full rounded-2xl border border-white/10 bg-white/[0.06] p-3 text-left shadow-lg shadow-black/10 transition active:scale-[0.985]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-[0.62rem] font-medium text-slate-400">№ {task.no}</span>
        <span
          className="flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.58rem] font-semibold"
          style={{ color: priority.color, background: `${priority.color}18` }}
        >
          <Flag size={9} />
          {priority.label}
        </span>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[0.8rem] font-semibold leading-snug text-slate-100">
        {task.title}
      </p>
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1 text-[0.62rem] text-slate-400">
          <Clock3 size={11} className="shrink-0" />
          <span className="truncate">{task.due}</span>
        </span>
        <Avatar name={task.assignee} size={24} />
      </div>
    </button>
  );
}

function TaskSheet({ task, onClose, onSave }) {
  const [status, setStatus] = useState(task.status);
  const [saved, setSaved] = useState(false);
  const priority = PRIORITIES[task.priority];

  const save = () => {
    setSaved(true);
    window.setTimeout(() => {
      setSaved(false);
      onSave(task.id, status);
      onClose();
    }, 450);
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-[#0b1020]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300"
          aria-label="Закрыть задачу"
        >
          <ArrowLeft size={18} />
        </button>
        <span className="text-xs font-semibold text-slate-300">Задача № {task.no}</span>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300"
          aria-label="Ещё"
        >
          <MoreHorizontal size={18} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4">
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-1 text-[0.6rem] font-semibold"
            style={{ color: priority.color, background: `${priority.color}18` }}
          >
            {priority.label} приоритет
          </span>
          <span className="rounded-full bg-white/5 px-2 py-1 text-[0.6rem] text-slate-300">
            {status}
          </span>
        </div>

        <h1 className="mt-3 text-xl font-bold leading-snug text-white">{task.title}</h1>

        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
              <CalendarDays size={17} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.6rem] uppercase tracking-wide text-slate-500">Срок</p>
              <p className="truncate text-xs font-medium text-slate-200">{task.due}</p>
            </div>
            <ChevronRight size={15} className="text-slate-500" />
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
            <Avatar name={task.assignee} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-[0.6rem] uppercase tracking-wide text-slate-500">Исполнитель</p>
              <p className="truncate text-xs font-medium text-slate-200">{task.assignee}</p>
            </div>
            <ChevronRight size={15} className="text-slate-500" />
          </div>
        </div>

        <div className="mt-5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">
            Описание
          </p>
          <p className="mt-2 text-[0.78rem] leading-relaxed text-slate-300">{task.description}</p>
        </div>

        <div className="mt-5">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wide text-slate-500">
            Этап
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {['Сделать', 'В работе', 'На тестировании', 'Готово'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={`rounded-xl border px-3 py-2 text-[0.68rem] font-medium transition ${
                  status === item
                    ? 'border-indigo-400/60 bg-indigo-500/15 text-indigo-200'
                    : 'border-white/10 bg-white/[0.03] text-slate-400'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 border-t border-white/10 bg-[#0b1020]/95 p-3 backdrop-blur">
        <button
          type="button"
          onClick={save}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 text-sm font-semibold text-white active:bg-indigo-600"
        >
          {saved ? <Check size={17} /> : null}
          {saved ? 'Сохранено' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}

export default function MobilePrototype() {
  const [columns, setColumns] = useState(INITIAL_COLUMNS);
  const [activeIndex, setActiveIndex] = useState(1);
  const [selectedTask, setSelectedTask] = useState(null);
  const [touchStart, setTouchStart] = useState(null);
  const [query, setQuery] = useState('');

  const activeColumn = columns[activeIndex];
  const visibleTasks = useMemo(() => {
    if (!query.trim()) return activeColumn.tasks;
    const normalized = query.trim().toLowerCase();
    return activeColumn.tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(normalized) || String(task.no).includes(normalized),
    );
  }, [activeColumn, query]);

  const moveTask = (taskId, nextStatus) => {
    const columnIndex = columns.findIndex((column) => column.title === nextStatus);
    if (columnIndex < 0) return;
    setColumns((prev) => {
      const task = prev.flatMap((column) => column.tasks).find((item) => item.id === taskId);
      if (!task) return prev;
      return prev.map((column) => {
        if (column.title === nextStatus && !column.tasks.some((item) => item.id === taskId)) {
          return { ...column, tasks: [{ ...task, status: nextStatus }, ...column.tasks] };
        }
        return { ...column, tasks: column.tasks.filter((item) => item.id !== taskId) };
      });
    });
    setActiveIndex(columnIndex);
  };

  const swipe = (direction) => {
    setActiveIndex((prev) => Math.min(columns.length - 1, Math.max(0, prev + direction)));
    setQuery('');
  };

  return (
    <div className="app-bg flex min-h-screen items-center justify-center sm:p-6">
      <div className="relative flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-[#0b1020] text-slate-100 shadow-2xl shadow-black/40 sm:h-[860px] sm:max-h-[92vh] sm:rounded-[2rem] sm:ring-1 sm:ring-white/10">
        <header className="shrink-0 px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500 text-sm font-black text-white">
                К
              </span>
              <div>
                <p className="text-[0.58rem] uppercase tracking-wider text-slate-500">Проект</p>
                <p className="text-sm font-semibold leading-tight">Мой Канбан</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-slate-300"
                aria-label="Уведомления"
              >
                <span className="relative">
                  <CalendarDays size={17} />
                  <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-rose-400" />
                </span>
              </button>
              <Avatar name="Владимир" size={34} />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <div className="flex h-10 flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] px-3">
              <Search size={15} className="text-slate-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти задачу"
                className="w-full bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-500"
              />
              {query ? (
                <button type="button" onClick={() => setQuery('')} aria-label="Очистить поиск">
                  <X size={14} className="text-slate-500" />
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500 text-white"
              aria-label="Новая задача"
            >
              <Plus size={19} />
            </button>
          </div>
        </header>

        <div className="shrink-0 px-4">
          <div className="flex gap-1 overflow-x-auto pb-2 [scrollbar-width:none]">
            {columns.map((column, index) => (
              <button
                key={column.id}
                type="button"
                onClick={() => {
                  setActiveIndex(index);
                  setQuery('');
                }}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[0.68rem] font-semibold transition ${
                  index === activeIndex
                    ? 'bg-white text-slate-900'
                    : 'bg-white/5 text-slate-400'
                }`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: index === activeIndex ? column.accent : '#475569' }}
                />
                {column.title}
                <span
                  className={`rounded-full px-1.5 text-[0.55rem] ${
                    index === activeIndex ? 'bg-slate-100 text-slate-500' : 'bg-white/10'
                  }`}
                >
                  {column.tasks.length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <main
          className="flex min-h-0 flex-1 flex-col px-4 pb-24 pt-1"
          onTouchStart={(event) => setTouchStart(event.touches[0].clientX)}
          onTouchEnd={(event) => {
            if (touchStart === null) return;
            const delta = event.changedTouches[0].clientX - touchStart;
            if (Math.abs(delta) > 55) swipe(delta < 0 ? 1 : -1);
            setTouchStart(null);
          }}
        >
          <div className="mb-2 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{activeColumn.title}</h2>
              <p className="text-[0.62rem] text-slate-500">
                {visibleTasks.length} {visibleTasks.length === 1 ? 'задача' : 'задач'} · свайп
                между этапами
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => swipe(-1)}
                disabled={activeIndex === 0}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-300 disabled:opacity-25"
                aria-label="Предыдущий этап"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => swipe(1)}
                disabled={activeIndex === columns.length - 1}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-300 disabled:opacity-25"
                aria-label="Следующий этап"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2.5 overflow-y-auto pb-4 [scrollbar-width:none]">
            {visibleTasks.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 text-center">
                <Search size={22} className="text-slate-600" />
                <p className="mt-2 text-xs text-slate-400">Ничего не найдено</p>
              </div>
            ) : (
              visibleTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={(item) => setSelectedTask({ ...item, status: activeColumn.title })}
                />
              ))
            )}
          </div>

          <div className="flex items-center justify-center gap-1.5 pb-1">
            {columns.map((column, index) => (
              <span
                key={column.id}
                className={`h-1.5 rounded-full transition-all ${
                  index === activeIndex ? 'w-5 bg-indigo-400' : 'w-1.5 bg-white/15'
                }`}
              />
            ))}
          </div>
        </main>

        <nav className="absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-[#0b1020]/95 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur">
          <div className="grid grid-cols-5 gap-1">
            {[
              { label: 'Доска', icon: LayoutGrid, active: true },
              { label: 'Календарь', icon: CalendarDays },
              { label: 'Чат', icon: MessageCircle },
              { label: 'Команда', icon: Users },
              { label: 'Ещё', icon: MoreHorizontal },
            ].map(({ label, icon: Icon, active }) => (
              <button
                key={label}
                type="button"
                className={`flex flex-col items-center gap-1 rounded-xl py-1.5 text-[0.56rem] ${
                  active ? 'text-indigo-300' : 'text-slate-500'
                }`}
              >
                <Icon size={18} strokeWidth={active ? 2.4 : 1.8} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        <div className="pointer-events-none absolute left-1/2 top-2 h-1 w-16 -translate-x-1/2 rounded-full bg-white/15 sm:hidden" />

        {selectedTask ? (
          <TaskSheet
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onSave={moveTask}
          />
        ) : null}
      </div>
    </div>
  );
}
