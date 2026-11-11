import { useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange } from 'lucide-react';
import { formatMonthTitle, getDueValue } from '../lib/format';
import { getPriority } from '../lib/priority';

const PRIORITY_COLORS = {
  3: { backgroundColor: '#f43f5e', borderColor: '#e11d48' },
  2: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
  1: { backgroundColor: '#10b981', borderColor: '#059669' },
  0: { backgroundColor: '#6366f1', borderColor: '#4f46e5' },
};

export default function CalendarView({ tasks = [], numberById, onTaskClick, onDateClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [activeView, setActiveView] = useState('dayGridMonth');
  const calendarRef = useRef(null);

  const events = tasks
    .filter((task) => getDueValue(task))
    .map((task) => {
      const due = getDueValue(task);
      const number = numberById?.get(task.id);
      const priority = getPriority(task.priority);
      const colors = PRIORITY_COLORS[priority.value] ?? PRIORITY_COLORS[0];

      return {
        id: task.id,
        title: number != null ? `№${number} · ${task.title || 'Без названия'}` : task.title || 'Без названия',
        start: due,
        allDay: !String(due).includes('T'),
        ...colors,
        extendedProps: { isPrivate: Boolean(task.is_private) },
      };
    });

  const changeView = (view) => {
    setActiveView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  return (
    <div className="calendar-container scrollbar-slim mx-auto flex h-[calc(100vh-140px)] max-w-6xl flex-col overflow-auto rounded-3xl p-4">
      <div className="mb-4 flex flex-wrap items-center gap-2 px-1">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().prev()}
            className="glass-btn !rounded-xl !p-2"
            title="Предыдущий период"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().next()}
            className="glass-btn !rounded-xl !p-2"
            title="Следующий период"
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            onClick={() => calendarRef.current?.getApi().today()}
            className="glass-btn !py-1.5 !text-xs"
          >
            Сегодня
          </button>
        </div>

        <h2 className="mx-auto text-lg font-bold text-slate-800 dark:text-slate-100">
          {formatMonthTitle(currentDate)}
        </h2>

        <div className="glass-segment">
          <button
            type="button"
            className="glass-segment-btn"
            data-active={activeView === 'dayGridMonth'}
            onClick={() => changeView('dayGridMonth')}
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Месяц</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={activeView === 'dayGridWeek'}
            onClick={() => changeView('dayGridWeek')}
          >
            <CalendarRange size={14} />
            <span className="hidden sm:inline">Неделя</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ru"
          firstDay={1}
          events={events}
          eventClick={(info) => {
            const task = tasks.find((item) => item.id === info.event.id);
            if (task && onTaskClick) onTaskClick(task);
          }}
          dateClick={(info) => {
            if (onDateClick) onDateClick(info.dateStr);
          }}
          headerToolbar={false}
          height="100%"
          dayMaxEvents={4}
          datesSet={(arg) => setCurrentDate(arg.view.currentStart)}
          eventDidMount={(info) => {
            info.el.title = info.event.title;
          }}
        />
      </div>
    </div>
  );
}
