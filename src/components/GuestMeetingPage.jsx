import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, ShieldAlert, Video } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { formatDue } from '../lib/format';

const JITSI_DOMAIN = String(import.meta.env.VITE_JITSI_DOMAIN || 'meet.jit.si')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

function loadJitsiApi(domain) {
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

export default function GuestMeetingPage({ token }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [roomError, setRoomError] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: loadError } = await supabase.rpc('meeting_by_guest_token', {
        p_token: token,
      });
      if (!alive) return;
      if (loadError) setError(loadError.message);
      else if (!data || data.length === 0) setError('Ссылка недействительна или встреча отменена.');
      else setMeeting(data[0]);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  useEffect(() => {
    if (!joined || !meeting || !containerRef.current) return undefined;
    let disposed = false;
    let api = null;

    loadJitsiApi(JITSI_DOMAIN)
      .then((JitsiMeetExternalAPI) => {
        if (disposed || !containerRef.current) return;
        api = new JitsiMeetExternalAPI(JITSI_DOMAIN, {
          roomName: `kanban-${meeting.room_token}`,
          parentNode: containerRef.current,
          userInfo: { displayName: displayName.trim() || 'Гость' },
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
              'raisehand',
              'participants-pane',
              'tileview',
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
        api.addListener('readyToClose', () => setJoined(false));
        api.addListener('videoConferenceLeft', () => setJoined(false));
      })
      .catch((loadError) => {
        if (!disposed) setRoomError(loadError.message || 'Не удалось открыть комнату');
      });

    return () => {
      disposed = true;
      try {
        api?.dispose();
      } catch {
        // комната уже закрыта
      }
      apiRef.current = null;
    };
  }, [joined, meeting, displayName]);

  if (loading) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 size={18} className="animate-spin" /> Открываем встречу…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel w-full max-w-md rounded-3xl p-6 text-center">
          <ShieldAlert size={30} className="mx-auto text-amber-500" />
          <h1 className="mt-3 text-base font-bold text-slate-900 dark:text-white">
            Ссылка не работает
          </h1>
          <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{error}</p>
          <a href="/" className="glass-btn mt-4 inline-flex !px-3 !py-1.5 !text-xs">
            <ArrowLeft size={14} /> На главную
          </a>
        </div>
      </div>
    );
  }

  if (!joined) {
    return (
      <div className="app-bg flex min-h-screen items-center justify-center px-4">
        <div className="glass-panel w-full max-w-md rounded-3xl p-6">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.12em] text-indigo-600 uppercase dark:text-indigo-300">
            <Video size={14} /> Гостевое подключение
          </div>
          <h1 className="mt-2 text-xl font-bold text-slate-900 dark:text-white">
            {meeting.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {formatDue(meeting.start_at)} · до {formatDue(meeting.end_at)}
          </p>
          {meeting.description && (
            <p className="mt-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300">
              {meeting.description}
            </p>
          )}

          <label className="mt-4 block">
            <span className="mb-1 block text-[0.68rem] font-semibold tracking-[0.1em] text-slate-500 uppercase dark:text-slate-400">
              Ваше имя
            </span>
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Например, Иван"
              maxLength={60}
              className="glass-input !py-1.5 !text-xs"
              autoFocus
            />
          </label>

          <button
            type="button"
            onClick={() => setJoined(true)}
            disabled={!displayName.trim()}
            className="glass-btn glass-btn-primary mt-3 w-full !justify-center !py-2 !text-xs"
          >
            <Video size={14} /> Войти в комнату
          </button>
          <p className="mt-2 text-center text-[0.62rem] text-slate-400 dark:text-slate-500">
            Чат встречи доступен только участникам команды после входа в Канбан.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-bg flex h-screen flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-slate-300/50 bg-white/55 px-4 py-2.5 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-950/55">
        <button
          type="button"
          onClick={() => setJoined(false)}
          className="glass-btn !px-2.5 !py-1.5 !text-xs"
        >
          <ArrowLeft size={15} /> Выйти
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
            {meeting.title}
          </p>
          <p className="text-[0.62rem] text-slate-500 dark:text-slate-400">
            Гостевой доступ · {displayName.trim() || 'Гость'}
          </p>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {roomError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4">
            <div className="glass-panel max-w-md rounded-2xl p-5 text-center">
              <p className="text-sm font-semibold text-white">Комната недоступна</p>
              <p className="mt-1 text-xs text-slate-300">{roomError}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
