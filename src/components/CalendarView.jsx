import { useState, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function CalendarView({ tasks, onTaskClick, onDateClick }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const calendarRef = useRef(null);

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

  // Форматируем дату: "Ноябрь 2026 г."
  const formattedTitle = currentDate.toLocaleDateString('ru-RU', {
    month: 'long',
    year: 'numeric',
  });
  // Делаем первую букву заглавной (месяц)
  const titleWithCapital = formattedTitle.charAt(0).toUpperCase() + formattedTitle.slice(1);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl p-4 border border-gray-300 dark:border-gray-700 shadow-sm h-[calc(100vh-140px)] overflow-auto calendar-container mx-auto max-w-6xl flex flex-col">
      
      {/* Шапка календаря (наша, кастомная) */}
      <div className="flex justify-between items-center mb-4 px-2">
        <div className="flex gap-2">
          <button 
            onClick={() => calendarRef.current?.getApi().prev()}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            <ChevronLeft size={20} />
          </button>
          <button 
            onClick={() => calendarRef.current?.getApi().next()}
            className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
          >
            <ChevronRight size={20} />
          </button>
          <button 
            onClick={() => calendarRef.current?.getApi().today()}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium transition-colors ml-2"
          >
            Сегодня
          </button>
        </div>

        {/* Наш заголовок с маленькой "г." */}
        <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {titleWithCapital}
        </h2>

        <div className="flex gap-2">
          <button 
            onClick={() => calendarRef.current?.getApi().changeView('dayGridMonth')}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Месяц
          </button>
          <button 
            onClick={() => calendarRef.current?.getApi().changeView('dayGridWeek')}
            className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium transition-colors"
          >
            Неделя
          </button>
        </div>
      </div>

      {/* Сам календарь (без встроенной шапки) */}
      <div className="flex-1">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ru"
          events={events}
          eventClick={(info) => {
            const task = tasks.find(t => t.id === info.event.id);
            if (task && onTaskClick) onTaskClick(task);
          }}
          dateClick={(info) => {
            if (onDateClick) onDateClick(info.dateStr);
          }}
          headerToolbar={false} // <-- Отключаем встроенную шапку
          datesSet={(arg) => {
            // Обновляем нашу дату при переключении месяца
            setCurrentDate(arg.view.currentStart);
          }}
          height="100%"
        />
      </div>
    </div>
  );
}