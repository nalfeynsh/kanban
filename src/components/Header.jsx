import ThemeToggle from './ThemeToggle';
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  LogOut,
  User,
  Lock,
  Users,
  Archive,
  Layers,
  X,
  ShieldCheck,
} from 'lucide-react';

function initials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

export default function Header({
  theme,
  onToggleTheme,
  currentView,
  onViewChange,
  onLogout,
  user,
  profile,
  onProfileClick,
  filterMode,
  onFilterChange,
  onArchiveClick,
  onTeamClick,
  onAccessClick,
  canAccess = false,
  teamCount = 0,
  memberFilter,
  onClearMemberFilter,
}) {
  const displayName = profile?.full_name || user?.email || 'Профиль';

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/55">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* Логотип */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-white/80 shadow-sm ring-1 ring-white/70 dark:bg-white/10 dark:ring-white/15">
              <img src="/logo.png" alt="Логотип" className="h-9 w-9 object-contain" />
            </span>
            <span className="absolute -inset-1 -z-10 rounded-3xl bg-gradient-to-br from-indigo-500/30 to-sky-400/30 blur-md" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-bold tracking-tight">
              <span className="text-gradient">Мой Канбан</span>
            </h1>
            <p className="hidden text-[0.65rem] text-slate-500 sm:block dark:text-slate-400">
              задачи · сроки · команда
            </p>
          </div>
        </div>

        {/* Вид */}
        <div className="glass-segment ml-1 sm:ml-3">
          <button
            type="button"
            className="glass-segment-btn"
            data-active={currentView === 'board'}
            onClick={() => onViewChange('board')}
          >
            <LayoutDashboard size={15} />
            <span className="hidden sm:inline">Канбан</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={currentView === 'calendar'}
            onClick={() => onViewChange('calendar')}
          >
            <CalendarDays size={15} />
            <span className="hidden sm:inline">Календарь</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={currentView === 'gantt'}
            onClick={() => onViewChange('gantt')}
            title="Диаграмма Ганта"
          >
            <BarChart3 size={15} />
            <span className="hidden sm:inline">Гант</span>
          </button>
        </div>

        {/* Фильтр задач */}
        <div className="glass-segment">
          <button
            type="button"
            className="glass-segment-btn"
            data-active={filterMode === 'all'}
            onClick={() => onFilterChange('all')}
            title="Все доступные задачи"
          >
            <Layers size={15} />
            <span className="hidden md:inline">Все</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={filterMode === 'team'}
            onClick={() => onFilterChange('team')}
            title="Командные задачи"
          >
            <Users size={15} />
            <span className="hidden md:inline">Команда</span>
          </button>
          <button
            type="button"
            className="glass-segment-btn"
            data-active={filterMode === 'personal'}
            onClick={() => onFilterChange('personal')}
            title="Мои личные задачи"
          >
            <Lock size={15} />
            <span className="hidden md:inline">Личное</span>
          </button>
        </div>

        {memberFilter && (
          <button
            type="button"
            onClick={onClearMemberFilter}
            className="glass-chip !py-1 !text-[0.7rem] hover:border-indigo-400/60"
            title="Сбросить фильтр по сотруднику"
          >
            <span
              className="flex h-4 w-4 items-center justify-center rounded-full text-[0.5rem] font-bold text-white"
              style={{ backgroundColor: memberFilter.color || '#6366f1' }}
            >
              {initials(memberFilter.full_name)}
            </span>
            {memberFilter.full_name || 'Сотрудник'}
            <X size={11} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {canAccess && (
            <button
              type="button"
              onClick={onAccessClick}
              className="glass-btn !px-2.5 !py-1.5"
              title="Доступ: роли и приглашения"
            >
              <ShieldCheck size={17} />
              <span className="hidden lg:inline">Доступ</span>
            </button>
          )}

          <button
            type="button"
            onClick={onTeamClick}
            className="glass-btn !px-2.5 !py-1.5"
            title="Список команды"
          >
            <Users size={17} />
            <span className="hidden lg:inline">Команда</span>
            {teamCount > 0 && (
              <span className="rounded-full bg-indigo-500/15 px-1.5 py-0.5 text-[0.62rem] font-bold text-indigo-700 dark:text-indigo-300">
                {teamCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onArchiveClick}
            className="glass-btn !px-2.5 !py-1.5"
            title="Архив удалённых задач"
          >
            <Archive size={17} />
            <span className="hidden lg:inline">Архив</span>
          </button>

          <button
            type="button"
            onClick={onProfileClick}
            className="glass-btn !rounded-full !py-1 !pr-3 !pl-1"
            title="Мой профиль"
          >
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
              style={{ backgroundColor: profile?.color || '#6366f1' }}
            >
              {profile?.full_name ? initials(profile.full_name) : <User size={14} />}
            </span>
            <span className="hidden max-w-[140px] truncate text-xs sm:block">{displayName}</span>
          </button>

          <ThemeToggle theme={theme} onToggle={onToggleTheme} />

          <button
            type="button"
            onClick={onLogout}
            className="glass-btn !rounded-full !p-2 hover:!border-rose-400/60 hover:!text-rose-500"
            title="Выйти"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </header>
  );
}
