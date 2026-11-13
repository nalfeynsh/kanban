import { useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ChevronLeft, ChevronRight, CalendarDays, CalendarRange, CalendarClock } from 'lucide-react';
import { formatMonthTitle, getDueValue, isDateOnly, parseDateValue } from '../lib/format';
import { getPriority } from '../lib/priority';

const PRIORITY_COLORS = {
  3: { backgroundColor: '#f43f5e', borderColor: '#e11d48' },
  2: { backgroundColor: '#f59e0b', borderColor: '#d97706' },
  1: { backgroundColor: '#10b981', borderColor: '#059669' },
  0: { backgroundColor: '#6366f1', borderColor: '#4f46e5' },
};

const pad = (value) => String(value).padStart(2, '0');

function capitalizeFirst(value) {
  const text = String(value || '');
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/** Date → значение для start_at/due_at: «2026-11-12T14:30:00» (локальное время) */
function toInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/** Разница в календарных днях (без влияния часовых поясов/DST) */
function dayDiff(from, to) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / 86_400_000);
}

function toDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default function CalendarView({
  tasks = [],
  meetings = [],
  numberById,
  onTaskClick,
  onMeetingClick,
  onSlotSelect,
  onTaskDateChange,
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [periodTitle, setPeriodTitle] = useState('');
  const [activeView, setActiveView] = useState('dayGridMonth');
  const calendarRef = useRef(null);

  const taskEvents = tasks.flatMap((task) => {
    const dueRaw = getDueValue(task);
    if (!dueRaw) return [];

    const dueDate = parseDateValue(dueRaw);
    if (!dueDate) return [];

    const startDate = task.start_at ? parseDateValue(task.start_at) : null;
    const hasStart = startDate && startDate < dueDate ? startDate : null;
    const effectiveStart = hasStart || dueDate;
    const multiDay = dayDiff(effectiveStart, dueDate) > 0;
    const dueDateOnly = isDateOnly(dueRaw);
    // Многодневные задачи рисуем полосой «весь день», чтобы они были видны
    // на каждом дне и в месяце, и в неделе. Внутри одного дня — по времени.
    const timed = !dueDateOnly && !multiDay;

    const number = numberById?.get(task.id);
    const priority = getPriority(task.priority);
    const colors = PRIORITY_COLORS[priority.value] ?? PRIORITY_COLORS[0];
    const title = number != null ? `№${number} · ${task.title || 'Без названия'}` : task.title || 'Без названия';
    const extendedProps = { isPrivate: Boolean(task.is_private) };

    if (!timed) {
      return [
        {
          id: task.id,
          title,
          start: toDateOnly(startOfDay(effectiveStart)),
          // FullCalendar считает end all-day события исключающим,
          // поэтому добавляем день: срок «завтра» входит в показ.
          end: toDateOnly(addDays(startOfDay(dueDate), 1)),
          allDay: true,
          ...colors,
          extendedProps,
        },
      ];
    }

    let startsAt = hasStart || dueDate;
    let endsAt = hasStart ? dueDate : new Date(dueDate.getTime() + 60 * 60 * 1000);
    if (!(endsAt > startsAt)) endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);

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

  const meetingEvents = meetings
    .filter((meeting) => meeting.status === 'scheduled')
    .map((meeting) => ({
      id: `meeting-${meeting.id}`,
      title: `Встреча · ${meeting.title}`,
      start: toInputValue(parseDateValue(meeting.start_at)),
      end: toInputValue(parseDateValue(meeting.end_at)),
      allDay: false,
      backgroundColor: '#0ea5e9',
      borderColor: '#0284c7',
      eventOrder: '00-meeting',
      editable: false,
      startEditable: false,
      durationEditable: false,
      extendedProps: { isMeeting: true, meetingId: meeting.id },
    }));

  const events = [...taskEvents, ...meetingEvents];

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

  /** Перетаскивание задачи на другой день/время: сдвигаем сроки и сохраняем */
  const handleEventDrop = async (info) => {
    const task = tasks.find((item) => item.id === info.event.id);
    const oldStart = info.oldEvent.start;
    const newStart = info.event.start;
    const dueRaw = getDueValue(task);
    const dueDate = parseDateValue(dueRaw);
    const startDate = task?.start_at ? parseDateValue(task.start_at) : null;

    if (!task || !onTaskDateChange || !dueDate || !oldStart || !newStart) {
      info.revert();
      return;
    }

    let deltaDays = 0;
    let deltaMs = 0;

    if (info.event.allDay) {
      deltaDays = dayDiff(oldStart, newStart);
      if (!deltaDays) return;
    } else {
      deltaMs = newStart.getTime() - oldStart.getTime();
      if (!deltaMs) return;
    }

    const shift = (value, dateOnly) => {
      const date = parseDateValue(value);
      if (!date) return null;
      const next = info.event.allDay ? addDays(date, deltaDays) : new Date(date.getTime() + deltaMs);
      return dateOnly ? toDateOnly(next) : toInputValue(next);
    };

    const patch = { due_at: shift(dueRaw, isDateOnly(dueRaw)) };
    if (startDate && startDate < dueDate) {
      patch.start_at = shift(task.start_at, isDateOnly(task.start_at));
    }

    try {
      const saved = await onTaskDateChange(task.id, patch);
      if (saved === false) info.revert();
    } catch {
      info.revert();
    }
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
          editable
          eventDurationEditable={false}
          eventDragMinDistance={5}
          eventDrop={handleEventDrop}
          events={events}
          eventClick={(info) => {
            if (info.event.extendedProps?.isMeeting) {
              const meeting = meetings.find((item) => item.id === info.event.extendedProps.meetingId);
              if (meeting && onMeetingClick) onMeetingClick(meeting);
              return;
            }
            const task = tasks.find((item) => item.id === info.event.id);
            if (task && onTaskClick) onTaskClick(task);
          }}
          headerToolbar={false}
          height="100%"
          dayMaxEvents={6}
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
            setPeriodTitle(capitalizeFirst(arg.view.title));
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
