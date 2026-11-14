import { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, ToggleLeft } from 'lucide-react';
import { fetchFeatureFlags, setFeatureFlag } from '../lib/features';

const PLAN_LABELS = {
  free: 'Базовый',
  team: 'Команда',
  business: 'Бизнес',
};

export default function FeatureFlagsPanel({ onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    fetchFeatureFlags().then(({ rows: data, error: loadError }) => {
      if (!alive) return;
      if (loadError) setError(loadError.message);
      else setRows(data);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = async (row) => {
    setBusyKey(row.key);
    setError('');
    const next = !row.enabled;
    const { error: updateError } = await setFeatureFlag(row.key, next);
    setBusyKey('');
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setRows((prev) =>
      prev.map((item) => (item.key === row.key ? { ...item, enabled: next } : item)),
    );
    onChanged?.(row.key, next);
  };

  return (
    <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mb-3 flex items-start gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-400/10 px-3 py-2.5">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-indigo-600 dark:text-indigo-300" />
        <div>
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
            Функциональные флаги
          </p>
          <p className="mt-0.5 text-[0.65rem] leading-relaxed text-slate-600 dark:text-slate-400">
            Выключенный модуль скрывается из интерфейса. Данные и задачи не удаляются — при
            включении всё вернётся. Менять флаги может только администратор.
          </p>
        </div>
      </div>

      {error && (
        <p className="mb-3 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[0.68rem] text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 size={18} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div
              key={row.key}
              className="flex items-center gap-3 rounded-2xl border border-slate-300/60 bg-white/45 px-3 py-2.5 dark:border-white/10 dark:bg-white/5"
            >
              <ToggleLeft
                size={18}
                className={row.enabled ? 'text-indigo-500' : 'text-slate-400'}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {row.name}
                  <span className="rounded-full bg-slate-400/15 px-1.5 py-0.5 text-[0.55rem] font-medium text-slate-500 dark:text-slate-400">
                    {PLAN_LABELS[row.min_plan] || row.min_plan}
                  </span>
                </p>
                <p className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
                  {row.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                aria-label={`${row.name}: ${row.enabled ? 'включено' : 'выключено'}`}
                onClick={() => toggle(row)}
                disabled={Boolean(busyKey)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                  row.enabled ? 'bg-indigo-500' : 'bg-slate-300 dark:bg-slate-600'
                } disabled:opacity-60`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                    row.enabled ? 'left-[1.35rem]' : 'left-0.5'
                  }`}
                />
                {busyKey === row.key && (
                  <Loader2
                    size={11}
                    className="absolute inset-0 m-auto animate-spin text-white"
                  />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[0.62rem] text-slate-500 dark:text-slate-400">
        Следующий этап — серверные проверки для API встреч, чата и аналитики, а также привязка
        флагов к тарифам.
      </p>
    </div>
  );
}
