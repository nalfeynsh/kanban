import { Sun, Moon } from 'lucide-react';

export default function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
      title="Переключить тему"
    >
      {/* Если тема светлая, показываем луну (чтобы переключить на темную) */}
      {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}