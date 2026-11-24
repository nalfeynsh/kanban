import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gift, Loader2, Plus, Users, X } from 'lucide-react';
import SecretSantaCreateForm from './SecretSantaCreateForm';
import SecretSantaGame from './SecretSantaGame';
import {
  addSecretSantaExclusion,
  deleteSecretSantaGame,
  drawSecretSanta,
  fetchSecretSantaGame,
  fetchSecretSantaGames,
  inviteSecretSantaUser,
  joinSecretSantaGame,
  leaveSecretSantaGame,
  removeSecretSantaExclusion,
  respondSecretSantaInvitation,
  saveSecretSantaWishlist,
  secretSantaError,
  setSecretSantaStatus,
} from './api';
import { budgetLabel, formatDate, STATUS_LABELS } from './utils';

export default function SecretSantaModal({
  isOpen,
  onClose,
  project,
  members = [],
  currentUserId,
  currentRole = 'member',
  initialGameId = null,
}) {
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [assignment, setAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingGame, setIsEditingGame] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setLoading(true);
      setError('');
      if (!initialGameId) {
        setSelectedGame(null);
        setAssignment(null);
        setIsCreating(false);
        setIsEditingGame(false);
      }
    });
    Promise.all([
      fetchSecretSantaGames(),
      initialGameId ? fetchSecretSantaGame(initialGameId) : Promise.resolve({ game: null, assignment: null }),
    ]).then(([gamesResult, gameResult]) => {
      if (!alive) return;
      setGames(gamesResult.games);
      if (gamesResult.error) setError(secretSantaError(gamesResult.error));
      if (initialGameId && gameResult.game) {
        setSelectedGame(gameResult.game);
        setAssignment(gameResult.assignment || null);
      } else if (initialGameId && gameResult.error) {
        setError(secretSantaError(gameResult.error));
      }
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, initialGameId]);

  const canManageGame = (game) => Boolean(game && (
    game.manager_id === currentUserId
    || game.created_by === currentUserId
    || ['admin', 'manager', 'deputy'].includes(currentRole)
  ));
  const canDeleteGame = ['admin', 'manager', 'deputy'].includes(currentRole);

  const refreshGames = async () => {
    const { games: rows, error: loadError } = await fetchSecretSantaGames();
    if (loadError) setError(secretSantaError(loadError));
    else setGames(rows);
  };

  const openGame = async (gameId) => {
    setBusy(true);
    setError('');
    const { game, assignment: row, error: loadError } = await fetchSecretSantaGame(gameId);
    setBusy(false);
    if (loadError) {
      setError(secretSantaError(loadError));
      return;
    }
    setSelectedGame(game);
    setAssignment(row || null);
    setIsCreating(false);
    setIsEditingGame(false);
    await refreshGames();
  };

  const run = async (action, after = true) => {
    setBusy(true);
    setError('');
    const result = await action();
    setBusy(false);
    if (result?.error) {
      setError(secretSantaError(result.error));
      return result;
    }
    if (after && selectedGame?.id) await openGame(selectedGame.id);
    return result;
  };

  const handleCreate = async (gameId) => {
    setIsCreating(false);
    setIsEditingGame(false);
    await refreshGames();
    if (gameId) await openGame(gameId);
  };

  const handleDraw = async () => {
    if (!selectedGame) return;
    if (!window.confirm('Провести жеребьёвку? После этого пары нельзя будет посмотреть организатору.')) return;
    const result = await run(() => drawSecretSanta(selectedGame.id));
    if (!result?.error) {
      setError('');
    }
  };

  const handleDelete = async () => {
    if (!selectedGame) return;
    if (!window.confirm(`Удалить игру «${selectedGame.title}»? Участники и пары будут удалены.`)) return;
    setBusy(true);
    const { error: deleteError } = await deleteSecretSantaGame(selectedGame.id);
    setBusy(false);
    if (deleteError) {
      setError(secretSantaError(deleteError));
      return;
    }
    setSelectedGame(null);
    setAssignment(null);
    await refreshGames();
  };

  const handleInvite = async (userId) => {
    if (!selectedGame) return;
    await run(() => inviteSecretSantaUser(selectedGame.id, userId));
  };

  const handleRespondInvitation = async (invitationId, accept) => {
    await run(() => respondSecretSantaInvitation(invitationId, accept));
  };

  if (!isOpen) return null;

  const snowflakes = Array.from({ length: 18 }, (_, index) => ({
    left: `${(index * 37) % 96}%`,
    size: 10 + (index % 4) * 4,
    duration: 9 + (index % 5) * 2,
    delay: -(index % 7) * 1.7,
    drift: `${-24 + (index % 9) * 7}px`,
  }));

  return createPortal(
    <div
      className="modal-overlay !z-[85]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-panel santa-panel relative flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-3xl">
        <div className="santa-snowfall" aria-hidden="true">
          {snowflakes.map((flake, index) => (
            <span
              key={index}
              className="santa-flake"
              style={{
                left: flake.left,
                fontSize: `${flake.size}px`,
                animationDuration: `${flake.duration}s`,
                animationDelay: `${flake.delay}s`,
                '--drift': flake.drift,
              }}
            >
              ❄
            </span>
          ))}
          <span className="santa-tree" style={{ left: '3%' }}>🎄</span>
          <span className="santa-tree" style={{ right: '4%', bottom: '14px', fontSize: '1.8rem' }}>🎄</span>
          <span className="santa-candy" style={{ right: '9%', bottom: '28px', transform: 'rotate(18deg)' }} />
          <span className="santa-candy" style={{ left: '7%', bottom: '42px', transform: 'rotate(-15deg)' }} />
        </div>
        <div className="relative z-10 flex items-start justify-between gap-4 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Gift size={19} className="text-rose-500" /> Тайный Санта
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Для всех сотрудников сервиса · обмен подарками
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-white/10"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim relative z-10 min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <p className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 size={22} className="animate-spin" />
            </div>
          ) : selectedGame ? (
            isEditingGame ? (
              <SecretSantaCreateForm
                project={project || null}
                game={selectedGame}
                onCreated={handleCreate}
                onCancel={() => setIsEditingGame(false)}
              />
            ) : (
              <SecretSantaGame
                key={selectedGame.id}
                game={selectedGame}
                assignment={assignment}
                members={members}
                currentUserId={currentUserId}
                canManage={canManageGame(selectedGame)}
                canDelete={canDeleteGame}
                busy={busy}
                invitations={selectedGame.invitations || []}
                onInvite={handleInvite}
                onRespondInvitation={handleRespondInvitation}
                onBack={() => {
                  setSelectedGame(null);
                  setAssignment(null);
                }}
                onJoin={() => run(() => joinSecretSantaGame(selectedGame.id))}
                onLeave={() => run(() => leaveSecretSantaGame(selectedGame.id))}
                onSaveWishlist={(payload) =>
                  run(() => saveSecretSantaWishlist(selectedGame.id, payload))
                }
                onAddExclusion={(a, b) =>
                  run(() => addSecretSantaExclusion(selectedGame.id, a, b))
                }
                onRemoveExclusion={(id) => run(() => removeSecretSantaExclusion(id))}
                onSetStatus={(status) => run(() => setSecretSantaStatus(selectedGame.id, status))}
                onDraw={handleDraw}
                onEdit={() => setIsEditingGame(true)}
                onDelete={handleDelete}
                onReload={() => openGame(selectedGame.id)}
              />
            )
          ) : isCreating ? (
            <SecretSantaCreateForm
              project={project || null}
              onCreated={handleCreate}
              onCancel={() => setIsCreating(false)}
            />
          ) : (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Игры проекта
                  </h3>
                  <p className="mt-0.5 text-[0.68rem] text-slate-500 dark:text-slate-400">
                    Создайте игру, пригласите коллег и проведите жеребьёвку.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreating(true);
                    setIsEditingGame(false);
                  }}
                  className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
                >
                  <Plus size={14} /> Создать игру
                </button>
              </div>

              {games.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-300/80 px-4 py-12 text-center dark:border-white/15">
                  <Gift size={30} className="mx-auto text-rose-400/70" />
                  <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Пока нет игр
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Создайте первую игру для команды — участвовать могут все сотрудники.
                  </p>
                </div>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {games.map((game) => (
                    <button
                      key={game.id}
                      type="button"
                      onClick={() => openGame(game.id)}
                      className="glass-card rounded-2xl p-3 text-left transition hover:border-indigo-400/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                          {game.title}
                        </span>
                        <span className="shrink-0 rounded-full bg-indigo-500/10 px-1.5 py-0.5 text-[0.55rem] font-semibold text-indigo-700 dark:text-indigo-300">
                          {STATUS_LABELS[game.status] || game.status}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[0.65rem] text-slate-500 dark:text-slate-400">
                        {game.description || 'Без описания'}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[0.6rem] text-slate-500 dark:text-slate-400">
                        <span className="flex items-center gap-1">
                          <Users size={10} /> {game.participants.length}
                        </span>
                        <span>{formatDate(game.exchange_at)}</span>
                        <span>{budgetLabel(game.budget_min, game.budget_max, game.currency)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
