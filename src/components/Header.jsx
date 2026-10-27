import ThemeToggle from './ThemeToggle';
import { LayoutDashboard, Calendar as CalendarIcon } from 'lucide-react';

export default function Header({ theme, onToggleTheme, currentView, onViewChange }) {
  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-blue-600 rounded"></div>
          <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">Мой Канбан</h1>
        </div>

        {/* Кнопки переключения видов */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          <button
            onClick={() => onViewChange('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentView === 'board' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <LayoutDashboard size={16} /> Канбан
          </button>
          <button
            onClick={() => onViewChange('calendar')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              currentView === 'calendar' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <CalendarIcon size={16} /> Календарь
          </button>
        </div>
      </div>
      
      <ThemeToggle theme={theme} onToggle={onToggleTheme} />
    </header>
  );
}