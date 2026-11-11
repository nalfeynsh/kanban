/**
 * Уведомления «Мой Канбан»: звук, браузерные уведомления, разрешения.
 * Без внешних зависимостей — Web Audio API + Notification API.
 */

let audioContext = null;

/** Разблокировать звук после первого действия пользователя (политика автоплея) */
export function unlockAudio() {
  if (typeof window === 'undefined') return;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  try {
    if (!audioContext) audioContext = new Ctx();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  } catch {
    // звук недоступен — не мешаем работе
  }
}

/** Мягкий двухнотный сигнал (как колокольчики) */
export function playChime() {
  unlockAudio();
  if (!audioContext || audioContext.state !== 'running') return;

  const ctx = audioContext;
  const now = ctx.currentTime;
  const notes = [880, 1174.66];

  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = now + index * 0.16;

    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.55);
  });
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifications() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function showSystemNotification({ title, body, tag, onClick }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return null;
  try {
    const notification = new Notification(title, {
      body,
      tag,
      icon: '/logo-mark.png',
      badge: '/logo-mark.png',
    });
    notification.onclick = () => {
      window.focus();
      onClick?.();
      notification.close();
    };
    return notification;
  } catch {
    return null;
  }
}
