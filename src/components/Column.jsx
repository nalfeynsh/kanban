import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import TaskCard from './TaskCard';

export default function Column({ column, tasks, onTaskClick, onAddNewTask }) {
  const { setNodeRef } = useSortable({ id: column.id, data: { type: 'Column' } });

  return (
    <div className="bg-white dark:bg-gray-900 w-72 flex-shrink-0 rounded-xl p-3 flex flex-col max-h-[calc(100vh-140px)] border border-gray-300 dark:border-gray-700 shadow-sm">
      
      <div className="flex justify-between items-center mb-3 px-1 border-b border-gray-100 dark:border-gray-800 pb-2">
        <h2 className="font-semibold text-gray-800 dark:text-gray-200">{column.title}</h2>
        <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
          {tasks.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex-1 overflow-y-auto min-h-[100px]">
        <SortableContext id={column.id} items={column.taskIds} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard 
              key={task.id} 
              task={task} 
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>

      <button 
        onClick={onAddNewTask}
        className="flex items-center text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 mt-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Plus size={16} className="mr-1" /> Добавить задачу
      </button>
    </div>
  );
}