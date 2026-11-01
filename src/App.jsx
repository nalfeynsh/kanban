import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import Header from './components/Header';
import Column from './components/Column';
import CalendarView from './components/CalendarView';
import TaskDetailModal from './components/TaskDetailModal';
import LoginPage from './components/LoginPage';
import ProfileModal from './components/ProfileModal';
import ArchiveModal from './components/ArchiveModal';
import TaskCard from './components/TaskCard';
import { supabase } from './supabaseClient';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [currentView, setCurrentView] = useState('board');
  const [filterMode, setFilterMode] = useState('team');
  
  const [activeTask, setActiveTask] = useState(null);

  // --- Логика темы ---
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  // --- ПРОВЕРКА АВТОРИЗАЦИИ ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else {
        setProfile(null);
        setAllProfiles([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); 
    
    if (data) {
      setProfile(data);
    }
  };

  // --- Загрузка данных ---
  useEffect(() => {
    if (!session) return;

    let isMounted = true;

    async function fetchData() {
      try {
        const [
          { data: colsData, error: colsError },
          { data: tasksData, error: tasksError },
          { data: archiveData, error: archiveError },
          { data: profilesData }
        ] = await Promise.all([
          supabase.from('columns').select('*').order('position', { ascending: true }),
          supabase.from('tasks').select('*').is('deleted_at', null).order('position', { ascending: true }),
          supabase.from('tasks').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
          supabase.from('profiles').select('*')
        ]);

        if (colsError) throw colsError;
        if (tasksError) throw tasksError;
        if (archiveError) throw archiveError;

        if (isMounted && colsData && tasksData) {
          const safeTasksData = tasksData.map(task => ({
            ...task,
            links: Array.isArray(task.links) ? task.links : [],
            files: Array.isArray(task.files) ? task.files : []
          }));

          setColumns(colsData);
          setTasks(safeTasksData);
          
          if (archiveData) setArchivedTasks(archiveData);
          if (profilesData) setAllProfiles(profilesData);
        }
      } catch (error) {
        console.error("Ошибка при загрузке данных:", error);
        if (isMounted) alert("Ошибка базы данных: " + error.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    
    fetchData();

    return () => {
      isMounted = false;
    };
  }, [session]);

  // --- ФИЛЬТРАЦИЯ ЗАДАЧ ---
  const visibleTasks = tasks.filter(task => {
    if (filterMode === 'personal') {
      return task.is_private === true;
    } else {
      return task.is_private === false;
    }
  });

  const filteredColumns = columns.map(col => ({
    ...col,
    taskIds: visibleTasks.filter(t => t.column_id === col.id).map(t => t.id)
  }));

  // --- Логика Drag-and-Drop ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragStart = (event) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) setActiveTask(task);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const sourceCol = filteredColumns.find((col) => col.taskIds.includes(activeId));
    const destCol = filteredColumns.find(
      (col) => col.id === overId || col.taskIds.includes(overId)
    );

    if (!sourceCol || !destCol) return;

    let newColumns = [];
    if (sourceCol.id === destCol.id) {
      const oldIndex = sourceCol.taskIds.indexOf(activeId);
      const newIndex = sourceCol.taskIds.indexOf(overId);
      if (newIndex === -1) return;

      const newTaskIds = Array.from(sourceCol.taskIds);
      newTaskIds.splice(oldIndex, 1);
      newTaskIds.splice(newIndex, 0, activeId);

      newColumns = filteredColumns.map((col) =>
        col.id === sourceCol.id ? { ...col, taskIds: newTaskIds } : col
      );
    } else {
      const sourceIds = sourceCol.taskIds.filter((id) => id !== activeId);
      const destIds = [...destCol.taskIds];
      const overIndex = destIds.indexOf(overId);

      if (overIndex !== -1) {
        destIds.splice(overIndex, 0, activeId);
      } else {
        destIds.push(activeId);
      }

      newColumns = filteredColumns.map((col) => {
        if (col.id === sourceCol.id) return { ...col, taskIds: sourceIds };
        if (col.id === destCol.id) return { ...col, taskIds: destIds };
        return col;
      });
    }

    const destTaskIds = newColumns.find(c => c.id === destCol.id).taskIds;
    const newPosition = destTaskIds.indexOf(activeId);

    await supabase
      .from('tasks')
      .update({ 
        column_id: destCol.id, 
        position: newPosition 
      })
      .eq('id', activeId);

    setTasks(prevTasks => 
      prevTasks.map(t => t.id === activeId ? { ...t, column_id: destCol.id, position: newPosition } : t)
    );
  };

  const handleDateClick = (dateStr) => {
    setSelectedTask({ 
      date: dateStr, 
      column_id: columns[0]?.id,
      is_private: filterMode === 'personal'
    });
  };

  // --- Логика СОХРАНЕНИЯ ---
  const handleSaveTask = async (taskToSave, columnId) => {
    if (!taskToSave.id) {
      const currentTasks = tasks.filter(t => t.column_id === columnId);
      const newPosition = currentTasks.length;

      const { data, error } = await supabase
        .from('tasks')
        .insert([{ 
          title: taskToSave.title, 
          description: taskToSave.description,
          date: taskToSave.date || null,
          links: taskToSave.links || [],
          files: taskToSave.files || [],
          column_id: columnId, 
          position: newPosition,
          created_by: session.user.id,
          is_private: taskToSave.is_private || false
        }])
        .select();

      if (error) {
        console.error("Ошибка при создании:", error);
        alert("Не удалось создать задачу: " + error.message);
        return;
      }

      if (data && data[0]) {
        const newTask = data[0];
        setTasks([...tasks, newTask]);
      }
    } else {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          title: taskToSave.title, 
          description: taskToSave.description,
          date: taskToSave.date || null,
          links: taskToSave.links || [],
          files: taskToSave.files || [],
          is_private: taskToSave.is_private
        })
        .eq('id', taskToSave.id);

      if (error) {
        console.error("Ошибка при обновлении:", error);
        alert("Ошибка сохранения: " + error.message);
        return;
      }

      setTasks(prevTasks => 
        prevTasks.map(t => t.id === taskToSave.id ? { ...t, ...taskToSave } : t)
      );
    }
    setSelectedTask(null);
  };

  // --- Логика МЯГКОГО УДАЛЕНИЯ ---
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Переместить задачу в архив?")) return;

    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', taskId);

    if (error) {
      console.error("Ошибка при удалении:", error);
      alert("Не удалось переместить в архив: " + error.message);
      return;
    }

    const taskToArchive = tasks.find(t => t.id === taskId);
    if (taskToArchive) {
      setArchivedTasks([taskToArchive, ...archivedTasks]);
      setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
    }
    
    setSelectedTask(null); 
  };

  const handleRestoreTask = async (taskId) => {
    const { error } = await supabase
      .from('tasks')
      .update({ deleted_at: null })
      .eq('id', taskId);

    if (error) {
      console.error("Ошибка при восстановлении:", error);
      alert("Не удалось восстановить задачу: " + error.message);
      return;
    }

    const taskToRestore = archivedTasks.find(t => t.id === taskId);
    if (taskToRestore) {
      setTasks([...tasks, taskToRestore]);
      setArchivedTasks(prev => prev.filter(t => t.id !== taskId));
    }
  };

  // --- ЛОГИКА ВЫХОДА ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAllProfiles([]);
    setColumns([]);
    setTasks([]);
    setArchivedTasks([]);
    setLoading(true);
  };

  if (!session) {
    return <LoginPage />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-200 dark:bg-gray-950 flex items-center justify-center">
        <h1 className="text-xl font-bold text-gray-700 dark:text-gray-300">Загрузка данных из базы...</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
      <Header 
        theme={theme} 
        onToggleTheme={toggleTheme} 
        currentView={currentView} 
        onViewChange={setCurrentView}
        onLogout={handleLogout}
        user={session.user}
        profile={profile}
        onProfileClick={() => setIsProfileOpen(true)}
        filterMode={filterMode}
        onFilterChange={setFilterMode}
        onArchiveClick={() => setIsArchiveOpen(true)}
      />

      <main className="p-6 overflow-x-auto flex-1">
        {currentView === 'board' && (
          <DndContext 
            sensors={sensors} 
            collisionDetection={closestCenter} 
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 items-start justify-center">
              <SortableContext items={filteredColumns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {filteredColumns.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    tasks={visibleTasks.filter((t) => col.taskIds.includes(t.id))}
                    onTaskClick={setSelectedTask}
                    onAddNewTask={() => setSelectedTask({ 
                      column_id: col.id, 
                      is_private: filterMode === 'personal' 
                    })}
                    onDeleteTask={handleDeleteTask} // <-- ПЕРЕДАЕМ ФУНКЦИЮ УДАЛЕНИЯ
                  />
                ))}
              </SortableContext>
            </div>
            
            <DragOverlay>
              {activeTask ? (
                <TaskCard task={activeTask} onClick={() => {}} onDelete={() => {}} />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {currentView === 'calendar' && (
          <CalendarView 
            tasks={visibleTasks} 
            onTaskClick={setSelectedTask} 
            onDateClick={handleDateClick} 
          />
        )}
      </main>

      <TaskDetailModal 
        key={selectedTask?.id || 'new'}
        isOpen={!!selectedTask} 
        onClose={() => setSelectedTask(null)} 
        task={selectedTask} 
        onSaveTask={handleSaveTask} 
        onDeleteTask={handleDeleteTask} 
        allProfiles={allProfiles}
      />

      <ProfileModal 
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
        onUpdateProfile={(updatedProfile) => setProfile(updatedProfile)}
      />

      <ArchiveModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        archivedTasks={archivedTasks}
        onRestore={handleRestoreTask}
      />
    </div>
  );
}