import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import Avatar from './Avatar';
import {
  deleteProjectColumn,
  fetchProjectColumns,
  fetchProjectMembers,
  saveProjectColumn,
} from '../lib/projects';
import { supabase } from '../supabaseClient';

export default function ProjectWorkflowModal({
  project,
  members = [],
  onClose,
  onChanged,
}) {
  const [columns, setColumns] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [memberIds, setMemberIds] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newResponsible, setNewResponsible] = useState('');
  const [busyId, setBusyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const [{ columns: rows, error: columnsError }, { members: projectMembers }] = await Promise.all([
      fetchProjectColumns(project.id),
      fetchProjectMembers(project.id),
    ]);
    if (columnsError) {
      setError(columnsError.message);
      setLoading(false);
      return;
    }
    setColumns(rows);
    setDrafts(
      Object.fromEntries(
        rows.map((column) => [
          column.id,
          { title: column.title, responsible_id: column.responsible_id || '' },
        ]),
      ),
    );
    setMemberIds(projectMembers.map((member) => member.profile_id));
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ columns: rows, error: columnsError }, { members: projectMembers }] =
        await Promise.all([fetchProjectColumns(project.id), fetchProjectMembers(project.id)]);
      if (!alive) return;
      if (columnsError) {
        setError(columnsError.message);
        setLoading(false);
        return;
      }
      setColumns(rows);
      setDrafts(
        Object.fromEntries(
          rows.map((column) => [
            column.id,
            { title: column.title, responsible_id: column.responsible_id || '' },
          ]),
        ),
      );
      setMemberIds(projectMembers.map((member) => member.profile_id));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [project.id]);

  const responsibleOptions = useMemo(() => {
    const allowed = new Set([project.owner_id, ...memberIds]);
    return members.filter((member) => allowed.has(member.id));
  }, [members, memberIds, project.owner_id]);

  const updateDraft = (id, patch) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const handleSave = async (column) => {
    const draft = drafts[column.id];
    if (!draft?.title?.trim()) {
      setError('Название блока не может быть пустым');
      return;
    }
    setBusyId(column.id);
    setError('');
    setNotice('');
    const { error: saveError } = await saveProjectColumn({
      projectId: project.id,
      columnId: column.id,
      title: draft.title,
      responsibleId: draft.responsible_id || null,
    });
    setBusyId('');
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setNotice(`Блок «${draft.title.trim()}» сохранён`);
    await load();
    onChanged?.();
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) {
      setError('Введите название нового блока');
      return;
    }
    setBusyId('new');
    setError('');
    const { error: saveError } = await saveProjectColumn({
      projectId: project.id,
      title: newTitle,
      responsibleId: newResponsible || null,
    });
    setBusyId('');
    if (saveError) {
      setError(saveError.message);
      return;
    }
    setNewTitle('');
    setNewResponsible('');
    setNotice('Блок добавлен');
    await load();
    onChanged?.();
  };

  const handleDelete = async (column) => {
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('column_id', column.id)
      .is('deleted_at', null);
    const taskCount = count || 0;
    const warning =
      taskCount > 0
        ? `В блоке «${column.title}» ${taskCount} задач(и). Они будут перенесены в архив. Удалить блок?`
        : `Удалить пустой блок «${column.title}»?`;
    if (!window.confirm(warning)) return;

    setBusyId(column.id);
    setError('');
    setNotice('');
    const { result, error: deleteError } = await deleteProjectColumn(column.id);
    setBusyId('');
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    setNotice(
      `Блок удалён. В архив перенесено: ${result?.archived || 0}. Восстановленные задачи попадут в «${result?.fallback_title || 'Сделать'}».`,
    );
    await load();
    onChanged?.();
  };

  return createPortal(
    <div
      className="modal-overlay !z-[85]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <ArrowLeft size={17} className="text-indigo-500 dark:text-indigo-300" />
              Этапы проекта
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {project.name} · добавление, названия и ответственные
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
          {notice && (
            <p className="mb-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-[0.68rem] text-emerald-700 dark:text-emerald-300">
              {notice}
            </p>
          )}
          {error && (
            <p className="mb-3 rounded-xl bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : (
            <div className="space-y-2">
              {columns.map((column, index) => {
                const draft = drafts[column.id] || {};
                return (
                  <div
                    key={column.id}
                    className="rounded-2xl border border-slate-300/60 bg-white/45 p-2.5 dark:border-white/10 dark:bg-white/5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-center text-[0.6rem] text-slate-400">
                        {index + 1}
                      </span>
                      <input
                        value={draft.title || ''}
                        onChange={(event) => updateDraft(column.id, { title: event.target.value })}
                        maxLength={80}
                        className="glass-input !min-w-0 flex-1 !py-1.5 !text-xs"
                        aria-label="Название блока"
                      />
                      <select
                        value={draft.responsible_id || ''}
                        onChange={(event) =>
                          updateDraft(column.id, { responsible_id: event.target.value })
                        }
                        className="glass-input w-40 !py-1.5 !text-[0.68rem]"
                        aria-label="Ответственный за блок"
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
                        onClick={() => handleSave(column)}
                        disabled={busyId === column.id}
                        className="glass-btn !px-2 !py-1.5 !text-[0.62rem]"
                        title="Сохранить блок"
                      >
                        {busyId === column.id ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <Save size={12} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(column)}
                        disabled={busyId === column.id || columns.length <= 1}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-600 disabled:opacity-30"
                        title="Удалить блок"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {draft.responsible_id && responsibleOptions.find((m) => m.id === draft.responsible_id) && (
                      <p className="mt-1 ml-6 flex items-center gap-1 text-[0.6rem] text-slate-500 dark:text-slate-400">
                        <Avatar
                          name={responsibleOptions.find((m) => m.id === draft.responsible_id)?.full_name}
                          color={responsibleOptions.find((m) => m.id === draft.responsible_id)?.color}
                          src={responsibleOptions.find((m) => m.id === draft.responsible_id)?.avatar_url}
                          className="h-4 w-4 text-[0.4rem]"
                        />
                        Ответственный: {responsibleOptions.find((m) => m.id === draft.responsible_id)?.full_name}
                      </p>
                    )}
                  </div>
                );
              })}

              <div className="rounded-2xl border border-dashed border-indigo-400/40 bg-indigo-400/10 p-2.5">
                <p className="mb-1.5 flex items-center gap-1 text-[0.65rem] font-semibold text-indigo-700 dark:text-indigo-300">
                  <Plus size={12} /> Добавить блок
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    value={newTitle}
                    onChange={(event) => setNewTitle(event.target.value)}
                    placeholder="Например, «Аналитика» или «На проверке»"
                    maxLength={80}
                    className="glass-input !min-w-[12rem] flex-1 !py-1.5 !text-xs"
                  />
                  <select
                    value={newResponsible}
                    onChange={(event) => setNewResponsible(event.target.value)}
                    className="glass-input w-40 !py-1.5 !text-[0.68rem]"
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
                    onClick={handleAdd}
                    disabled={busyId === 'new'}
                    className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-[0.65rem]"
                  >
                    {busyId === 'new' ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Check size={12} />
                    )}
                    Добавить
                  </button>
                </div>
              </div>
            </div>
          )}

          <p className="mt-3 text-[0.62rem] leading-relaxed text-slate-500 dark:text-slate-400">
            При удалении блока его задачи не удаляются: они уходят в архив. Если старая задача
            восстанавливается из архива, а блока уже нет — она попадёт в «Сделать».
          </p>
        </div>

        <div className="flex justify-end border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
