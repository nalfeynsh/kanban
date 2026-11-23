import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Users,
  KeyRound,
  ShieldCheck,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  Mail,
  Table2,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import {
  PERMISSIONS,
  ROLE_META,
  ROLE_ORDER,
  can,
  registerRoleDefinitions,
  roleHasPermission,
  roleOf,
  roleOptions,
  roleRank,
} from '../lib/permissions';
import Avatar from './Avatar';

const TABS = [
  { key: 'members', label: 'Сотрудники', icon: Users, permission: 'team.view' },
  { key: 'roles', label: 'Роли', icon: ShieldCheck, permission: 'roles.manage' },
  { key: 'matrix', label: 'Права ролей', icon: Table2, permission: 'team.view' },
  { key: 'invites', label: 'Приглашения', icon: KeyRound, permission: 'invites.view' },
];

export default function AccessModal({
  isOpen,
  onClose,
  members = [],
  currentUserId,
  currentRole = 'member',
  onRoleChange,
  roleSaving = false,
  roles = [],
  onRolesChange,
  defaultTab = 'members',
  embedded = false,
}) {
  const [tab, setTab] = useState(defaultTab);
  const [query, setQuery] = useState('');
  const [invites, setInvites] = useState([]);
  const [invitesError, setInvitesError] = useState('');
  const [form, setForm] = useState({ email: '', role: 'member', code: '' });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState('');
  const [formError, setFormError] = useState('');
  const [copied, setCopied] = useState('');
  const [lastInvite, setLastInvite] = useState(null);
  const [sendingInviteId, setSendingInviteId] = useState('');
  const [ownerHintOpen, setOwnerHintOpen] = useState(false);
  const [roleList, setRoleList] = useState(roles);
  const [roleEditor, setRoleEditor] = useState(null);
  const [roleBusy, setRoleBusy] = useState(false);
  const [roleError, setRoleError] = useState('');
  const [rolesLoadError, setRolesLoadError] = useState('');
  const [roleNotice, setRoleNotice] = useState('');

  const mayManageRoles = can(currentRole, 'roles.manage');
  const mayViewInvites = can(currentRole, 'invites.view');
  const mayCreateInvites = can(currentRole, 'invites.create');
  const adminSql = currentUserId
    ? `update public.profiles set role = 'admin' where id = '${currentUserId}';`
    : '';
  const mayRevokeInvites = can(currentRole, 'invites.revoke');

  const visibleTabs = TABS.filter((item) => can(currentRole, item.permission));
  const assignableRoles = useMemo(() => {
    const actorIsAdmin = roleOf(currentRole) === 'admin';
    const actorRank = roleRank(currentRole);
    const list = (roleList.length ? roleList : roles).filter(
      (role) => actorIsAdmin || Number(role.rank) < actorRank,
    );
    return roleOptions(list);
  }, [currentRole, roleList, roles]);
  const allRoleOptions = useMemo(
    () => roleOptions(roleList.length ? roleList : roles),
    [roleList, roles],
  );
  const currentRoleDefinition = roleList.find((item) => item.key === roleOf(currentRole));
  const availablePermissions = useMemo(() => {
    if (roleOf(currentRole) === 'admin') return PERMISSIONS;
    const allowed = new Set(currentRoleDefinition?.permissions ?? []);
    return PERMISSIONS.filter((permission) => allowed.has(permission.key));
  }, [currentRole, currentRoleDefinition]);

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('roles')
        .select('key,name,rank,permissions,is_system')
        .order('rank', { ascending: false });
      if (!alive) return;
      if (error) {
        setRolesLoadError(error.message);
        return;
      }
      registerRoleDefinitions(data ?? []);
      setRoleList(data ?? []);
      setRolesLoadError('');
    })();
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const reloadRoles = async () => {
    const { data, error } = await supabase
      .from('roles')
      .select('key,name,rank,permissions,is_system')
      .order('rank', { ascending: false });
    if (error) {
      setRolesLoadError(error.message);
      return [];
    }
    registerRoleDefinitions(data ?? []);
    setRoleList(data ?? []);
    setRolesLoadError('');
    await onRolesChange?.();
    return data ?? [];
  };


  useEffect(() => {
    if (!isOpen) return undefined;
    if (!mayViewInvites) return undefined;

    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('invites')
        .select('*')
        .order('created_at', { ascending: false });
      if (!alive) return;
      setInvites(data ?? []);
      setInvitesError(error ? error.message : '');
    })();

    return () => {
      alive = false;
    };
  }, [isOpen, mayViewInvites]);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...members].sort((a, b) => {
      const roleDelta = ROLE_ORDER.indexOf(roleOf(a)) - ROLE_ORDER.indexOf(roleOf(b));
      if (roleDelta !== 0) return roleDelta;
      return (a.full_name || '').localeCompare(b.full_name || '', 'ru');
    });
    if (!q) return sorted;
    return sorted.filter((member) =>
      [member.full_name, member.work_email, member.personal_email, member.position_title]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
  }, [members, query]);

  if (!isOpen) return null;

  const copy = async (key, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const inviteUrl = (id) => `${window.location.origin}/?invite=${id}`;

  const sendInviteEmail = async (invite) => {
    setSendingInviteId(invite.id);
    setFormError('');
    setNotice('');
    const { error } = await supabase.auth.signInWithOtp({
      email: invite.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/?invite=${invite.id}&welcome=1`,
        data: {
          invite_id: invite.id,
          invite_code: invite.code || null,
          welcome: true,
        },
      },
    });
    setSendingInviteId('');
    if (error) {
      setFormError(`Письмо не отправлено: ${error.message}. Скопируйте ссылку и отправьте вручную.`);
      return false;
    }
    setNotice(`Приглашение отправлено на ${invite.email}.`);
    return true;
  };

  const startCreateRole = () => {
    setRoleError('');
    setRoleNotice('');
    setRoleEditor({
      key: null,
      name: '',
      rank: Math.max(1, (currentRoleDefinition?.rank ?? 99) - 10),
      permissions: [],
      is_system: false,
    });
  };

  const startEditRole = (role) => {
    setRoleError('');
    setRoleNotice('');
    setRoleEditor({
      key: role.key,
      name: role.name,
      rank: role.rank,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
      is_system: Boolean(role.is_system),
    });
  };

  const toggleRolePermission = (permissionKey) => {
    setRoleEditor((prev) => {
      if (!prev) return prev;
      const has = prev.permissions.includes(permissionKey);
      return {
        ...prev,
        permissions: has
          ? prev.permissions.filter((key) => key !== permissionKey)
          : [...prev.permissions, permissionKey],
      };
    });
  };

  const saveRole = async () => {
    if (!roleEditor) return;
    const name = roleEditor.name.trim();
    const rank = Number(roleEditor.rank);
    if (name.length < 2) {
      setRoleError('Название роли: минимум 2 символа');
      return;
    }
    if (!Number.isInteger(rank) || rank < 1 || rank > 98) {
      setRoleError('Ранг роли: целое число от 1 до 98');
      return;
    }

    setRoleBusy(true);
    setRoleError('');
    const params = {
      p_name: name,
      p_rank: rank,
      p_permissions: roleEditor.permissions,
    };
    if (roleEditor.key) params.p_key = roleEditor.key;
    const { error } = await supabase.rpc(roleEditor.key ? 'update_role' : 'create_role', params);
    if (error) {
      setRoleError(
        `${error.message}${error.code === '42501' ? ' — проверьте миграцию 034 и права роли.' : ''}`,
      );
      setRoleBusy(false);
      return;
    }

    await reloadRoles();
    setRoleBusy(false);
    setRoleEditor(null);
    setRoleNotice(roleEditor.key ? 'Роль обновлена' : 'Роль создана');
  };

  const removeRole = async (role) => {
    if (!window.confirm(`Удалить роль «${role.name}»?`)) return;
    setRoleBusy(true);
    setRoleError('');
    const { error } = await supabase.rpc('delete_role', { p_key: role.key });
    if (error) {
      setRoleError(error.message);
      setRoleBusy(false);
      return;
    }
    await reloadRoles();
    setRoleBusy(false);
    setRoleNotice('Роль удалена');
  };


  const createInvite = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setFormError('Укажите корректную почту');
      return;
    }

    setCreating(true);
    setFormError('');
    setNotice('');

    const { data, error } = await supabase
      .from('invites')
      .insert([
        {
          email,
          role: form.role,
          code: form.code.trim() || null,
          created_by: currentUserId,
        },
      ])
      .select()
      .maybeSingle();

    if (error) {
      const hint =
        error.code === '42501'
          ? ' Нет прав: политика invites_insert_staff применяется миграцией 003.'
          : error.code === '23505'
            ? ' Такая почта уже приглашена и приглашение не использовано.'
            : '';
      setFormError(`Не удалось создать приглашение: ${error.message}.${hint}`);
      setCreating(false);
      return;
    }

    setInvites((prev) => [data, ...prev]);
    setForm({ email: '', role: 'member', code: '' });
    const url = inviteUrl(data.id);
    setLastInvite({ url, email });
    await copy(`link-${data.id}`, url);
    setNotice(`Приглашение для ${email} создано. Ссылка скопирована — отправьте её сотруднику.`);
    await sendInviteEmail(data);
    setCreating(false);
  };

  const revokeInvite = async (invite) => {
    if (!window.confirm(`Отозвать приглашение для ${invite.email}?`)) return;

    const { error } = await supabase.from('invites').delete().eq('id', invite.id);
    if (error) {
      setInvitesError(
        `Не удалось отозвать: ${error.message}${error.code === '42501' ? ' — нужна политика invites_delete_admin из миграции 003.' : ''}`,
      );
      return;
    }
    setInvites((prev) => prev.filter((item) => item.id !== invite.id));
  };

  const panelBody = (
    <>
      <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          <div className="glass-segment">
            {visibleTabs.map((item) => (
              <button
                key={item.key}
                type="button"
                className="glass-segment-btn"
                data-active={tab === item.key}
                onClick={() => setTab(item.key)}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>

          {tab === 'members' && (
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск сотрудника…"
              className="glass-input ml-auto !w-auto min-w-[12rem] flex-1 !py-1.5 !text-xs sm:max-w-xs"
            />
          )}
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-4">
          {/* --- Сотрудники --- */}
          {tab === 'members' && (
            <>
              {!mayManageRoles && adminSql && (
                <div className="mb-3 rounded-2xl border border-amber-400/60 bg-amber-500/10 p-3 text-[0.72rem] text-amber-900 dark:border-amber-400/30 dark:text-amber-100">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <ShieldCheck size={13} /> Роли меняет администратор
                  </p>
                  <p className="mt-1">
                    Вы вошли как «{ROLE_META[roleOf({ role: currentRole })]?.label || 'Сотрудник'}».
                    Попросите администратора команды выдать вам нужную роль.
                  </p>

                  <button
                    type="button"
                    onClick={() => setOwnerHintOpen((value) => !value)}
                    className="mt-1.5 text-[0.62rem] underline underline-offset-2 opacity-80 transition hover:opacity-100"
                  >
                    {ownerHintOpen
                      ? 'Скрыть инструкцию для владельца'
                      : 'Я владелец проекта — как назначить администратора?'}
                  </button>

                  {ownerHintOpen && (
                    <div className="mt-2 rounded-xl bg-black/5 p-2 dark:bg-black/25">
                      <p className="mb-1.5 text-[0.65rem] opacity-90">
                        Один раз выполните в Supabase → SQL Editor, затем обновите страницу:
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white/60 px-2 py-1 font-mono text-[0.62rem] whitespace-nowrap dark:bg-black/40">
                          {adminSql}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy('admin-sql', adminSql)}
                          className="glass-btn !px-2 !py-1 !text-[0.62rem]"
                        >
                          {copied === 'admin-sql' ? <Check size={11} /> : <Copy size={11} />}
                          {copied === 'admin-sql' ? 'Скопировано' : 'Копировать'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <ul className="space-y-2">
              {filteredMembers.map((member) => {
                const role = roleOf(member);
                const meta = ROLE_META[role] ?? {
                  label: roleList.find((item) => item.key === role)?.name || role,
                  short: roleList.find((item) => item.key === role)?.name || role,
                  description: 'Пользовательская роль',
                  chip: 'border-indigo-400/50 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
                  dot: 'bg-indigo-400',
                };
                const isSelf = member.id === currentUserId;
                const actorIsAdmin = roleOf(currentRole) === 'admin';
                const canChangeThisMember =
                  mayManageRoles &&
                  (actorIsAdmin || roleRank(currentRole) > roleRank(member.role));

                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/45 bg-white/35 p-3 dark:border-white/10 dark:bg-white/5"
                  >
                    <Avatar
                      name={member.full_name}
                      color={member.color}
                      src={member.avatar_url}
                      shape="rounded-2xl"
                      className="h-10 w-10 text-[0.7rem]"
                    />

                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {member.full_name || 'Без имени'}
                        {isSelf && <span className="glass-chip !text-[0.58rem]">это вы</span>}
                        {member.is_active === false && (
                          <span className="glass-chip !text-[0.58rem]">неактивен</span>
                        )}
                      </p>
                      <p className="truncate text-[0.7rem] text-slate-500 dark:text-slate-400">
                        {member.position_title ? `${member.position_title} · ` : ''}
                        {member.work_email || 'почта не указана'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`hidden rounded-full border px-2 py-0.5 text-[0.62rem] font-semibold sm:inline-flex ${meta.chip}`}>
                        {meta.label}
                      </span>
                      <select
                        value={role}
                        disabled={!canChangeThisMember || isSelf || roleSaving}
                        onChange={(event) => onRoleChange?.(member.id, event.target.value)}
                        className="glass-input !w-auto !py-1.5 !text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        title={
                          isSelf
                            ? 'Свою роль изменить нельзя'
                            : canChangeThisMember
                              ? 'Назначить роль'
                              : 'Можно менять только роли ниже своей'
                        }
                      >
                        {allRoleOptions.map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                            disabled={
                              !actorIsAdmin &&
                              roleRank(option.value) >= roleRank(currentRole)
                            }
                          >
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </li>
                );
              })}

              {filteredMembers.length === 0 && (
                <li className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
                  Сотрудники не найдены
                </li>
              )}
            </ul>
            </>
          )}

          {/* --- Приглашения --- */}
          {tab === 'invites' && (
            <div className="space-y-4">
              {mayCreateInvites ? (
                <div className="rounded-2xl border border-white/45 bg-white/35 p-3 dark:border-white/10 dark:bg-white/5">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    <Plus size={13} /> Новое приглашение
                  </p>
                  <div className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(event) => setForm({ ...form, email: event.target.value })}
                      placeholder="ivan@example.com"
                      className="glass-input !py-1.5 !text-xs"
                    />
                    <select
                      value={form.role}
                      onChange={(event) => setForm({ ...form, role: event.target.value })}
                      className="glass-input !py-1.5 !text-xs"
                      title="Роль нового сотрудника"
                    >
                      {assignableRoles.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={form.code}
                      onChange={(event) => setForm({ ...form, code: event.target.value })}
                      placeholder="Код (необязательно)"
                      className="glass-input !py-1.5 !text-xs"
                    />
                    <button
                      type="button"
                      onClick={createInvite}
                      disabled={creating}
                      className="glass-btn glass-btn-primary !py-1.5 !text-xs"
                    >
                      {creating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                      Создать ссылку
                    </button>
                  </div>
                  <p className="mt-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                    Ссылка копируется и отправляется на почту через встроенную почту. Если письмо не пришло, отправьте ссылку вручную. Код доступа — по желанию.
                  </p>
                  {formError && (
                    <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-2 py-1.5 text-[0.68rem] text-rose-700 dark:text-rose-300">
                      <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {formError}
                    </p>
                  )}
                  {notice && (
                    <p className="mt-2 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-1.5 text-[0.68rem] text-emerald-700 dark:text-emerald-300">
                      {notice}
                    </p>
                  )}
                  {lastInvite && (
                    <div className="mt-2 rounded-xl border border-indigo-400/30 bg-indigo-500/8 p-2.5">
                      <p className="mb-1 text-[0.65rem] font-semibold text-indigo-700 dark:text-indigo-300">
                        Ссылка для {lastInvite.email}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <code className="min-w-0 flex-1 truncate rounded-md bg-white/60 px-1.5 py-1 font-mono text-[0.6rem] dark:bg-black/25">
                          {lastInvite.url}
                        </code>
                        <button
                          type="button"
                          onClick={() => copy('last-invite', lastInvite.url)}
                          className="glass-btn shrink-0 !px-2 !py-1 !text-[0.62rem]"
                        >
                          {copied === 'last-invite' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                        </button>
                      </div>
                      <a
                        href={`mailto:${encodeURIComponent(lastInvite.email)}?subject=${encodeURIComponent('Приглашение в «Мой Канбан»')}&body=${encodeURIComponent(`Здравствуйте!\n\nВы приглашены в «Мой Канбан».\nПерейдите по ссылке, задайте пароль и войдите:\n${lastInvite.url}\n\nЕсли ссылка не открывается, скопируйте её в браузер.`)}`}
                        className="mt-1.5 inline-flex items-center gap-1 text-[0.62rem] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                      >
                        <Mail size={11} /> Открыть письмо в почтовом клиенте
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[0.7rem] text-amber-800 dark:text-amber-200">
                  Приглашать сотрудников могут администраторы и менеджеры.
                </div>
              )}

              {invitesError && (
                <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                  Приглашения не загрузились: {invitesError}
                  {/does not exist|relation|schema cache/i.test(invitesError) &&
                    ' — похоже, миграция 001 не применена.'}
                </div>
              )}

              <ul className="space-y-2">
                {invites.map((invite) => {
                  const used = Boolean(invite.used_at);
                  return (
                      <li
                        key={invite.id}
                        className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/45 bg-white/35 p-2.5 dark:border-white/10 dark:bg-white/5"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-300">
                          <Mail size={14} />
                        </span>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                            {invite.email}
                          </p>
                          <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                            {ROLE_META[invite.role]?.label ?? invite.role}
                            {invite.code ? ` · код ${invite.code}` : ''} ·{' '}
                            {used
                              ? `использовано ${new Date(invite.used_at).toLocaleDateString('ru-RU')}`
                              : 'ожидает регистрации'}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => copy(`link-${invite.id}`, inviteUrl(invite.id))}
                          className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                          title="Скопировать ссылку-приглашение"
                        >
                          {copied === `link-${invite.id}` ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                        </button>
                        {!used && (
                          <button
                            type="button"
                            onClick={() => sendInviteEmail(invite)}
                            disabled={sendingInviteId === invite.id}
                            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                            title="Отправить приглашение на почту"
                          >
                            {sendingInviteId === invite.id ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
                          </button>
                        )}

                        {mayRevokeInvites && !used && (
                          <button
                            type="button"
                            onClick={() => revokeInvite(invite)}
                            className="glass-btn glass-btn-danger !px-2 !py-1"
                            title="Отозвать приглашение"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </li>
                    );
                })}
              </ul>

              {invites.length === 0 && !invitesError && (
                <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Приглашений пока нет
                </p>
              )}
            </div>
          )}

          {/* --- Управление ролями --- */}
          {tab === 'roles' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Роли и уровни доступа
                  </p>
                  <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                    Ранг задаёт иерархию: менять можно только роли ниже своей.
                  </p>
                </div>
                {mayManageRoles && (
                  <button
                    type="button"
                    onClick={startCreateRole}
                    disabled={roleBusy}
                    className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
                  >
                    <Plus size={13} /> Добавить роль
                  </button>
                )}
              </div>

              {rolesLoadError && (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                  Роли не загрузились: {rolesLoadError}. Проверьте миграцию 034.
                </p>
              )}

              {roleError && (
                <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
                  {roleError}
                </p>
              )}
              {roleNotice && (
                <p className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[0.68rem] text-emerald-700 dark:text-emerald-300">
                  {roleNotice}
                </p>
              )}

              {roleEditor && (
                <div className="rounded-2xl border border-indigo-400/40 bg-indigo-500/[0.06] p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_6rem]">
                    <label className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Название
                      <input
                        value={roleEditor.name}
                        onChange={(event) =>
                          setRoleEditor((prev) => ({ ...prev, name: event.target.value }))
                        }
                        className="glass-input mt-1 !py-1.5 !text-xs"
                        placeholder="Например, Старший сотрудник"
                      />
                    </label>
                    <label className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                      Ранг
                      <input
                        type="number"
                        min="1"
                        max="98"
                        value={roleEditor.rank}
                        onChange={(event) =>
                          setRoleEditor((prev) => ({ ...prev, rank: event.target.value }))
                        }
                        className="glass-input mt-1 !py-1.5 !text-xs"
                      />
                    </label>
                  </div>

                  <p className="mt-3 text-[0.65rem] font-semibold text-slate-600 dark:text-slate-300">
                    Права доступа
                  </p>
                  <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                    {PERMISSIONS.map((permission) => {
                      const allowed = availablePermissions.some(
                        (item) => item.key === permission.key,
                      );
                      const checked = roleEditor.permissions.includes(permission.key);
                      return (
                        <label
                          key={permission.key}
                          className={`flex cursor-pointer items-start gap-2 rounded-xl border p-2 text-[0.68rem] ${
                            checked
                              ? 'border-indigo-400/50 bg-indigo-500/10 text-slate-800 dark:text-slate-100'
                              : 'border-white/45 bg-white/30 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300'
                          } ${!allowed ? 'cursor-not-allowed opacity-45' : ''}`}
                          title={!allowed ? 'Этого права нет у вашей роли' : permission.hint}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={!allowed || roleBusy}
                            onChange={() => toggleRolePermission(permission.key)}
                            className="mt-0.5 accent-indigo-500"
                          />
                          <span>
                            <span className="block font-medium">{permission.label}</span>
                            <span className="block text-[0.6rem] opacity-70">{permission.hint}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={saveRole}
                      disabled={roleBusy}
                      className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
                    >
                      {roleBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Сохранить роль
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoleEditor(null)}
                      disabled={roleBusy}
                      className="glass-btn !px-3 !py-1.5 !text-xs"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {roleList.map((role) => {
                  const meta = ROLE_META[role.key] ?? {
                    label: role.name,
                    short: role.name,
                    description: 'Пользовательская роль',
                    chip: 'border-indigo-400/50 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
                    dot: 'bg-indigo-400',
                  };
                  const isCurrent = roleOf(currentRole) === role.key;
                  return (
                    <div
                      key={role.key}
                      className={`flex flex-wrap items-center gap-3 rounded-2xl border p-3 ${
                        isCurrent
                          ? 'border-indigo-400/60 bg-indigo-500/10'
                          : 'border-white/45 bg-white/30 dark:border-white/10 dark:bg-white/5'
                      }`}
                    >
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${meta.dot}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                          {role.name}
                          <span className={`rounded-full border px-1.5 py-0.5 text-[0.55rem] ${meta.chip}`}>
                            {role.is_system ? 'системная' : 'пользовательская'}
                          </span>
                          {isCurrent && <span className="glass-chip !text-[0.55rem]">ваша</span>}
                        </p>
                        <p className="text-[0.62rem] text-slate-500 dark:text-slate-400">
                          Ранг {role.rank} · прав: {Array.isArray(role.permissions) ? role.permissions.length : 0}
                        </p>
                      </div>
                      {mayManageRoles && !role.is_system && (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditRole(role)}
                            disabled={roleBusy}
                            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRole(role)}
                            disabled={roleBusy}
                            className="glass-btn glass-btn-danger !px-2 !py-1"
                            title="Удалить роль"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="flex items-start gap-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                <ShieldCheck size={12} className="mt-0.5 shrink-0" />
                Системные роли изменить нельзя. Удалить пользовательскую роль можно только после
                переназначения сотрудников и удаления приглашений с этой ролью.
              </p>
            </div>
          )}

          {/* --- Матрица прав --- */}
          {tab === 'matrix' && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                {ROLE_ORDER.map((role) => {
                  const meta = ROLE_META[role] ?? {
                    label: roleList.find((item) => item.key === role)?.name || role,
                    short: roleList.find((item) => item.key === role)?.name || role,
                    description: 'Пользовательская роль',
                    chip: 'border-indigo-400/50 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
                    dot: 'bg-indigo-400',
                  };
                  return (
                    <div
                      key={role}
                      className={`rounded-2xl border p-3 ${
                        roleOf(currentRole) === role
                          ? 'border-indigo-400/60 bg-indigo-500/10'
                          : 'border-white/45 bg-white/30 dark:border-white/10 dark:bg-white/5'
                      }`}
                    >
                      <p className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                        <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                        {meta.label}
                        {roleOf(currentRole) === role && (
                          <span className="glass-chip !text-[0.55rem]">ваша роль</span>
                        )}
                      </p>
                      <p className="mt-1 text-[0.65rem] text-slate-500 dark:text-slate-400">
                        {meta.description}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="scrollbar-slim overflow-x-auto rounded-2xl border border-white/45 dark:border-white/10">
                <table className="w-full min-w-[560px] border-collapse text-left">
                  <thead>
                    <tr className="bg-white/40 dark:bg-white/5">
                      <th className="px-3 py-2 text-[0.62rem] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
                        Право
                      </th>
                      {ROLE_ORDER.map((role) => (
                        <th
                          key={role}
                          className="px-2 py-2 text-center text-[0.62rem] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
                        >
                          {ROLE_META[role].short}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSIONS.map((permission) => (
                      <tr
                        key={permission.key}
                        className="border-t border-slate-300/50 dark:border-white/5"
                      >
                        <td className="px-3 py-2">
                          <p className="text-[0.72rem] font-medium text-slate-800 dark:text-slate-100">
                            {permission.label}
                          </p>
                          <p className="text-[0.6rem] text-slate-500 dark:text-slate-400">{permission.hint}</p>
                        </td>
                        {ROLE_ORDER.map((role) => (
                          <td key={role} className="px-2 py-2 text-center">
                            {roleHasPermission(role, permission.key) ? (
                              <Check size={14} className="mx-auto text-emerald-500" />
                            ) : (
                              <span className="text-slate-300 dark:text-slate-600">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="flex items-start gap-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                <ShieldCheck size={12} className="mt-0.5 shrink-0" />
                Матрица обновляется из ролей Supabase. Системные роли заданы в миграции 034;
                пользовательские роли можно менять на вкладке «Роли».
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-300/50 px-6 py-3 dark:border-white/10">
          <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
            {mayManageRoles
              ? 'Вы можете менять роли — изменения сохраняются сразу.'
              : 'Роли и приглашения меняет администратор команды.'}
          </p>
          {!embedded && (
            <button type="button" onClick={onClose} className="glass-btn">
              Закрыть
            </button>
          )}
        </div>
    </>
  );

  if (embedded) return panelBody;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300/50 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <ShieldCheck size={20} className="text-indigo-500 dark:text-indigo-300" />
              Доступ и права
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Ваша роль: <b className="font-semibold">{ROLE_META[roleOf(currentRole)]?.label}</b>
              {!mayManageRoles && ' · роли меняет администратор'}
            </p>
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

        {panelBody}
      </div>
    </div>,
    document.body,
  );
}
