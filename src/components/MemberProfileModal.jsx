import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Send,
  Phone,
  Mail,
  ShieldCheck,
  Lock,
  ListChecks,
  Briefcase,
  UserRound,
  ArrowRight,
  Copy,
  Check,
  KeyRound,
  MessageSquare,
} from 'lucide-react';
import { roleLabel, ROLE_OPTIONS } from '../lib/priority';
import { telegramUrl } from '../lib/telegram';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function ContactRow({ icon: Icon, label, value, href, muted }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/40 bg-white/35 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-300">
        <Icon size={15} />
      </span>
      <div className="min-w-0">
        <p className="text-[0.62rem] font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </p>
        {value && href ? (
          <a
            href={href}
            target={href.startsWith('http') ? '_blank' : undefined}
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-indigo-700 hover:underline dark:text-indigo-300"
          >
            {value}
          </a>
        ) : (
          <p className={`truncate text-sm font-medium ${muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
            {value || 'не указано'}
          </p>
        )}
      </div>
    </div>
  );
}

export default function MemberProfileModal({
  isOpen,
  onClose,
  member,
  isSelf = false,
  taskCount = 0,
  onShowTasks,
  onEditSelf,
  onOpenChat,
  canManageRoles = false,
  onRoleChange,
  roleSaving = false,
}) {
  const [copied, setCopied] = useState(false);

  if (!isOpen || !member) return null;

  const tg = telegramUrl(member.telegram);
  const personalVisible = isSelf || Boolean(member.show_personal_data);
  const name = member.full_name || 'Сотрудник';

  const copyTelegram = async () => {
    if (!member.telegram) return;
    try {
      await navigator.clipboard.writeText(member.telegram);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay !z-[70]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel w-full max-w-md overflow-hidden rounded-3xl">
        <div
          className="relative h-28"
          style={{
            background: `linear-gradient(135deg, ${member.color || '#6366f1'}cc, #0ea5e988, ${member.color || '#6366f1'}55)`,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-white/25 p-1.5 text-white backdrop-blur transition hover:bg-white/40"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="-mt-10 px-6 pt-1 pb-5">
          <div className="flex items-end gap-3">
            <span
              className="flex h-20 w-20 items-center justify-center rounded-3xl text-xl font-bold text-white avatar-ring"
              style={{ backgroundColor: member.color || '#6366f1' }}
            >
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <h2 className="truncate text-lg leading-tight font-bold text-slate-900 dark:text-white">
                {name}
              </h2>
              <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <ShieldCheck size={12} /> {roleLabel(member.role)}
                {isSelf && <span className="text-indigo-600 dark:text-indigo-300">· это вы</span>}
              </p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="glass-chip">
              <ListChecks size={11} /> {taskCount} задач
            </span>
            {member.position_title && (
              <span className="glass-chip">
                <Briefcase size={11} /> {member.position_title}
              </span>
            )}
            <span className="glass-chip">
              <UserRound size={11} /> {member.is_active === false ? 'неактивен' : 'активен'}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            <ContactRow
              icon={Send}
              label="Telegram"
              value={member.telegram || 'не указан'}
              href={tg}
              muted={!tg}
            />

            {tg ? (
              <div className="flex gap-2">
                <a
                  href={tg}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="glass-btn glass-btn-primary min-w-0 flex-1 !py-2.5"
                  title={tg}
                >
                  <Send size={15} /> Написать в Telegram
                </a>
                <button
                  type="button"
                  onClick={copyTelegram}
                  className="glass-btn shrink-0 !px-3"
                  title="Скопировать ник"
                >
                  {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
                </button>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-400/40 px-3 py-2.5 text-center text-[0.7rem] text-slate-500 dark:border-white/10 dark:text-slate-400">
                Сотрудник ещё не добавил Telegram в профиль
              </div>
            )}

            <ContactRow
              icon={Phone}
              label="Рабочий телефон"
              value={member.work_phone}
              href={member.work_phone ? `tel:${member.work_phone.replace(/[^\d+]/g, '')}` : null}
              muted={!member.work_phone}
            />
            <ContactRow
              icon={Mail}
              label="Рабочая почта"
              value={member.work_email}
              href={member.work_email ? `mailto:${member.work_email}` : null}
              muted={!member.work_email}
            />

            {personalVisible ? (
              <>
                <ContactRow
                  icon={Phone}
                  label="Личный телефон"
                  value={member.personal_phone}
                  href={member.personal_phone ? `tel:${member.personal_phone.replace(/[^\d+]/g, '')}` : null}
                />
                <ContactRow
                  icon={Mail}
                  label="Личная почта"
                  value={member.personal_email}
                  href={member.personal_email ? `mailto:${member.personal_email}` : null}
                />
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-[0.7rem] text-amber-800 dark:text-amber-200">
                <Lock size={13} /> Личные контакты скрыты настройками приватности
              </div>
            )}
          </div>

          {canManageRoles && !isSelf && (
            <div className="mt-3 rounded-xl border border-indigo-400/35 bg-indigo-500/8 px-3 py-2.5">
              <label className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.1em] text-indigo-800 uppercase dark:text-indigo-200">
                <KeyRound size={12} /> Роль в команде
              </label>
              <select
                value={member.role || 'member'}
                onChange={(event) => onRoleChange?.(member.id, event.target.value)}
                disabled={roleSaving}
                className="glass-input !py-1.5 !text-xs"
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[0.62rem] text-indigo-700/80 dark:text-indigo-300/80">
                Менять роли может только администратор. Роль влияет на права в базе.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/30 px-6 py-4 dark:border-white/10">
          {!isSelf && onOpenChat && (
            <button
              type="button"
              onClick={() => onOpenChat(member)}
              className="glass-btn"
              title={`Написать в чат: ${name}`}
            >
              <MessageSquare size={15} /> Чат
            </button>
          )}
          {onShowTasks && (
            <button
              type="button"
              onClick={() => onShowTasks(member)}
              className="glass-btn flex-1"
              title={`Показать задачи: ${name}`}
            >
              <ListChecks size={15} /> Задачи сотрудника <ArrowRight size={14} />
            </button>
          )}
          {isSelf && onEditSelf && (
            <button type="button" onClick={onEditSelf} className="glass-btn">
              Изменить
            </button>
          )}
          <button type="button" onClick={onClose} className="glass-btn">
            Закрыть
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
