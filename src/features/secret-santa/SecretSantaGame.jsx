import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Gift,
  Link2,
  Loader2,
  Lock,
  Play,
  Pencil,
  RotateCcw,
  Trash2,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import Avatar from '../../components/Avatar';
import { STATUS_LABELS, budgetLabel, formatDate, participantName } from './utils';

function safeUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function StatusBadge({ status }) {
  const tone =
    status === 'drawn'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
      : status === 'cancelled'
        ? 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
        : status === 'collecting'
          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
          : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300';
  return (
    <span className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${tone}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function SecretSantaGame({
  game,
  assignment,
  members = [],
  currentUserId,
  canManage,
  busy,
  onBack,
  onJoin,
  onLeave,
  onSaveWishlist,
  onAddExclusion,
  onRemoveExclusion,
  onSetStatus,
  onDraw,
  onEdit,
  onDelete,
  onReload,
}) {
  const myParticipant = game.participants.find((item) => item.user_id === currentUserId) || null;
  const [wishlist, setWishlist] = useState(myParticipant?.wishlist || '');
  const [wishlistUrl, setWishlistUrl] = useState(myParticipant?.wishlist_url || '');
  const [preferences, setPreferences] = useState(myParticipant?.preferences || '');
  const [exclusionA, setExclusionA] = useState('');
  const [exclusionB, setExclusionB] = useState('');
  const [localError, setLocalError] = useState('');

  const participantById = useMemo(
    () => new Map(game.participants.map((participant) => [participant.id, participant])),
    [game.participants],
  );

  const saveWishlist = async (event) => {
    event.preventDefault();
    setLocalError('');
    if (wishlistUrl && !safeUrl(wishlistUrl)) {
      setLocalError('Ссылка должна начинаться с http:// или https://');
      return;
    }
    await onSaveWishlist({ wishlist, wishlistUrl, preferences });
  };

  const addExclusion = async () => {
    setLocalError('');
    if (!exclusionA || !exclusionB || exclusionA === exclusionB) {
      setLocalError('Выберите двух разных участников.');
      return;
    }
    await onAddExclusion(exclusionA, exclusionB);
    setExclusionA('');
    setExclusionB('');
  };

  const assignmentUrl = safeUrl(assignment?.wishlist_url);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
          >
            <ArrowLeft size={12} /> К списку игр
          </button>
          <h3 className="mt-2 truncate text-lg font-bold text-slate-900 dark:text-white">
            {game.title}
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[0.68rem] text-slate-500 dark:text-slate-400">
            <StatusBadge status={game.status} />
            <span className="flex items-center gap-1">
              <Users size={12} /> {game.participants.length}
            </span>
            <span className="flex items-center gap-1">
              <CalendarDays size={12} /> обмен: {formatDate(game.exchange_at)}
            </span>
            <span>{budgetLabel(game.budget_min, game.budget_max, game.currency)}</span>
          </div>
        </div>
        {canManage && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onEdit?.()}
              disabled={busy}
              className="glass-btn !px-2.5 !py-1.5 !text-xs"
              title="Редактировать игру"
            >
              <Pencil size={13} /> Изменить
            </button>
            <button
              type="button"
              onClick={() => onDelete?.()}
              disabled={busy}
              className="glass-btn glass-btn-danger !px-2.5 !py-1.5 !text-xs"
              title="Удалить игру"
            >
              <Trash2 size={13} /> Удалить
            </button>
          </div>
        )}
      </div>

      {game.description && (
        <p className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">{game.description}</p>
      )}

      {localError && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {localError}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-3">
          <div className="glass-card rounded-2xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Users size={14} /> Участники
              </h4>
              {!myParticipant && ['draft', 'collecting'].includes(game.status) && (
                <button
                  type="button"
                  onClick={onJoin}
                  disabled={busy}
                  className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-xs"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                  Участвовать
                </button>
              )}
              {myParticipant && ['draft', 'collecting'].includes(game.status) && (
                <button
                  type="button"
                  onClick={onLeave}
                  disabled={busy}
                  className="glass-btn !px-2.5 !py-1.5 !text-xs"
                >
                  Выйти из игры
                </button>
              )}
            </div>

            {game.participants.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                Пока никто не участвует. Пригласите коллег из проекта.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {game.participants.map((participant) => {
                  const member = members.find((item) => item.id === participant.user_id);
                  const isMe = participant.user_id === currentUserId;
                  return (
                    <div
                      key={participant.id}
                      className="flex items-center gap-2 rounded-xl border border-white/45 bg-white/35 px-2.5 py-2 dark:border-white/10 dark:bg-white/5"
                    >
                      <Avatar
                        name={member?.full_name || 'Сотрудник'}
                        color={member?.color}
                        src={member?.avatar_url}
                        className="h-7 w-7 text-[0.6rem]"
                      />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                        {member?.full_name || 'Сотрудник'} {isMe && <span className="text-slate-400">· вы</span>}
                      </span>
                      {participant.wishlist && <Gift size={12} className="text-rose-400" />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {myParticipant && (
            <form onSubmit={saveWishlist} className="glass-card rounded-2xl p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Gift size={14} /> Мои пожелания
              </h4>
              <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                Их увидит тот, кто будет вам дарить.
              </p>
              <label className="mt-2 block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                Что хотите получить
                <textarea
                  value={wishlist}
                  onChange={(event) => setWishlist(event.target.value)}
                  className="glass-input mt-1 min-h-24 resize-y"
                  placeholder="Книга, настольная игра, что-то для дома..."
                />
              </label>
              <label className="mt-2 block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                Ссылка на вишлист
                <input
                  value={wishlistUrl}
                  onChange={(event) => setWishlistUrl(event.target.value)}
                  className="glass-input mt-1"
                  placeholder="https://..."
                  inputMode="url"
                />
              </label>
              <label className="mt-2 block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
                Предпочтения
                <input
                  value={preferences}
                  onChange={(event) => setPreferences(event.target.value)}
                  className="glass-input mt-1"
                  placeholder="Размер, цвет, аллергии, любимые бренды"
                />
              </label>
              <div className="mt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="glass-btn !px-2.5 !py-1.5 !text-xs"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Сохранить пожелания
                </button>
              </div>
            </form>
          )}

          {game.status === 'drawn' && myParticipant && (
            <div className="glass-card rounded-2xl border-indigo-400/30 p-4">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Lock size={14} /> Ваш получатель
              </h4>
              {assignment ? (
                <div className="mt-2">
                  <div className="flex items-center gap-2.5">
                    <Avatar
                      name={assignment.recipient_name}
                      color={assignment.recipient_color}
                      src={assignment.recipient_avatar_url}
                      className="h-10 w-10 text-[0.65rem]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {assignment.recipient_name}
                      </p>
                      <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                        {budgetLabel(assignment.budget_min, assignment.budget_max, assignment.currency)}
                      </p>
                    </div>
                  </div>
                  {assignment.wishlist && (
                    <p className="mt-3 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                      {assignment.wishlist}
                    </p>
                  )}
                  {assignment.preferences && (
                    <p className="mt-1 text-[0.7rem] text-slate-500 dark:text-slate-400">
                      Предпочтения: {assignment.preferences}
                    </p>
                  )}
                  {assignmentUrl && (
                    <a
                      href={assignmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                    >
                      <Link2 size={12} /> Открыть вишлист
                    </a>
                  )}
                  <p className="mt-3 text-[0.62rem] text-slate-500 dark:text-slate-400">
                    Обмен: {formatDate(assignment.exchange_at)}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Жеребьёвка проведена, но ваша пара не найдена. Обратитесь к организатору.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3">
          {canManage && (
            <div className="glass-card rounded-2xl p-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Управление игрой
              </h4>
              <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                Вы не видите пары участников — это защита сюрприза.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {game.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => onSetStatus?.('collecting')}
                    disabled={busy}
                    className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-xs"
                  >
                    <Play size={13} /> Открыть набор
                  </button>
                )}
                {game.status === 'collecting' && (
                  <button
                    type="button"
                    onClick={onDraw}
                    disabled={busy}
                    className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-xs"
                  >
                    {busy ? <Loader2 size={13} className="animate-spin" /> : <Gift size={13} />}
                    Провести жеребьёвку
                  </button>
                )}
                {game.status === 'drawn' && (
                  <button
                    type="button"
                    onClick={onReload}
                    disabled={busy}
                    className="glass-btn !px-2.5 !py-1.5 !text-xs"
                  >
                    <RotateCcw size={13} /> Обновить
                  </button>
                )}
                {['draft', 'collecting'].includes(game.status) && (
                  <button
                    type="button"
                    onClick={() => onSetStatus?.('cancelled')}
                    disabled={busy}
                    className="glass-btn !px-2.5 !py-1.5 !text-xs"
                  >
                    <XCircle size={13} /> Отменить
                  </button>
                )}
              </div>
              {game.status === 'drawn' && (
                <p className="mt-2 rounded-xl bg-slate-500/10 px-2.5 py-2 text-[0.65rem] text-slate-500 dark:text-slate-400">
                  Жеребьёвка уже проведена. Чтобы изменить участников, отмените игру и создайте новую.
                </p>
              )}
            </div>
          )}

          {canManage && ['draft', 'collecting'].includes(game.status) && (
            <div className="glass-card rounded-2xl p-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Исключения</h4>
              <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                Кто не должен дарить друг другу.
              </p>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
                <select
                  value={exclusionA}
                  onChange={(event) => setExclusionA(event.target.value)}
                  className="glass-input !py-1.5 !text-xs"
                >
                  <option value="">Кто</option>
                  {game.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participantName(participant, members)}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">↔</span>
                <select
                  value={exclusionB}
                  onChange={(event) => setExclusionB(event.target.value)}
                  className="glass-input !py-1.5 !text-xs"
                >
                  <option value="">Кому</option>
                  {game.participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participantName(participant, members)}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={addExclusion}
                disabled={busy || game.participants.length < 2}
                className="glass-btn mt-2 !px-2.5 !py-1.5 !text-xs"
              >
                Добавить исключение
              </button>

              {game.exclusions.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {game.exclusions.map((exclusion) => (
                    <div
                      key={exclusion.id}
                      className="flex items-center gap-1.5 rounded-lg bg-white/35 px-2 py-1.5 text-[0.65rem] dark:bg-white/5"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {participantName(participantById.get(exclusion.participant_a), members)} ↔{' '}
                        {participantName(participantById.get(exclusion.participant_b), members)}
                      </span>
                      <button
                        type="button"
                        onClick={() => onRemoveExclusion?.(exclusion.id)}
                        className="text-slate-400 hover:text-rose-500"
                        title="Удалить исключение"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {game.rules && (
            <div className="glass-card rounded-2xl p-4">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Правила</h4>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300">
                {game.rules}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
