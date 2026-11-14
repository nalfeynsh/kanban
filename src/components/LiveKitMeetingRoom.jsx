import { useCallback, useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import {
  AlertTriangle,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { supabase } from '../supabaseClient';

function initials(name) {
  return String(name || '?')
    .trim()
    .slice(0, 1)
    .toUpperCase();
}

function VideoTrack({ track, muted = false, className = '' }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function AudioTrack({ track }) {
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !track) return undefined;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <audio ref={ref} autoPlay />;
}

function ParticipantTile({ participant, local = false }) {
  const camera = participant?.getTrackPublication(Track.Source.Camera)?.videoTrack;
  const screen = participant?.getTrackPublication(Track.Source.ScreenShare)?.videoTrack;
  const video = screen || camera;
  const name = participant?.name || participant?.identity || (local ? 'Вы' : 'Участник');

  return (
    <div className="relative min-h-36 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
      {video ? (
        <VideoTrack
          track={video}
          muted={local}
          className="h-full w-full object-contain"
        />
      ) : (
        <div className="flex h-full min-h-36 items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-lg font-bold text-indigo-200">
            {initials(name)}
          </span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 max-w-[85%] truncate rounded-md bg-slate-950/70 px-2 py-1 text-[0.65rem] font-medium text-white">
        {name} {local ? '· вы' : ''}
      </span>
      {screen && (
        <span className="absolute top-2 right-2 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[0.55rem] font-semibold text-white">
          экран
        </span>
      )}
    </div>
  );
}

export default function LiveKitMeetingRoom({
  roomToken,
  onConnected,
  onDisconnected,
  onParticipantsChange,
}) {
  const roomRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [busy, setBusy] = useState('');

  const refresh = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let room = null;

    const connect = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError('Нет активной сессии. Войдите в аккаунт заново.');
          setStatus('error');
          return;
        }

        const response = await fetch('/api/meetings/livekit-token', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ room_token: roomToken }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          setError(
            payload.message ||
              (response.status === 503
                ? 'LiveKit ещё не настроен на сервере.'
                : 'Не удалось получить доступ к комнате.'),
          );
          setStatus('error');
          return;
        }

        room = new Room({
          adaptiveStream: true,
          dynacast: true,
          videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
        });
        roomRef.current = room;
        setRoom(room);

        const onRoomChange = () => {
          if (!disposed) refresh();
        };
        room
          .on(RoomEvent.ParticipantConnected, onRoomChange)
          .on(RoomEvent.ParticipantDisconnected, onRoomChange)
          .on(RoomEvent.TrackSubscribed, onRoomChange)
          .on(RoomEvent.TrackUnsubscribed, onRoomChange)
          .on(RoomEvent.TrackMuted, onRoomChange)
          .on(RoomEvent.TrackUnmuted, onRoomChange)
          .on(RoomEvent.LocalTrackPublished, onRoomChange)
          .on(RoomEvent.LocalTrackUnpublished, onRoomChange)
          .on(RoomEvent.Disconnected, () => {
            if (disposed) return;
            setStatus('disconnected');
            onDisconnected?.();
          });

        await room.connect(payload.url, payload.token);
        if (disposed) {
          await room.disconnect();
          return;
        }

        setStatus('connected');
        refresh();
        onConnected?.();

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
          if (!disposed) setMicEnabled(true);
        } catch {
          if (!disposed) setMicEnabled(false);
        }
      } catch (connectError) {
        if (disposed) return;
        setError(connectError?.message || 'Не удалось подключиться к LiveKit.');
        setStatus('error');
      }
    };

    void connect();

    return () => {
      disposed = true;
      if (room) {
        try {
          void room.disconnect();
        } catch {
          // комната уже закрыта
        }
      }
      roomRef.current = null;
      setRoom(null);
    };
  }, [roomToken, refresh, onConnected, onDisconnected]);

  useEffect(() => {
    if (status !== 'connected') return;
    const room = roomRef.current;
    if (!room) return;
    onParticipantsChange?.(1 + room.remoteParticipants.size);
    // version меняется при каждом событии комнаты — этого достаточно для пересчёта
  }, [status, version, onParticipantsChange]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('mic');
    try {
      await room.localParticipant.setMicrophoneEnabled(!micEnabled);
      setMicEnabled((value) => !value);
    } catch (toggleError) {
      setError(toggleError?.message || 'Не удалось переключить микрофон.');
    } finally {
      setBusy('');
    }
  };

  const toggleCamera = async () => {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('camera');
    try {
      await room.localParticipant.setCameraEnabled(!cameraEnabled);
      setCameraEnabled((value) => !value);
    } catch (toggleError) {
      setError(toggleError?.message || 'Не удалось переключить камеру.');
    } finally {
      setBusy('');
    }
  };

  const toggleScreen = async () => {
    const room = roomRef.current;
    if (!room || busy) return;
    setBusy('screen');
    try {
      await room.localParticipant.setScreenShareEnabled(!screenEnabled);
      setScreenEnabled((value) => !value);
    } catch (toggleError) {
      if (toggleError?.name !== 'NotAllowedError') {
        setError(toggleError?.message || 'Не удалось включить демонстрацию экрана.');
      }
    } finally {
      setBusy('');
    }
  };

  const leave = () => {
    const room = roomRef.current;
    if (room) {
      void room.disconnect();
    }
    onDisconnected?.();
  };

  if (status === 'connecting') {
    return (
      <div className="flex h-full min-h-64 items-center justify-center bg-slate-950">
        <div className="flex items-center gap-2 text-sm text-slate-300">
          <Loader2 size={18} className="animate-spin" /> Подключаемся к LiveKit…
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full min-h-64 items-center justify-center bg-slate-950 px-4">
        <div className="max-w-md rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5 text-center">
          <AlertTriangle size={26} className="mx-auto text-amber-400" />
          <p className="mt-2 text-sm font-semibold text-white">SFU-комната недоступна</p>
          <p className="mt-1 text-xs text-amber-100/80">{error}</p>
          <p className="mt-2 text-[0.65rem] text-slate-400">
            Проверьте `/api/vks/status` и переменные LiveKit на сервере.
          </p>
        </div>
      </div>
    );
  }

  if (status === 'disconnected') {
    return (
      <div className="flex h-full min-h-64 items-center justify-center bg-slate-950">
        <div className="text-center">
          <p className="text-sm font-semibold text-white">Вы вышли из комнаты</p>
          <button type="button" onClick={leave} className="glass-btn mt-3 !px-3 !py-1.5 !text-xs">
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  const locals = room ? [room.localParticipant] : [];  const remotes = room ? [...room.remoteParticipants.values()] : [];
  const all = [...locals, ...remotes];
  const remoteAudio = remotes
    .map((participant) => participant.getTrackPublication(Track.Source.Microphone)?.audioTrack)
    .filter(Boolean);

  return (
    <div className="flex h-full flex-col bg-slate-950">
      {remoteAudio.map((track, index) => (
        <AudioTrack key={track.sid || `audio-${index}`} track={track} />
      ))}

      <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
        <div className="grid h-full auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {all.map((participant) => (
            <ParticipantTile
              key={participant.sid || participant.identity}
              participant={participant}
              local={participant === room?.localParticipant}
            />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-slate-950/95 px-4 py-3">
        <button
          type="button"
          onClick={toggleMic}
          disabled={Boolean(busy)}
          className={`glass-btn !px-3 !py-2 !text-xs ${micEnabled ? '' : '!border-rose-400/50 !text-rose-300'}`}
          title={micEnabled ? 'Выключить микрофон' : 'Включить микрофон'}
        >
          {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
          <span className="hidden sm:inline">{micEnabled ? 'Микрофон' : 'Включить микрофон'}</span>
        </button>
        <button
          type="button"
          onClick={toggleCamera}
          disabled={Boolean(busy)}
          className={`glass-btn !px-3 !py-2 !text-xs ${cameraEnabled ? '' : '!border-amber-400/50 !text-amber-200'}`}
          title={cameraEnabled ? 'Выключить камеру' : 'Включить камеру'}
        >
          {cameraEnabled ? <Video size={16} /> : <VideoOff size={16} />}
          <span className="hidden sm:inline">{cameraEnabled ? 'Камера' : 'Включить камеру'}</span>
        </button>
        <button
          type="button"
          onClick={toggleScreen}
          disabled={Boolean(busy)}
          className={`glass-btn !px-3 !py-2 !text-xs ${screenEnabled ? '!border-sky-400/60 !text-sky-200' : ''}`}
          title={screenEnabled ? 'Остановить показ экрана' : 'Показать экран'}
        >
          {screenEnabled ? <MonitorOff size={16} /> : <Monitor size={16} />}
          <span className="hidden sm:inline">Экран</span>
        </button>
        <button
          type="button"
          onClick={leave}
          className="glass-btn glass-btn-danger !px-3 !py-2 !text-xs"
          title="Выйти из комнаты"
        >
          <PhoneOff size={16} /> Выйти
        </button>
      </div>
    </div>
  );
}
