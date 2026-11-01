import { useState, useEffect } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import Header from './components/Header';
import Column from './components/Column';
import CalendarView from './components/CalendarView';
import TaskDetailModal from './components/TaskDetailModal';
import LoginPage from './components/LoginPage';
import ProfileModal from './components/ProfileModal';
import { supabase } from './supabaseClient';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allProfiles, setAllProfiles] = useState([]);
  
  const [selectedTask, setSelectedTask] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentView, setCurrentView] = useState('board');

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

  // --- Загрузка профиля текущего пользователя ---
  const fetchProfile = async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle(); 
    
    if (data) {
      setProfile(data);
    } else {
      // Если профиля нет, создаем его
      console.log("Профиль не найден, создаем новый...");
      const { error: createError } = await supabase
        .from('profiles')
        .insert([{ 
          id: userId, 
          full_name: session?.user?.email || 'Новый пользователь',
          work_email: session?.user?.email 
        }]);

      if (!createError) {
        const { data: createdProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (createdProfile) setProfile(createdProfile);
      }
    }
  };

  // --- Загрузка данных (задачи + все профили) ---
  useEffect(() => {
    if (!session) return;

    let isMounted = true;

    async function fetchData() {
      try {
        const [
          { data: colsData, error: colsError },
          { data: tasksData, error: tasksError },
          { data: profilesData }
        ] = await Promise.all([
          supabase.from('columns').select('*').order('position', { ascending: true }),
          supabase.from('tasks').select('*').order('position', { ascending: true }),
          supabase.from('profiles').select('*')
        ]);

        if (colsError) throw colsError;
        if (tasksError) throw tasksError;

        if (isMounted && colsData && tasksData) {
          const safeTasksData = tasksData.map(task => ({
            ...task,
            links: Array.isArray(task.links) ? task.links : [],
            files: Array.isArray(task.files) ? task.files : []
          }));

          const colsWithTasks = colsData.map(col => ({
            ...col,
            taskIds: safeTasksData.filter(t => t.column_id === col.id).map(t => t.id)
          }));
          setColumns(colsWithTasks);
          setTasks(safeTasksData);
          
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

  // --- Логика Drag-and-Drop ---
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;
    if (activeId === overId) return;

    const sourceCol = columns.find((col) => col.taskIds.includes(activeId));
    const destCol = columns.find(
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

      newColumns = columns.map((col) =>
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

      newColumns = columns.map((col) => {
        if (col.id === sourceCol.id) return { ...col, taskIds: sourceIds };
        if (col.id === destCol.id) return { ...col, taskIds: destIds };
        return col;
      });
    }

    setColumns(newColumns);

    const destTaskIds = newColumns.find(c => c.id === destCol.id).taskIds;
    const newPosition = destTaskIds.indexOf(activeId);

    await supabase
      .from('tasks')
      .update({ 
        column_id: destCol.id, 
        position: newPosition 
      })
      .eq('id', activeId);
  };

  const handleDateClick = (dateStr) => {
    setSelectedTask({ 
      date: dateStr, 
      column_id: columns[0]?.id 
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
          created_by: session.user.id
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
        
        setColumns(prevCols => 
          prevCols.map(col => 
            col.id === columnId 
              ? { ...col, taskIds: [...col.taskIds, newTask.id] } 
              : col
          )
        );
      }
    } else {
      const { error } = await supabase
        .from('tasks')
        .update({ 
          title: taskToSave.title, 
          description: taskToSave.description,
          date: taskToSave.date || null,
          links: taskToSave.links || [],
          files: taskToSave.files || []
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

  // --- Логика удаления задачи ---
  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Вы уверены, что хотите удалить эту задачу?")) return;

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', taskId);

    if (error) {
      console.error("Ошибка при удалении:", error);
      alert("Не удалось удалить задачу: " + error.message);
      return;
    }

    setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
    setColumns(prevCols => 
      prevCols.map(col => ({
        ...col,
        taskIds: col.taskIds.filter(id => id !== taskId)
      }))
    );
    setSelectedTask(null); 
  };

  // --- ЛОГИКА ВЫХОДА ---
  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAllProfiles([]);
    setColumns([]);
    setTasks([]);
    setLoading(true);
  };

  // --- РЕНДЕР ---
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
      />

      <main className="p-6 overflow-x-auto flex-1">
        {currentView === 'board' && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 items-start justify-center">
              <SortableContext items={columns.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                {columns.map((col) => (
                  <Column
                    key={col.id}
                    column={col}
                    tasks={tasks.filter((t) => col.taskIds.includes(t.id))}
                    onTaskClick={setSelectedTask}
                    onAddNewTask={() => setSelectedTask({ column_id: col.id })}
                  />
                ))}
              </SortableContext>
            </div>
          </DndContext>
        )}

        {currentView === 'calendar' && (
          <CalendarView 
            tasks={tasks} 
            onTaskClick={setSelectedTask} 
            onDateClick={handleDateClick} 
          />
        )}
      </main>

      {/* Модалка задачи с ключом для полного пересоздания */}
      <TaskDetailModal 
        key={selectedTask?.id || 'new'}
        isOpen={!!selectedTask} 
        onClose={() => setSelectedTask(null)} 
        task={selectedTask} 
        onSaveTask={handleSaveTask} 
        onDeleteTask={handleDeleteTask} 
        allProfiles={allProfiles}
      />

      {/* Модалка профиля */}
      <ProfileModal 
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
        profile={profile}
        onUpdateProfile={(updatedProfile) => setProfile(updatedProfile)}
      />
    </div>
  );
}