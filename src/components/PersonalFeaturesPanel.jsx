import { Check, EyeOff, SlidersHorizontal } from 'lucide-react';

const FEATURE_LABELS = {
  projects: { label: 'Проекты', hint: 'Переключатель проектов и настройки' },
  meetings: { label: 'Встречи и ВКС', hint: 'Только для администратора' },
  chat: { label: 'Чат', hint: 'Общий и личные диалоги' },
  gantt: { label: 'Диаграмма Ганта', hint: 'Планирование и ресурсы' },
  whiteboard: { label: 'Командная доска', hint: 'Холст, BPMN и фреймы' },
  calendar: { label: 'Календарь', hint: 'Задачи и встречи по дням' },
  analytics: { label: 'Аналитика', hint: 'KPI и отчёты' },
  notifications: { label: 'Уведомления', hint: 'Центр уведомлений и звук' },
  secret_santa: { label: 'Тайный Санта', hint: 'Обмен подарками для всех' },
};

export default function PersonalFeaturesPanel({
  features = {},
  personalFeatures = {},
  currentRole = 'member',
  onToggle,
}) {
  const isAdmin = currentRole === 'admin';

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-indigo-400/30 bg-indigo-500/8 px-4 py-3">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <SlidersHorizontal size={15} className="text-indigo-500" /> Мои функции
        </p>
        <p className="mt-0.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
          Отключённый раздел скрывается только у вас. Настройки сохраняются в этом браузере.
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {Object.entries(FEATURE_LABELS).map(([key, meta]) => {
          const globallyDisabled = features[key] === false;
          const vksLocked = key === 'meetings' && !isAdmin;
          const enabled = !globallyDisabled && personalFeatures[key] !== false && !vksLocked;
          return (
            <label
              key={key}
              className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
                globallyDisabled || vksLocked
                  ? 'cursor-not-allowed border-slate-300/50 bg-slate-500/5 opacity-60'
                  : 'cursor-pointer border-white/45 bg-white/35 hover:bg-white/55 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'
              }`}
            >
              <input
                type="checkbox"
                checked={enabled}
                disabled={globallyDisabled || vksLocked}
                onChange={(event) => onToggle?.(key, event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-indigo-500"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {meta.label}
                  {enabled ? <Check size={11} className="text-emerald-500" /> : <EyeOff size={11} className="text-slate-400" />}
                </span>
                <span className="block text-[0.62rem] text-slate-500 dark:text-slate-400">
                  {vksLocked ? 'ВКС в разработке — доступно только администратору' : meta.hint}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
