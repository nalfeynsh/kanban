import { useMemo, useState } from 'react';
import { Check, Copy, KeyRound, ShieldAlert } from 'lucide-react';

function readHash() {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.hash.replace(/^#/, ''));
}

export default function VkAuthPage() {
  const params = useMemo(() => readHash(), []);
  const accessToken = params.get('access_token') || '';
  const error = params.get('error_description') || params.get('error') || '';
  const [copied, setCopied] = useState(false);

  const copyToken = async () => {
    if (!accessToken) return;
    try {
      await navigator.clipboard.writeText(accessToken);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="app-bg flex min-h-screen items-center justify-center px-4 py-8">
      <div className="glass-panel w-full max-w-xl rounded-3xl p-6">
        <div className="flex items-center gap-2">
          <KeyRound size={20} className="text-indigo-500 dark:text-indigo-300" />
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Получение токена VK</h1>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
              <ShieldAlert size={16} /> VK не выдал токен
            </p>
            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/80">{error}</p>
            <p className="mt-2 text-[0.68rem] text-slate-500 dark:text-slate-400">
              Проверьте, что в настройках VK-приложения добавлен redirect URI{' '}
              <code className="font-mono">https://kanban.layero.app/vk-auth</code> и приложение включено.
            </p>
          </div>
        ) : accessToken ? (
          <>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
              Токен получен. Скопируйте его и добавьте в Layero как <code className="font-mono">VK_ACCESS_TOKEN</code>.
            </p>
            <div className="mt-3 rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
              <code className="block max-h-40 overflow-y-auto break-all font-mono text-[0.68rem] text-slate-700 dark:text-slate-200">
                {accessToken}
              </code>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={copyToken} className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Скопировано' : 'Скопировать токен'}
              </button>
              <a href="/" className="glass-btn !px-3 !py-1.5 !text-xs">
                Вернуться в Канбан
              </a>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[0.65rem] text-amber-700 dark:text-amber-300">
              <ShieldAlert size={12} className="mt-0.5 shrink-0" />
              Не пересылайте токен в чат и не публикуйте его. После добавления в Layero закройте эту страницу.
            </p>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              В ссылке нет <code className="font-mono">access_token</code>. Откройте страницу авторизации VK
              и разрешите доступ приложению.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
