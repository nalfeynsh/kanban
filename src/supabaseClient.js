import { createClient } from '@supabase/supabase-js';

/**
 * Конфигурация Supabase.
 *
 * Значения подставляются из переменных окружения (Layero / .env),
 * чтобы не держать локальные адреса в коде и не зависеть от сборки.
 * Fallback оставлен для локальной разработки и совместимости.
 */
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://theybeeteusxwxboczhe.supabase.co';

const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_kKouck2JRHJt04F0cMHk8g_alzlnidd';

export const SUPABASE_URL = supabaseUrl;

/** Адрес callback в Supabase — его нужно указать в приложении Яндекса */
export const OAUTH_CALLBACK_URL = `${supabaseUrl}/auth/v1/callback`;

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
