import { useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Send,
  Search,
  MessageSquare,
  Loader2,
  AlertTriangle,
  UserRound,
  ExternalLink,
  Check,
  Plus,
  Users,
  Paperclip,
  Download,
  Forward,
  Trash2,
  FileText,
} from 'lucide-react';
import { telegramUrl } from '../lib/telegram';
import { chatFileUrl } from '../lib/chat';
import Avatar from './Avatar';

const pad = (n) => String(n).padStart(2, '0');

function timeOf(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayLabel(value) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (dayKey(date) === dayKey(today)) return 'Сегодня';
  if (dayKey(date) === dayKey(yesterday)) return 'Вчера';

  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function dialogTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  if (dayKey(date) === dayKey(new Date())) return timeOf(date);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function membersLabel(count) {
  const n = Number(count) || 1;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} участник`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} участника`;
  return `${n} участников`;
}

function formatBytes(size) {
  const value = Number(size);
  if (!value || value < 0) return 'файл';
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}

/**
 * Текст сообщения: строки «> …» рисуем как цитату,
 * остальное — обычным текстом с сохранением переносов.
 */
function MessageBody({ text, own }) {
  const lines = String(text ?? '').split('\n');
  const blocks = [];
  let plain = [];
  let quote = [];

  const flushPlain = () => {
    if (plain.length) {
      blocks.push({ type: 'plain', text: plain.join('\n') });
      plain = [];
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      blocks.push({ type: 'quote', text: quote.join('\n') });
      quote = [];
    }
  };

  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      flushPlain();
      quote.push(line.replace(/^>\s?/, ''));
    } else {
      flushQuote();
      plain.push(line);
    }
  }
  flushPlain();
  flushQuote();

  return (
    <>
      {blocks.map((block, index) =>
        block.type === 'quote' ? (
          <blockquote
            key={`quote-${index}`}
            className={`my-1 border-l-2 py-0.5 pl-2 text-[0.78rem] italic ${
              own ? 'border-white/70 text-white/95' : 'border-indigo-400/70 text-slate-700 dark:text-slate-200'
            }`}
          >
            {block.text}
          </blockquote>
        ) : (
          <span key={`text-${index}`} className="block whitespace-pre-wrap">
            {block.text}
          </span>
        ),
      )}
    </>
  );
}

/**
 * Презентационная часть чата — без запросов, чтобы её можно было
 * отрисовать в стенде и протестировать отдельно.
 */
export default function ChatView({
  dialogs = [],
  activeId = null,
  messages = [],
  candidates = [],
  profilesById,
  currentUserId,
  loadingDialogs = false,
  loadingMessages = false,
  loadingCandidates = false,
  sending = false,
  error = '',
  schemaMissing = false,
  teamUnavailable = false,
  onSelect,
  onSend,
  onSendFiles,
  onDeleteMessage,
  onForwardMessage,
  onClose,
  onOpenProfile,
  onStartDialog,
  onRetry,
  initialDraft = '',
}) {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(initialDraft || '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [fileMenu, setFileMenu] = useState(null);
  const [forwardMessage, setForwardMessage] = useState(null);
  const listRef = useRef(null);
  const fileInputRef = useRef(null);
  const composerRef = useRef(null);

  const activeDialog = dialogs.find((dialog) => dialog.conversation_id === activeId) || null;
  const isTeam = Boolean(activeDialog?.is_team);
  const peer = activeDialog && !isTeam
    ? {
        id: activeDialog.peer_id,
        full_name: activeDialog.peer_name,
        color: activeDialog.peer_color,
        telegram: activeDialog.peer_telegram,
        avatar_url: profilesById?.get?.(activeDialog.peer_id)?.avatar_url || '',
      }
    : null;
  const peerTelegram = peer ? telegramUrl(peer.telegram) : null;

  const teamDialog = dialogs.find((dialog) => dialog.is_team) || null;
  const privateDialogs = dialogs.filter((dialog) => !dialog.is_team);

  const filteredPrivate = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return privateDialogs;
    return privateDialogs.filter((dialog) => (dialog.peer_name || '').toLowerCase().includes(q));
  }, [privateDialogs, query]);

  // Сотрудники, с которыми ещё нет переписки — можно начать диалог сразу из списка
  const startable = useMemo(() => {
    const q = query.trim().toLowerCase();
    const existing = new Set(privateDialogs.map((dialog) => dialog.peer_id));
    return candidates
      .filter((member) => member.id !== currentUserId && !existing.has(member.id))
      .filter((member) => !q || (member.full_name || '').toLowerCase().includes(q))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ru'));
  }, [candidates, privateDialogs, currentUserId, query]);

  const pickerMembers = useMemo(() => {
    const q = memberQuery.trim().toLowerCase();
    return candidates
      .filter((member) => member.id !== currentUserId)
      .filter((member) =>
        !q
          ? true
          : [member.full_name, member.position_title, member.telegram]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(q)),
      )
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ru'));
  }, [candidates, currentUserId, memberQuery]);

  // Прокрутка вниз при новых сообщениях
  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages.length, activeId]);

  const authorOf = (message) => {
    if (message.author) return message.author;
    return profilesById?.get?.(message.author_id) || null;
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !activeId || sending) return;
    setDraft('');
    onSend?.(text);
    // Не теряем курсор: можно сразу печатать следующее сообщение,
    // даже если предыдущее ещё отправляется.
    composerRef.current?.focus();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const openPicker = () => {
    setMemberQuery('');
    setPickerOpen(true);
  };

  const closePicker = () => {
    setPickerOpen(false);
    setMemberQuery('');
    setForwardMessage(null);
  };

  const startDialog = (memberId) => {
    const target = forwardMessage;
    setPickerOpen(false);
    setMemberQuery('');
    if (target) {
      setForwardMessage(null);
      onForwardMessage?.(target, { memberId });
      return;
    }
    onStartDialog?.(memberId);
  };

  /** Скачивание через blob: имя файла сохраняется, даже если это картинка или PDF */
  const downloadFile = async (message) => {
    const url = chatFileUrl(message.attachment_path);
    if (!url) return;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = message.attachment_name || 'file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  };

  const openFileMenu = (event, message) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 208;
    const menuHeight = message.author_id === currentUserId ? 132 : 96;
    setFileMenu({
      message,
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
    });
  };

  const startForward = (message) => {
    setFileMenu(null);
    setForwardMessage(message);
    setMemberQuery('');
    setPickerOpen(true);
  };

  const requestDelete = (message) => {
    setFileMenu(null);
    if (window.confirm('Удалить файл из чата? Он исчезнет у всех участников.')) {
      onDeleteMessage?.(message);
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className="modal-panel glass-panel flex h-[84vh] w-full max-w-5xl overflow-hidden rounded-3xl">
        {/* Список диалогов */}
        <aside
          className={`flex w-full shrink-0 flex-col border-r border-slate-300/50 dark:border-white/10 sm:w-[18.5rem] ${
            activeId ? 'hidden sm:flex' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-slate-300/50 px-4 py-3 dark:border-white/10">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <MessageSquare size={16} className="text-indigo-500 dark:text-indigo-300" />
              Чат
            </h2>
            <div className="flex items-center gap-1">
              <span className="glass-chip !text-[0.62rem]">{dialogs.length}</span>
              <button
                type="button"
                onClick={openPicker}
                className="rounded-lg p-1 text-slate-500 transition hover:bg-white/60 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-indigo-300"
                title="Новый диалог"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="px-3 pt-3">
            <div className="relative">
              <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по имени…"
                className="glass-input !py-1.5 !pl-8 !text-xs"
              />
            </div>
          </div>

          <div className="scrollbar-slim mt-2 flex-1 overflow-y-auto px-2 pb-2">
            {loadingDialogs && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 size={18} className="animate-spin" />
              </div>
            )}

            {!loadingDialogs && (
              <>
                {/* Общий чат */}
                <p className="px-2 pt-1 pb-1 text-[0.58rem] font-semibold tracking-[0.1em] text-slate-400 uppercase">
                  Общий чат
                </p>

                {teamDialog ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(teamDialog)}
                    className={`mb-2 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                      teamDialog.conversation_id === activeId
                        ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40'
                        : 'hover:bg-white/50 dark:hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
                      <Users size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                          Общий чат команды
                        </span>
                        <span className="shrink-0 text-[0.6rem] text-slate-400">
                          {dialogTime(teamDialog.last_message_at)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-[0.68rem] text-slate-500 dark:text-slate-400">
                          {teamDialog.last_message || membersLabel(teamDialog.member_count)}
                        </span>
                        {teamDialog.unread > 0 && (
                          <span className="shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[0.58rem] font-bold text-white">
                            {teamDialog.unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ) : (
                  <p className="mb-2 rounded-xl border border-dashed border-slate-400/30 px-2 py-2 text-[0.65rem] text-slate-500 dark:border-white/10 dark:text-slate-400">
                    {teamUnavailable
                      ? 'Общий чат включится после миграции 005.'
                      : 'Общий чат создаётся при первом открытии.'}
                  </p>
                )}

                {/* Личные диалоги */}
                <p className="px-2 pt-1 pb-1 text-[0.58rem] font-semibold tracking-[0.1em] text-slate-400 uppercase">
                  Личные
                </p>

                {filteredPrivate.length === 0 && startable.length === 0 && (
                  <div className="px-2 py-3 text-center">
                    <p className="mb-2 text-[0.68rem] text-slate-500 dark:text-slate-400">
                      {privateDialogs.length === 0 ? 'Пока нет личных диалогов' : 'Ничего не найдено'}
                    </p>
                    <button
                      type="button"
                      onClick={openPicker}
                      className="glass-btn !px-2.5 !py-1.5 !text-[0.68rem]"
                    >
                      <Plus size={13} /> Начать диалог
                    </button>
                  </div>
                )}

                {filteredPrivate.map((dialog) => {
                  const isActive = dialog.conversation_id === activeId;
                  return (
                    <button
                      key={dialog.conversation_id}
                      type="button"
                      onClick={() => onSelect?.(dialog)}
                      className={`mb-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                        isActive
                          ? 'bg-indigo-500/15 ring-1 ring-indigo-400/40'
                          : 'hover:bg-white/50 dark:hover:bg-white/5'
                      }`}
                    >
                      <Avatar
                        name={dialog.peer_name}
                        color={dialog.peer_color}
                        src={profilesById?.get?.(dialog.peer_id)?.avatar_url}
                        shape="rounded-xl"
                        className="h-9 w-9 text-[0.65rem]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                            {dialog.peer_name || 'Сотрудник'}
                          </span>
                          <span className="shrink-0 text-[0.6rem] text-slate-400">
                            {dialogTime(dialog.last_message_at)}
                          </span>
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-[0.68rem] text-slate-500 dark:text-slate-400">
                            {dialog.last_message || 'Нет сообщений'}
                          </span>
                          {dialog.unread > 0 && (
                            <span className="shrink-0 rounded-full bg-indigo-500 px-1.5 py-0.5 text-[0.58rem] font-bold text-white">
                              {dialog.unread}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {startable.length > 0 && (
                  <>
                    <p className="px-2 pt-2 pb-1 text-[0.58rem] font-semibold tracking-[0.1em] text-slate-400 uppercase">
                      Сотрудники
                    </p>
                    {startable.map((member) => (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => onStartDialog?.(member.id)}
                        className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left opacity-80 transition hover:bg-white/50 hover:opacity-100 dark:hover:bg-white/5"
                        title={`Написать: ${member.full_name || 'сотрудник'}`}
                      >
                        <Avatar
                          name={member.full_name}
                          color={member.color}
                          src={profilesById?.get?.(member.id)?.avatar_url || member.avatar_url}
                          shape="rounded-xl"
                          className="h-9 w-9 text-[0.65rem]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                            {member.full_name || 'Сотрудник'}
                          </span>
                          <span className="block truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                            нажмите, чтобы написать
                          </span>
                        </span>
                        <MessageSquare size={13} className="shrink-0 text-indigo-400" />
                      </button>
                    ))}
                  </>
                )}
              </>
            )}
          </div>
        </aside>

        {/* Переписка */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b border-slate-300/50 px-4 py-2.5 dark:border-white/10">
            {isTeam ? (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
                  <Users size={15} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                    Общий чат команды
                  </span>
                  <span className="block text-[0.62rem] text-slate-500 dark:text-slate-400">
                    {membersLabel(activeDialog?.member_count)} · видят все
                  </span>
                </span>
              </>
            ) : peer ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenProfile?.(peer)}
                  className="flex min-w-0 items-center gap-2 rounded-xl px-1 py-0.5 text-left transition hover:bg-white/50 dark:hover:bg-white/5"
                  title="Открыть профиль"
                >
                  <Avatar
                    name={peer.full_name}
                    color={peer.color}
                    src={peer.avatar_url}
                    shape="rounded-xl"
                    className="h-8 w-8 text-[0.6rem]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                      {peer.full_name}
                    </span>
                    <span className="block text-[0.62rem] text-slate-500 dark:text-slate-400">личный диалог</span>
                  </span>
                </button>

                {peerTelegram && (
                  <a
                    href={peerTelegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="glass-btn ml-auto !px-2 !py-1 !text-[0.65rem]"
                    title="Открыть Telegram"
                  >
                    <ExternalLink size={12} /> Telegram
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => onOpenProfile?.(peer)}
                  className={`glass-btn !px-2 !py-1 !text-[0.65rem] ${peerTelegram ? '' : 'ml-auto'}`}
                  title="Профиль сотрудника"
                >
                  <UserRound size={12} />
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400">Выберите диалог</p>
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              title="Закрыть"
            >
              <X size={18} />
            </button>
          </div>

          {schemaMissing ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <AlertTriangle size={26} className="text-amber-500" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Чат ещё не настроен в базе</p>
              <p className="max-w-md text-xs text-slate-500 dark:text-slate-400">
                Примените <code className="font-mono">supabase/migrations/004_chat.sql</code> в SQL Editor
                (таблицы диалогов, сообщений и RLS), после чего обновите страницу.
              </p>
            </div>
          ) : (
            <>
              <div ref={listRef} className="scrollbar-slim flex-1 overflow-y-auto px-4 py-4">
                <div className="flex min-h-full flex-col justify-end">
                  {loadingMessages && (
                    <div className="flex items-center justify-center py-10 text-slate-400">
                      <Loader2 size={18} className="animate-spin" />
                    </div>
                  )}

                  {!loadingMessages && !activeId && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                      <MessageSquare size={28} className="text-indigo-400/60" />
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                        Выберите диалог
                      </p>
                      <p className="max-w-xs text-xs text-slate-500 dark:text-slate-400">
                        Общий чат команды всегда сверху, личные диалоги — ниже. Новый диалог — по кнопке «+».
                      </p>
                      <button
                        type="button"
                        onClick={openPicker}
                        className="glass-btn mt-1 !px-3 !py-1.5 !text-xs"
                      >
                        <Plus size={13} /> Начать диалог
                      </button>
                    </div>
                  )}

                  {!loadingMessages && activeId && messages.length === 0 && (
                    <p className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
                      Сообщений пока нет — напишите первым.
                    </p>
                  )}

                  {messages.map((message, index) => {
                    const own = message.author_id === currentUserId;
                    const author = authorOf(message);
                    const prev = messages[index - 1];
                    const showDay = !prev || dayKey(prev.created_at) !== dayKey(message.created_at);

                    return (
                      <div key={message.id}>
                        {showDay && (
                          <div className="my-3 flex items-center gap-2">
                            <span className="h-px flex-1 bg-white/40 dark:bg-white/10" />
                            <span className="text-[0.6rem] font-medium tracking-wide text-slate-400 uppercase">
                              {dayLabel(message.created_at)}
                            </span>
                            <span className="h-px flex-1 bg-white/40 dark:bg-white/10" />
                          </div>
                        )}

                        <div className={`mb-1.5 flex ${own ? 'justify-end' : 'justify-start'}`}>
                          <div className={`flex max-w-[80%] items-end gap-1.5 ${own ? 'flex-row-reverse' : ''}`}>
                            {!own && (
                              <Avatar
                                name={author?.full_name}
                                color={author?.color}
                                src={profilesById?.get?.(message.author_id)?.avatar_url || author?.avatar_url}
                                className="h-6 w-6 text-[0.55rem]"
                                title={author?.full_name || 'Сотрудник'}
                              />
                            )}

                            <div
                              className={`rounded-2xl px-3 py-2 text-[0.8rem] leading-snug break-words whitespace-pre-wrap ${
                                own
                                  ? 'bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm'
                                  : 'border border-slate-300/60 bg-white/80 text-slate-800 dark:border-white/10 dark:bg-white/10 dark:text-slate-100'
                              } ${message.pending ? 'opacity-60' : ''}`}
                            >
                              {(!own || isTeam) && (
                                <span
                                  className={`mb-0.5 block text-[0.62rem] font-semibold ${
                                    own
                                      ? 'text-white/90'
                                      : 'text-indigo-600/90 dark:text-indigo-300'
                                  }`}
                                >
                                  {own ? 'Вы' : author?.full_name || 'Сотрудник'}
                                </span>
                              )}
                              {message.attachment_path && (
                                <button
                                  type="button"
                                  onClick={() => downloadFile(message)}
                                  onContextMenu={(event) => openFileMenu(event, message)}
                                  className={`mb-1 flex w-full max-w-[16rem] items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${
                                    own
                                      ? 'border-slate-300/50 bg-white/15 hover:bg-white/25'
                                      : 'border-slate-300/60 bg-white/80 hover:bg-white dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/15'
                                  }`}
                                  title="Скачать · правый клик — действия"
                                >
                                  <FileText size={16} className="shrink-0" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[0.72rem] font-semibold">
                                      {message.attachment_name || 'Файл'}
                                    </span>
                                    <span
                                      className={`block text-[0.6rem] ${
                                        own ? 'text-white/70' : 'text-slate-500 dark:text-slate-400'
                                      }`}
                                    >
                                      {formatBytes(message.attachment_size)}
                                    </span>
                                  </span>
                                  <Download size={13} className="shrink-0 opacity-70" />
                                </button>
                              )}
                              <MessageBody text={message.body} own={own} />
                              <span
                                className={`mt-1 flex items-center justify-end gap-1 text-[0.58rem] ${
                                  own ? 'text-white/75' : 'text-slate-400'
                                }`}
                              >
                                {timeOf(message.created_at)}
                                {own && <Check size={10} />}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-slate-300/50 p-3 dark:border-white/10">
                <div className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      event.target.value = '';
                      if (files.length) onSendFiles?.(files);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeId || sending}
                    className="glass-btn !px-2.5 !py-2"
                    title="Прикрепить файл (до 20 МБ)"
                    aria-label="Прикрепить файл"
                  >
                    <Paperclip size={15} />
                  </button>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    disabled={!activeId}
                    placeholder={
                      activeId
                        ? isTeam
                          ? 'Сообщение в общий чат… (Enter — отправить)'
                          : 'Сообщение… (Enter — отправить, Shift+Enter — новая строка)'
                        : 'Выберите диалог'
                    }
                    className="glass-input max-h-32 !min-h-[2.6rem] flex-1 resize-none !py-2 !text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={!draft.trim() || !activeId || sending}
                    className="glass-btn glass-btn-primary !px-3 !py-2"
                    title="Отправить"
                  >
                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </button>
                </div>

                {error && (
                  <p className="mt-2 flex items-start gap-1.5 text-[0.65rem] text-rose-600 dark:text-rose-300">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
                    {onRetry && (
                      <button type="button" onClick={onRetry} className="underline">
                        повторить
                      </button>
                    )}
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Окно выбора собеседника */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePicker();
          }}
        >
          <div className="glass-panel flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-300/50 px-5 py-3 dark:border-white/10">
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {forwardMessage ? 'Переслать файл' : 'Кому написать'}
                </h3>
                <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {forwardMessage
                    ? `«${forwardMessage.attachment_name || 'Файл'}» — выберите получателя`
                    : 'Только зарегистрированные сотрудники'}
                </p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
                title="Закрыть"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-4 pt-3">
              <div className="relative">
                <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={memberQuery}
                  onChange={(event) => setMemberQuery(event.target.value)}
                  placeholder="Найти сотрудника…"
                  className="glass-input !py-1.5 !pl-8 !text-xs"
                  autoFocus
                />
              </div>
            </div>

            <div className="scrollbar-slim flex-1 overflow-y-auto px-2 py-2">
              {forwardMessage && teamDialog && (
                <button
                  type="button"
                  onClick={() => {
                    const target = forwardMessage;
                    setForwardMessage(null);
                    setPickerOpen(false);
                    setMemberQuery('');
                    onForwardMessage?.(target, { conversationId: teamDialog.conversation_id });
                  }}
                  className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white">
                    <Users size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                      Общий чат команды
                    </span>
                    <span className="block truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                      видят все сотрудники
                    </span>
                  </span>
                  <MessageSquare size={14} className="shrink-0 text-indigo-400" />
                </button>
              )}

              {loadingCandidates && (
                <div className="flex items-center justify-center py-8 text-slate-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              )}

              {!loadingCandidates && pickerMembers.length === 0 && (
                <p className="px-3 py-8 text-center text-[0.72rem] text-slate-500 dark:text-slate-400">
                  Никого не найдено. Список берётся из зарегистрированных и активных пользователей.
                </p>
              )}

              {!loadingCandidates &&
                pickerMembers.map((member) => (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => startDialog(member.id)}
                    className="mb-1 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/60 dark:hover:bg-white/5"
                  >
                    <Avatar
                      name={member.full_name}
                      color={member.color}
                      src={profilesById?.get?.(member.id)?.avatar_url || member.avatar_url}
                      shape="rounded-xl"
                      className="h-9 w-9 text-[0.62rem]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                        {member.full_name || 'Сотрудник'}
                      </span>
                      <span className="block truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                        {member.telegram || member.position_title || 'начать переписку'}
                      </span>
                    </span>
                    <MessageSquare size={14} className="shrink-0 text-indigo-400" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Контекстное меню файла */}
      {fileMenu && (
        <div
          className="fixed inset-0 z-[110]"
          onMouseDown={() => setFileMenu(null)}
          onContextMenu={(event) => {
            event.preventDefault();
            setFileMenu(null);
          }}
        >
          <div
            className="absolute w-52 overflow-hidden rounded-xl border border-white/60 bg-white/95 p-1 shadow-2xl backdrop-blur dark:border-white/15 dark:bg-slate-900/95"
            style={{ left: fileMenu.x, top: fileMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                downloadFile(fileMenu.message);
                setFileMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.75rem] font-medium text-slate-700 transition hover:bg-slate-500/10 dark:text-slate-200"
            >
              <Download size={13} /> Скачать
            </button>
            <button
              type="button"
              onClick={() => startForward(fileMenu.message)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.75rem] font-medium text-slate-700 transition hover:bg-slate-500/10 dark:text-slate-200"
            >
              <Forward size={13} /> Переслать
            </button>
            {fileMenu.message.author_id === currentUserId && (
              <button
                type="button"
                onClick={() => requestDelete(fileMenu.message)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[0.75rem] font-medium text-rose-600 transition hover:bg-rose-500/10 dark:text-rose-300"
              >
                <Trash2 size={13} /> Удалить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
