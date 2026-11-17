import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, KeyRound, Loader2, ShieldAlert } from 'lucide-react';

const VK_CLIENT_ID = import.meta.env.VITE_VK_CLIENT_ID || '54900725';

function readParams() {
  if (typeof window === 'undefined') return new URLSearchParams();
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  for (const [key, value] of hash) search.set(key, value);
  return search;
}

function base64Url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64Url(bytes).slice(0, length);
}

async function makeChallenge(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export default function VkAuthPage() {
  const params = useMemo(() => readParams(), []);
  const code = params.get('code') || '';
  const deviceId = params.get('device_id') || '';
  const state = params.get('state') || '';
  const initialError = params.get('error_description') || params.get('error') || '';
  const redirectUri =
    import.meta.env.VITE_VK_REDIRECT_URI || `${window.location.origin}/vk-auth`;

  const [accessToken, setAccessToken] = useState(params.get('access_token') || '');
  const [error, setError] = useState(initialError);
  const [starting, setStarting] = useState(false);
  const [exchanging, setExchanging] = useState(Boolean(code && !params.get('access_token')));
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!code || accessToken) return undefined;
    let alive = true;
    const verifier = sessionStorage.getItem('vk_code_verifier') || '';
    const savedState = sessionStorage.getItem('vk_oauth_state') || '';

    const fail = (message) =>
      Promise.resolve().then(() => {
        if (alive) {
          setError(message);
          setExchanging(false);
        }
      });

    if (!verifier) {
      void fail('Нет code_verifier. Начните авторизацию заново с этой страницы.');
      return () => {
        alive = false;
      };
    }
    if (savedState && state && savedState !== state) {
      void fail('VK вернул неверный state. Авторизация отменена.');
      return () => {
        alive = false;
      };
    }

    fetch('/api/vk/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        device_id: deviceId,
        code_verifier: verifier,
        state,
        redirect_uri: redirectUri,
      }),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.access_token) {
          throw new Error(payload.message || 'Не удалось обменять код на токен');
        }
        if (alive) {
          sessionStorage.removeItem('vk_code_verifier');
          sessionStorage.removeItem('vk_oauth_state');
          setAccessToken(payload.access_token);
        }
      })
      .catch((exchangeError) => {
        if (alive) setError(exchangeError?.message || 'Не удалось получить токен');
      })
      .finally(() => {
        if (alive) setExchanging(false);
      });
    return () => {
      alive = false;
    };
  }, [code, accessToken, deviceId, redirectUri, state]);

  const startOauth = async () => {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      const verifier = randomString(64);
      const challenge = await makeChallenge(verifier);
      const nextState = randomString(32);
      sessionStorage.setItem('vk_code_verifier', verifier);
      sessionStorage.setItem('vk_oauth_state', nextState);
      const url = new URL('https://id.vk.ru/authorize');
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('client_id', VK_CLIENT_ID);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', nextState);
      url.searchParams.set('code_challenge', challenge);
      url.searchParams.set('code_challenge_method', 'S256');
      url.searchParams.set('scope', 'vkid.personal_info');
      window.location.assign(url.toString());
    } catch (startError) {
      setError(startError?.message || 'Не удалось начать авторизацию VK ID.');
      setStarting(false);
    }
  };

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

        {exchanging ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-indigo-400/30 bg-indigo-400/10 p-4 text-xs text-indigo-700 dark:text-indigo-200">
            <Loader2 size={16} className="animate-spin" /> Обмениваем код VK ID на токен…
          </div>
        ) : error ? (
          <div className="mt-4 rounded-2xl border border-rose-400/40 bg-rose-500/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
              <ShieldAlert size={16} /> VK не выдал токен
            </p>
            <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-200/80">{error}</p>
            <button
              type="button"
              onClick={startOauth}
              disabled={starting}
              className="glass-btn glass-btn-primary mt-3 !px-3 !py-1.5 !text-xs"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Попробовать снова
            </button>
          </div>
        ) : accessToken ? (
          <>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-300">
              Токен получен. Скопируйте его и добавьте в Layero как{' '}
              <code className="font-mono">VK_ACCESS_TOKEN</code>.
            </p>
            <div className="mt-3 rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
              <code className="block max-h-40 overflow-y-auto break-all font-mono text-[0.68rem] text-slate-700 dark:text-slate-200">
                {accessToken}
              </code>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={copyToken}
                className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Скопировано' : 'Скопировать токен'}
              </button>
              <a href="/" className="glass-btn !px-3 !py-1.5 !text-xs">
                Вернуться в Канбан
              </a>
            </div>
            <p className="mt-3 flex items-start gap-1.5 text-[0.65rem] text-amber-700 dark:text-amber-300">
              <ShieldAlert size={12} className="mt-0.5 shrink-0" />
              Не пересылайте токен в чат и не публикуйте его.
            </p>
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-indigo-400/30 bg-indigo-400/10 p-4">
            <p className="text-xs text-slate-700 dark:text-slate-200">
              Нажмите кнопку — откроется VK ID. После разрешения VK вернёт вас сюда, и токен появится на странице.
            </p>
            <button
              type="button"
              onClick={startOauth}
              disabled={starting}
              className="glass-btn glass-btn-primary mt-3 !px-3 !py-1.5 !text-xs"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Получить токен через VK ID
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
