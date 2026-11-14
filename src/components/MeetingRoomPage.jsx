import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Circle,
  Loader2,
  MessageCircle,
  MicOff,
  ShieldAlert,
  Square,
  Users,
  Video,
  X,
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatDue } from '../lib/format';
import MeetingChatModal from './MeetingChatModal';

const JITSI_DOMAIN = String(import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function loadJitsiApi(domain) {
  if (typeof window === 'undefined') return Promise.reject(new Error('Нет браузера'));
  if (window.JitsiMeetExternalAPI) return Promise.resolve(window.JitsiMeetExternalAPI);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-jitsi-api]');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.JitsiMeetExternalAPI));
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить Jitsi')));
      return;
    }
    const script = document.createElement('script');
    script.src = `https://${domain}/external_api.js`;
    script.async = true;
    script.dataset.jitsiApi = 'true';
    script.onload = () => {
      if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI);
      else reject(new Error('Jitsi API не инициализировался'));
    };
    script.onerror = () => reject(new Error(`Не удалось загрузить ${domain}`));
    document.head.appendChild(script);
  });
}

export default function MeetingRoomPage({ token, profile, userEmail, currentUserId, members = [], onExit }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isPresent, setIsPresent] = useState(false);
  const attendanceTimerRef = useRef(null);
  const attendanceJoinedRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [recordingNotice, setRecordingNotice] = useState('');
  const [jitsiParticipants, setJitsiParticipants] = useState([]);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isJitsiModerator, setIsJitsiModerator] = useState(false);
  const [moderationNotice, setModerationNotice] = useState('');
  const recorderRef = useRef(null);
  const recordStreamRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);
  const recordStartedAtRef = useRef(0);

  const displayName = profile?.full_name || userEmail?.split('@')[0] || 'Сотрудник';
  const roomName = useMemo(() => `kanban-${token}`, [token]);
  const canModerate = Boolean(
    meeting &&
      currentUserId &&
      (meeting.organizer_id === currentUserId || meeting.host_id === currentUserId),
  );
  const otherParticipants = jitsiParticipants.filter(
    (participant) => !(participant.local || participant.isLocal),
  );

  const muteAll = () => {
    const api = apiRef.current;
    if (!api) return;
    try {
      api.executeCommand('muteEveryone', 'audio');
      setModerationNotice('Команда «выключить микрофоны всем» отправлена');
    } catch {
      setModerationNotice('Не удалось отправить команду. Нужны права модератора Jitsi.');
    }
  };

  const muteParticipant = (participantId, participantName) => {
    const api = apiRef.current;
    if (!api) return;
    try {
      api.executeCommand('muteRemoteParticipant', participantId, 'audio');
      setModerationNotice(`Микрофон ${participantName || 'участника'} выключен`);
    } catch {
      setModerationNotice('Не удалось выключить микрофон. Нужны права модератора Jitsi.');
    }
  };

  const startRecording = async () => {
    if (recording || recordingBusy) return;
    if (!meeting || !currentUserId) {
      setRecordingNotice('Не удалось определить встречу или пользователя');
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setRecordingNotice('Браузер не поддерживает запись экрана');
      return;
    }

    setRecordingNotice('');
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true,
        preferCurrentTab: true,
      });
      const mimeCandidates = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
      ];
      const mimeType = mimeCandidates.find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      recordChunksRef.current = [];
      recordStartedAtRef.current = Date.now();
      recordStreamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data?.size) recordChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        const duration = Math.max(1, Math.round((Date.now() - recordStartedAtRef.current) / 1000));
        setRecording(false);
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        recordStreamRef.current?.getTracks().forEach((track) => track.stop());
        recordStreamRef.current = null;
        recorderRef.current = null;

        const chunks = recordChunksRef.current;
        recordChunksRef.current = [];
        if (!chunks.length) {
          setRecordingNotice('Запись пустая — сохранять нечего');
          return;
        }

        setRecordingBusy(true);
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
          const mimeType = blob.type.split(';')[0] || 'video/webm';
          const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
          const path = `${meeting.id}/${currentUserId}/${crypto.randomUUID()}.${extension}`;
          const fileName = `Запись встречи ${new Date().toLocaleString('ru-RU')}.${extension}`;
          const { error: uploadError } = await supabase.storage
            .from('meeting-recordings')
            .upload(path, blob, { contentType: mimeType, upsert: false });
          if (uploadError) {
            setRecordingNotice(`Не удалось загрузить запись: ${uploadError.message}`);
            return;
          }

          const { error: rowError } = await supabase.from('meeting_recordings').insert({
            meeting_id: meeting.id,
            author_id: currentUserId,
            path,
            file_name: fileName,
            mime_type: mimeType,
            size_bytes: blob.size,
            duration_seconds: duration,
          });
          if (rowError) {
            setRecordingNotice(`Файл загружен, но не привязан к встрече: ${rowError.message}`);
            return;
          }

          setRecordingNotice(`Запись сохранена (${formatClock(duration)}). Скачать её можно в деталях встречи.`);
        } finally {
          setRecordingBusy(false);
        }
      };

      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });
      recorder.start(1000);
      setRecording(true);
      setRecordingSeconds(0);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingSeconds(Math.round((Date.now() - recordStartedAtRef.current) / 1000));
      }, 1000);
    } catch (recordError) {
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
      if (recordError?.name === 'NotAllowedError') {
        setRecordingNotice('Выбор вкладки отменён');
      } else {
        setRecordingNotice(recordError?.message || 'Не удалось начать запись');
      }
    }
  };

  const stopRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
  };

  useEffect(
    () => () => {
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // запись уже остановлена
        }
      }
      recordStreamRef.current?.getTracks().forEach((track) => track.stop());
      recordStreamRef.current = null;
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: loadError } = await supabase
        .from('meetings')
        .select('*')
        .eq('room_token', token)
        .maybeSingle();
      if (!alive) return;
      if (loadError) {
        setError(loadError.message);
      } else if (!data) {
        setError('Встреча не найдена или у вас нет доступа.');
      } else if (data.status === 'cancelled') {
        setError('Эта встреча отменена организатором.');
      } else {
        setMeeting(data);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!meeting || !containerRef.current) return undefined;
    let disposed = false;
    let api = null;

    loadJitsiApi(JITSI_DOMAIN)
      .then((JitsiMeetExternalAPI) => {
        if (disposed || !containerRef.current) return;
        api = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName,
          parentNode: containerRef.current,
          userInfo: { displayName },
          configOverwrite: {
            prejoinPageEnabled: true,
            startWithAudioMuted: false,
            startWithVideoMuted: true,
            disableDeepLinking: true,
            enableWelcomePage: false,
            toolbarButtons: [
              'microphone',
              'camera',
              'desktop',
              'chat',
              'raisehand',
              'participants-pane',
              'tileview',
              'select-background',
              'settings',
              'fullscreen',
              'hangup',
            ],
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            TOOLBAR_ALWAYS_VISIBLE: true,
            DEFAULT_BACKGROUND: '#0f172a',
          },
        });
        apiRef.current = api;
        const refreshParticipants = () => {
          if (disposed || !apiRef.current) return;
          try {
            const list = api.getParticipantsInfo?.() || [];
            setJitsiParticipants(list);
            const local =
              list.find((participant) => participant.local || participant.isLocal) ||
              (api.getMyParticipantId
                ? list.find((participant) => participant.participantId === api.getMyParticipantId())
                : null);
            if (local?.role) setIsJitsiModerator(local.role === 'moderator');
          } catch {
            // список участников может быть недоступен до входа в комнату
          }
        };
        refreshParticipants();
        const leaveRoom = () => {
          if (attendanceTimerRef.current) {
            window.clearInterval(attendanceTimerRef.current);
            attendanceTimerRef.current = null;
          }
          if (attendanceJoinedRef.current) {
            attendanceJoinedRef.current = false;
            setIsPresent(false);
            void supabase.rpc('meeting_leave', { p_meeting_id: meeting.id });
          }
        };
        api.addListener('videoConferenceJoined', () => {
          refreshParticipants();
          if (!currentUserId) return;
          void supabase
            .rpc('meeting_join', { p_meeting_id: meeting.id })
            .then(({ error: joinError }) => {
              if (disposed) return;
              if (joinError) {
                console.warn('meeting attendance join:', joinError.message);
                return;
              }
              attendanceJoinedRef.current = true;
              setIsPresent(true);
              if (attendanceTimerRef.current) window.clearInterval(attendanceTimerRef.current);
              attendanceTimerRef.current = window.setInterval(() => {
                void supabase.rpc('meeting_heartbeat', { p_meeting_id: meeting.id });
              }, 30_000);
            });
        });
        api.addListener('participantJoined', refreshParticipants);
        api.addListener('participantLeft', refreshParticipants);
        api.addListener('participantRoleChanged', (event) => {
          if (event.role) setIsJitsiModerator(event.role === 'moderator');
          refreshParticipants();
        });
        api.addListener('readyToClose', () => {
          leaveRoom();
          onExit?.();
        });
        api.addListener('videoConferenceLeft', () => {
          leaveRoom();
          onExit?.();
        });
      })
      .catch((loadError) => {
        if (!disposed) setRoomError(loadError.message || 'Не удалось открыть комнату');
      });

    return () => {
      disposed = true;
      if (attendanceTimerRef.current) {
        window.clearInterval(attendanceTimerRef.current);
        attendanceTimerRef.current = null;
      }
      if (attendanceJoinedRef.current) {
        attendanceJoinedRef.current = false;
        void supabase.rpc('meeting_leave', { p_meeting_id: meeting.id });
      }
      try {
        api?.dispose();
      } catch {
        // комната уже закрыта
      }
      apiRef.current = null;
    };
  }, [meeting, roomName, displayName, onExit, currentUserId]);

  if (loading) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 size={18} className="animate-spin" /> Подключаемся к встрече…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-center">
          <ShieldAlert size={30} className="mx-auto text-amber-500" />
          <h1 className="mt-3 text-base font-bold text-slate-900 dark:text-white">Не удалось войти</h1>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{error}</p>
          <button type="button" onClick={onExit} className="glass-btn mt-4 !px-3 !py-1.5 !text-xs">
            <ArrowLeft size={14} /> На главную
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg flex h-screen flex-col overflow-hidden">
      <header className="relative flex shrink-0 items-center gap-3 border-b border-slate-300/50 bg-white/55 px-4 py-2.5 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55">
        <button
          type="button"
          onClick={onExit}
          className="glass-btn !px-2.5 !py-1.5 !text-xs"
          title="Выйти из встречи"
        >
          <ArrowLeft size={15} /> Выйти
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            <Video size={13} className="shrink-0 text-sky-500" />
            {meeting.title}
          </p>
          <p className="truncate text-[0.62rem] text-slate-500 dark:text-slate-400">
            {formatDue(meeting.start_at)} · до {formatDue(meeting.end_at)}
          </p>
        </div>
        <span className="hidden rounded-full bg-sky-500/10 px-2 py-0.5 text-[0.6rem] font-semibold text-sky-700 sm:inline dark:text-sky-300">
          до 10 участников
        </span>
        {isPresent && (
          <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-700 dark:text-emerald-300">
            Вы в комнате
          </span>
        )}
        {canModerate && (
          <button
            type="button"
            onClick={() => setIsParticipantsOpen((prev) => !prev)}
            className="glass-btn !px-2.5 !py-1.5 !text-xs"
            title="Участники и управление микрофонами"
            aria-expanded={isParticipantsOpen}
          >
            <Users size={15} />
            <span className="hidden sm:inline">Участники</span>
            {otherParticipants.length > 0 && (
              <span className="rounded-full bg-indigo-500/15 px-1.5 text-[0.6rem] font-semibold text-indigo-700 dark:text-indigo-200">
                {otherParticipants.length}
              </span>
            )}
          </button>
        )}
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          disabled={recordingBusy}
          className={`glass-btn !px-2.5 !py-1.5 !text-xs ${
            recording ? '!border-rose-400/60 !bg-rose-500/12 !text-rose-700 dark:!text-rose-300' : ''
          }`}
          title="Записать вкладку с встречей (видео и звук вкладки)"
        >
          {recordingBusy ? (
            <Loader2 size={13} className="animate-spin" />
          ) : recording ? (
            <Square size={13} className="fill-current" />
          ) : (
            <Circle size={13} className="fill-rose-500 text-rose-500" />
          )}
          <span className="hidden sm:inline">
            {recording ? formatClock(recordingSeconds) : recordingBusy ? 'Сохраняем…' : 'Запись'}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className="glass-btn !px-2.5 !py-1.5 !text-xs"
          title="Чат встречи"
        >
          <MessageCircle size={15} />
          <span className="hidden sm:inline">Чат</span>
        </button>
      </header>

      {canModerate && isParticipantsOpen && (
        <div className="absolute top-[3.25rem] right-4 z-40 w-80 overflow-hidden rounded-2xl border border-slate-300/70 bg-white/95 shadow-2xl backdrop-blur dark:border-white/10 dark:bg-slate-900/95">
          <div className="flex items-center justify-between border-b border-slate-300/60 px-3 py-2 dark:border-white/10">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
              <Users size={14} className="text-indigo-500" /> Участники
            </p>
            <button
              type="button"
              onClick={() => setIsParticipantsOpen(false)}
              className="rounded-md p-1 text-slate-400 hover:bg-white/70 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
              aria-label="Закрыть список участников"
            >
              <X size={14} />
            </button>
          </div>

          <div className="space-y-2 p-2.5">
            <button
              type="button"
              onClick={muteAll}
              className="glass-btn glass-btn-danger w-full !justify-center !px-2.5 !py-1.5 !text-xs"
              title="Выключить микрофоны всех участников"
            >
              <MicOff size={13} /> Выключить всем микрофоны
            </button>

            {!isJitsiModerator && (
              <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-2 py-1.5 text-[0.64rem] leading-relaxed text-amber-800 dark:text-amber-200">
                Jitsi ещё не выдал права модератора. Если команда не сработала, назначьте ведущего
                модератором в панели участников Jitsi.
              </p>
            )}

            <div className="scrollbar-slim max-h-64 space-y-1 overflow-y-auto">
              {otherParticipants.length === 0 ? (
                <p className="px-2 py-3 text-center text-[0.68rem] text-slate-500 dark:text-slate-400">
                  Других участников в комнате пока нет.
                </p>
              ) : (
                otherParticipants.map((participant) => (
                  <div
                    key={participant.participantId || participant.displayName}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/70 dark:hover:bg-white/5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/15 text-[0.6rem] font-bold text-indigo-700 dark:text-indigo-200">
                      {(participant.displayName || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200">
                      {participant.displayName || 'Участник'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        muteParticipant(
                          participant.participantId,
                          participant.displayName,
                        )
                      }
                      className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-500/10"
                      title={`Выключить микрофон ${participant.displayName || 'участника'}`}
                      aria-label={`Выключить микрофон ${participant.displayName || 'участника'}`}
                    >
                      <MicOff size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {moderationNotice && (
        <div className="flex shrink-0 items-center gap-2 border-b border-indigo-400/30 bg-indigo-400/10 px-4 py-1.5 text-[0.68rem] text-indigo-800 dark:text-indigo-200">
          <MicOff size={12} className="shrink-0" />
          <span className="min-w-0 flex-1">{moderationNotice}</span>
          <button
            type="button"
            onClick={() => setModerationNotice('')}
            className="shrink-0 text-xs font-semibold opacity-70 hover:opacity-100"
            aria-label="Скрыть сообщение"
          >
            ×
          </button>
        </div>
      )}

      {recordingNotice && (
        <div className="flex shrink-0 items-center gap-2 border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-[0.68rem] text-amber-800 dark:text-amber-200">
          <ShieldAlert size={12} className="shrink-0" />
          <span className="min-w-0 flex-1">{recordingNotice}</span>
          <button
            type="button"
            onClick={() => setRecordingNotice('')}
            className="shrink-0 text-xs font-semibold opacity-70 hover:opacity-100"
            aria-label="Скрыть сообщение"
          >
            ×
          </button>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {roomError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="glass-panel max-w-md rounded-2xl p-5 text-center">
              <p className="text-sm font-semibold text-white">Комната недоступна</p>
              <p className="mt-1 text-xs text-slate-300">{roomError}</p>
              <p className="mt-2 text-[0.65rem] text-slate-400">
                Проверьте доступность {JITSI_DOMAIN} или задайте VITE_JITSI_DOMAIN.
              </p>
            </div>
          </div>
        )}
      </div>

      {isChatOpen && (
        <MeetingChatModal
          meeting={meeting}
          currentUserId={currentUserId}
          members={members}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}
