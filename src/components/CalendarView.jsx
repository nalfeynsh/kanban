import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

export default function CalendarView({ tasks, onTaskClick, onDateClick }) {
  // Преобразуем задачи в формат, понятный FullCalendar
  const events = tasks
    .filter(task => task.date)
    .map(task => ({
      id: task.id,
      title: task.title,
      date: task.date,
      backgroundColor: '#3b82f6', 
      borderColor: '#2563eb',
    }));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-300 dark:border-gray-700 shadow-sm h-[calc(100vh-140px)] overflow-auto calendar-container">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale="ru"
        events={events}
        eventClick={(info) => {
          const task = tasks.find(t => t.id === info.event.id);
          if (task && onTaskClick) onTaskClick(task);
        }}
        dateClick={(info) => {
          // info.dateStr возвращает дату в формате "2026-10-28"
          if (onDateClick) onDateClick(info.dateStr);
        }}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek'
        }}
        buttonText={{
          today: 'Сегодня',
          month: 'Месяц',
          week: 'Неделя'
        }}
        height="100%"
      />
    </div>
  );
}