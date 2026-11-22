import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  FolderKanban,
  Loader2,
  Plus,
  Trash2,
  Users,
  X,
  Settings2,
  RotateCcw,
  Clock3,
} from 'lucide-react';
import Avatar from './Avatar';
import ProjectDeleteModal from './ProjectDeleteModal';
import { WORKFLOW_PRESETS, createProject } from '../lib/projects';
import { roleOf } from '../lib/permissions';

const CREATE_ROLES = ['admin', 'manager', 'deputy'];

export default function ProjectsModal({
  projects = [],
  trashedProjects = [],
  projectNotices = [],
  currentProjectId,
  currentRole,
  currentUserId,
  members = [],
  onClose,
  onSelect,
  onCreated,
  onDeleteProject,
  onRestoreProject,
  onMarkNoticeRead,
  onManageWorkflow,
  onUpdateSettings,
}) {
  const [mode, setMode] = useState('list');
  const [showTrash, setShowTrash] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [preset, setPreset] = useState('simple');
  const [columns, setColumns] = useState(() =>
    WORKFLOW_PRESETS.find((item) => item.key === 'simple').columns.map((title) => ({
      title,
      responsible_id: '',
    })),
  );
  const [group, setGroup] = useState({});
  const [saving, setSaving] = useState(false);
  const [storyPointsEnabled, setStoryPointsEnabled] = useState(false);
  const [error, setError] = useState('');

  const canCreate = CREATE_ROLES.includes(roleOf(currentRole));
  const currentProject = projects.find((project) => project.id === currentProjectId) || null;
  const canManageWorkflow = Boolean(currentProject) && CREATE_ROLES.includes(roleOf(currentRole));
  const me = members.find((member) => member.id === currentUserId);
  const unreadNotices = projectNotices.filter((notice) => !notice.read_at);
  const canDeleteProject = (project) =>
    roleOf(currentRole) === 'admin' || project.owner_id === currentUserId;
  const ownerName = (project) =>
    members.find((member) => member.id === project.owner_id)?.full_name || 'не указан';
  const noticeText = (notice) => {
    if (notice.kind === 'project_deleted') {
      const until = notice.created_at
        ? new Date(new Date(notice.created_at).getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;
      return `Проект «${notice.project_name}» перемещён в корзину. Восстановить можно до ${
        until ? until.toLocaleDateString('ru-RU') : '30 дней'
      }. После этой даты блоки, задачи и вложенные файлы будут удалены.`;
    }
    if (notice.kind === 'project_restored') {
      return `Проект «${notice.project_name}» восстановлен из корзины.`;
    }
    return notice.message;
  };
  const candidates = useMemo(
    () =>
      members
        .filter((member) => member.id !== currentUserId && member.is_active !== false)
        .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ru')),
    [members, currentUserId],
  );

  const responsibleOptions = useMemo(
    () => [
      ...(me ? [{ id: me.id, full_name: me.full_name || 'Вы', color: me.color, avatar_url: me.avatar_url }] : []),
      ...Object.keys(group)
        .map((id) => members.find((member) => member.id === id))
        .filter(Boolean),
    ],
    [group, me, members],
  );

  const applyPreset = (key) => {
    const next = WORKFLOW_PRESETS.find((item) => item.key === key);
    if (!next) return;
    setPreset(key);
    setColumns(next.columns.map((title) => ({ title, responsible_id: '' })));
  };

  const setColumnTitle = (index, value) => {
    setPreset('custom');
    setColumns((prev) => prev.map((column, i) => (i === index ? { ...column, title: value } : column)));
  };

  const setColumnResponsible = (index, value) => {
    setColumns((prev) =>
      prev.map((column, i) => (i === index ? { ...column, responsible_id: value } : column)),
    );
  };

  const addColumn = () => {
    setPreset('custom');
    setColumns((prev) => [...prev, { title: '', responsible_id: '' }]);
  };

  const removeColumn = (index) => {
    setPreset('custom');
    setColumns((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const toggleMember = (id) => {
    const selected = Boolean(group[id]);
    setGroup((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 'member' };
    });
    if (selected) {
      setColumns((columnsPrev) =>
        columnsPrev.map((column) =>
          column.responsible_id === id ? { ...column, responsible_id: '' } : column,
        ),
      );
    }
  };

  const setMemberRole = (id, role) => {
    setGroup((prev) => ({ ...prev, [id]: role }));
  };

  const handleCreate = async () => {
    const cleanColumns = columns
      .map((column) => ({ ...column, title: column.title.trim() }))
      .filter((column) => column.title);
    if (!name.trim()) {
      setError('Укажите название проекта');
      return;
    }
    if (cleanColumns.length === 0) {
      setError('Добавьте хотя бы один этап');
      return;
    }

    setSaving(true);
    setError('');
    const { projectId, error: createError } = await createProject({
      name: name.trim(),
      description: description.trim(),
      columns: cleanColumns.map((column) => ({
        title: column.title,
        responsible_id: column.responsible_id || null,
      })),
      members: Object.entries(group).map(([profile_id, role]) => ({ profile_id, role })),
      storyPointsEnabled,
    });
    setSaving(false);

    if (createError) {
      setError(createError.message);
      return;
    }
    onCreated?.(projectId);
  };

  return createPortal(
    <div
      className="modal-overlay !z-[80]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <FolderKanban size={18} className="text-indigo-500 dark:text-indigo-300" />
              {mode === 'create' ? 'Новый проект' : 'Проекты'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mode === 'create'
                ? 'Название, этапы, рабочая группа и ответственные'
                : 'Выберите проект или создайте новый'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === 'list' ? (
            <div className="space-y-2">
              {error && (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              )}
              {unreadNotices.length > 0 && (
                <div className="rounded-2xl border border-amber-400/50 bg-amber-400/10 p-3 text-xs text-amber-900 dark:border-amber-400/30 dark:text-amber-100">
                  <p className="font-semibold">Уведомления по проектам</p>
                  <ul className="mt-1.5 space-y-2">
                    {unreadNotices.map((notice) => (
                      <li key={notice.id} className="flex items-start gap-2">
                        <span className="min-w-0 flex-1">{noticeText(notice)}</span>
                        <button
                          type="button"
                          onClick={() => onMarkNoticeRead?.(notice.id)}
                          className="shrink-0 text-[0.62rem] underline underline-offset-2"
                        >
                          Прочитано
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.65rem] font-semibold text-slate-500 dark:text-slate-400">
                  {showTrash ? 'Корзина проектов' : 'Активные проекты'}
                </p>
                <button
                  type="button"
                  onClick={() => setShowTrash((value) => !value)}
                  className="glass-btn !px-2.5 !py-1 !text-[0.65rem]"
                >
                  {showTrash ? 'К активным' : `Корзина (${trashedProjects.length})`}
                </button>
              </div>

              {showTrash ? (
                <div className="space-y-2">
                  {trashedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/45 bg-white/30 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-slate-600 dark:text-slate-300">
                        <Trash2 size={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {project.name}
                        </p>
                        <p className="flex items-center gap-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                          <Clock3 size={11} />
                          Удалён {project.deleted_at ? new Date(project.deleted_at).toLocaleDateString('ru-RU') : '—'}
                          {project.purge_at
                            ? ` · удалится ${new Date(project.purge_at).toLocaleDateString('ru-RU')}`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          const { error: restoreError } = await onRestoreProject?.(project.id) || {};
                          if (restoreError) setError(restoreError.message);
                        }}
                        className={`glass-btn !px-2.5 !py-1 !text-[0.65rem] ${
                          canDeleteProject(project) ? '' : 'hidden'
                        }`}
                      >
                        <RotateCcw size={12} /> Восстановить
                      </button>
                    </div>
                  ))}
                  {trashedProjects.length === 0 && (
                    <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                      Корзина пуста
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {projects.map((project) => {
                    const active = project.id === currentProjectId;
                    return (
                      <div key={project.id} className="relative">
                        <button
                          type="button"
                          onClick={() => onSelect?.(project.id)}
                          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 pr-14 text-left transition ${
                            active
                              ? 'border-indigo-400/60 bg-indigo-400/10'
                              : 'border-slate-300/60 bg-white/45 hover:border-indigo-400/40 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
                          }`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
                            <FolderKanban size={17} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                                {project.name}
                              </span>
                              {active && (
                                <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[0.55rem] font-bold text-indigo-700 dark:text-indigo-300">
                                  Открыт
                                </span>
                              )}
                            </span>
                            <span className="block truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                              {project.description || 'Без описания'}
                            </span>
                          </span>
                          <ChevronRight size={16} className="shrink-0 text-slate-400" />
                        </button>
                        {canDeleteProject(project) && (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(project)}
                            className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                            title="Удалить проект"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </>
              )}

              {!showTrash && projects.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
                  Проектов пока нет
                </p>
              )}

              {currentProject && canManageWorkflow && (
                <button
                  type="button"
                  onClick={() => onManageWorkflow?.(currentProject)}
                  className="glass-btn w-full !justify-center !px-3 !py-2 !text-xs"
                >
                  <Settings2 size={14} /> Настроить этапы проекта
                </button>
              )}

              {currentProject && canManageWorkflow && (
                <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-white/45 bg-white/40 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <input
                    type="checkbox"
                    checked={currentProject.story_points_enabled === true}
                    onChange={(event) => onUpdateSettings?.({ story_points_enabled: event.target.checked })}
                    className="h-4 w-4 accent-indigo-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Story points в этом проекте
                    </span>
                    <span className="block text-[0.62rem] text-slate-500 dark:text-slate-400">
                      Оценка задач и загрузка исполнителей в SP
                    </span>
                  </span>
                </label>
              )}

              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setMode('create');
                    setError('');
                  }}
                  className="glass-btn mt-1 w-full !justify-center !px-3 !py-2 !text-xs"
                >
                  <Plus size={14} /> Новый проект
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    Название
                  </span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={120}
                    placeholder="Например, Новый сайт"
                    className="glass-input !py-1.5 !text-xs"
                    autoFocus
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    Назначение
                  </span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    maxLength={300}
                    placeholder="Коротко о проекте"
                    className="glass-input !py-1.5 !text-xs"
                  />
                </label>
              </div>

              <div>
                <p className="mb-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  Воркфлоу
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {WORKFLOW_PRESETS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => applyPreset(item.key)}
                      className={`glass-btn !px-2.5 !py-1 !text-[0.68rem] ${
                        preset === item.key ? 'glass-btn-primary' : ''
                      }`}
                      title={item.description}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-indigo-400/25 bg-indigo-500/[0.04] px-3 py-2.5 dark:border-indigo-300/15 dark:bg-indigo-400/[0.06]">
                <input
                  type="checkbox"
                  checked={storyPointsEnabled}
                  onChange={(event) => setStoryPointsEnabled(event.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-indigo-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Оценивать время в story points
                  </span>
                  <span className="block text-[0.65rem] text-slate-500 dark:text-slate-400">
                    Необязательно. В Ганте появятся SP для задач и загрузка исполнителей в SP/день.
                    Для существующего проекта это можно включить в настройках.
                  </span>
                </span>
              </label>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <p className="text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    Этапы и ответственные
                  </p>
                  <button type="button" onClick={addColumn} className="glass-btn !px-2 !py-1 !text-[0.62rem]">
                    <Plus size={11} /> Блок
                  </button>
                </div>
                <div className="space-y-1.5">
                  {columns.map((column, index) => (
                    <div key={index} className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-center text-[0.6rem] text-slate-400">{index + 1}</span>
                      <input
                        value={column.title}
                        onChange={(event) => setColumnTitle(index, event.target.value)}
                        placeholder="Название блока"
                        maxLength={80}
                        className="glass-input !min-w-0 flex-1 !py-1.5 !text-xs"
                      />
                      <select
                        value={column.responsible_id || ''}
                        onChange={(event) => setColumnResponsible(index, event.target.value)}
                        className="glass-input w-40 !py-1.5 !text-[0.68rem]"
                        title="Ответственный за блок"
                      >
                        <option value="">Ответственный</option>
                        {responsibleOptions.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.full_name || 'Сотрудник'}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => removeColumn(index)}
                        disabled={columns.length <= 1}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-30"
                        title="Удалить блок"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                  <Users size={12} /> Рабочая группа
                </p>
                <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-300/60 p-1.5 dark:border-white/10">
                  {candidates.map((member) => {
                    const selected = Boolean(group[member.id]);
                    return (
                      <div
                        key={member.id}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                          selected ? 'bg-indigo-400/10' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleMember(member.id)}
                          className="h-3.5 w-3.5 accent-indigo-500"
                        />
                        <Avatar
                          name={member.full_name}
                          color={member.color}
                          src={member.avatar_url}
                          className="h-6 w-6 text-[0.5rem]"
                        />
                        <span className="min-w-0 flex-1 truncate text-[0.72rem] text-slate-700 dark:text-slate-200">
                          {member.full_name || 'Сотрудник'}
                        </span>
                        {selected && (
                          <select
                            value={group[member.id]}
                            onChange={(event) => setMemberRole(member.id, event.target.value)}
                            className="glass-input !w-28 !py-1 !text-[0.62rem]"
                          >
                            <option value="member">Участник</option>
                            <option value="manager">Руководитель</option>
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {candidates.length === 0 && (
                    <p className="px-2 py-2 text-[0.65rem] text-slate-400">Нет доступных сотрудников</p>
                  )}
                </div>
                <p className="mt-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
                  Вы — владелец проекта. Ответственных за этапы можно выбрать из рабочей группы.
                </p>
              </div>

              {error && (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          {mode === 'create' ? (
            <>
              <button type="button" onClick={() => setMode('list')} className="glass-btn !px-3 !py-1.5 !text-xs">
                <ArrowLeft size={13} /> Назад
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
              >
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Создать проект
              </button>
            </>
          ) : (
            <>
              <span className="text-[0.62rem] text-slate-400">
                {projects.length} проект(ов)
              </span>
              <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
                Закрыть
              </button>
            </>
          )}
        </div>
      </div>

      {deleteTarget && (
        <ProjectDeleteModal
          project={deleteTarget}
          ownerName={ownerName(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
          onDelete={onDeleteProject}
        />
      )}
    </div>,
    document.body,
  );
}
