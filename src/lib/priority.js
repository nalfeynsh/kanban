/** Приоритет задачи = её «рейтинг» на доске. */
export const PRIORITIES = [
  {
    value: 3,
    key: 'high',
    label: 'Высокий',
    short: 'Высокий',
    dot: 'bg-rose-500',
    bar: 'from-rose-500 to-orange-400',
    chip: 'border-rose-400/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  },
  {
    value: 2,
    key: 'medium',
    label: 'Средний',
    short: 'Средний',
    dot: 'bg-amber-400',
    bar: 'from-amber-400 to-yellow-300',
    chip: 'border-amber-400/50 bg-amber-400/15 text-amber-700 dark:text-amber-300',
  },
  {
    value: 1,
    key: 'low',
    label: 'Низкий',
    short: 'Низкий',
    dot: 'bg-emerald-400',
    bar: 'from-emerald-400 to-teal-300',
    chip: 'border-emerald-400/50 bg-emerald-400/15 text-emerald-700 dark:text-emerald-300',
  },
  {
    value: 0,
    key: 'none',
    label: 'Без приоритета',
    short: 'Обычный',
    dot: 'bg-slate-400',
    bar: 'from-slate-400/70 to-slate-300/70',
    chip: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
  },
];

export function getPriority(value) {
  return PRIORITIES.find((p) => p.value === Number(value)) ?? PRIORITIES[PRIORITIES.length - 1];
}

export function normalizePriority(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  if (num >= 3) return 3;
  if (num <= 0) return 0;
  return Math.round(num);
}

const ROLE_LABELS = {
  admin: 'Администратор',
  manager: 'Менеджер',
  deputy: 'Заместитель',
  member: 'Сотрудник',
};

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? 'Сотрудник';
}

export const ROLE_OPTIONS = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
