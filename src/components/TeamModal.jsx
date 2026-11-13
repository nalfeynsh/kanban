import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, Search, Send, ChevronRight, Mail, ShieldCheck, ListChecks, MessageSquare, Plug, BarChart3 } from 'lucide-react';
import { roleLabel } from '../lib/priority';
import { telegramUrl } from '../lib/telegram';
import AccessModal from './AccessModal';
import IntegrationsPanel from './IntegrationsPanel';
import AnalyticsPanel from './AnalyticsPanel';
import Avatar from './Avatar';

export default function TeamModal({
  isOpen,
  onClose,
  members = [],
  currentUserId,
  taskCountByUser,
  onSelectMember,
  onOpenChat,
  currentRole = 'member',
  onRoleChange,
  roleSaving = false,
  tasks = [],
  archivedTasks = [],
  columns = [],
}) {
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [tab, setTab] = useState('members');
  const canAnalytics = ['admin', 'manager', 'deputy'].includes(currentRole);

  const matchesRole = (member) => {
    if (roleFilter === 'admin') return member.role === 'admin';
    if (roleFilter === 'lead') return member.role === 'manager' || member.role === 'deputy';
    if (roleFilter === 'member') return !member.role || member.role === 'member';
    return true;
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...members].sort((a, b) => {
      const activeDelta = Number(b.is_active !== false) - Number(a.is_active !== false);
      if (activeDelta !== 0) return activeDelta;
      return (a.full_name || '').localeCompare(b.full_name || '', 'ru');
    });
    const byRole = sorted.filter(matchesRole);
    if (!q) return byRole;
    return byRole.filter((member) =>
      [member.full_name, member.work_email, member.position_title, member.telegram, member.role]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, query, roleFilter]);

  if (!isOpen) return null;

  const activeCount = members.filter((member) => member.is_active !== false).length;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className={`modal-panel glass-panel flex max-h-[88vh] w-full flex-col overflow-hidden rounded-3xl ${tab === 'analytics' ? 'max-w-6xl' : 'max-w-3xl'}`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-300/50 px-6 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <Users size={20} className="text-indigo-500 dark:text-indigo-300" />
              Команда
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {tab === 'access'
                ? 'Роли, приглашения и матрица прав'
                : tab === 'integrations'
                  ? 'API-токены и обмен задачами с внешними системами'
                  : tab === 'analytics'
                    ? 'Сроки, статусы и нагрузка по сотрудникам за период'
                    : `${activeCount} из ${members.length} активны · нажмите на сотрудника, чтобы открыть профиль`}
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

        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          <div className="glass-segment">
            <button
              type="button"
              className="glass-segment-btn"
              data-active={tab === 'members'}
              onClick={() => setTab('members')}
            >
              <Users size={14} />
              Сотрудники
            </button>
            {canAnalytics && (
              <button
                type="button"
                className="glass-segment-btn"
                data-active={tab === 'analytics'}
                onClick={() => setTab('analytics')}
              >
                <BarChart3 size={14} />
                Аналитика
              </button>
            )}
            <button
              type="button"
              className="glass-segment-btn"
              data-active={tab === 'access'}
              onClick={() => setTab('access')}
            >
              <ShieldCheck size={14} />
              Доступ и права
            </button>
            {currentRole === 'admin' && (
              <button
                type="button"
                className="glass-segment-btn"
                data-active={tab === 'integrations'}
                onClick={() => setTab('integrations')}
              >
                <Plug size={14} />
                Интеграции
              </button>
            )}
          </div>
        </div>

        {tab === 'members' && (
          <>
        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          <div className="relative min-w-[180px] flex-1">
            <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по имени, почте, Telegram…"
              className="glass-input !pl-9"
            />
          </div>

          <div className="glass-segment">
            {[
              { key: 'all', label: 'Все' },
              { key: 'admin', label: 'Админы' },
              { key: 'lead', label: 'Руководители' },
              { key: 'member', label: 'Сотрудники' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                className="glass-segment-btn !px-2 !text-[0.7rem]"
                data-active={roleFilter === item.key}
                onClick={() => setRoleFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="scrollbar-slim flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <div className="py-14 text-center text-sm text-slate-500 dark:text-slate-400">
              <Users size={28} className="mx-auto mb-2 opacity-40" />
              Сотрудники не найдены
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {filtered.map((member) => {
                const isSelf = member.id === currentUserId;
                const tg = telegramUrl(member.telegram);
                const tasksCount = taskCountByUser?.get(member.id) ?? 0;

                return (
                  <li key={member.id} className="relative">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onSelectMember(member)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectMember(member);
                        }
                      }}
                      className="glass-card group flex h-full cursor-pointer items-center gap-3 rounded-2xl p-3 pr-20"
                    >
                      <Avatar
                        name={member.full_name}
                        color={member.color}
                        src={member.avatar_url}
                        shape="rounded-2xl"
                        className="h-11 w-11 text-xs avatar-ring"
                      />

                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {member.full_name || 'Без имени'}
                          {isSelf && (
                            <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                              это вы
                            </span>
                          )}
                          {member.is_active === false && (
                            <span className="rounded-full bg-slate-500/15 px-1.5 py-0.5 text-[0.55rem] font-bold tracking-wide text-slate-600 uppercase dark:text-slate-300">
                              неактивен
                            </span>
                          )}
                        </p>

                        <p className="flex items-center gap-2 truncate text-[0.7rem] text-slate-500 dark:text-slate-400">
                          <ShieldCheck size={11} className="shrink-0" />
                          {roleLabel(member.role)}
                          {member.position_title ? ` · ${member.position_title}` : ''}
                        </p>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {tasksCount > 0 && (
                            <span className="glass-chip !text-[0.62rem]">
                              <ListChecks size={10} /> {tasksCount}
                            </span>
                          )}
                          {tg && (
                            <a
                              href={tg}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="flex items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/15 px-2 py-0.5 text-[0.62rem] font-medium text-sky-700 transition hover:bg-sky-500/25 dark:text-sky-300"
                              title={`Написать в Telegram ${member.telegram}`}
                            >
                              <Send size={10} /> Telegram
                            </a>
                          )}
                          {member.work_email && (
                            <span className="flex items-center gap-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
                              <Mail size={10} /> {member.work_email}
                            </span>
                          )}
                        </div>
                      </div>

                    </div>

                    <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1">
                      {!isSelf && (
                        <button
                          type="button"
                          onClick={() => onOpenChat?.(member)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-300"
                          title={`Написать в чат: ${member.full_name || 'сотрудник'}`}
                          aria-label={`Написать в чат: ${member.full_name || 'сотрудник'}`}
                        >
                          <MessageSquare size={16} />
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onSelectMember(member)}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-white/50 hover:text-indigo-500 dark:hover:bg-white/5"
                        title={`Открыть профиль: ${member.full_name || 'сотрудник'}`}
                        aria-label={`Открыть профиль: ${member.full_name || 'сотрудник'}`}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
          </>
        )}

        {tab === 'integrations' && currentRole === 'admin' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <IntegrationsPanel />
          </div>
        )}

        {tab === 'analytics' && canAnalytics && (
          <div className="flex min-h-0 flex-1 flex-col">
            <AnalyticsPanel
              tasks={tasks}
              archivedTasks={archivedTasks}
              columns={columns}
              members={members}
            />
          </div>
        )}

        {tab === 'access' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <AccessModal
              embedded
              isOpen
              onClose={onClose}
              members={members}
              currentUserId={currentUserId}
              currentRole={currentRole}
              onRoleChange={onRoleChange}
              roleSaving={roleSaving}
            />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
