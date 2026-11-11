/**
 * Роли и права.
 *
 * Права описаны декларативно: один источник истины для UI (панель «Доступ»)
 * и для проверок `can(...)`. Серверная часть дублируется в RLS-политиках
 * (миграции 001 и 003) — клиентские проверки нужны только для UX.
 */

export const ROLE_ORDER = ['admin', 'manager', 'deputy', 'member'];

export const PERMISSIONS = [
  {
    key: 'tasks.create',
    label: 'Создавать задачи',
    hint: 'Новая задача в любой колонке',
    roles: ['admin', 'manager', 'deputy', 'member'],
  },
  {
    key: 'tasks.editTeam',
    label: 'Редактировать командные задачи',
    hint: 'Заголовок, описание, сроки, файлы, ссылки',
    roles: ['admin', 'manager', 'deputy', 'member'],
  },
  {
    key: 'tasks.archive',
    label: 'Отправлять задачи в архив',
    hint: 'Мягкое удаление с возможностью восстановления',
    roles: ['admin', 'manager', 'deputy', 'member'],
  },
  {
    key: 'tasks.assign',
    label: 'Назначать исполнителей',
    hint: 'Выбор коллеги в карточке задачи',
    roles: ['admin', 'manager', 'deputy'],
  },
  {
    key: 'tasks.manageAny',
    label: 'Управлять любыми задачами',
    hint: 'В том числе закрывать и переносить чужие',
    roles: ['admin', 'manager'],
  },
  {
    key: 'tasks.priority',
    label: 'Менять приоритет',
    hint: 'Влияет на порядок в колонке',
    roles: ['admin', 'manager', 'deputy'],
  },
  {
    key: 'team.view',
    label: 'Смотреть профили команды',
    hint: 'Контакты, Telegram, задачи сотрудника',
    roles: ['admin', 'manager', 'deputy', 'member'],
  },
  {
    key: 'roles.manage',
    label: 'Менять роли сотрудников',
    hint: 'Выдача администраторов, менеджеров, заместителей',
    roles: ['admin'],
  },
  {
    key: 'invites.view',
    label: 'Смотреть приглашения',
    hint: 'Список выданных доступов',
    roles: ['admin', 'manager'],
  },
  {
    key: 'invites.create',
    label: 'Приглашать сотрудников',
    hint: 'Новая почта в списке доступа',
    roles: ['admin', 'manager'],
  },
  {
    key: 'invites.revoke',
    label: 'Отзывать приглашения',
    hint: 'Удаление неиспользованного доступа',
    roles: ['admin'],
  },
  {
    key: 'columns.manage',
    label: 'Управлять колонками доски',
    hint: 'Создание и переименование блоков',
    roles: ['admin'],
  },
];

export const ROLE_META = {
  admin: {
    label: 'Администратор',
    short: 'Админ',
    description: 'Полный доступ: роли, приглашения, колонки, все задачи.',
    chip: 'border-rose-400/50 bg-rose-500/12 text-rose-700 dark:text-rose-300',
    dot: 'bg-rose-500',
  },
  manager: {
    label: 'Менеджер',
    short: 'Менеджер',
    description: 'Приглашает сотрудников, управляет задачами, назначает исполнителей.',
    chip: 'border-amber-400/50 bg-amber-400/12 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-400',
  },
  deputy: {
    label: 'Заместитель',
    short: 'Зам',
    description: 'Помогает менеджеру: приоритеты, исполнители, задачи команды.',
    chip: 'border-sky-400/50 bg-sky-500/12 text-sky-700 dark:text-sky-300',
    dot: 'bg-sky-400',
  },
  member: {
    label: 'Сотрудник',
    short: 'Сотрудник',
    description: 'Работает со своими и командными задачами.',
    chip: 'border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
  },
};

export function roleOf(profileOrRole) {
  if (!profileOrRole) return 'member';
  if (typeof profileOrRole === 'string') return profileOrRole;
  return profileOrRole.role || 'member';
}

/** Есть ли у роли право */
export function can(profileOrRole, permissionKey) {
  const role = roleOf(profileOrRole);
  const permission = PERMISSIONS.find((item) => item.key === permissionKey);
  if (!permission) return false;
  return permission.roles.includes(role);
}

/** Все права роли */
export function permissionsFor(profileOrRole) {
  const role = roleOf(profileOrRole);
  return PERMISSIONS.filter((permission) => permission.roles.includes(role));
}

export function isAdmin(profileOrRole) {
  return roleOf(profileOrRole) === 'admin';
}
