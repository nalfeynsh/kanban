import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, KeyRound, Loader2, Plug, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Панель интеграций: API-токены для внешних систем (доска Игоря и др.).
 * Токен показывается один раз — в базе хранится только его SHA-256.
 */
export default function IntegrationsPanel() {
  const [tokens, setTokens] = useState([]);
  const [name, setName] = useState('');
  const [created, setCreated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const loadTokens = async () => {
    const { data, error: loadError } = await supabase.rpc('list_api_tokens');
    if (loadError) {
      setError(loadError.message);
      setLoading(false);
      return;
    }
    setTokens(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    let alive = true;

    supabase.rpc('list_api_tokens').then(({ data, error: loadError }) => {
      if (!alive) return;
      if (loadError) {
        setError(loadError.message);
      } else {
        setTokens(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, []);

  const createToken = async (event) => {
    event.preventDefault();
    const clean = name.trim();
    if (clean.length < 2 || busy) return;

    setBusy(true);
    setError('');
    const { data, error: createError } = await supabase.rpc('create_api_token', { p_name: clean });
    setBusy(false);

    if (createError) {
      setError(createError.message);
      return;
    }

    setCreated(data);
    setName('');
    await loadTokens();
  };

  const revokeToken = async (token) => {
    if (!window.confirm(`Отозвать токен «${token.name}»? Все интеграции с ним перестанут работать.`)) {
      return;
    }
    setBusy(true);
    setError('');
    const { error: revokeError } = await supabase.rpc('revoke_api_token', { p_id: token.id });
    setBusy(false);
    if (revokeError) {
      setError(revokeError.message);
      return;
    }
    await loadTokens();
  };

  const copy = async (value, key) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 2000);
    } catch {
      window.prompt('Скопируйте значение:', value);
    }
  };

  const apiBase = `${window.location.origin}/api/v1`;
  const activeTokens = tokens.filter((token) => !token.revoked_at);

  return (
    <div className="scrollbar-slim min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <div className="mb-4 rounded-2xl border border-indigo-300/50 bg-indigo-500/8 p-4 dark:border-indigo-400/25 dark:bg-indigo-500/10">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <Plug size={16} className="text-indigo-500 dark:text-indigo-300" />
          API для внешних систем
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
          REST API v1 для двустороннего обмена задачами: токены, чтение изменений по курсору
          <code className="mx-1 rounded bg-white/70 px-1 py-0.5 text-[0.68rem] dark:bg-white/10">updated_at</code>
          и upsert по внешнему идентификатору. Подходит для стыковки с доской Игоря.
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.68rem] text-slate-500 dark:text-slate-400">
          Базовый адрес:
          <code className="rounded bg-white/80 px-1.5 py-0.5 text-[0.68rem] text-slate-700 dark:bg-white/10 dark:text-slate-200">
            {apiBase}
          </code>
          <button
            type="button"
            onClick={() => copy(apiBase, 'base')}
            className="rounded-md p-1 transition hover:bg-white/70 dark:hover:bg-white/10"
            title="Скопировать адрес API"
          >
            {copied === 'base' ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </p>
      </div>

      {error && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border border-rose-300/60 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:border-rose-400/30 dark:text-rose-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      {created && (
        <div className="mb-4 rounded-2xl border border-emerald-400/60 bg-emerald-500/10 p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
            <ShieldCheck size={14} /> Токен создан — скопируйте его сейчас
          </p>
          <p className="mt-1 text-[0.68rem] text-emerald-800/80 dark:text-emerald-200/80">
            После закрытия окна значение больше не показывается: в базе хранится только хеш.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-white/80 px-2 py-1.5 text-[0.7rem] text-slate-800 dark:bg-slate-950/50 dark:text-slate-100">
              {created.token}
            </code>
            <button
              type="button"
              onClick={() => copy(created.token, 'new')}
              className="glass-btn shrink-0 !px-2.5 !py-1.5 !text-[0.7rem]"
            >
              {copied === 'new' ? <Check size={13} /> : <Copy size={13} />} Копировать
            </button>
          </div>
          <p className="mt-2 text-[0.65rem] text-emerald-800/75 dark:text-emerald-200/70">
            Передайте токен Игорю по защищённому каналу — не в чат и не в репозиторий.
          </p>
        </div>
      )}

      <form onSubmit={createToken} className="mb-4 flex flex-wrap items-end gap-2">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-[0.68rem] font-medium text-slate-600 dark:text-slate-300">
            Название токена
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Например, доска Игоря"
            className="glass-input !py-2 !text-xs"
            maxLength={80}
          />
        </label>
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="glass-btn glass-btn-primary !px-3 !py-2 !text-xs"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
          Создать токен
        </button>
      </form>

      {loading ? (
        <p className="flex items-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 size={16} className="animate-spin" /> Загрузка токенов…
        </p>
      ) : activeTokens.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300/70 px-3 py-6 text-center text-xs text-slate-500 dark:border-white/15 dark:text-slate-400">
          Активных токенов нет. Создайте первый — он понадобится для API и синхронизации.
        </p>
      ) : (
        <ul className="space-y-2">
          {activeTokens.map((token) => (
            <li key={token.id} className="glass-card flex flex-wrap items-center gap-2 rounded-xl px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {token.name}
                  <span className="ml-2 font-mono text-[0.62rem] font-normal text-slate-400">
                    {token.prefix}…
                  </span>
                </p>
                <p className="mt-0.5 text-[0.62rem] text-slate-500 dark:text-slate-400">
                  Создан {formatDate(token.created_at)} · использован {formatDate(token.last_used_at)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => revokeToken(token)}
                disabled={busy}
                className="glass-btn !px-2.5 !py-1.5 !text-[0.68rem] !text-rose-600 dark:!text-rose-300"
              >
                <Trash2 size={13} /> Отозвать
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4 rounded-2xl border border-slate-300/60 bg-white/55 p-3 dark:border-white/10 dark:bg-white/5">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
          Примеры запросов и синхронизация
        </summary>
        <div className="mt-2 space-y-2 text-[0.68rem] leading-relaxed text-slate-600 dark:text-slate-300">
          <p>
            Авторизация — заголовок <code>Authorization: Bearer &lt;токен&gt;</code> или
            <code className="mx-1">X-API-Key</code>.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-slate-950/90 p-2.5 text-[0.62rem] text-slate-100">{`curl -H "Authorization: Bearer kb_..." \\
  ${apiBase}/tasks

curl -X POST -H "Authorization: Bearer kb_..." \\
  -H "Content-Type: application/json" \\
  ${apiBase}/tasks -d '{
    "external_id": "igor-123",
    "title": "Задача из доски Игоря",
    "column_title": "Готово",
    "updated_at": "2026-11-14T09:00:00Z"
  }'`}</pre>
          <p>
            Двусторонний обмен запускается скриптом <code>tools/igor-sync.mjs</code>:
            нужны адрес и токен API Игоря. Пока его API не готов, используйте контракт из
            <code className="mx-1">docs/integration-api.md</code> — по нему можно реализовать
            принимающую сторону.
          </p>
        </div>
      </details>
    </div>
  );
}
