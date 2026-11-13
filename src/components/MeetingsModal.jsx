import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarPlus, Clock3, Plus, Users, Video, X } from 'lucide-react';
import Avatar from './Avatar';
import { formatDue } from '../lib/format';

function myStatus(participants, meetingId, userId) {
  return participants.find((item) => item.meeting_id === meetingId && item.user_id === userId)?.status;
}

function StatusPill({ status }) {
  if (status === 'accepted') {
    return <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-700 dark:text-emerald-300">Принято</span>;
  }
  if (status === 'declined') {
    return <span className="rounded-full bg-rose-500/12 px-2 py-0.5 text-[0.6rem] font-semibold text-rose-700 dark:text-rose-300">Отклонено</span>;
  }
  return <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-700 dark:text-amber-300">Приглашение</span>;
}

export default function MeetingsModal({
  meetings = [],
  participants = [],
  members = [],
  currentUserId,
  onClose,
  onCreate,
  onMeetingClick,
}) {
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 60_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, []);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...meetings].sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
    return {
      upcoming: sorted.filter(
        (meeting) =>
          meeting.status === 'scheduled'
          && (now === 0 || new Date(meeting.end_at).getTime() >= now),
      ),
      past: sorted
        .filter(
          (meeting) =>
            meeting.status !== 'scheduled'
            || (now > 0 && new Date(meeting.end_at).getTime() < now),
        )
        .reverse(),
    };
  }, [meetings, now]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const renderMeeting = (meeting) => {
    const rows = participants.filter((item) => item.meeting_id === meeting.id);
    const organizer = memberById.get(meeting.organizer_id);
    const mine = myStatus(participants, meeting.id, currentUserId);
    return (
      <button
        key={meeting.id}
        type="button"
        onClick={() => onMeetingClick(meeting)}
        className="w-full rounded-2xl border border-slate-300/60 bg-white/45 p-3 text-left transition hover:border-indigo-400/60 hover:bg-white/70 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm">
            <Video size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                {meeting.title}
              </span>
              {meeting.status === 'cancelled' ? (
                <span className="shrink-0 rounded-full bg-rose-500/12 px-2 py-0.5 text-[0.6rem] font-semibold text-rose-700 dark:text-rose-300">
                  Отменена
                </span>
              ) : (
                <StatusPill status={mine} />
              )}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.66rem] text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <Clock3 size={10} /> {formatDue(meeting.start_at)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users size={10} /> {rows.length}
              </span>
            </span>
            <span className="mt-1 flex items-center gap-1.5 text-[0.62rem] text-slate-400 dark:text-slate-500">
              <Avatar
                name={organizer?.full_name}
                color={organizer?.color}
                src={organizer?.avatar_url}
                className="h-4 w-4 text-[0.4rem]"
              />
              {organizer?.full_name || 'Организатор'}
            </span>
          </span>
        </div>
      </button>
    );
  };

  return createPortal(
    <div className="modal-overlay !z-[60]">
      <div className="modal-panel glass-panel flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-300/50 px-5 py-4 dark:border-white/10">
          <div>
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Video size={18} className="text-indigo-500 dark:text-indigo-300" />
              Встречи
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {upcoming.length === 1
                ? '1 предстоящая'
                : upcoming.length > 0
                  ? `${upcoming.length} предстоящих`
                  : 'Предстоящих встреч нет'}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onCreate}
              className="glass-btn glass-btn-primary !px-2.5 !py-1.5 !text-xs"
            >
              <Plus size={14} /> Создать
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
              title="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="scrollbar-slim flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {meetings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300/70 px-5 py-10 text-center dark:border-white/15">
              <CalendarPlus size={26} className="mx-auto text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">Встреч пока нет</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Создайте встречу и пригласите команду.
              </p>
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    Предстоящие
                  </p>
                  <div className="space-y-1.5">{upcoming.map(renderMeeting)}</div>
                </section>
              )}
              {past.length > 0 && (
                <section>
                  <p className="mb-1.5 text-[0.65rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
                    Прошедшие и отменённые
                  </p>
                  <div className="space-y-1.5 opacity-80">{past.map(renderMeeting)}</div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="border-t border-slate-300/50 px-5 py-2.5 text-[0.62rem] text-slate-400 dark:border-white/10 dark:text-slate-500">
          Напоминания придут за 30 и 5 минут до начала.
        </div>
      </div>
    </div>,
    document.body,
  );
}
