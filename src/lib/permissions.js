/**
 * Роли и права.
 *
 * Права описаны декларативно: один источник истины для UI (панель «Доступ»)
 * и для проверок `can(...)`. Серверная часть дублируется в RLS-политиках
 * (миграции 001 и 003) — клиентские проверки нужны только для UX.
 */

export const ROLE_ORDER = ['admin', 'manager', 'deputy', 'member'];

const ROLE_RANKS = { admin: 99, manager: 70, deputy: 50, member: 20 };
const ROLE_DEFINITIONS = new Map();

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
    key: 'team.remove',
    label: 'Удалять сотрудников',
    hint: 'Мягкое удаление с возможностью восстановления',
    roles: ['admin', 'manager', 'deputy'],
  },
  {
    key: 'team.restore',
    label: 'Восстанавливать сотрудников',
    hint: 'Вернуть доступ и изменить роль при восстановлении',
    roles: ['admin', 'manager', 'deputy'],
  },
  {
    key: 'roles.manage',
    label: 'Управлять ролями',
    hint: 'Создавать роли, менять права и назначать их сотрудникам',
    roles: ['admin', 'manager', 'deputy'],
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

/**
 * Регистрирует роли из Supabase в клиентском реестре.
 * Системные названия/цвета остаются прежними, пользовательские добавляются рядом.
 */
export function registerRoleDefinitions(roleList = []) {
  ROLE_DEFINITIONS.clear();
  const ordered = [...roleList].sort((a, b) => Number(b.rank) - Number(a.rank));

  ordered.forEach((role) => {
    if (!role?.key) return;
    ROLE_DEFINITIONS.set(role.key, {
      key: role.key,
      name: role.name || role.key,
      rank: Number(role.rank) || 1,
      permissions: Array.isArray(role.permissions) ? role.permissions : [],
      isSystem: Boolean(role.is_system),
    });

    if (!ROLE_META[role.key] || role.is_system !== true) {
      ROLE_META[role.key] = {
        label: role.name || role.key,
        short: role.name || role.key,
        description: role.is_system
          ? 'Системная роль'
          : `Пользовательская роль · ранг ${Number(role.rank) || 1}`,
        chip: 'border-indigo-400/50 bg-indigo-500/12 text-indigo-700 dark:text-indigo-300',
        dot: 'bg-indigo-400',
      };
    }
  });

  ROLE_ORDER.length = 0;
  ROLE_ORDER.push(...ordered.map((role) => role.key));
}

export function roleOptions(roleList = []) {
  if (Array.isArray(roleList) && roleList.length > 0) {
    return [...roleList]
      .sort((a, b) => Number(b.rank) - Number(a.rank))
      .map((role) => ({ value: role.key, label: role.name }));
  }
  const fallback = ROLE_DEFINITIONS.size
    ? [...ROLE_DEFINITIONS.values()]
    : ROLE_ORDER.map((key) => ({
        key,
        name: ROLE_META[key]?.label || key,
        rank: ROLE_RANKS[key] || 1,
      }));
  return fallback.map((role) => ({ value: role.key, label: role.name }));
}

export function roleRank(profileOrRole) {
  const role = roleOf(profileOrRole);
  return ROLE_DEFINITIONS.get(role)?.rank ?? ROLE_RANKS[role] ?? 1;
}

export function roleHasPermission(profileOrRole, permissionKey) {
  return can(profileOrRole, permissionKey);
}

/** Есть ли у роли право */
export function can(profileOrRole, permissionKey) {
  const role = roleOf(profileOrRole);
  const dynamicRole = ROLE_DEFINITIONS.get(role);
  if (dynamicRole) return dynamicRole.permissions.includes(permissionKey);
  const permission = PERMISSIONS.find((item) => item.key === permissionKey);
  if (!permission) return false;
  return permission.roles.includes(role);
}

/** Все права роли */
export function permissionsFor(profileOrRole) {
  const role = roleOf(profileOrRole);
  const dynamicRole = ROLE_DEFINITIONS.get(role);
  if (dynamicRole) return permissionKeysToObjects(dynamicRole.permissions);
  return PERMISSIONS.filter((permission) => permission.roles.includes(role));
}

function permissionKeysToObjects(keys) {
  const set = new Set(keys);
  return PERMISSIONS.filter((permission) => set.has(permission.key));
}

export function isAdmin(profileOrRole) {
  return roleOf(profileOrRole) === 'admin';
}

export const CHAT_MODERATION_ROLES = ['admin', 'manager', 'deputy'];

/** Может ли роль открывать панель модерации чата. */
export function canModerateChat(profileOrRole) {
  return CHAT_MODERATION_ROLES.includes(roleOf(profileOrRole));
}

/** Строгая иерархия: модерировать можно только роль ниже своей. */
export function canModerateRole(actorProfileOrRole, targetProfileOrRole) {
  return (
    canModerateChat(actorProfileOrRole) &&
    roleRank(actorProfileOrRole) > roleRank(targetProfileOrRole)
  );
}
