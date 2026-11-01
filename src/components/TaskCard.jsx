import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, Lock, Trash2 } from 'lucide-react';

export default function TaskCard({ task, onClick, onDelete }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 1,
    position: 'relative',
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`bg-gray-50 dark:bg-gray-800 p-3 rounded-lg shadow-md border border-gray-300 dark:border-gray-600 mb-2 hover:border-blue-400 dark:hover:border-blue-500 transition-colors flex flex-col relative ${
        isDragging ? 'shadow-2xl ring-2 ring-blue-500' : ''
      }`}
    >
      {/* Верхняя часть: теги и замок */}
      <div className="flex justify-between items-start gap-2 mb-2">
        <div className="flex flex-wrap gap-1">
          {task.tags?.map((tag, i) => (
            <span key={i} className={`${tag.color} text-white text-xs px-2 py-0.5 rounded font-medium shadow-sm`}>
              {tag.text}
            </span>
          ))}
        </div>
        {task.is_private && (
          <div className="text-gray-400 dark:text-gray-500 flex-shrink-0" title="Личная задача">
            <Lock size={14} />
          </div>
        )}
      </div>
      
      {/* Название задачи */}
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-4">{task.title}</p>
      
      {/* Дата (слева внизу) */}
      {task.date && (
        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 font-medium mb-1">
          <Calendar size={12} className="mr-1" /> {task.date}
        </div>
      )}

      {/* Кнопка удаления (абсолютно в правом нижнем углу) */}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          className="absolute bottom-2 right-2 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 transition-colors p-1"
          title="Удалить задачу"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}