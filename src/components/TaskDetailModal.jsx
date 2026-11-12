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
} from 'lucide-react';
import TipTapEditor from './TipTapEditor';
import FilePreviewModal from './FilePreviewModal';
import Avatar from './Avatar';
import { supabase } from '../supabaseClient';
import {
  formatCreated,
  formatDueLong,
  getDueValue,
  toDateTimeLocalValue,
  toDateInputValue,
  fromDateTimeLocalValue,
} from '../lib/format';
import { PRIORITIES, getPriority, normalizePriority } from '../lib/priority';
import { supports } from '../lib/schema';
import { htmlToText } from '../lib/quote';

/** props.task → редактируемая копия (модалка монтируется заново на каждую задачу) */
function toEditableTask(task) {
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
}) {
  const [editedTask, setEditedTask] = useState(() => toEditableTask(task));
  const [isCopied, setIsCopied] = useState(false);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const panelRef = useRef(null);
  const quoteSelectionRef = useRef('');

  const dueSupported = supports(allowedFields, 'due_at');
  const startSupported = supports(allowedFields, 'start_at');
  const prioritySupported = supports(allowedFields, 'priority');
  const assigneeSupported = supports(allowedFields, 'assignee_id');

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
  // Приватность меняет только постановщик: иначе можно «запереть» чужую задачу
  const canTogglePrivacy = isNewTask || !editedTask.created_by || editedTask.created_by === currentUserId;

  const setField = (key, value) => setEditedTask((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!editedTask.title.trim()) {
      setFormError('Название задачи не может быть пустым');
      return;
    }
    setFormError('');
    setIsSaving(true);
    await onSaveTask({ ...editedTask, title: editedTask.title.trim() }, editedTask.column_id);
    setIsSaving(false);
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

  const dueInputValue = dueSupported
    ? toDateTimeLocalValue(editedTask.due_at)
    : toDateInputValue(editedTask.due_at);

  const handleDueChange = (raw) => {
    if (!raw) {
      setField('due_at', null);
      return;
    }
    if (dueSupported) {
      const iso = fromDateTimeLocalValue(raw);
      setField('due_at', iso);
    } else {
      // Колонка date — храним как есть, без времени
      const [year, month, day] = raw.split('-');
      setField('due_at', raw ? `${year}-${month}-${day}` : null);
    }
  };

  const priorityInfo = getPriority(editedTask.priority);
  const assignee = allProfiles.find((profile) => profile.id === editedTask.assignee_id);

  /** Цитата: выделенный в описании текст, иначе описание целиком, иначе название */
  const handleQuoteToChat = () => {
    const selected = quoteSelectionRef.current || '';
    const text = selected || htmlToText(editedTask.description) || editedTask.title;
    if (!text) return;
    onQuoteToChat?.({ title: editedTask.title, number, text });
  };

  return (
    <>
      <div className="modal-overlay" onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
        <div
          ref={panelRef}
          className="modal-panel glass-panel scrollbar-slim max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-3xl"
        >
          {/* Шапка */}
          <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/30 bg-white/40 px-6 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/40">
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
                onChange={(event) => setField('title', event.target.value)}
                className="w-full border-b-2 border-transparent bg-transparent pb-1 text-xl font-bold text-slate-900 outline-none transition-colors placeholder:text-slate-400 hover:border-white/60 focus:border-indigo-500 dark:text-white dark:hover:border-white/15"
                placeholder="Название задачи"
                autoFocus={isNewTask}
              />

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
              title="Закрыть"
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

              <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/30 backdrop-blur-md dark:border-white/10 dark:bg-white/5">
                <TipTapEditor
                  key={editedTask.id || 'new'}
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
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/40 bg-white/35 px-3 py-2 dark:border-white/10 dark:bg-white/5"
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
                          className="group flex items-center justify-between gap-2 rounded-xl border border-white/40 bg-white/35 px-3 py-2 dark:border-white/10 dark:bg-white/5"
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
            <aside className="space-y-4 lg:border-l lg:border-white/30 lg:pl-5 dark:lg:border-white/10">
              {startSupported && (
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    <CalendarClock size={12} /> Начало
                  </label>
                  <input
                    type="datetime-local"
                    value={toDateTimeLocalValue(editedTask.start_at)}
                    onChange={(event) =>
                      setField('start_at', event.target.value ? fromDateTimeLocalValue(event.target.value) : null)
                    }
                    className="glass-input !py-1.5 !text-xs"
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
                <input
                  type={dueSupported ? 'datetime-local' : 'date'}
                  value={dueInputValue}
                  onChange={(event) => handleDueChange(event.target.value)}
                  className="glass-input !py-1.5 !text-xs"
                />
                <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {editedTask.due_at
                    ? formatDueLong(editedTask.due_at)
                    : 'Срок не задан'}
                  {!dueSupported && ' · время появится после миграции БД'}
                </p>
              </div>

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
                          : 'border-white/40 bg-white/25 text-slate-600 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
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

              <button
                type="button"
                disabled={!canTogglePrivacy}
                onClick={() => setField('is_private', !editedTask.is_private)}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  editedTask.is_private
                    ? 'border-violet-400/60 bg-violet-500/15 text-violet-700 dark:text-violet-300'
                    : 'border-white/40 bg-white/25 text-slate-600 hover:bg-white/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
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

              <div className="space-y-2 pt-1">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="glass-btn glass-btn-primary w-full"
                >
                  {isSaving ? <Loader size={15} className="animate-spin" /> : <Check size={15} />}
                  {isNewTask ? 'Создать задачу' : 'Сохранить'}
                </button>

                {!isNewTask && (
                  <button
                    type="button"
                    onClick={() => onDeleteTask(editedTask.id)}
                    className="glass-btn glass-btn-danger w-full"
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
