import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  LifeBuoy,
  BookOpen,
  Sparkles,
  Lightbulb,
  Send,
  Loader2,
  Trash2,
  AlertTriangle,
  Mail,
  Phone,
  ExternalLink,
  Search,
} from 'lucide-react';
import Avatar from './Avatar';
import { telegramUrl } from '../lib/telegram';
import { formatPhone, phoneHref } from '../lib/phone';
import { CHANGELOG, FAQ } from '../lib/changelog';
import {
  addSuggestion,
  deleteSuggestion,
  fetchSuggestions,
  isSuggestionsSchemaMissing,
} from '../lib/suggestions';

const TABS = [
  { id: 'faq', label: 'Инструкция', icon: BookOpen },
  { id: 'whatsnew', label: 'Что нового', icon: Sparkles },
  { id: 'ideas', label: 'Предложения', icon: Lightbulb },
  { id: 'support', label: 'Поддержка', icon: LifeBuoy },
];

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function normalizeFaqText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function faqWordStem(word) {
  return word.length > 4 ? word.slice(0, 4) : word;
}

/** Поиск по инструкции: сначала совпадения в вопросе, затем в ответе. */
function searchFaq(query) {
  const normalized = normalizeFaqText(query);
  if (!normalized) return [];
  const words = [...new Set(normalized.split(/\s+/).filter((word) => word.length >= 2))];

  return FAQ.map((item, index) => {
    const question = normalizeFaqText(item.q);
    const answer = normalizeFaqText(item.a);
    let score = 0;

    if (question.includes(normalized)) score += 16;
    if (question.startsWith(normalized)) score += 8;

    words.forEach((word) => {
      const stem = faqWordStem(word);
      if (question.includes(word)) score += 5;
      else if (question.includes(stem)) score += 2;
      if (answer.includes(word)) score += 2;
      else if (answer.includes(stem)) score += 1;
    });

    return { item, index, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}

/** Помощь: инструкция, история изменений, предложения, контакты поддержки */
export default function HelpModal({
  isOpen,
  onClose,
  currentUserId,
  isAdmin = false,
  profiles = [],
  onOpenProfile,
}) {
  const [tab, setTab] = useState('faq');
  const [ideas, setIdeas] = useState([]);
  const [ideasError, setIdeasError] = useState('');
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [faqQuery, setFaqQuery] = useState('');
  const [faqSubmitted, setFaqSubmitted] = useState('');
  const [faqSelected, setFaqSelected] = useState(null);
  const [faqOpen, setFaqOpen] = useState(null);
  const [faqFocused, setFaqFocused] = useState(false);
  const [faqActive, setFaqActive] = useState(-1);
  const faqSearchRef = useRef(null);

  const faqSuggestions = useMemo(() => searchFaq(faqQuery).slice(0, 6), [faqQuery]);
  const faqResults = useMemo(() => {
    if (faqSelected) return FAQ.filter((item) => item.q === faqSelected);
    return faqSubmitted ? searchFaq(faqSubmitted) : FAQ;
  }, [faqSubmitted, faqSelected]);
  const showFaqSuggestions = faqFocused && faqQuery.trim().length >= 2;

  const runFaqSearch = (value = faqQuery) => {
    const query = String(value ?? '').trim();
    setFaqQuery(value);
    setFaqSubmitted(query);
    setFaqSelected(null);
    setFaqOpen(null);
    setFaqFocused(false);
    setFaqActive(-1);
    faqSearchRef.current?.blur();
  };

  const selectFaqSuggestion = (item) => {
    setFaqQuery(item.q);
    setFaqSubmitted(item.q);
    setFaqSelected(item.q);
    setFaqOpen(item.q);
    setFaqFocused(false);
    setFaqActive(-1);
  };

  const resetFaqSearch = () => {
    setFaqQuery('');
    setFaqSubmitted('');
    setFaqSelected(null);
    setFaqOpen(null);
    setFaqFocused(false);
    setFaqActive(-1);
    faqSearchRef.current?.focus();
  };

  const handleFaqKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFaqFocused(true);
      setFaqActive((prev) => {
        const next = Math.min(prev + 1, faqSuggestions.length - 1);
        return next < 0 ? -1 : next;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFaqActive((prev) => Math.max(prev - 1, -1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (faqActive >= 0 && faqSuggestions[faqActive]) {
        selectFaqSuggestion(faqSuggestions[faqActive]);
      } else {
        runFaqSearch();
      }
      return;
    }
    if (event.key === 'Escape') {
      setFaqFocused(false);
      setFaqActive(-1);
    }
  };

  const admins = useMemo(
    () => profiles.filter((profile) => profile.role === 'admin' && profile.is_active !== false),
    [profiles],
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

  // Предложения подгружаем один раз при открытии
  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;

    fetchSuggestions().then(({ suggestions, error }) => {
      if (!alive) return;
      if (error) {
        setSchemaMissing(isSuggestionsSchemaMissing(error));
        setIdeasError(error.message);
        return;
      }
      setIdeas(suggestions);
    });

    return () => {
      alive = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async () => {
    const text = draft.trim();
    if (text.length < 3) {
      setIdeasError('Напишите хотя бы пару слов.');
      return;
    }

    setSending(true);
    setIdeasError('');

    const { suggestion, error } = await addSuggestion(text, currentUserId);

    if (error) {
      setSchemaMissing(isSuggestionsSchemaMissing(error));
      setIdeasError(
        isSuggestionsSchemaMissing(error)
          ? 'В базе ещё нет таблицы предложений — примените миграцию 010.'
          : `Не получилось отправить: ${error.message}`,
      );
      setSending(false);
      return;
    }

    setIdeas((prev) => [suggestion, ...prev]);
    setDraft('');
    setSending(false);
  };

  const handleDelete = async (idea) => {
    if (!window.confirm('Удалить это предложение?')) return;
    const { error } = await deleteSuggestion(idea.id);
    if (error) {
      setIdeasError(error.message);
      return;
    }
    setIdeas((prev) => prev.filter((item) => item.id !== idea.id));
  };

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-lg">
              <LifeBuoy size={19} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Помощь</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Инструкция, новинки, идеи и контакты
              </p>
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

        <div className="scrollbar-slim flex gap-1 overflow-x-auto border-b border-slate-300/50 px-3 py-2 dark:border-white/10">
          {TABS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[0.72rem] font-semibold transition ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-700 ring-1 ring-indigo-400/40 dark:text-indigo-200'
                    : 'text-slate-500 hover:bg-white/50 dark:text-slate-400 dark:hover:bg-white/5'
                }`}
              >
                <Icon size={13} /> {item.label}
                {item.id === 'ideas' && ideas.length > 0 && (
                  <span className="rounded-full bg-indigo-500/15 px-1.5 text-[0.58rem] text-indigo-700 dark:text-indigo-200">
                    {ideas.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === 'faq' && (
            <div className="space-y-3">
              <div className="relative">
                <div className="flex gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search
                      size={14}
                      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      ref={faqSearchRef}
                      value={faqQuery}
                      onChange={(event) => {
                        const value = event.target.value;
                        setFaqQuery(value);
                        setFaqSelected(null);
                        setFaqActive(-1);
                        setFaqFocused(true);
                        if (!value.trim()) {
                          setFaqSubmitted('');
                          setFaqOpen(null);
                        }
                      }}
                      onFocus={() => setFaqFocused(true)}
                      onBlur={() => window.setTimeout(() => setFaqFocused(false), 120)}
                      onKeyDown={handleFaqKeyDown}
                      placeholder="Найти тему: встречи, календарь, чат…"
                      autoComplete="off"
                      spellCheck={false}
                      role="combobox"
                      aria-label="Поиск по инструкции"
                      aria-expanded={showFaqSuggestions}
                      aria-controls="faq-suggestions"
                      aria-autocomplete="list"
                      className="glass-input w-full !py-2 !pr-8 !pl-8 !text-xs"
                    />
                    {faqQuery && (
                      <button
                        type="button"
                        onClick={resetFaqSearch}
                        className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-white/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                        title="Очистить поиск"
                        aria-label="Очистить поиск"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => runFaqSearch()}
                    className="glass-btn glass-btn-primary shrink-0 !px-3 !py-2 !text-xs"
                  >
                    <Search size={13} /> Найти
                  </button>
                </div>

                {showFaqSuggestions && (
                  <div
                    id="faq-suggestions"
                    role="listbox"
                    aria-label="Подходящие темы"
                    className="absolute top-full right-0 left-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-300/70 bg-white/95 shadow-xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95"
                  >
                    {faqSuggestions.length > 0 ? (
                      faqSuggestions.map((item, index) => (
                        <button
                          key={item.q}
                          type="button"
                          role="option"
                          aria-selected={faqActive === index}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectFaqSuggestion(item)}
                          className={`flex w-full items-start gap-2 px-3 py-2 text-left text-[0.72rem] leading-snug transition ${
                            faqActive === index
                              ? 'bg-indigo-500/15 text-indigo-900 dark:text-indigo-100'
                              : 'text-slate-700 hover:bg-white/80 dark:text-slate-200 dark:hover:bg-white/10'
                          }`}
                        >
                          <Search size={12} className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
                          <span>{item.q}</span>
                        </button>
                      ))
                    ) : (
                      <p className="px-3 py-2.5 text-[0.7rem] leading-relaxed text-slate-500 dark:text-slate-400">
                        Совпадений нет. Нажмите «Найти» или Enter — покажем результат поиска.
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-2">
                <p className="text-[0.68rem] text-slate-500 dark:text-slate-400">
                  {faqSelected
                    ? 'Выбранная тема'
                    : faqSubmitted
                      ? `Найдено: ${faqResults.length}`
                      : `Все темы: ${FAQ.length}`}
                </p>
                {faqSubmitted && (
                  <button
                    type="button"
                    onClick={resetFaqSearch}
                    className="text-[0.68rem] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
                  >
                    Сбросить
                  </button>
                )}
              </div>

              {faqResults.length > 0 ? (
                <div className="space-y-2">
                  {faqResults.map((item) => {
                    const isOpen = faqOpen === item.q;
                    return (
                      <div
                        key={item.q}
                        className="rounded-xl border border-slate-300/60 bg-white/70 dark:border-white/10 dark:bg-white/5"
                      >
                        <button
                          type="button"
                          onClick={() => setFaqOpen(isOpen ? null : item.q)}
                          aria-expanded={isOpen}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100"
                        >
                          <span>{item.q}</span>
                          <span
                            className={`shrink-0 text-slate-400 transition ${isOpen ? 'rotate-45' : ''}`}
                            aria-hidden="true"
                          >
                            +
                          </span>
                        </button>
                        {isOpen && (
                          <p className="mt-1 px-3 pb-2.5 text-[0.75rem] leading-relaxed text-slate-600 dark:text-slate-300">
                            {item.a}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300/70 bg-white/50 px-4 py-6 text-center dark:border-white/15 dark:bg-white/5">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    Ничего не нашли
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[0.73rem] leading-relaxed text-slate-500 dark:text-slate-400">
                    По запросу «{faqSubmitted}» нет подходящей темы. Можно спросить поддержку
                    или предложить новую инструкцию.
                  </p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTab('support')}
                      className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
                    >
                      <LifeBuoy size={13} /> Написать в поддержку
                    </button>
                    <button
                      type="button"
                      onClick={() => setTab('ideas')}
                      className="glass-btn !px-3 !py-1.5 !text-xs"
                    >
                      <Lightbulb size={13} /> Предложить тему
                    </button>
                    <button
                      type="button"
                      onClick={resetFaqSearch}
                      className="glass-btn !px-3 !py-1.5 !text-xs"
                    >
                      Показать все вопросы
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'whatsnew' && (
            <div className="space-y-4">
              {CHANGELOG.map((release) => (
                <section key={release.date}>
                  <h3 className="mb-2 flex items-center gap-2 text-[0.7rem] font-bold tracking-[0.08em] text-indigo-600 uppercase dark:text-indigo-300">
                    <Sparkles size={12} /> {release.date}
                  </h3>
                  <ul className="space-y-1.5">
                    {release.items.map((text) => (
                      <li
                        key={text}
                        className="flex gap-2 rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2 text-[0.75rem] leading-relaxed text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                        {text}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}

          {tab === 'ideas' && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
                <label className="block">
                  <span className="mb-1 block text-[0.7rem] font-semibold text-slate-600 dark:text-slate-300">
                    Что улучшить в сервисе?
                  </span>
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    rows={3}
                    maxLength={4000}
                    placeholder="Опишите идею: что неудобно и как хотелось бы"
                    className="glass-input resize-none !text-xs"
                  />
                </label>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[0.65rem] text-slate-400">Видно всем участникам команды</span>
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={sending || draft.trim().length < 3 || schemaMissing}
                    className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-[0.7rem]"
                  >
                    {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                    Отправить
                  </button>
                </div>
                {ideasError && (
                  <p className="mt-2 flex items-start gap-1.5 text-[0.68rem] text-rose-600 dark:text-rose-300">
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {ideasError}
                  </p>
                )}
              </div>

              {ideas.length === 0 && !ideasError && (
                <p className="py-6 text-center text-[0.72rem] text-slate-500 dark:text-slate-400">
                  Идей пока нет — станьте первым.
                </p>
              )}

              <ul className="space-y-2">
                {ideas.map((idea) => {
                  const author = idea.author || null;
                  const own = idea.author_id === currentUserId;
                  return (
                    <li
                      key={idea.id}
                      className="flex gap-2.5 rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <Avatar
                        name={author?.full_name}
                        color={author?.color}
                        src={author?.avatar_url}
                        className="h-8 w-8 text-[0.6rem]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[0.75rem] font-semibold text-slate-800 dark:text-slate-100">
                            {author?.full_name || 'Сотрудник'}
                          </span>
                          {own && (
                            <span className="rounded-full bg-indigo-500/15 px-1.5 text-[0.55rem] font-bold text-indigo-700 dark:text-indigo-200">
                              вы
                            </span>
                          )}
                          <span className="ml-auto shrink-0 text-[0.6rem] text-slate-400">
                            {formatDate(idea.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 text-[0.75rem] leading-relaxed break-words whitespace-pre-wrap text-slate-700 dark:text-slate-200">
                          {idea.body}
                        </p>
                      </div>
                      {(own || isAdmin) && (
                        <button
                          type="button"
                          onClick={() => handleDelete(idea)}
                          className="shrink-0 self-start rounded-lg p-1 text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-500"
                          title="Удалить предложение"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {tab === 'support' && (
            <div className="space-y-3">
              <p className="text-[0.75rem] leading-relaxed text-slate-600 dark:text-slate-300">
                Вопросы по работе сервиса, доступы и права — администратору команды. Идеи и пожелания
                удобнее оставлять во вкладке «Предложения»: их видят все участники.
              </p>

              {admins.length === 0 && (
                <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[0.72rem] text-amber-800 dark:text-amber-200">
                  Администратор ещё не назначен. Напишите в общий чат команды — там подскажут, к кому
                  обратиться.
                </div>
              )}

              <ul className="space-y-2">
                {admins.map((admin) => {
                  const telegram = telegramUrl(admin.telegram);
                  const hasContacts = Boolean(telegram || admin.work_email || admin.work_phone);
                  return (
                    <li
                      key={admin.id}
                      className="rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          name={admin.full_name}
                          color={admin.color}
                          src={admin.avatar_url}
                          className="h-10 w-10 text-[0.7rem]"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.8rem] font-semibold text-slate-800 dark:text-slate-100">
                            {admin.full_name || 'Администратор'}
                          </p>
                          <p className="truncate text-[0.65rem] text-slate-500 dark:text-slate-400">
                            {admin.position_title || 'Администратор команды'}
                          </p>
                        </div>
                        {onOpenProfile && (
                          <button
                            type="button"
                            onClick={() => onOpenProfile(admin)}
                            className="glass-btn shrink-0 !px-2 !py-1 !text-[0.65rem]"
                          >
                            Профиль
                          </button>
                        )}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {telegram && (
                          <a
                            href={telegram}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                          >
                            <ExternalLink size={11} /> Telegram
                          </a>
                        )}
                        {admin.work_email && (
                          <a
                            href={`mailto:${admin.work_email}`}
                            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                          >
                            <Mail size={11} /> {admin.work_email}
                          </a>
                        )}
                        {admin.work_phone && (
                          <a
                            href={phoneHref(admin.work_phone) || undefined}
                            className="glass-btn !px-2 !py-1 !text-[0.65rem]"
                          >
                            <Phone size={11} /> {formatPhone(admin.work_phone) || admin.work_phone}
                          </a>
                        )}
                      </div>

                      {!hasContacts && (
                        <p className="mt-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                          Контакты не заполнены — напишите в общий чат или откройте профиль.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
