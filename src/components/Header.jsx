import ThemeToggle from './ThemeToggle';
import Avatar from './Avatar';
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

  MessageSquare,
  Bell,
  BellOff,
} from 'lucide-react';

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
  onChatClick,
  chatUnread = 0,
  notificationsEnabled = true,
  notificationsPermission = 'default',
  onToggleNotifications,
  teamCount = 0,
  memberFilter,
  onClearMemberFilter,
  onHome,
}) {
  const displayName = profile?.full_name || user?.email || 'Профиль';

  return (
    <header className="sticky top-0 z-40 border-b border-white/40 bg-white/55 backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10 dark:bg-slate-950/55">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-3 px-4 py-2.5 sm:px-6">
        {/* Логотип — всегда ведёт на главную */}
        <a
          href="/"
          onClick={(event) => {
            event.preventDefault();
            onHome?.();
          }}
          className="group -mx-1 flex items-center gap-2.5 rounded-2xl px-1 py-0.5 text-left no-underline transition hover:bg-white/40 focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:outline-none dark:hover:bg-white/10"
          title="На главную"
          aria-label="Мой Канбан — на главную"
        >
          <span className="relative flex h-10 w-10 items-center justify-center">
            <span className="absolute -inset-1 -z-10 rounded-2xl bg-gradient-to-br from-indigo-500/25 to-sky-400/25 opacity-70 blur-md transition group-hover:opacity-100" />
            <img
              src="/logo-mark.png"
              alt=""
              className="h-10 w-10 object-contain transition-transform group-hover:scale-105"
              style={theme === 'dark' ? { filter: 'brightness(1.35) saturate(1.15)' } : undefined}
            />
          </span>
          <span className="leading-tight">
            <span className="block text-base font-bold tracking-tight">
              <span className="text-gradient">Мой Канбан</span>
            </span>
            <span className="hidden text-[0.65rem] text-slate-500 sm:block dark:text-slate-400">
              задачи · сроки · команда
            </span>
          </span>
        </a>

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
            <Avatar
              name={memberFilter.full_name}
              color={memberFilter.color}
              src={memberFilter.avatar_url}
              className="h-4 w-4 text-[0.5rem]"
            />
            {memberFilter.full_name || 'Сотрудник'}
            <X size={11} />
          </button>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={onToggleNotifications}
            className={`glass-btn relative !px-2.5 !py-1.5 ${
              notificationsEnabled ? '' : 'opacity-60'
            }`}
            title={
              notificationsEnabled
                ? notificationsPermission === 'granted'
                  ? 'Уведомления включены: звук и браузерные оповещения'
                  : 'Уведомления включены (только внутри Канбана — разрешите браузерные)'
                : 'Включить уведомления'
            }
            aria-pressed={notificationsEnabled}
          >
            {notificationsEnabled ? <Bell size={17} /> : <BellOff size={17} />}
            <span className="hidden xl:inline">Уведомления</span>
          </button>

          <button
            type="button"
            onClick={onChatClick}
            className="glass-btn relative !px-2.5 !py-1.5"
            title="Внутренний чат"
          >
            <MessageSquare size={17} />
            <span className="hidden lg:inline">Чат</span>
            {chatUnread > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.55rem] font-bold text-white shadow">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </button>

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
            {profile?.full_name ? (
              <Avatar
                name={profile.full_name}
                color={profile.color}
                src={profile.avatar_url}
                className="h-7 w-7 text-[0.65rem]"
              />
            ) : (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full text-[0.65rem] font-bold text-white"
                style={{ backgroundColor: profile?.color || '#6366f1' }}
              >
                <User size={14} />
              </span>
            )}
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
