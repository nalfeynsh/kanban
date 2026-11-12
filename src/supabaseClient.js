import { createClient } from '@supabase/supabase-js';

/**
 * Конфигурация Supabase.
 *
 * Значения подставляются из переменных окружения (Layero / .env),
 * чтобы не держать локальные адреса в коде и не зависеть от сборки.
 * Fallback оставлен для локальной разработки и совместимости.
 *
 * В production запросы идут на свой же домен: server.js проксирует
 * /auth, /rest, /storage и /realtime в Supabase. Так браузеры из РФ
 * не зависят от доступности *.supabase.co (Cloudflare).
 * Отключить прокси можно переменной VITE_SUPABASE_DIRECT=1.
 */
const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const DIRECT_URL = 'https://theybeeteusxwxboczhe.supabase.co';

const useSameOrigin =
  import.meta.env.PROD &&
  typeof window !== 'undefined' &&
  !import.meta.env.VITE_SUPABASE_DIRECT;

const supabaseUrl = useSameOrigin ? window.location.origin : envUrl || DIRECT_URL;

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_kKouck2JRHJt04F0cMHk8g_alzlnidd';

export const SUPABASE_URL = supabaseUrl;

/**
 * Адрес callback в Supabase — его нужно указать в приложении Яндекса.
 * Всегда прямой адрес Supabase, а не прокси: callback обслуживает Supabase.
 */
export const OAUTH_CALLBACK_URL = `${envUrl || DIRECT_URL}/auth/v1/callback`;

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Адрес возврата после подтверждения почты / OAuth.
 * Строится от текущего origin, а не от захардкоженного localhost —
 * иначе на production пользователь улетает на localhost:5173.
 */
export function authRedirectUrl() {
  if (typeof window === 'undefined') return undefined;
  const { origin, pathname } = window.location;
  return `${origin}${pathname}`;
}

export const IS_CONFIGURED = Boolean(supabaseUrl && supabaseKey);
