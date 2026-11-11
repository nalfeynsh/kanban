/**
 * Разбор ошибок OAuth после возврата с провайдера.
 *
 * Supabase возвращает их в URL: `?error=...&error_code=...&error_description=...`
 * (или в hash для implicit-режима). Без этого пользователь видит
 * «ничего не произошло» — именно так выглядит сломанный вход через Яндекс.
 */

const KNOWN_ERRORS = {
  access_denied: 'Вход отменён на стороне Яндекса. Попробуйте снова.',
  bad_oauth_state:
    'Сессия входа устарела (OAuth state не совпал). Закройте вкладку, откройте сайт заново и повторите вход.',
  bad_oauth_callback:
    'Провайдер вернул некорректный ответ. Проверьте Redirect URL в настройках Supabase и приложения Яндекса.',
  bad_code_verifier:
    'Браузер потерял PKCE-проверку. Войдите заново в том же окне (без блокировщиков и приватного режима).',
  invalid_request: 'Некорректный запрос авторизации.',
  server_error: 'Ошибка на стороне сервера авторизации.',
  email_provider_disabled: 'Вход по почте отключён в настройках проекта.',
  signup_disabled: 'Регистрация в проекте отключена.',
};

/** Читает ошибку авторизации из текущего URL */
export function readOAuthError() {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash?.startsWith('#') ? window.location.hash.slice(1) : '';
  const search = window.location.search?.startsWith('?') ? window.location.search.slice(1) : '';
  const raw = hash || search;
  if (!raw) return null;

  const params = new URLSearchParams(raw);
  const code = params.get('error_code') || params.get('error');
  const description = params.get('error_description') || params.get('error_description');

  if (!code && !description) return null;

  return {
    code: code || '',
    description: (description || '').replace(/\+/g, ' '),
  };
}

/** Убирает error-параметры из адресной строки, чтобы не висели после перезагрузки */
export function cleanOAuthUrl() {
  if (typeof window === 'undefined') return;
  const { origin, pathname } = window.location;
  window.history.replaceState({}, document.title, `${origin}${pathname}`);
}

/** Понятный текст + подсказка, что проверить */
export function explainOAuthError(error) {
  if (!error) return null;
  const description = error.description || '';
  const code = error.code || '';

  if (/Database error saving new user/i.test(description)) {
    return {
      title: 'База отклонила создание пользователя',
      text:
        'Auth-триггер не смог создать строку в profiles (обычно из-за RLS, NOT NULL или отсутствующей колонки). ' +
        'Частая причина — самописный триггер on_auth_user_created. Ниже — SQL, который заменяет его безопасной версией.',
      kind: 'database',
    };
  }

  if (/redirect/i.test(description) || /redirect/i.test(code)) {
    return {
      title: 'Redirect URL не разрешён',
      text:
        'Адрес возврата должен быть в Supabase → Authentication → URL Configuration (Site URL и Redirect URLs) ' +
        'и совпадать с текущим доменом сайта.',
      kind: 'redirect',
    };
  }

  if (/email/i.test(description) && /(missing|not provided|required)/i.test(description)) {
    return {
      title: 'Яндекс не вернул почту',
      text:
        'В провайдере custom:yandex включите «Allow users without email» либо выдайте приложению доступ к e-mail в Яндекс OAuth.',
      kind: 'email',
    };
  }

  if (KNOWN_ERRORS[code]) {
    return { title: 'Вход не завершён', text: KNOWN_ERRORS[code], kind: 'known' };
  }

  return {
    title: 'Вход не завершён',
    text: description || 'Провайдер вернул ошибку без описания.',
    kind: 'unknown',
  };
}

/** SQL: безопасный триггер создания профиля (лечит «Database error saving new user») */
export const SAFE_PROFILE_TRIGGER_SQL = `create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      split_part(coalesce(new.email, ''), '@', 1),
      'Сотрудник'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();`;
