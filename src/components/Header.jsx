import ThemeToggle from './ThemeToggle';
import { LayoutDashboard, Calendar as CalendarIcon, LogOut, User, Lock, Users, Archive } from 'lucide-react';

export default function Header({ theme, onToggleTheme, currentView, onViewChange, onLogout, user, profile, onProfileClick, filterMode, onFilterChange, onArchiveClick }) {
  return (
    <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Logo" className="w-8 h-8 object-contain" />
          <h1 className="font-bold text-lg text-gray-900 dark:text-gray-100">Мой Канбан</h1>
        </div>

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

        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 ml-2">
          <button
            onClick={() => onFilterChange('team')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filterMode === 'team' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Users size={16} /> Команда
          </button>
          <button
            onClick={() => onFilterChange('personal')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              filterMode === 'personal' 
                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Lock size={16} /> Личное
          </button>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Кнопка Архива с подписью */}
        <button 
          onClick={onArchiveClick}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
          title="Архив задач"
        >
          <Archive size={18} />
          <span className="hidden sm:inline">Архив</span> {/* <-- Подпись */}
        </button>

        {user && (
          <button 
            onClick={onProfileClick}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 px-2 py-1 rounded-lg transition-colors"
            title="Настройки профиля"
          >
            <div 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white"
              style={{ backgroundColor: profile?.color || '#3b82f6' }}
            >
              <User size={16} />
            </div>
            <span className="hidden sm:block max-w-[150px] truncate">
              {profile?.full_name || user.email}
            </span>
          </button>
        )}

        <button 
          onClick={onLogout}
          className="p-2 rounded-full hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 transition-colors"
          title="Выйти"
        >
          <LogOut size={20} />
        </button>

        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}