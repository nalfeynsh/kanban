import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ban, Loader2, MicOff, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
import Avatar from './Avatar';
import { clearChatMessages, fetchChatRestrictions, moderateChatUser, unmuteChatUser } from '../lib/chat';
import { ROLE_META, canModerateRole, roleOf, roleRank } from '../lib/permissions';

const DURATIONS = [
  { value: 5, label: '5 минут' },
  { value: 15, label: '15 минут' },
  { value: 30, label: '30 минут' },
  { value: 60, label: '1 час' },
  { value: 240, label: '4 часа' },
  { value: 1440, label: '1 день' },
];

function restrictionLabel(restriction) {
  if (!restriction) return '';
  if (restriction.kind === 'ban') return 'Заблокирован';
  if (!restriction.expires_at) return 'Молчание';
  const until = new Date(restriction.expires_at);
  if (Number.isNaN(until.getTime())) return 'Молчание';
  return `Молчание до ${until.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function ChatModerationModal({
  conversationId,
  members = [],
  currentUserId,
  currentUserRole,
  onClose,
  onCleared,
  onChanged,
}) {
  const [restrictions, setRestrictions] = useState([]);
  const [minutes, setMinutes] = useState(30);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    const { restrictions: rows, error: loadError } = await fetchChatRestrictions();
    if (loadError) setError(loadError.message);
    else setRestrictions(rows);
  };

  useEffect(() => {
    let alive = true;
    fetchChatRestrictions().then(({ restrictions: rows, error: loadError }) => {
      if (!alive) return;
      if (loadError) setError(loadError.message);
      else setRestrictions(rows);
    });
    return () => {
      alive = false;
    };
  }, []);

  const restrictionByUser = useMemo(
    () => new Map(restrictions.map((item) => [item.user_id, item])),
    [restrictions],
  );

  const targets = useMemo(
    () =>
      members
        .filter((member) => member.id !== currentUserId && member.is_active !== false)
        .sort(
          (a, b) =>
            roleRank(b.role) - roleRank(a.role) ||
            (a.full_name || '').localeCompare(b.full_name || '', 'ru'),
        ),
    [members, currentUserId],
  );

  const apply = async (member, kind) => {
    setBusyId(`${member.id}:${kind}`);
    setError('');
    setNotice('');
    const { error: actionError } = await moderateChatUser(
      member.id,
      kind,
      kind === 'mute' ? minutes : null,
      reason,
    );
    setBusyId('');
    if (actionError) {
      setError(actionError.message);
      return;
    }
    setNotice(kind === 'ban' ? `${member.full_name || 'Сотрудник'} заблокирован` : `Молчание выдано: ${member.full_name || 'сотрудник'}`);
    await load();
    onChanged?.();
  };

  const release = async (member) => {
    setBusyId(`${member.id}:release`);
    setError('');
    setNotice('');
    const { error: actionError } = await unmuteChatUser(member.id);
    setBusyId('');
    if (actionError) {
      setError(actionError.message);
      return;
    }
    setNotice(`Ограничение снято: ${member.full_name || 'сотрудник'}`);
    await load();
    onChanged?.();
  };

  const handleClear = async () => {
    if (!window.confirm('Очистить весь чат? Сообщения и файлы будут удалены у всех участников.')) {
      return;
    }
    setBusyId('clear');
    setError('');
    const { deleted, error: clearError } = await clearChatMessages(conversationId);
    setBusyId('');
    if (clearError) {
      setError(clearError.message);
      return;
    }
    setNotice(`Чат очищен: удалено сообщений — ${deleted}`);
    onCleared?.();
  };

  return createPortal(
    <div className="modal-overlay !z-[95]">
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <ShieldCheck size={18} className="text-indigo-500 dark:text-indigo-300" />
              Модерация чата
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Молчание, блокировка и очистка сообщений
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

        <div className="scrollbar-slim min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Срок молчания
              </span>
              <select
                value={minutes}
                onChange={(event) => setMinutes(Number(event.target.value))}
                className="glass-input !py-1.5 !text-xs"
              >
                {DURATIONS.map((duration) => (
                  <option key={duration.value} value={duration.value}>
                    {duration.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Причина (необязательно)
              </span>
              <input
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Флуд, спам, конфиденциальное…"
                maxLength={200}
                className="glass-input !py-1.5 !text-xs"
              />
            </label>
          </div>

          <p className="rounded-xl border border-slate-300/60 bg-white/45 px-3 py-2 text-[0.68rem] leading-relaxed text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Модерировать можно только роль ниже своей. Администратор может модерировать
            руководителей, заместителей и сотрудников. Руководитель — заместителей и сотрудников.
            Заместитель — только сотрудников. Себя модерировать нельзя.
          </p>

          {roleOf(currentUserRole) === 'admin' && (
            <button
              type="button"
              onClick={handleClear}
              disabled={busyId === 'clear'}
              className="glass-btn glass-btn-danger w-full !justify-center !px-3 !py-2 !text-xs"
            >
              {busyId === 'clear' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Очистить весь чат
            </button>
          )}

          {notice && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-[0.68rem] text-emerald-700 dark:text-emerald-300">
              {notice}
            </p>
          )}
          {error && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            {targets.map((member) => {
              const restriction = restrictionByUser.get(member.id);
              const allowed = canModerateRole(currentUserRole, member.role);
              const meta = ROLE_META[roleOf(member.role)];
              return (
                <div
                  key={member.id}
                  className="rounded-xl border border-slate-300/60 bg-white/50 px-2.5 py-2 dark:border-white/10 dark:bg-white/5"
                >
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={member.full_name}
                      color={member.color}
                      src={member.avatar_url}
                      className="h-7 w-7 text-[0.55rem]"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                        {member.full_name || 'Сотрудник'}
                        <span className={`rounded-full px-1.5 py-0.5 text-[0.55rem] ${meta?.chip || ''}`}>
                          {meta?.short || member.role || 'member'}
                        </span>
                      </p>
                      <p className={`text-[0.6rem] ${restriction ? 'text-rose-600 dark:text-rose-300' : 'text-slate-400'}`}>
                        {restriction ? restrictionLabel(restriction) : 'Без ограничений'}
                      </p>
                    </div>
                  </div>

                  {allowed ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => apply(member, 'mute')}
                        disabled={Boolean(busyId)}
                        className="glass-btn !px-2 !py-1 !text-[0.62rem]"
                        title={`Молчание на ${DURATIONS.find((item) => item.value === minutes)?.label}`}
                      >
                        {busyId === `${member.id}:mute` ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <MicOff size={11} />
                        )}
                        Молчание
                      </button>
                      <button
                        type="button"
                        onClick={() => apply(member, 'ban')}
                        disabled={Boolean(busyId)}
                        className="glass-btn glass-btn-danger !px-2 !py-1 !text-[0.62rem]"
                        title="Заблокировать до снятия вручную"
                      >
                        {busyId === `${member.id}:ban` ? (
                          <Loader2 size={11} className="animate-spin" />
                        ) : (
                          <Ban size={11} />
                        )}
                        Блок
                      </button>
                      {restriction && (
                        <button
                          type="button"
                          onClick={() => release(member)}
                          disabled={Boolean(busyId)}
                          className="glass-btn !px-2 !py-1 !text-[0.62rem]"
                        >
                          {busyId === `${member.id}:release` ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <UserRound size={11} />
                          )}
                          Снять
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1.5 text-[0.6rem] text-slate-400">
                      Нельзя модерировать: роль не ниже вашей.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
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
