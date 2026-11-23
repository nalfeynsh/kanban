import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  CalendarClock,
  AlignLeft,
  Check,
  Trash2,
  Copy,
  Clock,
  Link as LinkIcon,
  Plus,
  Paperclip,
  FileText,
  Loader2,
  Eye,
  UserRound,
  Flag,
  Hash,
  Loader,
  AlertTriangle,
  Send,
  Quote,
  Repeat,
  Diamond,
  Gauge,
  GitBranch,
  Layers3,
  ListChecks,
  Link2,
  GripVertical,
  ListTree,
  CornerDownRight,
  Pencil,
} from 'lucide-react';
import TipTapEditor from './TipTapEditor';
import DateTimeField from './DateTimeField';
import FilePreviewModal from './FilePreviewModal';
import Avatar from './Avatar';
import { supabase } from '../supabaseClient';
import {
  formatCreated,
  formatDueLong,
  getDueValue,
} from '../lib/format';
import { PRIORITIES, getPriority, normalizePriority } from '../lib/priority';
import { supports } from '../lib/schema';
import { htmlToText } from '../lib/quote';
import { recurrenceLabel, recurrenceNextValue, RECURRENCE_OPTIONS } from '../lib/recurrence';

/** props.task → редактируемая копия (модалка монтируется заново на каждую задачу) */
function toEditableTask(task, dependencyIds = [], relatedIds = []) {
  if (!task) return null;
  return {
    id: task.id || null,
    title: task.title || '',
    description: task.description || '',
    start_at: task.start_at || null,
    due_at: getDueValue(task),
    links: Array.isArray(task.links) ? task.links : [],
    files: Array.isArray(task.files) ? task.files : [],
    column_id: task.column_id,
    created_at: task.created_at,
    created_by: task.created_by,
    is_private: Boolean(task.is_private),
    priority: normalizePriority(task.priority),
    assignee_id: task.assignee_id || '',
    recurrence_freq: task.recurrence_freq || '',
    recurrence_interval: Number(task.recurrence_interval) || 1,
    recurrence_until: task.recurrence_until || '',
    story_points: task.story_points ?? '',
    progress_percent: Number(task.progress_percent) || 0,
    is_milestone: task.is_milestone === true,
    milestone_date: task.milestone_date ? String(task.milestone_date).slice(0, 10) : '',
    effort_hours: task.effort_hours ?? '',
    actual_hours: task.actual_hours ?? '',
    dependency_lag_days: Number(task.dependency_lag_days) || 0,
    sprint_id: task.sprint_id || '',
    depends_on_ids: dependencyIds,
    related_task_ids: relatedIds,
    parent_task_id: task.parent_task_id || null,
  };
}

export default function TaskDetailModal({
  isOpen,
  onClose,
  task,
  number,
  onSaveTask,
  onDeleteTask,
  allProfiles = [],
  allowedFields,
  currentUserId,
  onQuoteToChat,
  columns = [],
  onOpenExistingTask,
  storyPointsEnabled = false,
  methodology = 'waterfall',
  sprints = [],
  taskOptions = [],
  dependencyIds = [],
  relatedTaskIds = [],
  checklistItems = [],
  subtasks = [],
  parentTask = null,
  onAddSubtask,
  onSaveDependencies,
  onSaveRelations,
  onSaveChecklist,
  canManageLag = false,
}) {
  const [editedTask, setEditedTask] = useState(() => toEditableTask(task, dependencyIds, relatedTaskIds));
  const [checklist, setChecklist] = useState(() =>
    (checklistItems || []).map((item) => ({
      id: item.id,
      title: item.title,
      is_done: Boolean(item.is_done),
    })),
  );
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [editingChecklistIndex, setEditingChecklistIndex] = useState(null);
  const [checklistEditValue, setChecklistEditValue] = useState('');
  const [draggingChecklistIndex, setDraggingChecklistIndex] = useState(null);
  const [dragOverChecklistIndex, setDragOverChecklistIndex] = useState(null);
  const [newSubtask, setNewSubtask] = useState({ title: '', assignee_id: '', due_at: '' });
  const [isCopied, setIsCopied] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateMatches, setDuplicateMatches] = useState([]);
  const [forceCreate, setForceCreate] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const panelRef = useRef(null);
  const quoteSelectionRef = useRef('');
  const descriptionRef = useRef(null);

  const dueSupported = supports(allowedFields, 'due_at');
  const startSupported = supports(allowedFields, 'start_at');
  const prioritySupported = supports(allowedFields, 'priority');
  const assigneeSupported = supports(allowedFields, 'assignee_id');
  const recurrenceSupported = supports(allowedFields, 'recurrence_freq');
  const storyPointsSupported = supports(allowedFields, 'story_points');
  const progressSupported = supports(allowedFields, 'progress_percent');
  const milestoneSupported = supports(allowedFields, 'is_milestone');
  const sprintSupported = supports(allowedFields, 'sprint_id');
  const effortSupported = supports(allowedFields, 'effort_hours');
  const actualHoursSupported = supports(allowedFields, 'actual_hours');
  const milestoneDateSupported = supports(allowedFields, 'milestone_date');
  const dependencyLagSupported = supports(allowedFields, 'dependency_lag_days');
  const dependenciesSupported = Boolean(onSaveDependencies) && Boolean(task?.id);

  const authorProfile = useMemo(
    () => allProfiles.find((profile) => profile.id === task?.created_by) || null,
    [allProfiles, task?.created_by],
  );

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Запоминаем выделение заранее: обычный клик по кнопке сворачивает выделённый текст
  useEffect(() => {
    if (!isOpen) return undefined;
    const capture = () => {
      const selection = window.getSelection();
      if (!selection) return;
      const node = selection.anchorNode;
      if (!node || !panelRef.current?.contains(node)) return;
      quoteSelectionRef.current = selection.isCollapsed ? '' : selection.toString().trim();
    };
    document.addEventListener('mouseup', capture);
    document.addEventListener('keyup', capture);
    return () => {
      document.removeEventListener('mouseup', capture);
      document.removeEventListener('keyup', capture);
    };
  }, [isOpen]);

  if (!isOpen || !editedTask) return null;

  const isNewTask = !editedTask.id;
  const checklistTotal = checklist.length;
  const checklistDone = checklist.filter((item) => item.is_done).length;
  const checklistProgress =
    checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : null;
  // Приватность меняет только постановщик: иначе можно «запереть» чужую задачу
  const canTogglePrivacy = isNewTask || !editedTask.created_by || editedTask.created_by === currentUserId;

  const setField = (key, value) => {
    setEditedTask((prev) => ({ ...prev, [key]: value }));
    if (key === 'title' || key === 'description') {
      setDuplicateMatches([]);
      setForceCreate(false);
    }
  };

  const persistChecklist = async (next) => {
    setChecklist(next);
    if (task?.id && onSaveChecklist) await onSaveChecklist(task.id, next);
  };

  const addChecklistItem = () => {
    const title = newChecklistTitle.trim();
    if (!title) return;
    const next = [...checklist, { id: null, title, is_done: false }];
    setNewChecklistTitle('');
    persistChecklist(next);
  };

  const toggleChecklistItem = (index) => {
    const next = checklist.map((item, i) => (i === index ? { ...item, is_done: !item.is_done } : item));
    persistChecklist(next);
  };

  const removeChecklistItem = (index) => {
    persistChecklist(checklist.filter((_, i) => i !== index));
  };

  const saveChecklistTitle = (index) => {
    const value = checklistEditValue.trim();
    setEditingChecklistIndex(null);
    if (!value) return;
    persistChecklist(checklist.map((item, i) => (i === index ? { ...item, title: value } : item)));
  };

  const moveChecklistItem = (from, to) => {
    if (from == null || to == null || from === to) return;
    const next = [...checklist];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistChecklist(next);
  };

  const addSubtask = async () => {
    if (!newSubtask.title.trim() || !onAddSubtask) return;
    const created = await onAddSubtask({
      title: newSubtask.title.trim(),
      assignee_id: newSubtask.assignee_id || null,
      due_at: newSubtask.due_at || null,
    });
    if (created) {
      setNewSubtask({ title: '', assignee_id: '', due_at: '' });
    }
  };

  const saveTask = async () => {
    setFormError('');
    setIsSaving(true);
    const saved = await onSaveTask(
      {
        ...editedTask,
        title: editedTask.title.trim(),
        progress_percent: checklistProgress ?? editedTask.progress_percent,
      },
      editedTask.column_id,
    );
    const taskId = saved?.id || editedTask.id;
    if (taskId) {
      if (onSaveDependencies) {
        await onSaveDependencies(taskId, editedTask.depends_on_ids || []);
      }
      if (onSaveRelations) {
        await onSaveRelations(taskId, editedTask.related_task_ids || []);
      }
      if (onSaveChecklist && (checklist.length > 0 || checklistItems.length > 0)) {
        await onSaveChecklist(taskId, checklist);
      }
    }
    setIsSaving(false);
  };

  const handleSave = async () => {
    if (!editedTask.title.trim()) {
      setFormError('Название задачи не может быть пустым');
      return;
    }

    // Перед созданием мягко проверяем похожие задачи. Ошибка проверки
    // не должна мешать сохранить задачу.
    if (isNewTask && !forceCreate) {
      setIsCheckingDuplicates(true);
      const { data, error } = await supabase.rpc('find_similar_tasks', {
        p_title: editedTask.title.trim(),
        p_description: editedTask.description || '',
        p_exclude_id: editedTask.id || null,
        p_limit: 3,
      });
      setIsCheckingDuplicates(false);

      if (!error && Array.isArray(data) && data.length > 0) {
        setDuplicateMatches(data);
        return;
      }
    }

    await saveTask();
  };

  const handleForceCreate = async () => {
    setDuplicateMatches([]);
    setForceCreate(true);
    await saveTask();
  };

  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;
    let formattedUrl = newLinkUrl.trim();
    if (!/^https?:\/\//i.test(formattedUrl)) formattedUrl = `https://${formattedUrl}`;
    const newLink = {
      id: Date.now().toString(),
      title: newLinkTitle.trim() || formattedUrl,
      url: formattedUrl,
    };
    setField('links', [...editedTask.links, newLink]);
    setNewLinkTitle('');
    setNewLinkUrl('');
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { error } = await supabase.storage.from('task-files').upload(fileName, file);
    if (error) {
      setFormError(`Не удалось загрузить файл: ${error.message}`);
      setIsUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('task-files').getPublicUrl(fileName);
    setField('files', [
      ...editedTask.files,
      { id: Date.now().toString(), name: file.name, url: urlData.publicUrl, type: file.type },
    ]);
    setIsUploading(false);
  };

  const handleCopyAll = async () => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = editedTask.description;
    tempDiv.querySelectorAll('p, h1, h2, h3, li, br').forEach((el) => el.insertAdjacentText('afterend', '\n'));
    const text = tempDiv.textContent || '';
    const due = editedTask.due_at ? `\n\nСрок: ${formatDueLong(editedTask.due_at)}` : '';
    await navigator.clipboard.writeText(`${editedTask.title}\n\n${text.trim()}${due}`);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const priorityInfo = getPriority(editedTask.priority);
  const assignee = allProfiles.find((profile) => profile.id === editedTask.assignee_id);
  const nextRecurrence = recurrenceNextValue(
    editedTask.due_at,
    editedTask.recurrence_freq,
    editedTask.recurrence_interval || 1,
  );
  const recurrenceEnded =
    Boolean(nextRecurrence && editedTask.recurrence_until && nextRecurrence > editedTask.recurrence_until);

  /** Цитата: выделенный в описании текст, иначе описание целиком, иначе название */
  const handleQuoteToChat = () => {
    const selected = quoteSelectionRef.current || '';
    const text = selected || htmlToText(editedTask.description) || editedTask.title;
    if (!text) return;
    onQuoteToChat?.({ taskId: editedTask.id, title: editedTask.title, number, text });
  };

  return (
    <>
      <div className="modal-overlay">
        <div
          ref={panelRef}
          className="modal-panel glass-panel scrollbar-slim max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl"
        >
          {/* Шапка */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-300/60 bg-white/80 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/40">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {number != null && (
                  <span className="glass-chip font-mono !text-[0.65rem]" title="Номер задачи">
                    <Hash size={10} />{number}
                  </span>
                )}
                {editedTask.is_private && (
                  <span className="flex items-center gap-1 rounded-full border border-violet-400/50 bg-violet-500/15 px-2 py-0.5 text-[0.62rem] font-semibold text-violet-700 dark:text-violet-300">
                    <UserRound size={10} /> Личная — видна только вам
                  </span>
                )}
                {priorityInfo.value > 0 && (
                  <span className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold ${priorityInfo.chip}`}>
                    <Flag size={10} /> {priorityInfo.label}
                  </span>
                )}
              </div>

              <input
                type="text"
                value={editedTask.title}
                spellCheck="true"
                lang="ru"
                onChange={(event) => setField('title', event.target.value)}
                onKeyDown={(event) => {
                  // Tab из названия — сразу в описание, минуя панель форматирования
                  if (event.key === 'Tab' && !event.shiftKey) {
                    event.preventDefault();
                    descriptionRef.current?.focus();
                  }
                }}
                className="w-full border-b-2 border-transparent bg-transparent pb-1 text-xl font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-white/60 focus:border-indigo-500 dark:text-white dark:hover:border-white/15"
                placeholder="Название задачи"
                autoFocus={isNewTask}
              />

              {parentTask && (
                <button
                  type="button"
                  onClick={() => onOpenExistingTask?.(parentTask.id)}
                  className="mt-1 flex max-w-full items-center gap-1 truncate rounded-lg bg-sky-500/10 px-2 py-1 text-[0.62rem] font-medium text-sky-700 hover:bg-sky-500/20 dark:text-sky-300"
                  title="Открыть родительскую задачу"
                >
                  <CornerDownRight size={11} /> Родительская: {parentTask.title}
                </button>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-slate-500 dark:text-slate-400">
                {authorProfile ? (
                  <span className="flex items-center gap-1.5">
                    <Avatar
                      name={authorProfile.full_name}
                      color={authorProfile.color}
                      src={authorProfile.avatar_url}
                      className="h-5 w-5 text-[0.55rem]"
                    />
                    Постановщик: {authorProfile.full_name}
                  </span>
                ) : (
                  !isNewTask && <span>Постановщик: загрузка…</span>
                )}

                <span className="flex items-center gap-1.5">
                  <Clock size={12} />
                  Создана: {formatCreated(editedTask.created_at)}
                </span>

                {editedTask.due_at && (
                  <span className="flex items-center gap-1.5 font-medium text-indigo-600 dark:text-indigo-300">
                    <CalendarClock size={12} />
                    Срок: {formatDueLong(editedTask.due_at)}
                  </span>
                )}

                {assignee && (
                  <span className="flex items-center gap-1.5">
                    <Avatar
                      name={assignee.full_name}
                      color={assignee.color}
                      src={assignee.avatar_url}
                      className="h-5 w-5 text-[0.55rem]"
                    />
                    Исполнитель: {assignee.full_name}
                  </span>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              title="Закрыть (Esc)"
            >
              <X size={20} />
            </button>
          </div>

          <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1fr_16rem]">
            {/* Основная колонка */}
            <div className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <AlignLeft size={16} /> Описание
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={handleQuoteToChat}
                    onMouseDown={(event) => event.preventDefault()}
                    className="glass-btn !px-2 !py-1 !text-[0.7rem]"
                    title="Процитировать в чат: выделенный текст или всё описание"
                  >
                    <Quote size={12} /> В чат
                  </button>
                  {(editedTask.description || editedTask.links.length > 0 || editedTask.files.length > 0) && (
                    <button
                      type="button"
                      onClick={handleCopyAll}
                      className="glass-btn !px-2 !py-1 !text-[0.7rem]"
                    >
                      {isCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {isCopied ? 'Скопировано' : 'Копировать всё'}
                    </button>
                  )}
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-300/60 bg-white/75 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                <TipTapEditor
                  key={editedTask.id || 'new'}
                  ref={descriptionRef}
                  content={editedTask.description}
                  onChange={(html) => setField('description', html)}
                />
              </div>

              {/* Ссылки */}
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <LinkIcon size={16} /> Ссылки
                  {editedTask.links.length > 0 && (
                    <span className="glass-chip !text-[0.6rem]">{editedTask.links.length}</span>
                  )}
                </div>

                {editedTask.links.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {editedTask.links.map((link) => (
                      <li
                        key={link.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                      >
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate text-xs font-medium text-indigo-700 hover:underline dark:text-indigo-300"
                        >
                          {link.title}
                        </a>
                        <button
                          type="button"
                          onClick={() => setField('links', editedTask.links.filter((item) => item.id !== link.id))}
                          className="rounded p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                          title="Удалить ссылку"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <input
                    type="text"
                    placeholder="Название"
                    value={newLinkTitle}
                    onChange={(event) => setNewLinkTitle(event.target.value)}
                    className="glass-input !w-auto min-w-[7rem] flex-1 !py-1.5 !text-xs"
                  />
                  <input
                    type="url"
                    placeholder="https://…"
                    value={newLinkUrl}
                    onChange={(event) => setNewLinkUrl(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleAddLink();
                      }
                    }}
                    className="glass-input !w-auto min-w-[9rem] flex-[2] !py-1.5 !text-xs"
                  />
                  <button type="button" onClick={handleAddLink} className="glass-btn !px-2.5" title="Добавить ссылку">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {/* Файлы */}
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Paperclip size={16} /> Файлы
                  {editedTask.files.length > 0 && (
                    <span className="glass-chip !text-[0.6rem]">{editedTask.files.length}</span>
                  )}
                </div>

                {editedTask.files.length > 0 && (
                  <ul className="mb-3 space-y-1.5">
                    {editedTask.files.map((file) => {
                      const previewable =
                        file.type?.startsWith('image/') ||
                        file.type === 'application/pdf' ||
                        /\.(jpeg|jpg|gif|png|bmp|svg|pdf)$/i.test(file.name);
                      return (
                        <li
                          key={file.id}
                          className="group flex items-center justify-between gap-2 rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2 dark:border-white/10 dark:bg-white/5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <FileText size={14} className="shrink-0 text-slate-400" />
                            <span className="truncate text-xs text-slate-700 dark:text-slate-300">{file.name}</span>
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5">
                            {previewable && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewFile(file);
                                  setIsPreviewOpen(true);
                                }}
                                className="rounded p-1 text-indigo-500 transition hover:bg-indigo-500/10"
                                title="Просмотреть"
                              >
                                <Eye size={14} />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setField('files', editedTask.files.filter((item) => item.id !== file.id))}
                              className="rounded p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                              title="Удалить файл"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <input
                  type="file"
                  id="task-file-upload"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                />
                <label
                  htmlFor="task-file-upload"
                  className={`glass-btn !py-1.5 !text-xs ${
                    isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer'
                  }`}
                >
                  {isUploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                  {isUploading ? 'Загрузка…' : 'Прикрепить файл'}
                </label>
              </div>
            </div>

            {/* Боковая панель */}
            <aside className="space-y-4 lg:border-l lg:border-slate-300/50 lg:pl-5 dark:lg:border-white/10">
              {startSupported && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    <CalendarClock size={12} /> Начало
                  </label>
                  <DateTimeField
                    value={editedTask.start_at}
                    onChange={(value) => setField('start_at', value)}
                  />
                  <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                    {editedTask.start_at ? formatDueLong(editedTask.start_at) : 'Не задано — берётся дата создания'}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  <CalendarClock size={12} /> Срок
                </label>
                <DateTimeField
                  value={editedTask.due_at}
                  onChange={(value) => setField('due_at', value)}
                  withTime={dueSupported}
                />
                <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {editedTask.due_at
                    ? formatDueLong(editedTask.due_at)
                    : 'Срок не задан'}
                  {dueSupported ? ' · время можно не указывать' : ' · время появится после миграции БД'}
                </p>
              </div>

              {recurrenceSupported && (
                <div className="rounded-xl border border-indigo-300/50 bg-indigo-500/5 p-2">
                  <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-indigo-700 uppercase dark:text-indigo-200">
                    <Repeat size={12} /> Повторение
                  </label>
                  <select
                    value={editedTask.recurrence_freq || ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setEditedTask((prev) => ({
                        ...prev,
                        recurrence_freq: value || null,
                        ...(value ? {} : { recurrence_until: '' }),
                      }));
                    }}
                    className="glass-input !py-1.5 !text-xs"
                  >
                    <option value="">Не повторять</option>
                    {RECURRENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {editedTask.recurrence_freq && (
                    <>
                      <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                        {editedTask.due_at
                          ? recurrenceLabel(editedTask.recurrence_freq, editedTask.due_at)
                          : 'Сначала укажите срок задачи'}
                      </p>

                      <label className="mt-2 block">
                        <span className="mb-1 block text-[0.6rem] text-slate-500 dark:text-slate-400">
                          Повторять до (необязательно)
                        </span>
                        <input
                          type="date"
                          value={editedTask.recurrence_until || ''}
                          min={nextRecurrence || undefined}
                          onChange={(event) => setField('recurrence_until', event.target.value || null)}
                          className="glass-input !py-1.5 !text-xs"
                        />
                      </label>

                      {nextRecurrence && (
                        <p
                          className={`mt-1 text-[0.65rem] ${
                            recurrenceEnded
                              ? 'text-rose-600 dark:text-rose-300'
                              : 'text-indigo-700 dark:text-indigo-200'
                          }`}
                        >
                          {recurrenceEnded
                            ? 'Следующая копия не создастся: дата окончания раньше.'
                            : `Следующая: ${formatDueLong(nextRecurrence)}`}
                        </p>
                      )}
                    </>
                  )}

                  <p className="mt-1.5 text-[0.6rem] leading-snug text-slate-500 dark:text-slate-400">
                    После завершения текущей задачи новая копия появится в первой колонке.
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  <Flag size={12} /> Приоритет
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRIORITIES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={!prioritySupported}
                      onClick={() => setField('priority', option.value)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-1.5 text-[0.7rem] font-medium transition ${
                        editedTask.priority === option.value
                          ? option.chip
                          : 'border-slate-300/60 bg-white/70 text-slate-700 hover:bg-white/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                      } ${!prioritySupported ? 'cursor-not-allowed opacity-50' : ''}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${option.dot}`} />
                      {option.short}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  <UserRound size={12} /> Исполнитель
                </label>
                <select
                  value={editedTask.assignee_id}
                  onChange={(event) => setField('assignee_id', event.target.value)}
                  disabled={!assigneeSupported}
                  className="glass-input !py-1.5 !text-xs"
                >
                  <option value="">Не назначен</option>
                  {allProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.work_email || 'Сотрудник'}
                      {profile.id === currentUserId ? ' (я)' : ''}
                    </option>
                  ))}
                </select>
                {!assigneeSupported && (
                  <p className="mt-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
                    Выбор исполнителя включится после миграции БД (колонка tasks.assignee_id).
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.045] p-3 dark:border-emerald-300/15 dark:bg-emerald-400/[0.06]">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    <ListChecks size={13} /> Чек-лист
                  </p>
                  <span className="text-[0.65rem] font-semibold text-emerald-700 dark:text-emerald-300">
                    {checklistDone}/{checklistTotal} · {checklistProgress ?? 0}%
                  </span>
                </div>

                {checklistTotal > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-400/20">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${checklistProgress}%` }}
                    />
                  </div>
                )}

                <div className="mt-2 space-y-1">
                  {checklist.map((item, index) => (
                    <div
                      key={item.id || `new-${index}`}
                      draggable={editingChecklistIndex !== index}
                      onDragStart={(event) => {
                        setDraggingChecklistIndex(index);
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', String(index));
                      }}
                      onDragOver={(event) => {
                        event.preventDefault();
                        setDragOverChecklistIndex(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = Number(event.dataTransfer.getData('text/plain'));
                        moveChecklistItem(from, index);
                        setDraggingChecklistIndex(null);
                        setDragOverChecklistIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggingChecklistIndex(null);
                        setDragOverChecklistIndex(null);
                      }}
                      className={`flex items-center gap-1.5 rounded-lg border bg-white/45 px-2 py-1.5 transition dark:bg-white/5 ${
                        dragOverChecklistIndex === index && draggingChecklistIndex !== index
                          ? 'border-indigo-400 bg-indigo-500/10'
                          : 'border-white/45 dark:border-white/10'
                      } ${draggingChecklistIndex === index ? 'opacity-40' : ''}`}
                    >
                      <span className="cursor-grab text-slate-300 active:cursor-grabbing dark:text-slate-600" title="Перетащите, чтобы изменить порядок">
                        <GripVertical size={13} />
                      </span>
                      <input
                        type="checkbox"
                        checked={item.is_done}
                        onChange={() => toggleChecklistItem(index)}
                        className="h-3.5 w-3.5 shrink-0 accent-emerald-500"
                      />
                      {editingChecklistIndex === index ? (
                        <input
                          autoFocus
                          value={checklistEditValue}
                          onChange={(event) => setChecklistEditValue(event.target.value)}
                          onBlur={() => saveChecklistTitle(index)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              saveChecklistTitle(index);
                            }
                            if (event.key === 'Escape') setEditingChecklistIndex(null);
                          }}
                          className="glass-input !min-w-0 flex-1 !py-0.5 !text-[0.68rem]"
                        />
                      ) : (
                        <span
                          onDoubleClick={() => {
                            setEditingChecklistIndex(index);
                            setChecklistEditValue(item.title);
                          }}
                          className={`min-w-0 flex-1 text-[0.7rem] ${item.is_done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}
                          title="Двойной клик — редактировать"
                        >
                          {item.title}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingChecklistIndex(index);
                          setChecklistEditValue(item.title);
                        }}
                        className="text-slate-400 hover:text-indigo-500"
                        title="Редактировать пункт"
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeChecklistItem(index)}
                        className="text-slate-400 hover:text-rose-500"
                        title="Удалить пункт"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-2 flex gap-1.5">
                  <input
                    value={newChecklistTitle}
                    onChange={(event) => setNewChecklistTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addChecklistItem();
                      }
                    }}
                    placeholder="Подзадача или пункт чек-листа"
                    spellCheck="true"
                    lang="ru"
                    className="glass-input !min-w-0 flex-1 !py-1.5 !text-xs"
                  />
                  <button
                    type="button"
                    onClick={addChecklistItem}
                    disabled={!newChecklistTitle.trim()}
                    className="glass-btn !px-2.5 !py-1.5 !text-xs disabled:opacity-40"
                    title="Добавить пункт"
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <p className="mt-1 text-[0.6rem] text-slate-500 dark:text-slate-400">
                  Прогресс задачи считается автоматически: выполнено пунктов / всего пунктов.
                </p>
              </div>

              {task?.id && (
                <div className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.045] p-3 dark:border-sky-300/15 dark:bg-sky-400/[0.06]">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                      <ListTree size={13} /> Подзадачи
                    </p>
                    <span className="text-[0.62rem] text-slate-500">{subtasks.length}</span>
                  </div>
                  <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
                    Полноценные задачи со своим исполнителем и сроком. Откройте подзадачу, чтобы заполнить описание.
                  </p>

                  <div className="mt-2 space-y-1">
                    {subtasks.map((subtask) => {
                      const assignee = subtask.assignee_id ? allProfiles.find((profile) => profile.id === subtask.assignee_id) : null;
                      return (
                        <button
                          key={subtask.id}
                          type="button"
                          onClick={() => onOpenExistingTask?.(subtask.id)}
                          className="flex w-full items-center gap-2 rounded-lg border border-white/45 bg-white/45 px-2 py-1.5 text-left transition hover:border-sky-300 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                        >
                          <CornerDownRight size={11} className="shrink-0 text-sky-500" />
                          <span className="min-w-0 flex-1 truncate text-[0.68rem] text-slate-700 dark:text-slate-200">{subtask.title}</span>
                          {assignee && <Avatar name={assignee.full_name} color={assignee.color} src={assignee.avatar_url} className="h-4 w-4 text-[0.4rem]" />}
                          {subtask.due_at && <span className="shrink-0 text-[0.58rem] text-slate-400">{formatDueLong(subtask.due_at)}</span>}
                          <span className="w-12 shrink-0">
                            <span className="block h-1 overflow-hidden rounded-full bg-slate-400/20">
                              <span className="block h-full rounded-full bg-sky-500" style={{ width: `${Number(subtask.progress_percent) || 0}%` }} />
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    {subtasks.length === 0 && (
                      <p className="px-1 py-2 text-[0.62rem] text-slate-400">Подзадач пока нет.</p>
                    )}
                  </div>

                  {onAddSubtask && (
                    <div className="mt-2 space-y-1.5 rounded-xl border border-white/50 bg-white/35 p-2 dark:border-white/10 dark:bg-white/5">
                      <input
                        value={newSubtask.title}
                        onChange={(event) => setNewSubtask((prev) => ({ ...prev, title: event.target.value }))}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            addSubtask();
                          }
                        }}
                        placeholder="Название подзадачи"
                        spellCheck="true"
                        lang="ru"
                        className="glass-input !py-1 !text-[0.68rem]"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <select
                          value={newSubtask.assignee_id}
                          onChange={(event) => setNewSubtask((prev) => ({ ...prev, assignee_id: event.target.value }))}
                          className="glass-input !w-auto !py-1 !text-[0.62rem]"
                        >
                          <option value="">Исполнитель</option>
                          {allProfiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>{profile.full_name || profile.work_email || 'Сотрудник'}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={newSubtask.due_at}
                          onChange={(event) => setNewSubtask((prev) => ({ ...prev, due_at: event.target.value }))}
                          className="glass-input !w-auto !py-1 !text-[0.62rem]"
                        />
                        <button type="button" onClick={addSubtask} disabled={!newSubtask.title.trim()} className="glass-btn glass-btn-primary !ml-auto !px-2 !py-1 !text-[0.62rem] disabled:opacity-40">
                          <Plus size={12} /> Добавить
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(progressSupported || milestoneSupported || (storyPointsEnabled && storyPointsSupported) || (methodology === 'agile' && sprintSupported) || dependenciesSupported) && (
                <div className="rounded-2xl border border-indigo-400/25 bg-indigo-500/[0.045] p-3 dark:border-indigo-300/15 dark:bg-indigo-400/[0.06]">
                  <p className="mb-2 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    <Gauge size={12} /> Планирование
                  </p>

                  <div className="space-y-2.5">
                    {progressSupported && (
                      checklistTotal > 0 ? (
                        <div className="text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                          <span className="flex items-center justify-between">
                            <span>Готовность из чек-листа</span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-300">{checklistProgress}%</span>
                          </span>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-400/20">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${checklistProgress}%` }} />
                          </div>
                        </div>
                      ) : (
                        <label className="block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                          <span className="flex items-center justify-between">
                            <span>Готовность</span>
                            <span className="font-mono text-slate-500">{editedTask.progress_percent}%</span>
                          </span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={editedTask.progress_percent}
                            onChange={(event) => setField('progress_percent', Number(event.target.value))}
                            className="mt-1 w-full accent-indigo-500"
                          />
                        </label>
                      )
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      {storyPointsEnabled && storyPointsSupported && (
                        <label className="flex items-center gap-1.5 text-[0.68rem] text-slate-600 dark:text-slate-300">
                          <Layers3 size={12} /> SP
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={editedTask.story_points}
                            onChange={(event) => setField('story_points', event.target.value)}
                            className="glass-input ml-1 !w-20 !py-1 !text-xs"
                            placeholder="0"
                          />
                        </label>
                      )}

                      {milestoneSupported && (
                        <label className="flex items-center gap-1.5 text-[0.68rem] text-slate-600 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={editedTask.is_milestone}
                            onChange={(event) => setField('is_milestone', event.target.checked)}
                            className="accent-amber-500"
                          />
                          <Diamond size={12} className="text-amber-500" /> Веха
                        </label>
                      )}
                      {effortSupported && !editedTask.is_milestone && (
                        <label className="flex items-center gap-1.5 text-[0.68rem] text-slate-600 dark:text-slate-300">
                          <Clock size={12} /> Трудозатраты, ч
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={editedTask.effort_hours}
                            onChange={(event) => setField('effort_hours', event.target.value)}
                            className="glass-input ml-1 !w-20 !py-1 !text-xs"
                            placeholder="8"
                          />
                        </label>
                      )}
                      {actualHoursSupported && !editedTask.is_milestone && (
                        <label className="flex items-center gap-1.5 text-[0.68rem] text-slate-600 dark:text-slate-300">
                          <Clock size={12} /> Факт, ч
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={editedTask.actual_hours}
                            onChange={(event) => setField('actual_hours', event.target.value)}
                            className="glass-input ml-1 !w-20 !py-1 !text-xs"
                            placeholder={`≈ ${Math.round(((Number(editedTask.effort_hours) || 0) * ((checklistProgress ?? Number(editedTask.progress_percent)) || 0)) / 100)}`}
                            title="Пусто — факт считается по проценту выполнения"
                          />
                        </label>
                      )}
                    </div>

                    {editedTask.is_milestone && milestoneDateSupported && (
                      <label className="block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                        Дата вехи
                        <input
                          type="date"
                          value={editedTask.milestone_date}
                          onChange={(event) => setField('milestone_date', event.target.value)}
                          className="glass-input mt-1 !py-1.5 !text-xs"
                        />
                        <span className="mt-0.5 block text-[0.6rem] text-slate-500 dark:text-slate-400">
                          Пусто — веха ставится на срок задачи.
                        </span>
                      </label>
                    )}

                    {editedTask.is_milestone && (
                      <p className="text-[0.62rem] text-amber-700 dark:text-amber-300">
                        Веха показывается ромбом на дату срока; длительность у неё не считается.
                      </p>
                    )}

                    {methodology === 'agile' && sprintSupported && (
                      <label className="block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                        Спринт
                        <select
                          value={editedTask.sprint_id}
                          onChange={(event) => setField('sprint_id', event.target.value)}
                          className="glass-input mt-1 !py-1.5 !text-xs"
                        >
                          <option value="">Без спринта</option>
                          {sprints.map((sprint) => (
                            <option key={sprint.id} value={sprint.id}>
                              {sprint.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    {dependenciesSupported && (
                      <div>
                        <p className="flex items-center gap-1.5 text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                          <GitBranch size={12} /> Зависит от
                        </p>
                        <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
                          Задача не может начаться раньше этих задач. По зависимостям строится критический путь.
                        </p>
                        <div className="scrollbar-slim mt-1 max-h-28 space-y-1 overflow-y-auto rounded-xl border border-slate-300/60 bg-white/45 p-1.5 dark:border-white/10 dark:bg-white/5">
                          {taskOptions.filter((option) => option.id !== editedTask.id).length === 0 ? (
                            <p className="px-1 py-1 text-[0.62rem] text-slate-500">Других задач пока нет.</p>
                          ) : (
                            taskOptions
                              .filter((option) => option.id !== editedTask.id)
                              .map((option) => {
                                const checked = (editedTask.depends_on_ids || []).includes(option.id);
                                return (
                                  <label
                                    key={option.id}
                                    className="flex items-center gap-2 rounded-lg px-1 py-1 text-[0.65rem] text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => {
                                        const current = editedTask.depends_on_ids || [];
                                        setField(
                                          'depends_on_ids',
                                          checked
                                            ? current.filter((id) => id !== option.id)
                                            : [...current, option.id],
                                        );
                                      }}
                                      className="accent-indigo-500"
                                    />
                                    <span className="truncate">{option.title || 'Без названия'}</span>
                                  </label>
                                );
                              })
                          )}
                        </div>
                        {dependencyLagSupported && (
                          <label className="mt-1.5 flex items-center gap-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                            Задержка после зависимостей, дн:
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={editedTask.dependency_lag_days}
                              onChange={(event) => setField('dependency_lag_days', Number(event.target.value))}
                              disabled={!canManageLag}
                              className="glass-input !w-16 !py-1 !text-xs disabled:opacity-50"
                            />
                            {!canManageLag && <span className="text-[0.58rem] text-slate-400">меняет руководитель</span>}
                          </label>
                        )}
                      </div>
                    )}

                    {onSaveRelations && (
                      <div>
                        <p className="flex items-center gap-1.5 text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                          <Link2 size={12} /> Связанные задачи
                        </p>
                        <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
                          Задачи по теме. Связь не влияет на сроки и критический путь.
                        </p>
                        <div className="scrollbar-slim mt-1 max-h-24 space-y-1 overflow-y-auto rounded-xl border border-slate-300/60 bg-white/45 p-1.5 dark:border-white/10 dark:bg-white/5">
                          {taskOptions.filter((option) => option.id !== editedTask.id).map((option) => {
                            const checked = (editedTask.related_task_ids || []).includes(option.id);
                            return (
                              <label key={option.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-[0.65rem] text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-white/10">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    const current = editedTask.related_task_ids || [];
                                    setField(
                                      'related_task_ids',
                                      checked ? current.filter((id) => id !== option.id) : [...current, option.id],
                                    );
                                  }}
                                  className="accent-indigo-500"
                                />
                                <span className="truncate">{option.title || 'Без названия'}</span>
                              </label>
                            );
                          })}
                          {taskOptions.filter((option) => option.id !== editedTask.id).length === 0 && (
                            <p className="px-1 py-1 text-[0.62rem] text-slate-500">Других задач пока нет.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!canTogglePrivacy}
                onClick={() => setField('is_private', !editedTask.is_private)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  editedTask.is_private
                    ? 'border-violet-400/60 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    : 'border-slate-300/60 bg-white/70 text-slate-700 hover:bg-white/90 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                }`}
                title={canTogglePrivacy ? 'Сделать задачу личной' : 'Приватность меняет постановщик задачи'}
              >
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                    editedTask.is_private ? 'bg-violet-500/25' : 'bg-slate-500/10'
                  }`}
                >
                  <UserRound size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block">Личная задача</span>
                  <span className="block text-[0.65rem] font-normal opacity-70">
                    {!canTogglePrivacy
                      ? 'Приватность меняет постановщик'
                      : editedTask.is_private
                        ? 'Видна только вам'
                        : 'Видна всей команде'}
                  </span>
                </span>
                <span
                  className={`relative h-4 w-7 shrink-0 rounded-full transition ${
                    editedTask.is_private ? 'bg-violet-500' : 'bg-slate-400/40'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${
                      editedTask.is_private ? 'left-3.5' : 'left-0.5'
                    }`}
                  />
                </span>
              </button>

              {!editedTask.is_private && (
                <p className="rounded-xl border border-sky-400/35 bg-sky-500/10 px-2.5 py-2 text-[0.65rem] text-sky-800 dark:text-sky-200">
                  Командная задача: после удаления останется в архиве у всех, у кого есть доступ.
                </p>
              )}

              {formError && (
                <div className="flex items-start gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  {formError}
                </div>
              )}

              {duplicateMatches.length > 0 && !isSaving && (
                <div className="rounded-xl border border-amber-400/60 bg-amber-400/10 p-2.5 dark:border-amber-400/40 dark:bg-amber-400/10">
                  <p className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-amber-800 dark:text-amber-200">
                    <AlertTriangle size={13} /> Похожие задачи уже есть
                  </p>
                  <p className="mt-0.5 text-[0.62rem] text-amber-800/80 dark:text-amber-200/80">
                    Проверьте, не дубль ли это. Создать задачу всё равно можно.
                  </p>

                  <div className="mt-2 space-y-1">
                    {duplicateMatches.map((match) => {
                      const matchAssignee = allProfiles.find((profile) => profile.id === match.assignee_id);
                      const matchColumn =
                        columns.find((column) => column.id === match.column_id)?.title || match.column_title;
                      const reasonLabel =
                        match.reason === 'title'
                          ? 'похожее название'
                          : match.reason === 'content'
                            ? 'похожее описание'
                            : 'похожий текст';

                      return (
                        <button
                          key={match.id}
                          type="button"
                          onClick={() => onOpenExistingTask?.(match.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-white/60 px-2 py-1.5 text-left transition hover:bg-white/90 dark:border-amber-400/30 dark:bg-white/5 dark:hover:bg-white/10"
                          title="Открыть существующую задачу"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[0.7rem] font-medium text-slate-800 dark:text-slate-100">
                              {match.title}
                            </span>
                            <span className="block truncate text-[0.6rem] text-slate-500 dark:text-slate-400">
                              {[matchColumn, matchAssignee?.full_name, reasonLabel].filter(Boolean).join(' · ')}
                            </span>
                          </span>
                          <span className="shrink-0 text-[0.6rem] text-amber-700 dark:text-amber-300">
                            {match.score ? `${Math.round(Number(match.score) * 100)}%` : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setDuplicateMatches([])}
                      className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      onClick={handleForceCreate}
                      className="glass-btn !px-2 !py-1 !text-[0.65rem] !text-amber-800 dark:!text-amber-200"
                    >
                      Всё равно создать
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isCheckingDuplicates}
                  className="glass-btn glass-btn-primary w-full"
                  title={isNewTask ? 'Создать задачу и закрыть окно' : 'Сохранить изменения и закрыть окно'}
                >
                  {isSaving || isCheckingDuplicates ? (
                    <Loader size={15} className="animate-spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  {isCheckingDuplicates
                    ? 'Проверяем…'
                    : isSaving
                      ? 'Сохраняем…'
                      : isNewTask
                        ? 'Создать и закрыть'
                        : 'Сохранить и закрыть'}
                </button>

                {!isNewTask && (
                  <button
                    type="button"
                    onClick={() => onDeleteTask(editedTask.id, editedTask)}
                    className="glass-btn glass-btn-danger w-full"
                    title="Сохранить изменения и переместить задачу в архив"
                  >
                    <Trash2 size={15} /> В архив
                  </button>
                )}

                {!isNewTask && task?.created_by !== currentUserId && (
                  <p className="flex items-center gap-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
                    <Send size={10} /> Задача поставлена другим сотрудником
                  </p>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </>
  );
}
