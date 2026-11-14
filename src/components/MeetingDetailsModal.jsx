import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CalendarDays,
  CalendarPlus,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Link2,
  Loader,
  Mail,
  MapPin,
  MessageCircle,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import Avatar from './Avatar';
import { formatDue } from '../lib/format';
import { downloadMeetingIcs, googleCalendarUrl, outlookCalendarUrl } from '../lib/meetingCalendar';

function statusLabel(status) {
  if (status === 'accepted') return 'Принял';
  if (status === 'declined') return 'Отклонил';
  return 'Приглашён';
}

function statusClass(status) {
  if (status === 'accepted') return 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300';
  if (status === 'declined') return 'bg-rose-500/12 text-rose-700 dark:text-rose-300';
  return 'bg-amber-500/12 text-amber-700 dark:text-amber-300';
}

export default function MeetingDetailsModal({
  meeting,
  participants = [],
  members = [],
  currentUserId,
  onClose,
  onRespond,
  onCancel,
  onJoin,
  onOpenChat,
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const myParticipation = participants.find((item) => item.user_id === currentUserId);
  const isOrganizer = meeting.organizer_id === currentUserId;
  const organizer = memberById.get(meeting.organizer_id);
  const joinUrl = `${window.location.origin}/meet/${meeting.room_token}`;
  const isCancelled = meeting.status === 'cancelled';
  const calendarOrganizer = {
    name: organizer?.full_name,
    email: organizer?.work_email || organizer?.personal_email || '',
  };
  const calendarAttendees = participants
    .map((participant) => {
      const member = memberById.get(participant.user_id);
      return {
        name: member?.full_name,
        email: member?.work_email || member?.personal_email || '',
        status: participant.status,
      };
    })
    .filter((attendee) => attendee.email);
  const calendarOptions = {
    organizer: calendarOrganizer,
    attendees: calendarAttendees,
    joinUrl,
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  };

  const handleRespond = async (status) => {
    setBusy(true);
    setError('');
    const ok = await onRespond(meeting.id, status);
    setBusy(false);
    if (!ok) setError('Не удалось сохранить ответ');
  };

  const handleCancel = async () => {
    if (!window.confirm(`Отменить встречу «${meeting.title}»?`)) return;
    setBusy(true);
    setError('');
    const ok = await onCancel(meeting.id);
    setBusy(false);
    if (!ok) setError('Не удалось отменить встречу');
    else onClose();
  };

  return createPortal(
    <div className="modal-overlay !z-[70]">
      <div className="modal-panel glass-panel max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.12em] text-indigo-600 uppercase dark:text-indigo-300">
              <Video size={12} /> Встреча
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-slate-900 dark:text-white">{meeting.title}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={12} /> {formatDue(meeting.start_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> до {formatDue(meeting.end_at)}
              </span>
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

        <div className="space-y-4 px-5 py-4">
          {isCancelled && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              Встреча отменена организатором.
            </div>
          )}

          {meeting.description && (
            <div>
              <p className="mb-1 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Описание
              </p>
              <p className="whitespace-pre-wrap rounded-xl bg-white/45 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-200">
                {meeting.description}
              </p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-300/60 bg-white/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.62rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Организатор
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Avatar
                  name={organizer?.full_name}
                  color={organizer?.color}
                  src={organizer?.avatar_url}
                  className="h-7 w-7 text-[0.55rem]"
                />
                <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                  {organizer?.full_name || 'Сотрудник'}
                </span>
              </div>
            </div>
            <div className="rounded-xl border border-slate-300/60 bg-white/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
              <p className="text-[0.62rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                Мой ответ
              </p>
              <p className="mt-1.5">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${statusClass(myParticipation?.status)}`}>
                  {statusLabel(myParticipation?.status)}
                </span>
              </p>
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              Ссылка на встречу
            </p>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-300/60 bg-white/45 px-2.5 py-2 dark:border-white/10 dark:bg-white/5">
                <Link2 size={13} className="shrink-0 text-slate-400" />
                <span className="truncate font-mono text-[0.68rem] text-slate-600 dark:text-slate-300">{joinUrl}</span>
              </div>
              <button type="button" onClick={handleCopy} className="glass-btn shrink-0 !px-2.5 !py-1.5 !text-xs">
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
            <p className="mt-1 flex items-center gap-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
              <Mail size={10} /> Ссылка доступна только участникам встречи.
            </p>
          </div>

          {!isCancelled && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              <CalendarPlus size={12} /> Добавить в календарь
            </p>
            <div className="flex flex-wrap gap-1.5">
              <a
                href={googleCalendarUrl(meeting, { joinUrl })}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-btn !px-2.5 !py-1.5 !text-[0.68rem]"
                title="Открыть Google Calendar"
              >
                <ExternalLink size={12} /> Google
              </a>
              <a
                href={outlookCalendarUrl(meeting, { joinUrl })}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-btn !px-2.5 !py-1.5 !text-[0.68rem]"
                title="Открыть Outlook"
              >
                <ExternalLink size={12} /> Outlook
              </a>
              <button
                type="button"
                onClick={() => downloadMeetingIcs(meeting, calendarOptions)}
                className="glass-btn !px-2.5 !py-1.5 !text-[0.68rem]"
                title="Скачать приглашение .ics"
              >
                <Download size={12} /> Скачать .ics
              </button>
            </div>
            <p className="mt-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
              Событие добавится в ваш календарь; ссылка на встречу будет в описании.
            </p>
          </div>
          )}

          <div>
            <p className="mb-1.5 flex items-center justify-between text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              <span>Участники</span>
              <span className="font-normal normal-case tracking-normal">{participants.length}</span>
            </p>
            <div className="space-y-1">
              {participants.map((participant) => {
                const member = memberById.get(participant.user_id);
                return (
                  <div
                    key={participant.user_id}
                    className="flex items-center gap-2 rounded-xl border border-slate-300/50 bg-white/40 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5"
                  >
                    <Avatar
                      name={member?.full_name}
                      color={member?.color}
                      src={member?.avatar_url}
                      className="h-7 w-7 text-[0.55rem]"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
                      {member?.full_name || 'Сотрудник'}
                      {participant.user_id === meeting.organizer_id && (
                        <span className="ml-1 text-[0.6rem] text-indigo-500 dark:text-indigo-300">организатор</span>
                      )}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${statusClass(participant.status)}`}>
                      {statusLabel(participant.status)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {!isCancelled && !isOrganizer && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleRespond('accepted')}
                disabled={busy || myParticipation?.status === 'accepted'}
                className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
              >
                <Check size={14} /> Принять
              </button>
              <button
                type="button"
                onClick={() => handleRespond('declined')}
                disabled={busy || myParticipation?.status === 'declined'}
                className="glass-btn !px-3 !py-1.5 !text-xs"
              >
                <XCircle size={14} /> Отклонить
              </button>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300/50 px-5 py-3 dark:border-white/10">
          <span className="inline-flex items-center gap-1 text-[0.65rem] text-slate-400 dark:text-slate-500">
            <MapPin size={11} /> Комната по ссылке
          </span>
          <div className="flex flex-wrap gap-2">
            {onOpenChat && (
              <button
                type="button"
                onClick={() => onOpenChat(meeting)}
                className="glass-btn !px-3 !py-1.5 !text-xs"
              >
                <MessageCircle size={13} /> Чат встречи
              </button>
            )}
            {!isCancelled && onJoin && (
              <button
                type="button"
                onClick={() => onJoin(meeting)}
                className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
              >
                <Video size={13} /> Подключиться
              </button>
            )}
            {isOrganizer && !isCancelled && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={busy}
                className="glass-btn glass-btn-danger !px-3 !py-1.5 !text-xs"
              >
                {busy ? <Loader size={13} className="animate-spin" /> : <XCircle size={13} />}
                Отменить встречу
              </button>
            )}
            <button type="button" onClick={onClose} className="glass-btn !px-3 !py-1.5 !text-xs">
              Закрыть
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
