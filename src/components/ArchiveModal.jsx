import { X, RotateCcw, Archive } from 'lucide-react';

export default function ArchiveModal({ isOpen, onClose, archivedTasks, onRestore }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[85vh] flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Archive size={24} /> Архив задач
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X size={24} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-2">
          {archivedTasks.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              <p>Архив пуст</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {archivedTasks.map(task => (
                <li key={task.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-900 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">{task.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Удалено: {new Date(task.deleted_at).toLocaleDateString('ru-RU')}
                    </p>
                  </div>
                  <button 
                    onClick={() => onRestore(task.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 dark:text-blue-400 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded-lg transition-colors"
                  >
                    <RotateCcw size={16} /> Восстановить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}