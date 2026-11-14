import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { AlertTriangle, X, ListChecks, AlarmClock, UserRound, Loader2, LayoutGrid, CheckSquare } from 'lucide-react';

import Header from './components/Header';
import Column from './components/Column';
import CalendarView from './components/CalendarView';
import GanttView from './components/GanttView';
import TaskDetailModal from './components/TaskDetailModal';
import LoginPage from './components/LoginPage';
import ProfileModal from './components/ProfileModal';
import ArchiveModal from './components/ArchiveModal';
import TeamModal from './components/TeamModal';
import MemberProfileModal from './components/MemberProfileModal';
import BulkActions from './components/BulkActions';
import ChatModal from './components/ChatModal';
import HelpModal from './components/HelpModal';
import Toasts from './components/Toasts';
import MeetingModal from './components/MeetingModal';
import MeetingsModal from './components/MeetingsModal';
import MeetingDetailsModal from './components/MeetingDetailsModal';
import MeetingChatModal from './components/MeetingChatModal';
import MeetingRoomPage from './components/MeetingRoomPage';
import {
  notificationPermission,
  playChime,
  requestNotifications,
  showSystemNotification,
  unlockAudio,
} from './lib/notifications';
import { TaskCardView } from './components/TaskCard';
import { supabase } from './supabaseClient';
import { collectFields, mergeFields, pickFields, profileFields, supports, taskFields } from './lib/schema';
import { buildTaskQuote, stripTaskMarker } from './lib/quote';
import { readOAuthError, explainOAuthError, cleanOAuthUrl } from './lib/oauth';
import { canSeeTask, matchesMode } from './lib/access';
import { byPosition, isTaskOverdue } from './lib/format';
import { normalizePriority } from './lib/priority';
import { clearLocalTelegram, getLocalTelegram, setLocalTelegram } from './lib/localProfile';
import { applyTaskUpdates, planTaskMove } from './lib/dnd';

/** Приводим задачу к безопасному виду (старые записи могут иметь null) */
function sanitizeTask(task) {
  if (!task) return task;
  return {
    ...task,
    links: Array.isArray(task.links) ? task.links : [],
    files: Array.isArray(task.files) ? task.files : [],
    position: Number.isFinite(Number(task.position)) ? Number(task.position) : 0,
    is_private: task.is_private === true,
  };
}

function initialsOf(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [columns, setColumns] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState('');
  const [oauthNotice, setOauthNotice] = useState(() => {
    const error = readOAuthError();
    if (!error) return '';
    const info = explainOAuthError(error);
    return `${info?.title || 'Вход не завершён'}. ${info?.text || error.description || error.code}`;
  });

  const [selectedTask, setSelectedTask] = useState(null);
  const [draftKey, setDraftKey] = useState(0);
  const [selectedMember, setSelectedMember] = useState(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isTeamOpen, setIsTeamOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMeetingsOpen, setIsMeetingsOpen] = useState(false);
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [meetingChat, setMeetingChat] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [meetingParticipants, setMeetingParticipants] = useState([]);
  const [meetingsSupported, setMeetingsSupported] = useState(true);
  const [chatPeerId, setChatPeerId] = useState(null);
  const [chatConversationId, setChatConversationId] = useState(null);
  const [chatDraft, setChatDraft] = useState('');
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    try {
      return localStorage.getItem('kanban.notifications') !== 'off';
    } catch {
      return true;
    }
  });
  const [notificationsPermission, setNotificationsPermission] = useState(() => notificationPermission());
  const [roleSaving, setRoleSaving] = useState(false);

  const [currentView, setCurrentView] = useState('board');
  const [filterMode, setFilterMode] = useState('all');
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [memberFilter, setMemberFilter] = useState(null);
  const [activeTask, setActiveTask] = useState(null);
  const lastOverRef = useRef(null);
  const doneCleanupRef = useRef(false);
  const meetingRemindedRef = useRef(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const [taskSchema, setTaskSchema] = useState(new Set());
  const [profileSchema, setProfileSchema] = useState(new Set());

  const userId = session?.user?.id ?? null;
  const userEmail = session?.user?.email ?? '';
  const roomToken = useMemo(() => {
    const match = window.location.pathname.match(/^\/meet\/([^/]+)\/?$/);
    return match ? decodeURIComponent(match[1]) : null;
  }, []);

  // --- Тема ---
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  // --- Авторизация ---
  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data: { session: nextSession } }) => {
      if (!alive) return;
      setSession(nextSession);
      if (!nextSession) setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) {
        setProfile(null);
        setAllProfiles([]);
        setColumns([]);
        setTasks([]);
        setArchivedTasks([]);
        setSelectedTask(null);
        setMeetings([]);
        setMeetingParticipants([]);
        setSelectedMeeting(null);
        setMeetingChat(null);
        setMemberFilter(null);
        setLoading(false);
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  // Ошибку OAuth из URL показываем один раз и убираем из адреса.
  // Параллельно отправляем её на сервер — так видно точный текст ошибки
  // даже если пользователь не открывает DevTools.
  useEffect(() => {
    const error = readOAuthError();
    if (!error) return;
    fetch('/client-oauth-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: error.code,
        description: error.description,
        href: window.location.href,
      }),
    }).catch(() => {});
    cleanOAuthUrl();
  }, []);

  // --- Профиль ---
  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (!alive) return;
      if (error) {
        setBanner(`Профиль не загружен: ${error.message}`);
        return;
      }

      if (data) {
        let merged = data;
        const localTelegram = getLocalTelegram(userId);

        if (localTelegram) {
          if ('telegram' in data) {
            // Колонка уже есть: переносим локальное значение в базу
            if (!data.telegram) {
              const { error: syncError } = await supabase
                .from('profiles')
                .update({ telegram: localTelegram })
                .eq('id', userId);
              if (!syncError) {
                merged = { ...data, telegram: localTelegram };
                clearLocalTelegram(userId);
              }
            } else {
              clearLocalTelegram(userId);
            }
          } else {
            // Колонки ещё нет — показываем локальное значение
            merged = { ...data, telegram: localTelegram };
          }
        }

        if (!alive) return;
        setProfile(merged);
        setProfileSchema((prev) => mergeFields(prev, collectFields([merged])));
        return;
      }

      // Строки профиля может не быть (триггер не сработал) — создаём её сами.
      const seed = {
        id: userId,
        full_name: userEmail ? userEmail.split('@')[0] : 'Сотрудник',
      };
      const { data: created, error: createError } = await supabase
        .from('profiles')
        .upsert(seed, { onConflict: 'id' })
        .select()
        .maybeSingle();

      if (!alive) return;
      if (createError) {
        // Модалка всё равно должна открываться — работаем с тем, что есть
        setProfile(seed);
        setProfileSchema((prev) => mergeFields(prev, collectFields([seed])));
        setBanner(
          `Профиль не создан автоматически: ${createError.message}. Примените RLS-политики из миграции.`,
        );
        return;
      }

      setProfile(created || seed);
      setProfileSchema((prev) => mergeFields(prev, collectFields([created || seed])));
    })();

    return () => {
      alive = false;
    };
  }, [userId, userEmail]);

  // --- Данные ---
  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      const [columnsResult, activeResult, archiveResult, profilesResult] = await Promise.all([
        supabase.from('columns').select('*').order('position', { ascending: true }),
        supabase.from('tasks').select('*').is('deleted_at', null).order('position', { ascending: true }),
        supabase.from('tasks').select('*').not('deleted_at', 'is', null).order('deleted_at', { ascending: false }),
        supabase.from('profiles').select('*'),
      ]);

      const firstError = [columnsResult.error, activeResult.error, archiveResult.error].find(Boolean);
      if (firstError) throw firstError;

      const activeRows = (activeResult.data ?? []).map(sanitizeTask);
      const archiveRows = (archiveResult.data ?? []).map(sanitizeTask);
      const profileRows = profilesResult.data ?? [];

      setColumns(columnsResult.data ?? []);
      setTasks(activeRows);
      setArchivedTasks(archiveRows);
      setAllProfiles(profileRows);
      setTaskSchema((prev) => mergeFields(prev, taskFields([...activeRows, ...archiveRows])));
      setProfileSchema((prev) => mergeFields(prev, profileFields([...profileRows, ...(profile ? [profile] : [])])));
      setBanner('');
    } catch (error) {
      setBanner(`Ошибка базы данных: ${error.message}`);
    } finally {
      setLoading(false);
    }
    // profile намеренно не в зависимостях: иначе цикл перезагрузок
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    // Загрузка данных — внешний побочный эффект; setState происходит после await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  // --- Встречи (Phase 1 ВКС) ---
  const loadMeetings = useCallback(async () => {
    if (!userId) return;
    const [meetingsResult, participantsResult] = await Promise.all([
      supabase.from('meetings').select('*').order('start_at', { ascending: true }),
      supabase.from('meeting_participants').select('*'),
    ]);
    const error = meetingsResult.error || participantsResult.error;
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code)) {
        setMeetingsSupported(false);
        return;
      }
      setBanner(`Встречи не загружены: ${error.message}`);
      return;
    }
    setMeetings(meetingsResult.data ?? []);
    setMeetingParticipants(participantsResult.data ?? []);
    setMeetingsSupported(true);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMeetings();
  }, [userId, loadMeetings]);

  const handleOpenMeeting = useCallback((meeting) => {
    setIsMeetingsOpen(false);
    setSelectedMeeting(meeting);
  }, []);

  // Напоминания о встречах: 30 и 5 минут. Работают, пока открыта вкладка.
  useEffect(() => {
    if (!userId || meetings.length === 0) return undefined;

    const checkReminders = () => {
      const now = Date.now();
      const stages = [
        { key: '30', minutes: 30, from: 29, label: 'через 30 минут' },
        { key: '5', minutes: 5, from: 4, label: 'через 5 минут' },
      ];

      meetings.forEach((meeting) => {
        if (meeting.status !== 'scheduled') return;
        const participation = meetingParticipants.find(
          (item) => item.meeting_id === meeting.id && item.user_id === userId,
        );
        if (!participation || participation.status === 'declined') return;

        const startsIn = (new Date(meeting.start_at).getTime() - now) / 60_000;
        stages.forEach((stage) => {
          if (startsIn > stage.minutes || startsIn <= stage.from) return;
          const reminderKey = `${meeting.id}:${stage.key}`;
          if (meetingRemindedRef.current.has(reminderKey)) return;
          meetingRemindedRef.current.add(reminderKey);

          const toast = {
            id: `meeting-toast-${reminderKey}`,
            meetingId: meeting.id,
            title: `Встреча ${stage.label}`,
            body: meeting.title,
            color: '#0ea5e9',
          };
          setToasts((prev) => [...prev.filter((item) => item.id !== toast.id), toast].slice(-3));
          playChime();
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((item) => item.id !== toast.id));
          }, 12_000);

          if (notificationsEnabled) {
            showSystemNotification({
              title: toast.title,
              body: toast.body,
              tag: toast.id,
              onClick: () => handleOpenMeeting(meeting),
            });
          }
        });
      });
    };

    checkReminders();
    const timer = window.setInterval(checkReminders, 30_000);
    return () => window.clearInterval(timer);
    // handleOpenMeeting стабилен (useCallback), meetings обновляют замыкание
  }, [meetings, meetingParticipants, userId, notificationsEnabled, handleOpenMeeting]);

  // Автоочистка «Готово»: задачи, пробывшие там дольше 3 дней, уходят в архив.
  // Основная проверка живёт в pg_cron (миграция 011); это дублирующий запуск
  // при входе администратора/менеджера на случай, если cron не установлен.
  useEffect(() => {
    if (doneCleanupRef.current) return;
    if (loading || !userId || !supports(taskSchema, 'done_at')) return;
    if (!['admin', 'manager'].includes(profile?.role)) return;

    const doneColumn = columns.find((column) =>
      /^(готово|done)$/i.test(String(column.title || '').trim()),
    );
    if (!doneColumn) return;

    doneCleanupRef.current = true;

    (async () => {
      const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
      const payload = { deleted_at: new Date().toISOString() };
      if (supports(taskSchema, 'deleted_by')) payload.deleted_by = userId;

      const { data, error } = await supabase
        .from('tasks')
        .update(payload)
        .eq('column_id', doneColumn.id)
        .is('deleted_at', null)
        .lt('done_at', cutoff)
        .select('*');

      if (error) {
        setBanner(`Не удалось очистить «Готово»: ${error.message}`);
        return;
      }

      const rows = (data ?? []).map(sanitizeTask);
      if (!rows.length) return;

      const ids = new Set(rows.map((task) => task.id));
      setTasks((prev) => prev.filter((task) => !ids.has(task.id)));
      setArchivedTasks((prev) => [...rows, ...prev]);
      setBanner(`Блок «Готово»: ${rows.length} задач(и) старше 3 дней перенесены в архив.`);
    })();
  }, [loading, userId, profile?.role, columns, taskSchema]);

  // --- Производные данные ---
  const authorById = useMemo(() => new Map(allProfiles.map((item) => [item.id, item])), [allProfiles]);

  const numberById = useMemo(() => {
    const ordered = [...tasks, ...archivedTasks].sort(
      (a, b) => (Date.parse(a.created_at) || 0) - (Date.parse(b.created_at) || 0),
    );
    const map = new Map();
    ordered.forEach((task, index) => {
      const explicit = Number(task.task_no);
      map.set(task.id, Number.isFinite(explicit) && task.task_no != null ? explicit : index + 1);
    });
    return map;
  }, [tasks, archivedTasks]);

  const doneColumnId = useMemo(
    () => columns.find((column) => /^(готово|done)$/i.test(String(column.title || '').trim()))?.id || null,
    [columns],
  );

  const scopedTasks = useMemo(
    () =>
      tasks.filter(
        (task) =>
          matchesMode(task, filterMode, userId) &&
          (!memberFilter || task.created_by === memberFilter.id),
      ),
    [tasks, filterMode, userId, memberFilter],
  );

  const overdueTasks = useMemo(
    () => scopedTasks.filter((task) => isTaskOverdue(task, doneColumnId)),
    [scopedTasks, doneColumnId],
  );

  const visibleTasks = useMemo(
    () => (overdueOnly ? overdueTasks : scopedTasks),
    [overdueOnly, overdueTasks, scopedTasks],
  );

  const boardColumns = useMemo(
    () =>
      columns.map((column) => ({
        ...column,
        tasks: visibleTasks.filter((task) => task.column_id === column.id).sort(byPosition),
      })),
    [columns, visibleTasks],
  );

  const archivedVisible = useMemo(
    () =>
      archivedTasks.filter(
        (task) =>
          canSeeTask(task, userId) && (!memberFilter || task.created_by === memberFilter.id),
      ),
    [archivedTasks, userId, memberFilter],
  );

  const taskCountByUser = useMemo(() => {
    const map = new Map();
    tasks.forEach((task) => {
      if (!task.created_by) return;
      map.set(task.created_by, (map.get(task.created_by) ?? 0) + 1);
    });
    return map;
  }, [tasks]);

  const stats = useMemo(() => {
    const personal = scopedTasks.filter((task) => task.is_private).length;
    return { total: scopedTasks.length, overdue: overdueTasks.length, personal };
  }, [scopedTasks, overdueTasks]);

  // Перетаскивание полос в Ганте возможно, только если есть и начало, и срок
  const canEditGantt = useMemo(
    () =>
      supports(taskSchema, 'start_at') &&
      (supports(taskSchema, 'due_at') || supports(taskSchema, 'date')),
    [taskSchema],
  );

  const canManageRoles = profile?.role === 'admin';

  const upcomingMeetingCount = useMemo(() => {
    const declined = new Set(
      meetingParticipants
        .filter((item) => item.user_id === userId && item.status === 'declined')
        .map((item) => item.meeting_id),
    );
    return meetings.filter(
      (meeting) => meeting.status === 'scheduled' && !declined.has(meeting.id),
    ).length;
  }, [meetings, meetingParticipants, userId]);

  const handleCreateMeeting = async ({ title, description, start_at, end_at, participantIds = [] }) => {    if (!userId) return false;
    const meetingId = crypto.randomUUID();
    const { error } = await supabase
      .from('meetings')
      .insert({
        id: meetingId,
        title,
        description,
        start_at,
        end_at,
        organizer_id: userId,
      });

    if (error) {
      setBanner(`Не удалось создать встречу: ${error.message}`);
      return false;
    }

    const inviteIds = participantIds.filter((id) => id !== userId);
    if (inviteIds.length > 0) {
      const { error: inviteError } = await supabase.from('meeting_participants').insert(
        inviteIds.map((id) => ({ meeting_id: meetingId, user_id: id, status: 'invited' })),
      );
      if (inviteError) {
        setBanner(`Встреча создана, но приглашения не отправлены: ${inviteError.message}`);
      }
    }

    await loadMeetings();
    return true;
  };

  const handleRespondMeeting = async (meetingId, status) => {
    if (!userId) return false;
    const { error } = await supabase
      .from('meeting_participants')
      .update({ status, responded_at: new Date().toISOString() })
      .eq('meeting_id', meetingId)
      .eq('user_id', userId);
    if (error) {
      setBanner(`Не удалось сохранить ответ: ${error.message}`);
      return false;
    }
    await loadMeetings();
    return true;
  };

  const handleCancelMeeting = async (meetingId) => {
    const { error } = await supabase
      .from('meetings')
      .update({ status: 'cancelled' })
      .eq('id', meetingId);
    if (error) {
      setBanner(`Не удалось отменить встречу: ${error.message}`);
      return false;
    }
    await loadMeetings();
    return true;
  };

  // --- Drag & Drop ---
  const visibleTaskIds = useMemo(() => new Set(visibleTasks.map((task) => task.id)), [visibleTasks]);
  const columnIdSet = useMemo(() => new Set(columns.map((column) => column.id)), [columns]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  /**
   * Коллизии: сначала ищем карточку под курсором, потом колонку.
   * Без этого пустая область колонки не принимала задачу,
   * а карточка из другой колонки не находилась.
   */
  const collisionDetection = useCallback(
    (args) => {
      const pointerHits = pointerWithin(args);
      if (pointerHits.length > 0) {
        const overTask = pointerHits.find((hit) => visibleTaskIds.has(hit.id));
        if (overTask) return [overTask];
        const overColumn = pointerHits.find((hit) => columnIdSet.has(hit.id));
        if (overColumn) return [overColumn];
        return pointerHits;
      }

      const closest = closestCenter(args);
      const closestTask = closest.find((hit) => visibleTaskIds.has(hit.id));
      return closestTask ? [closestTask] : closest;
    },
    [visibleTaskIds, columnIdSet],
  );

  const handleDragStart = (event) => {
    lastOverRef.current = null;
    const task = tasks.find((item) => item.id === event.active.id);
    if (task) setActiveTask(task);
  };

  const persistPositions = useCallback(async (updates) => {
    if (updates.length === 0) return true;
    const results = await Promise.all(
      updates.map((update) =>
        supabase
          .from('tasks')
          .update({ column_id: update.column_id, position: update.position })
          .eq('id', update.id),
      ),
    );
    const failed = results.find((result) => result.error);
    if (failed) {
      setBanner(`Не удалось сохранить порядок задач: ${failed.error.message}`);
      return false;
    }
    return true;
  }, []);

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveTask(null);

    // Если отпустили за пределами droppable-зоны — берём последнюю цель под курсором
    const overId = over ? String(over.id) : lastOverRef.current;
    lastOverRef.current = null;
    if (!overId) return;

    const activeId = String(active.id);
    if (activeId === overId) return;

    const moving = tasks.find((task) => task.id === activeId);
    if (!moving) return;

    const isColumnTarget = columnIdSet.has(overId);
    let overColumnId = null;

    if (!isColumnTarget) {
      const overTask = tasks.find((task) => task.id === overId);
      if (!overTask) return;
      overColumnId = overTask.column_id;
    }

    const columnsToTaskIds = {};
    boardColumns.forEach((column) => {
      columnsToTaskIds[column.id] = column.tasks.map((task) => task.id);
    });

    const plan = planTaskMove({
      activeId,
      overId,
      isColumnTarget,
      sourceColumnId: moving.column_id,
      overColumnId,
      columnsToTaskIds,
    });
    if (!plan) return;

    // Оптимистичное обновление, затем сохранение; при ошибке — откат через reload
    setTasks((prev) => applyTaskUpdates(prev, plan.updates));
    const ok = await persistPositions(plan.updates);
    if (!ok) await loadData();

    const activeUpdate = plan.updates.find((update) => update.id === activeId);
    if (ok && activeUpdate?.column_id === doneColumnId && moving.recurrence_freq) {
      // Триггер БД уже создал следующую копию — подтягиваем её в состояние
      await loadData();
    }
  };

  // --- CRUD задач ---
  const handleNewTask = (columnId) => {
    setDraftKey((key) => key + 1);
    setSelectedTask({
      id: null,
      title: '',
      description: '',
      due_at: null,
      links: [],
      files: [],
      column_id: columnId ?? columns[0]?.id ?? null,
      is_private: filterMode === 'personal',
      priority: 0,
      assignee_id: '',
    });
  };

  /** Перетаскивание задачи в календаре: меняем дату начала и/или срока */
  const handleCalendarTaskDateChange = async (taskId, patch) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return false;

    const payload = {};
    if (supports(taskSchema, 'due_at') && patch.due_at) payload.due_at = patch.due_at;
    if (supports(taskSchema, 'start_at') && patch.start_at) payload.start_at = patch.start_at;
    if (supports(taskSchema, 'date') && patch.due_at) payload.date = String(patch.due_at).slice(0, 10);

    if (Object.keys(payload).length === 0) return false;

    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', taskId)
      .select()
      .maybeSingle();

    if (error) {
      setBanner(`Не удалось перенести задачу: ${error.message}`);
      return false;
    }

    const updated = sanitizeTask(data) || { ...task, ...payload };
    setTasks((prev) => prev.map((item) => (item.id === taskId ? { ...item, ...updated } : item)));
    return true;
  };

  /** Клик по слоту календаря: создаём задачу/встречу на выбранное время */
  const handleCalendarSlot = ({ start, due }) => {
    setDraftKey((key) => key + 1);
    setSelectedTask({
      id: null,
      title: '',
      description: '',
      start_at: start,
      due_at: due,
      links: [],
      files: [],
      column_id: columns[0]?.id ?? null,
      is_private: filterMode === 'personal',
      priority: 0,
      assignee_id: '',
    });
  };

  const handleSaveTask = async (taskToSave, columnId) => {
    if (!userId) return;

    const due = taskToSave.due_at || null;
    const isNew = !taskToSave.id;
    const startValue = taskToSave.start_at || (isNew ? new Date().toISOString() : null);

    const payloadBase = {
      title: taskToSave.title.trim(),
      description: taskToSave.description || '',
      links: Array.isArray(taskToSave.links) ? taskToSave.links : [],
      files: Array.isArray(taskToSave.files) ? taskToSave.files : [],
      is_private: Boolean(taskToSave.is_private),
      ...(supports(taskSchema, 'due_at') ? { due_at: due } : {}),
      ...(supports(taskSchema, 'start_at') ? { start_at: startValue } : {}),
      ...(supports(taskSchema, 'date') ? { date: due ? String(due).slice(0, 10) : null } : {}),
      ...(supports(taskSchema, 'priority')
        ? { priority: normalizePriority(taskToSave.priority) }
        : {}),
      ...(supports(taskSchema, 'assignee_id')
        ? { assignee_id: taskToSave.assignee_id || null }
        : {}),
      ...(supports(taskSchema, 'recurrence_freq')
        ? { recurrence_freq: due ? taskToSave.recurrence_freq || null : null }
        : {}),
      ...(supports(taskSchema, 'recurrence_interval')
        ? { recurrence_interval: Math.max(1, Number(taskToSave.recurrence_interval) || 1) }
        : {}),
      ...(supports(taskSchema, 'recurrence_until')
        ? {
            recurrence_until:
              due && taskToSave.recurrence_freq ? taskToSave.recurrence_until || null : null,
          }
        : {}),
    };

    if (!taskToSave.id) {
      const targetColumn = columnId || columns[0]?.id;
      if (!targetColumn) {
        setBanner('Сначала создайте хотя бы одну колонку.');
        return;
      }

      const position = tasks.filter((task) => task.column_id === targetColumn).length;
      const payload = pickFields(
        { ...payloadBase, column_id: targetColumn, position, created_by: userId },
        taskSchema,
      );

      const { data, error } = await supabase.from('tasks').insert([payload]).select().single();
      if (error) {
        setBanner(`Не удалось создать задачу: ${error.message}`);
        return;
      }

      setTasks((prev) => [...prev, sanitizeTask(data)]);
      setSelectedTask(null);
      return;
    }

    const payload = pickFields(payloadBase, taskSchema);
    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', taskToSave.id)
      .select()
      .maybeSingle();

    if (error) {
      setBanner(`Не удалось сохранить задачу: ${error.message}`);
      return;
    }

    const updated = sanitizeTask(data) || { ...taskToSave, ...payload };
    setTasks((prev) => prev.map((task) => (task.id === updated.id ? { ...task, ...updated } : task)));
    setSelectedTask(null);
  };

  const handleDeleteTask = async (taskId, draft) => {
    if (!window.confirm('Переместить задачу в архив? Текущие изменения сохранятся, задачу можно восстановить.')) {
      return;
    }

    const payload = { deleted_at: new Date().toISOString() };
    if (supports(taskSchema, 'deleted_by')) payload.deleted_by = userId;

    // Архивируем вместе с текущими правками из модалки, чтобы изменения
    // не терялись, если пользователь сначала отредактировал задачу.
    if (draft) {
      const due = draft.due_at || null;
      if (draft.title?.trim()) payload.title = draft.title.trim();
      payload.description = draft.description || '';
      payload.links = Array.isArray(draft.links) ? draft.links : [];
      payload.files = Array.isArray(draft.files) ? draft.files : [];
      payload.is_private = Boolean(draft.is_private);
      if (supports(taskSchema, 'due_at')) payload.due_at = due;
      if (supports(taskSchema, 'start_at')) payload.start_at = draft.start_at || null;
      if (supports(taskSchema, 'date')) payload.date = due ? String(due).slice(0, 10) : null;
      if (supports(taskSchema, 'priority')) payload.priority = normalizePriority(draft.priority);
      if (supports(taskSchema, 'assignee_id')) payload.assignee_id = draft.assignee_id || null;
      if (supports(taskSchema, 'recurrence_freq')) {
        payload.recurrence_freq = due ? draft.recurrence_freq || null : null;
      }
      if (supports(taskSchema, 'recurrence_interval')) {
        payload.recurrence_interval = Math.max(1, Number(draft.recurrence_interval) || 1);
      }
      if (supports(taskSchema, 'recurrence_until')) {
        payload.recurrence_until =
          due && draft.recurrence_freq ? draft.recurrence_until || null : null;
      }
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(payload)
      .eq('id', taskId)
      .select()
      .maybeSingle();

    if (error) {
      setBanner(`Не удалось переместить в архив: ${error.message}`);
      return;
    }

    const task = sanitizeTask(data) || tasks.find((item) => item.id === taskId);
    if (task) {
      setArchivedTasks((prev) => [{ ...task, ...payload }, ...prev.filter((item) => item.id !== taskId)]);
      setTasks((prev) => prev.filter((item) => item.id !== taskId));
    }
    setSelectedTask(null);
  };

  const handleRestoreTask = async (taskId) => {
    const archived = archivedTasks.find((task) => task.id === taskId);
    const payload = { deleted_at: null };
    if (supports(taskSchema, 'deleted_by')) payload.deleted_by = null;
    if (supports(taskSchema, 'done_at')) payload.done_at = new Date().toISOString();

    const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
    if (error) {
      setBanner(`Не удалось восстановить задачу: ${error.message}`);
      return;
    }

    if (archived) {
      const position = tasks.filter((task) => task.column_id === archived.column_id).length;
      await supabase.from('tasks').update({ position }).eq('id', taskId);
      setTasks((prev) => [...prev, { ...archived, ...payload, position }]);
      setArchivedTasks((prev) => prev.filter((task) => task.id !== taskId));
    }
  };

  const handleDeleteForever = async (taskId) => {
    if (!window.confirm('Удалить задачу навсегда? Восстановить её будет нельзя.')) return;

    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    if (error) {
      setBanner(`Не удалось удалить задачу: ${error.message}`);
      return;
    }
    setArchivedTasks((prev) => prev.filter((task) => task.id !== taskId));
  };

  /** Сдвиг/изменение сроков из диаграммы Ганта */
  const handleScheduleChange = async (taskId, next) => {
    if (!next?.start || !next?.finish) return;

    const payload = {};
    if (supports(taskSchema, 'start_at')) payload.start_at = next.start.toISOString();
    if (supports(taskSchema, 'due_at')) payload.due_at = next.finish.toISOString();
    if (supports(taskSchema, 'date')) {
      const finish = next.finish;
      payload.date = `${finish.getFullYear()}-${String(finish.getMonth() + 1).padStart(2, '0')}-${String(finish.getDate()).padStart(2, '0')}`;
    }
    if (Object.keys(payload).length === 0) return;

    const previous = tasks.find((task) => task.id === taskId);
    setTasks((prev) => prev.map((task) => (task.id === taskId ? { ...task, ...payload } : task)));

    const { error } = await supabase.from('tasks').update(payload).eq('id', taskId);
    if (error) {
      setBanner(`Не удалось сохранить сроки задачи: ${error.message}`);
      if (previous) {
        setTasks((prev) => prev.map((task) => (task.id === taskId ? previous : task)));
      }
    }
  };

  // --- Массовое выделение ---
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectionMode = () => {
    if (selectionMode) exitSelection();
    else setSelectionMode(true);
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const selectAllVisible = () => setSelectedIds(new Set(visibleTasks.map((task) => task.id)));

  const selectColumn = (columnId) => {
    const ids = visibleTasks.filter((task) => task.column_id === columnId).map((task) => task.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });
  };

  const changeView = (view) => {
    exitSelection();
    setCurrentView(view);
  };

  /** Открыть чат на главной, на диалоге с сотрудником или на конкретном диалоге */
  const openChat = (peerId = null, conversationId = null) => {
    exitSelection();
    unlockAudio();
    setChatPeerId(peerId);
    setChatConversationId(conversationId);
    setIsChatOpen(true);
  };

  /** Цитата из задачи → черновик сообщения в чате (получателя выбирает пользователь) */
  const handleQuoteToChat = ({ taskId, title, number, text }) => {
    setSelectedTask(null);
    setChatDraft(buildTaskQuote({ taskId, title, number, text }));
    setChatPeerId(null);
    setChatConversationId(null);
    setIsChatOpen(true);
  };

  /** Клик по цитате в чате → открыть исходную задачу в модалке */
  const handleOpenTaskFromChat = (taskId) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) {
      setBanner('Задача из цитаты не найдена или больше недоступна.');
      return;
    }
    setIsChatOpen(false);
    setChatPeerId(null);
    setChatConversationId(null);
    setActiveChatId(null);
    setChatDraft('');
    setSelectedTask(task);
    setDraftKey((value) => value + 1);
  };

  /** Клик по логотипу — всегда на главную (доска, без фильтров и модалок) */
  const goHome = () => {
    setSelectedTask(null);
    setSelectedMember(null);
    setIsProfileOpen(false);
    setIsArchiveOpen(false);
    setIsTeamOpen(false);
    setIsHelpOpen(false);
    setIsChatOpen(false);
    setChatPeerId(null);
    setChatConversationId(null);
    setActiveChatId(null);
    setChatDraft('');
    setMemberFilter(null);
    setFilterMode('all');
    setOverdueOnly(false);
    changeView('board');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeFilter = (mode) => {
    exitSelection();
    setFilterMode(mode);
    setOverdueOnly(false);
  };

  const toggleOverdue = () => {
    exitSelection();
    setOverdueOnly((current) => !current);
  };

  // --- Уведомления (чат): всплывашки, звук, браузерные оповещения ---
  const chatViewRef = useRef({ open: false, conversationId: null });
  const profilesRef = useRef(allProfiles);
  const notificationsRef = useRef(notificationsEnabled);
  const openChatRef = useRef(null);

  useEffect(() => {
    chatViewRef.current = { open: isChatOpen, conversationId: activeChatId };
  }, [isChatOpen, activeChatId]);

  useEffect(() => {
    profilesRef.current = allProfiles;
  }, [allProfiles]);

  useEffect(() => {
    notificationsRef.current = notificationsEnabled;
  }, [notificationsEnabled]);

  useEffect(() => {
    openChatRef.current = openChat;
  });

  useEffect(() => {
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true });
    return () => window.removeEventListener('pointerdown', handler);
  }, []);

  useEffect(() => {
    if (!userId) return undefined;

    const channel = supabase
      .channel('kanban-chat-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          const row = payload.new;
          if (!row || row.author_id === userId) return;

          const viewed =
            chatViewRef.current.open &&
            chatViewRef.current.conversationId === row.conversation_id &&
            document.hasFocus();
          if (viewed) return;

          const author = profilesRef.current.find((item) => item.id === row.author_id);
          const preview = stripTaskMarker(row.body) || (row.attachment_name ? 'Файл' : '');
          const toast = {
            id: `toast-${row.id}`,
            title: author?.full_name || 'Сотрудник',
            body: preview,
            color: author?.color,
            avatar: author?.avatar_url,
            initials: initialsOf(author?.full_name),
            conversationId: row.conversation_id,
          };

          setToasts((prev) => [...prev.filter((item) => item.id !== toast.id), toast].slice(-3));
          window.setTimeout(() => {
            setToasts((prev) => prev.filter((item) => item.id !== toast.id));
          }, 8000);

          if (!notificationsRef.current) return;

          playChime();
          if (!chatViewRef.current.open) setChatUnread((value) => value + 1);
          if (document.hidden) {
            showSystemNotification({
              title: toast.title,
              body: preview,
              tag: row.conversation_id,
              onClick: () => openChatRef.current?.(null, row.conversation_id),
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      try {
        localStorage.setItem('kanban.notifications', 'off');
      } catch {
        // приватный режим — не критично
      }
      return;
    }

    unlockAudio();
    playChime();
    const permission = await requestNotifications();
    setNotificationsPermission(permission);
    setNotificationsEnabled(true);
    try {
      localStorage.setItem('kanban.notifications', 'on');
    } catch {
      // приватный режим — не критично
    }
  };

  /** Применяет патчи к выбранным задачам и сохраняет их в базе */
  const applyBulkPatch = async (ids, buildPatch) => {
    const patches = new Map();
    ids.forEach((id) => {
      const patch = buildPatch(id);
      if (patch) patches.set(id, patch);
    });
    if (patches.size === 0) return true;

    setTasks((prev) =>
      prev.map((task) => (patches.has(task.id) ? { ...task, ...patches.get(task.id) } : task)),
    );

    const results = await Promise.all(
      [...patches.entries()].map(([id, patch]) => supabase.from('tasks').update(patch).eq('id', id)),
    );
    const failed = results.find((result) => result.error);
    if (failed) {
      setBanner(`Не удалось применить изменения: ${failed.error.message}`);
      await loadData();
      return false;
    }
    return true;
  };

  const handleBulkMove = async (columnId) => {
    if (!columnId || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const base = tasks.filter((task) => task.column_id === columnId).length;
    let index = 0;
    const ok = await applyBulkPatch(ids, () => {
      const patch = { column_id: columnId, position: base + index };
      index += 1;
      return patch;
    });
    if (ok) setSelectedIds(new Set());
    if (ok && columnId === doneColumnId && tasks.some((task) => ids.includes(task.id) && task.recurrence_freq)) {
      // После завершения повторяющихся задач появляется следующая копия
      await loadData();
    }
  };

  const handleBulkAssign = async (assigneeId) => {
    if (!supports(taskSchema, 'assignee_id')) {
      setBanner('Назначение исполнителей включится после миграции БД (колонка tasks.assignee_id).');
      return;
    }
    const ok = await applyBulkPatch([...selectedIds], () => ({ assignee_id: assigneeId || null }));
    if (ok) setSelectedIds(new Set());
  };

  const handleBulkPriority = async (priority) => {
    if (!supports(taskSchema, 'priority')) {
      setBanner('Приоритет включится после миграции БД (колонка tasks.priority).');
      return;
    }
    const ok = await applyBulkPatch([...selectedIds], () => ({ priority }));
    if (ok) setSelectedIds(new Set());
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Переместить в архив ${selectedIds.size} задач?`)) return;

    const ids = [...selectedIds];
    const payload = { deleted_at: new Date().toISOString() };
    if (supports(taskSchema, 'deleted_by')) payload.deleted_by = userId;

    const moving = tasks.filter((task) => ids.includes(task.id));
    setArchivedTasks((prev) => [...moving.map((task) => ({ ...task, ...payload })), ...prev]);
    setTasks((prev) => prev.filter((task) => !ids.includes(task.id)));
    setSelectedIds(new Set());

    const results = await Promise.all(
      ids.map((id) => supabase.from('tasks').update(payload).eq('id', id)),
    );
    const failed = results.find((result) => result.error);
    if (failed) {
      setBanner(`Не удалось отправить в архив: ${failed.error.message}`);
      await loadData();
    }
  };

  // Esc выходит из режима выделения
  useEffect(() => {
    if (!selectionMode) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectionMode]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setAllProfiles([]);
    setColumns([]);
    setTasks([]);
    setArchivedTasks([]);
    setSelectedTask(null);
    setMemberFilter(null);
    setLoading(true);
  };

  const handleProfileUpdated = (updated, meta = {}) => {
    const next = { ...updated };

    // Telegram: до миграции храним в браузере, после — в profiles.telegram
    if (meta.telegram !== undefined) {
      if (meta.localOnly) {
        next.telegram = meta.telegram || null;
        setLocalTelegram(userId, meta.telegram || '');
      } else {
        clearLocalTelegram(userId);
      }
    }

    setProfile(next);
    setAllProfiles((prev) =>
      prev.some((item) => item.id === next.id)
        ? prev.map((item) => (item.id === next.id ? { ...item, ...next } : item))
        : [...prev, next],
    );
    setProfileSchema((prev) => mergeFields(prev, collectFields([next])));
  };

  /** Смена роли сотрудника — только администратор */
  const handleRoleChange = async (memberId, role) => {
    const previous = allProfiles.find((item) => item.id === memberId);
    if (!previous || previous.role === role) return;

    setRoleSaving(true);
    setAllProfiles((prev) => prev.map((item) => (item.id === memberId ? { ...item, role } : item)));
    setSelectedMember((prev) => (prev?.id === memberId ? { ...prev, role } : prev));
    if (memberId === userId) setProfile((prev) => (prev ? { ...prev, role } : prev));

    const { error } = await supabase.from('profiles').update({ role }).eq('id', memberId);

    if (error) {
      setAllProfiles((prev) => prev.map((item) => (item.id === memberId ? previous : item)));
      setSelectedMember((prev) => (prev?.id === memberId ? previous : prev));
      if (memberId === userId) setProfile((prev) => (prev ? { ...prev, role: previous.role } : prev));
      const hint =
        error.code === '42501'
          ? ' Нужна RLS-политика profiles_update_admin из миграции.'
          : '';
      setBanner(`Не удалось изменить роль: ${error.message}.${hint}`);
    }

    setRoleSaving(false);
  };

  if (!session) return <LoginPage />;

  if (loading) {
    return (
      <div className="app-bg flex min-h-screen flex-col items-center justify-center gap-3">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Загрузка данных из базы…</p>
      </div>
    );
  }

  if (roomToken) {
    return (
      <MeetingRoomPage
        token={roomToken}
        profile={profile}
        userEmail={userEmail}
        currentUserId={userId}
        members={allProfiles}
        onExit={() => window.location.assign('/')}
      />
    );
  }

  return (
    <div className="app-bg flex min-h-screen flex-col">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        currentView={currentView}
        onViewChange={changeView}
        onLogout={handleLogout}
        user={session.user}
        profile={profile}
        onProfileClick={() => setIsProfileOpen(true)}
        filterMode={filterMode}
        onFilterChange={changeFilter}
        onArchiveClick={() => setIsArchiveOpen(true)}
        onTeamClick={() => setIsTeamOpen(true)}
        onChatClick={() => openChat()}
        onMeetingsClick={() => setIsMeetingsOpen(true)}
        meetingsCount={upcomingMeetingCount}
        meetingsEnabled={meetingsSupported}
        onHelpClick={() => setIsHelpOpen(true)}
        chatUnread={chatUnread}
        notificationsEnabled={notificationsEnabled}
        notificationsPermission={notificationsPermission}
        onToggleNotifications={handleToggleNotifications}
        onHome={goHome}
        teamCount={allProfiles.length}
        memberFilter={memberFilter}
        onClearMemberFilter={() => setMemberFilter(null)}
        overdueOnly={overdueOnly}
        onClearOverdue={() => setOverdueOnly(false)}
      />

      {oauthNotice && (
        <div className="mx-auto mt-3 w-full max-w-[1800px] px-4 sm:px-6">
          <div className="flex items-start gap-2 rounded-2xl border border-amber-400/50 bg-amber-400/15 px-3 py-2 text-xs text-amber-900 backdrop-blur dark:text-amber-200">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{oauthNotice}</span>
            <button
              type="button"
              onClick={() => setOauthNotice('')}
              className="rounded p-0.5 transition hover:bg-amber-500/20"
              title="Скрыть"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      {banner && (
        <div className="mx-auto mt-3 w-full max-w-[1800px] px-4 sm:px-6">
          <div className="flex items-start gap-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 backdrop-blur dark:text-rose-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span className="flex-1">{banner}</span>
            <button
              type="button"
              onClick={() => setBanner('')}
              className="rounded p-0.5 transition hover:bg-rose-500/20"
              title="Скрыть"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 px-4 py-4 sm:px-6">
        {currentView === 'board' && (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={(event) => {
              if (event.over) lastOverRef.current = String(event.over.id);
            }}
            onDragEnd={handleDragEnd}
            onDragCancel={() => setActiveTask(null)}
          >
            <div className="mx-auto flex max-w-[1800px] flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-[0.7rem] text-slate-500 dark:text-slate-400">
                <span className="glass-chip">
                  <ListChecks size={11} /> Задач: {overdueOnly ? `${visibleTasks.length} из ${stats.total}` : stats.total}
                </span>
                <button
                  type="button"
                  onClick={toggleOverdue}
                  disabled={!overdueOnly && stats.overdue === 0}
                  className={`glass-chip cursor-pointer transition ${
                    overdueOnly
                      ? '!border-rose-400/70 !bg-rose-500/15 !text-rose-700 ring-1 ring-rose-400/40 dark:!text-rose-200'
                      : 'hover:border-rose-400/60 hover:!text-rose-700 dark:hover:!text-rose-200'
                  } disabled:cursor-default disabled:opacity-50`}
                  title={
                    overdueOnly
                      ? 'Показать все задачи — сбросить фильтр просроченных'
                      : 'Показать только просроченные задачи'
                  }
                  aria-pressed={overdueOnly}
                >
                  <AlarmClock size={11} /> Просрочено: {stats.overdue}
                  {overdueOnly && <X size={11} />}
                </button>
                <span className="glass-chip">
                  <UserRound size={11} /> Личных: {stats.personal}
                </span>

                <button
                  type="button"
                  onClick={toggleSelectionMode}
                  className={`glass-btn !px-2.5 !py-1 !text-[0.7rem] ${
                    selectionMode ? 'glass-btn-primary' : ''
                  }`}
                  title="Режим массового выделения задач"
                >
                  <CheckSquare size={13} />
                  {selectionMode ? 'Выделение включено' : 'Выделить'}
                </button>

                <span className="ml-auto hidden items-center gap-1.5 sm:flex">
                  {selectionMode ? (
                    <>
                      <CheckSquare size={12} /> Кликните по карточке, чтобы выделить задачу
                    </>
                  ) : (
                    <>
                      <LayoutGrid size={12} /> Перетащите карточку, чтобы изменить колонку или рейтинг
                    </>
                  )}
                </span>
              </div>

              {columns.length === 0 ? (
                <div className="glass mx-auto mt-8 w-full max-w-md rounded-3xl p-8 text-center">
                  <LayoutGrid size={28} className="mx-auto mb-2 text-indigo-500" />
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Колонок пока нет</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Добавьте записи в таблицу <code>columns</code> — например: «Сделать», «В работе», «Готово».
                  </p>
                </div>
              ) : (
                <div className="scrollbar-slim overflow-x-auto pb-4">
                  <div className="mx-auto flex w-max items-start gap-4">
                    {boardColumns.map((column, index) => (
                      <Column
                        key={column.id}
                        column={column}
                        tasks={column.tasks}
                        index={index}
                        numberById={numberById}
                        authorById={authorById}
                        selectionMode={selectionMode}
                        selectedIds={selectedIds}
                        onTaskClick={setSelectedTask}
                        onAddNewTask={() => handleNewTask(column.id)}
                        onDeleteTask={handleDeleteTask}
                        onToggleSelect={toggleTaskSelection}
                        onSelectColumn={selectColumn}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <DragOverlay dropAnimation={null}>
              {activeTask ? (
                <div className="w-[19rem]">
                  <TaskCardView
                    task={activeTask}
                    number={numberById.get(activeTask.id)}
                    author={authorById.get(activeTask.created_by)}
                    assignee={activeTask.assignee_id ? authorById.get(activeTask.assignee_id) : null}
                    isOverlay
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}

        {currentView === 'calendar' && (
          <CalendarView
            tasks={visibleTasks}
            meetings={meetings}
            numberById={numberById}
            onTaskClick={setSelectedTask}
            onMeetingClick={handleOpenMeeting}
            onSlotSelect={handleCalendarSlot}
            onTaskDateChange={handleCalendarTaskDateChange}
          />
        )}

        {currentView === 'gantt' && (
          <GanttView
            tasks={visibleTasks}
            columns={columns}
            authorById={authorById}
            numberById={numberById}
            onTaskClick={setSelectedTask}
            onScheduleChange={handleScheduleChange}
            canEditSchedule={canEditGantt}
          />
        )}
      </main>

      {currentView === 'board' && selectionMode && (
        <BulkActions
          count={selectedIds.size}
          total={visibleTasks.length}
          columns={columns}
          members={allProfiles}
          canAssign={supports(taskSchema, 'assignee_id')}
          canPriority={supports(taskSchema, 'priority')}
          onSelectAll={selectAllVisible}
          onClear={() => setSelectedIds(new Set())}
          onExit={exitSelection}
          onMove={handleBulkMove}
          onAssign={handleBulkAssign}
          onPriority={handleBulkPriority}
          onArchive={handleBulkArchive}
        />
      )}

      {selectedTask && (
        <TaskDetailModal
          key={selectedTask.id || `new-${draftKey}`}
          isOpen
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          number={selectedTask.id ? numberById.get(selectedTask.id) : undefined}
          onSaveTask={handleSaveTask}
          onDeleteTask={handleDeleteTask}
          allProfiles={allProfiles}
          allowedFields={taskSchema}
          currentUserId={userId}
          onQuoteToChat={handleQuoteToChat}
          columns={columns}
          onOpenExistingTask={(taskId) => {
            const existing = tasks.find((item) => item.id === taskId);
            if (existing) setSelectedTask(existing);
          }}
        />
      )}

      {isProfileOpen && (
        <ProfileModal
          isOpen
          onClose={() => setIsProfileOpen(false)}
          profile={profile}
          user={session.user}
          allowedFields={profileSchema}
          onUpdateProfile={handleProfileUpdated}
        />
      )}

      <ArchiveModal
        isOpen={isArchiveOpen}
        onClose={() => setIsArchiveOpen(false)}
        archivedTasks={archivedVisible}
        onRestore={handleRestoreTask}
        onDeleteForever={handleDeleteForever}
        authorById={authorById}
        numberById={numberById}
        currentUserId={userId}
      />

      <TeamModal
        isOpen={isTeamOpen}
        onClose={() => setIsTeamOpen(false)}
        members={allProfiles}
        currentUserId={userId}
        taskCountByUser={taskCountByUser}
        onSelectMember={setSelectedMember}
        currentRole={profile?.role || 'member'}
        onRoleChange={handleRoleChange}
        roleSaving={roleSaving}
        tasks={tasks}
        archivedTasks={archivedTasks}
        columns={columns}
        onOpenChat={(member) => {
          setIsTeamOpen(false);
          openChat(member.id);
        }}
      />

      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        currentUserId={userId}
        isAdmin={profile?.role === 'admin'}
        profiles={allProfiles}
        onOpenProfile={(member) => {
          setIsHelpOpen(false);
          setSelectedMember(allProfiles.find((item) => item.id === member.id) ?? member);
        }}
      />

      {isChatOpen && (
        <ChatModal
          key={chatConversationId || 'chat-root'}
          isOpen
          onClose={() => {
            setIsChatOpen(false);
            setChatPeerId(null);
            setChatConversationId(null);
            setActiveChatId(null);
            setChatDraft('');
          }}
          currentUserId={userId}
          members={allProfiles}
          peerId={chatPeerId}
          initialConversationId={chatConversationId}
          initialDraft={chatDraft}
          onActiveChange={setActiveChatId}
          onUnreadChange={setChatUnread}
          onOpenTask={handleOpenTaskFromChat}
          onOpenProfile={(peer) => {
            setIsChatOpen(false);
            setChatPeerId(null);
            setChatConversationId(null);
            setActiveChatId(null);
            setSelectedMember(allProfiles.find((item) => item.id === peer.id) ?? peer);
          }}
        />
      )}

      {isMeetingsOpen && meetingsSupported && (
        <MeetingsModal
          meetings={meetings}
          participants={meetingParticipants}
          members={allProfiles}
          currentUserId={userId}
          onClose={() => setIsMeetingsOpen(false)}
          onCreate={() => setIsMeetingModalOpen(true)}
          onMeetingClick={handleOpenMeeting}
        />
      )}

      {isMeetingModalOpen && meetingsSupported && (
        <MeetingModal
          members={allProfiles}
          currentUserId={userId}
          onClose={() => setIsMeetingModalOpen(false)}
          onSave={handleCreateMeeting}
        />
      )}

      {selectedMeeting && (
        <MeetingDetailsModal
          meeting={selectedMeeting}
          participants={meetingParticipants.filter((item) => item.meeting_id === selectedMeeting.id)}
          members={allProfiles}
          currentUserId={userId}
          onClose={() => setSelectedMeeting(null)}
          onRespond={handleRespondMeeting}
          onCancel={handleCancelMeeting}
          onJoin={(meeting) => window.location.assign(`/meet/${meeting.room_token}`)}
          onOpenChat={setMeetingChat}
        />
      )}

      {meetingChat && (
        <MeetingChatModal
          meeting={meetingChat}
          currentUserId={userId}
          members={allProfiles}
          onClose={() => setMeetingChat(null)}
        />
      )}

      <Toasts
        toasts={toasts}
        onDismiss={(id) => setToasts((prev) => prev.filter((item) => item.id !== id))}
        onOpen={(toast) => {
          setToasts((prev) => prev.filter((item) => item.id !== toast.id));
          if (toast.meetingId) {
            const meeting = meetings.find((item) => item.id === toast.meetingId);
            if (meeting) handleOpenMeeting(meeting);
            return;
          }
          openChat(null, toast.conversationId);
        }}
      />

      <MemberProfileModal
        isOpen={Boolean(selectedMember)}
        onClose={() => setSelectedMember(null)}
        member={selectedMember}
        isSelf={selectedMember?.id === userId}
        taskCount={selectedMember ? taskCountByUser.get(selectedMember.id) ?? 0 : 0}
        canManageRoles={canManageRoles}
        onRoleChange={handleRoleChange}
        roleSaving={roleSaving}
        onOpenChat={(member) => {
          setSelectedMember(null);
          openChat(member.id);
        }}
        onShowTasks={(member) => {
          setMemberFilter(member);
          changeView('board');
          setSelectedMember(null);
          setIsTeamOpen(false);
        }}
        onEditSelf={() => {
          setSelectedMember(null);
          setIsTeamOpen(false);
          setIsProfileOpen(true);
        }}
      />
    </div>
  );
}
