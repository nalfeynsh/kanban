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
  Trash2,
  RotateCcw,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { roleLabel } from '../lib/priority';
import { roleOptions, roleOf, roleRank } from '../lib/permissions';
import { telegramUrl } from '../lib/telegram';
import { formatPhone, phoneHref } from '../lib/phone';
import Avatar from './Avatar';

function ContactRow({ icon: Icon, label, value, href, muted }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
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
  canManageMembers = false,
  onRoleChange,
  roleSaving = false,
  roles = [],
  currentRole = 'member',
  onDeleteMember,
  onRestoreMember,
}) {
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [restoreRole, setRestoreRole] = useState(member?.role || 'member');

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

  const handleDelete = async () => {
    if (!onDeleteMember) return;
    setMemberBusy(true);
    setMemberError('');
    const ok = await onDeleteMember(member.id, deleteReason);
    if (!ok) setMemberError('Не удалось удалить сотрудника.');
    else setDeleteOpen(false);
    setMemberBusy(false);
  };

  const handleRestore = async () => {
    if (!onRestoreMember) return;
    setMemberBusy(true);
    setMemberError('');
    const ok = await onRestoreMember(member.id, restoreRole || member.role);
    if (!ok) setMemberError('Не удалось восстановить сотрудника.');
    setMemberBusy(false);
  };

  return createPortal(
    <div
      className="modal-overlay !z-[70]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-3xl">
        <div
          className="relative h-28 shrink-0"
          style={{
            background: `linear-gradient(135deg, ${member.color || '#6366f1'}cc, #0ea5e988, ${member.color || '#6366f1'}55)`,
          }}
        >
          {!isSelf && (
            <button
              type="button"
              onClick={() => onOpenChat?.(member)}
              className="absolute top-3 right-12 rounded-full bg-white/25 p-1.5 text-white backdrop-blur transition hover:bg-white/40"
              title="Написать в чат"
              aria-label={`Написать в чат: ${name}`}
            >
              <MessageSquare size={18} />
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 rounded-full bg-white/25 p-1.5 text-white backdrop-blur transition hover:bg-white/40"
            title="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="scrollbar-slim -mt-10 min-h-0 flex-1 overflow-y-auto px-6 pt-1 pb-5">
          <div className="flex items-end gap-3">
            <Avatar
              name={name}
              color={member.color}
              src={member.avatar_url}
              shape="rounded-3xl"
              className="h-20 w-20 text-xl avatar-ring"
            />
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
              <UserRound size={11} /> {member.deleted_at ? 'удалён' : member.is_active === false ? 'неактивен' : 'активен'}
            </span>
            {member.deleted_at && (
              <span className="rounded-full border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[0.62rem] font-medium text-rose-700 dark:text-rose-300">
                доступ приостановлен
              </span>
            )}
          </div>

          {member.deleted_at && (
            <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/8 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              <p className="font-semibold">Сотрудник удалён из сервиса</p>
              <p className="mt-0.5">
                Причина: {member.deleted_reason || 'не указана'}.
              </p>
            </div>
          )}

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
              value={formatPhone(member.work_phone) || member.work_phone}
              href={phoneHref(member.work_phone)}
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
                  value={formatPhone(member.personal_phone) || member.personal_phone}
                  href={phoneHref(member.personal_phone)}
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

          {member.deleted_at && canManageMembers && !isSelf && (
            <div id="member-restore-panel" className="mt-3 rounded-xl border border-emerald-400/35 bg-emerald-500/8 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.1em] text-emerald-800 uppercase dark:text-emerald-200">
                <RotateCcw size={12} /> Восстановить доступ
              </p>
              <label className="block text-[0.65rem] text-slate-600 dark:text-slate-300">
                Роль после восстановления
                <select
                  value={restoreRole || member.role || 'member'}
                  onChange={(event) => setRestoreRole(event.target.value)}
                  className="glass-input mt-1 !py-1.5 !text-xs"
                >
                  {roleOptions(roles).map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={roleOf(currentRole) !== 'admin' && roleRank(option.value) >= roleRank(currentRole)}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleRestore}
                disabled={memberBusy}
                className="glass-btn glass-btn-primary mt-2 w-full !justify-center !py-1.5 !text-[0.68rem]"
              >
                {memberBusy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                Восстановить сотрудника
              </button>
              {memberError && <p className="mt-1 text-[0.65rem] text-rose-600 dark:text-rose-300">{memberError}</p>}
            </div>
          )}

          {canManageRoles && !isSelf && !member.deleted_at && (
            <div className="mt-3 rounded-xl border border-indigo-400/35 bg-indigo-500/8 px-3 py-2.5">
              <label className="mb-1 flex items-center gap-1.5 text-[0.62rem] font-semibold tracking-[0.1em] text-indigo-800 uppercase dark:text-indigo-200">
                <KeyRound size={12} /> Роль в команде
              </label>
              <select
                value={member.role || 'member'}
                onChange={(event) => onRoleChange?.(member.id, event.target.value)}
                disabled={roleSaving || !canManageRoles || isSelf}
                className="glass-input !py-1.5 !text-xs"
              >
                {roleOptions(roles).map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    disabled={
                      roleOf(currentRole) !== 'admin' &&
                      roleRank(option.value) >= roleRank(currentRole)
                    }
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[0.62rem] text-indigo-700/80 dark:text-indigo-300/80">
                Менять роли может только администратор. Роль влияет на права в базе.
              </p>
            </div>
          )}

          {!member.deleted_at && canManageMembers && !isSelf && (
            <div id="member-delete-panel" className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/8 px-3 py-2.5">
              {!deleteOpen ? (
                <button
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                  className="flex items-center gap-1.5 text-[0.68rem] font-medium text-rose-700 hover:underline dark:text-rose-300"
                >
                  <Trash2 size={12} /> Удалить сотрудника из сервиса
                </button>
              ) : (
                <>
                  <p className="flex items-center gap-1.5 text-[0.68rem] font-semibold text-rose-800 dark:text-rose-200">
                    <AlertTriangle size={12} /> Удалить доступ?
                  </p>
                  <textarea
                    value={deleteReason}
                    onChange={(event) => setDeleteReason(event.target.value)}
                    rows={2}
                    placeholder="Причина (необязательно): увольнение, давно не пользовался…"
                    className="glass-input mt-1.5 !py-1.5 !text-xs"
                  />
                  <p className="mt-1 text-[0.62rem] text-rose-700/80 dark:text-rose-300/80">
                    Аккаунт и данные сохранятся. Восстановить можно в «Команда → Удалённые».
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button type="button" onClick={handleDelete} disabled={memberBusy} className="glass-btn glass-btn-danger !px-2.5 !py-1.5 !text-[0.65rem]">
                      {memberBusy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />} Удалить
                    </button>
                    <button type="button" onClick={() => { setDeleteOpen(false); setMemberError(''); }} className="glass-btn !px-2.5 !py-1.5 !text-[0.65rem]">
                      Отмена
                    </button>
                  </div>
                  {memberError && <p className="mt-1 text-[0.65rem] text-rose-600 dark:text-rose-300">{memberError}</p>}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-t border-slate-300/50 px-6 py-4 dark:border-white/10">
          {!isSelf && (
            <button
              type="button"
              onClick={() => onOpenChat?.(member)}
              className="glass-btn"
              title={`Написать в чат: ${name}`}
            >
              <MessageSquare size={15} /> Написать в чат
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
          {!isSelf && canManageMembers && !member.deleted_at && (
            <button
              type="button"
              onClick={() => {
                setDeleteOpen(true);
                setTimeout(() => document.getElementById('member-delete-panel')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
              }}
              className="glass-btn glass-btn-danger"
            >
              <Trash2 size={14} /> Удалить
            </button>
          )}
          {!isSelf && canManageMembers && member.deleted_at && (
            <button
              type="button"
              onClick={() => document.getElementById('member-restore-panel')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}
              className="glass-btn glass-btn-primary"
            >
              <RotateCcw size={14} /> Восстановить
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
