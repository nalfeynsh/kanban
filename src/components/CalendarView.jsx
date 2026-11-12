import { useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import { formatMonthTitle, getDueValue } from '../lib/format';
import { getPriority } from '../lib/priority';

const PRIORITY_COLORS = {
  3: { backgroundColor: '#f43f5e', borderColor: '#e11d48' },
  2: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
  1: { backgroundColor: '#10b981', borderColor: '#059669' },
  0: { backgroundColor: '#6366f1', borderColor: '#4f46e5' },
};

const pad = (value) => String(value).padStart(2, '0');

/** Date → значение для start_at/due_at: «2026-11-12T14:30:00» (локальное время) */
function toInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function sameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function CalendarView({ tasks = [], numberById, onTaskClick, onSlotSelect }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodTitle, setPeriodTitle] = useState('');
  const [activeView, setActiveView] = useState('dayGridMonth');
  const calendarRef = useRef(null);

  const events = tasks.flatMap((task) => {
    const due = getDueValue(task);
    if (!due) return [];

    const number = numberById?.get(task.id);
    const priority = getPriority(task.priority);
    const colors = PRIORITY_COLORS[priority.value] ?? PRIORITY_COLORS[0];
    const title = number != null ? `№${number} · ${task.title || 'Без названия'}` : task.title || 'Без названия';
    const extendedProps = { isPrivate: Boolean(task.is_private) };

    // Задача без времени — событие на весь день
    if (!String(due).includes('T')) {
      return [{ id: task.id, title, start: due, allDay: true, ...colors, extendedProps }];
    }

    const dueDate = new Date(due);
    if (Number.isNaN(dueDate.getTime())) return [];

    // Если задано начало в тот же день — рисуем интервал, иначе точку в сроке (30 минут)
    let startsAt = dueDate;
    if (task.start_at && String(task.start_at).includes('T')) {
      const startDate = new Date(task.start_at);
      if (!Number.isNaN(startDate.getTime()) && startDate < dueDate && sameDay(startDate, dueDate)) {
        startsAt = startDate;
      }
    }
    const endsAt = startsAt === dueDate ? new Date(dueDate.getTime() + 60 * 60 * 1000) : dueDate;

    return [
      {
        id: task.id,
        title,
        start: toInputValue(startsAt),
        end: toInputValue(endsAt),
        allDay: false,
        ...colors,
        extendedProps,
      },
    ];
  });

  const changeView = (view) => {
    setActiveView(view);
    calendarRef.current?.getApi().changeView(view);
  };

  /** Выделение слота: в неделе/дне — конкретное время, в месяце — вечер выбранного дня */
  const handleSelect = (info) => {
    if (!onSlotSelect) return;

    if (info.allDay) {
      const start = info.start;
      const day = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
      onSlotSelect({ start: `${day}T18:00:00`, due: `${day}T19:00:00` });
    } else {
      let end = info.end;
      if (!(end > info.start)) end = new Date(info.start.getTime() + 60 * 60 * 1000);
      onSlotSelect({ start: toInputValue(info.start), due: toInputValue(end) });
    }

    info.view.calendar.unselect();
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
          {periodTitle || formatMonthTitle(currentDate)}
        </h2>

        <div className="glass-segment">
          <button
            type="button"
            className="glass-segment-btn"
            data-active={activeView === 'dayGridMonth'}
            onClick={() => changeView('dayGridMonth')}
            title="Месяц"
          >
            <CalendarDays size={14} />
            <span className="hidden sm:inline">Месяц</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={activeView === 'timeGridWeek'}
            onClick={() => changeView('timeGridWeek')}
            title="Неделя с часами"
          >
            <CalendarRange size={14} />
            <span className="hidden sm:inline">Неделя</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={activeView === 'timeGridDay'}
            onClick={() => changeView('timeGridDay')}
            title="Один день по часам"
          >
            <CalendarClock size={14} />
            <span className="hidden sm:inline">День</span>
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ru"
          firstDay={1}
          selectable
          selectMirror
          select={handleSelect}
          events={events}
          eventClick={(info) => {
            const task = tasks.find((item) => item.id === info.event.id);
            if (task && onTaskClick) onTaskClick(task);
          }}
          headerToolbar={false}
          height="100%"
          dayMaxEvents={4}
          eventDisplay="block"
          nowIndicator
          slotDuration="01:00:00"
          slotLabelInterval="01:00"
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          allDayText="Весь день"
          datesSet={(arg) => {
            setCurrentDate(arg.view.currentStart);
            setPeriodTitle(arg.view.title);
          }}
          eventDidMount={(info) => {
            info.el.title = info.event.title;
            if (info.event.backgroundColor) {
              info.el.style.backgroundColor = info.event.backgroundColor;
            }
            if (info.event.borderColor) {
              info.el.style.borderColor = info.event.borderColor;
            }
            info.el.style.color = '#ffffff';
          }}
        />
      </div>
    </div>
  );
}
