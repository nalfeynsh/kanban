import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar } from 'lucide-react';

export default function TaskCard({ task, onClick }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg shadow-md border border-gray-300 dark:border-gray-600 mb-2 cursor-grab active:cursor-grabbing hover:border-blue-400 dark:hover:border-blue-500 transition-colors"
    >
      <div className="flex flex-wrap gap-1 mb-2">
        {task.tags?.map((tag, i) => (
          <span key={i} className={`${tag.color} text-white text-xs px-2 py-0.5 rounded font-medium shadow-sm`}>
            {tag.text}
          </span>
        ))}
      </div>
      
      <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{task.title}</p>
      
      {task.date && (
        <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
          <Calendar size={12} className="mr-1" /> {task.date}
        </div>
      )}
    </div>
  );
}