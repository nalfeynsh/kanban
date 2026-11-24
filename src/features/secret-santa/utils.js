export const STATUS_LABELS = {
  draft: 'Черновик',
  collecting: 'Набор участников',
  drawn: 'Жеребьёвка проведена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

export const CURRENCIES = [
  { value: 'RUB', label: '₽' },
];

export function formatMoney(value, currency = 'RUB') {
  if (value == null || value === '') return '';
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(Number(value));
  } catch {
    return `${Number(value)} ${currency}`;
  }
}

export function budgetLabel(min, max, currency = 'RUB') {
  const from = min == null || min === '' ? '' : formatMoney(min, currency);
  const to = max == null || max === '' ? '' : formatMoney(max, currency);
  if (from && to) return `${from} — ${to}`;
  if (from) return `от ${from}`;
  if (to) return `до ${to}`;
  return 'Бюджет не указан';
}

export function formatDate(value) {
  if (!value) return 'не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'не указана';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function countdownLabel(value) {
  if (!value) return '';
  const target = new Date(value).getTime();
  if (Number.isNaN(target)) return '';
  const days = Math.ceil((target - Date.now()) / 86_400_000);
  if (days < 0) return 'обмен уже прошёл';
  if (days === 0) return 'обмен сегодня';
  if (days === 1) return 'до обмена 1 день';
  if (days < 5) return `до обмена ${days} дня`;
  return `до обмена ${days} дней`;
}

export function formatDateTime(value) {  if (!value) return 'не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'не указана';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** ISO → значение для input[type=datetime-local] в локальном часовом поясе */
export function toDateTimeLocal(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Значение input[type=datetime-local] → ISO */
export function fromDateTimeLocal(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function participantName(participant, members = []) {
  if (!participant) return 'Участник';
  const member = members.find((item) => item.id === participant.user_id);
  return member?.full_name || 'Сотрудник';
}

export function participantAvatar(participant, members = []) {
  if (!participant) return null;
  return members.find((item) => item.id === participant.user_id) || null;
}
