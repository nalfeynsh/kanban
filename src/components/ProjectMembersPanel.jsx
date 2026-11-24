import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2, UserPlus, Users } from 'lucide-react';
import { supabase } from '../supabaseClient';
import Avatar from './Avatar';

const ROLE_LABELS = { owner: 'Руководитель проекта', manager: 'Руководитель', member: 'Сотрудник' };

export default function ProjectMembersPanel({ project, members = [], currentUserId, canManage = false }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [addId, setAddId] = useState('');
  const [addRole, setAddRole] = useState('member');

  const byId = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const memberIds = useMemo(() => new Set(rows.map((row) => row.profile_id)), [rows]);
  const candidates = members.filter((member) => !memberIds.has(member.id) && member.id !== project?.owner_id);

  const reload = async () => {
    if (!project?.id) return;
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('project_members')
      .select('profile_id,role')
      .eq('project_id', project.id);
    setLoading(false);
    if (loadError) setError(loadError.message);
    else {
      setError('');
      setRows(data || []);
    }
  };

  useEffect(() => {
    if (!project?.id) return undefined;
    let active = true;
    supabase
      .from('project_members')
      .select('profile_id,role')
      .eq('project_id', project.id)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else {
          setError('');
          setRows(data || []);
        }
      });
    return () => { active = false; };
  }, [project?.id]);

  const addMember = async () => {
    if (!addId || !project?.id) return;
    setBusy('add');
    setError('');
    const { error: addError } = await supabase
      .from('project_members')
      .upsert({ project_id: project.id, profile_id: addId, role: addRole }, { onConflict: 'project_id,profile_id' });
    setBusy('');
    if (addError) setError(addError.message);
    else {
      setAddId('');
      await reload();
    }
  };

  const changeRole = async (profileId, role) => {
    if (!project?.id) return;
    setBusy(profileId);
    const { error: roleError } = await supabase
      .from('project_members')
      .update({ role })
      .eq('project_id', project.id)
      .eq('profile_id', profileId);
    setBusy('');
    if (roleError) setError(roleError.message);
    else await reload();
  };

  const removeMember = async (profileId) => {
    if (!project?.id || profileId === project.owner_id || profileId === currentUserId) return;
    setBusy(profileId);
    const { error: removeError } = await supabase
      .from('project_members')
      .delete()
      .eq('project_id', project.id)
      .eq('profile_id', profileId);
    setBusy('');
    if (removeError) setError(removeError.message);
    else await reload();
  };

  return (
    <div className="mt-2 rounded-2xl border border-white/45 bg-white/35 p-3 dark:border-white/10 dark:bg-white/5">
      <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
        <Users size={12} /> Участники проекта
      </p>
      <p className="mt-0.5 text-[0.6rem] text-slate-500 dark:text-slate-400">
        Создатель проекта — руководитель направления. Он может приглашать сотрудников и менять их роль на проекте.
      </p>
      {loading ? (
        <p className="mt-2 flex items-center gap-1.5 text-[0.68rem] text-slate-500"><Loader2 size={12} className="animate-spin" /> Загружаем…</p>
      ) : (
        <div className="mt-2 space-y-1">
          {rows.map((row) => {
            const member = byId.get(row.profile_id);
            const isOwner = row.profile_id === project?.owner_id;
            return (
              <div key={row.profile_id} className="flex items-center gap-2 rounded-lg bg-white/50 px-2 py-1.5 dark:bg-white/10">
                <Avatar name={member?.full_name} color={member?.color} src={member?.avatar_url} className="h-6 w-6 text-[0.5rem]" />
                <span className="min-w-0 flex-1 truncate text-[0.68rem] font-medium text-slate-700 dark:text-slate-200">
                  {member?.full_name || 'Сотрудник'} {row.profile_id === currentUserId ? '(вы)' : ''}
                </span>
                {isOwner ? (
                  <span className="text-[0.6rem] text-indigo-600 dark:text-indigo-300">Руководитель</span>
                ) : canManage ? (
                  <>
                    <select
                      value={row.role}
                      onChange={(event) => changeRole(row.profile_id, event.target.value)}
                      disabled={busy === row.profile_id}
                      className="glass-input !w-32 !py-0.5 !text-[0.6rem]"
                    >
                      <option value="manager">Руководитель</option>
                      <option value="member">Сотрудник</option>
                    </select>
                    {row.profile_id !== currentUserId && (
                      <button type="button" onClick={() => removeMember(row.profile_id)} disabled={busy === row.profile_id} className="text-slate-400 hover:text-rose-500" title="Убрать из проекта">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </>
                ) : (
                  <span className="text-[0.6rem] text-slate-500">{ROLE_LABELS[row.role] || row.role}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {canManage && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <select value={addId} onChange={(event) => setAddId(event.target.value)} className="glass-input min-w-0 flex-1 !py-1 !text-[0.65rem]">
            <option value="">Добавить сотрудника</option>
            {candidates.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.work_email || 'Сотрудник'}</option>)}
          </select>
          <select value={addRole} onChange={(event) => setAddRole(event.target.value)} className="glass-input !w-32 !py-1 !text-[0.65rem]">
            <option value="member">Сотрудник</option>
            <option value="manager">Руководитель</option>
          </select>
          <button type="button" onClick={addMember} disabled={!addId || busy === 'add'} className="glass-btn !px-2 !py-1 !text-[0.62rem]">
            {busy === 'add' ? <Loader2 size={11} className="animate-spin" /> : <UserPlus size={11} />} Добавить
          </button>
        </div>
      )}
      {error && <p className="mt-1 text-[0.62rem] text-rose-600 dark:text-rose-300">{error}</p>}
    </div>
  );
}
