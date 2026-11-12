import { useEffect, useState } from 'react';
import {
  Lock,
  Mail,
  KeyRound,
  Loader2,
  ShieldCheck,
  Users,
  CalendarClock,
  Layers,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Send,
  Copy,
  Check,
  Stethoscope,
} from 'lucide-react';
import { supabase, authRedirectUrl, OAUTH_CALLBACK_URL } from '../supabaseClient';
import {
  readOAuthError,
  cleanOAuthUrl,
  explainOAuthError,
  SAFE_PROFILE_TRIGGER_SQL,
} from '../lib/oauth';

const FEATURES = [
  { icon: Layers, title: 'Канбан и календарь', text: 'Задачи по колонкам, сроки и дедлайны в одном окне.' },
  { icon: Users, title: 'Команда', text: 'Профили сотрудников, роли и быстрый контакт в Telegram.' },
  { icon: CalendarClock, title: 'Сроки и приоритеты', text: 'Срок с точным временем, рейтинг задач и нумерация.' },
];

function translateError(message) {
  const raw = String(message || '');
  if (/Database error saving new user/i.test(raw)) {
    return 'Почта Яндекса не подошла: её нет в приглашениях или она уже занята аккаунтом с паролем. Войдите по почте и паролю, а Яндекс привяжите в профиле — раздел «Вход через Яндекс».';
  }
  if (/Invalid login credentials/i.test(raw)) return 'Неверная почта или пароль.';
  if (/Email not confirmed/i.test(raw)) return 'Почта не подтверждена — проверьте письмо со ссылкой.';
  if (/User already registered/i.test(raw)) return 'Пользователь с такой почтой уже зарегистрирован.';
  if (/Password should be at least/i.test(raw)) return 'Пароль слишком короткий (минимум 6 символов).';
  if (/rate limit|too many/i.test(raw)) return 'Слишком много попыток. Попробуйте через минуту.';
  return raw;
}

export default function LoginPage() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [oauthError, setOauthError] = useState(() => readOAuthError());
  const [errorMsg, setErrorMsg] = useState(() => {
    const info = explainOAuthError(readOAuthError());
    return info ? `${info.title}. ${info.text}` : '';
  });
  const [successMsg, setSuccessMsg] = useState('');
  const [showDiag, setShowDiag] = useState(() => Boolean(readOAuthError()));
  const [copied, setCopied] = useState('');

  const oauthInfo = explainOAuthError(oauthError);
  const isLogin = mode === 'login';

  // Ошибку из URL показали — чистим адрес, чтобы не висела после F5
  useEffect(() => {
    if (readOAuthError()) cleanOAuthUrl();
  }, []);

  const copy = async (kind, value) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };

  const switchMode = () => {
    setMode(isLogin ? 'register' : 'login');
    setErrorMsg('');
    setSuccessMsg('');
  };

  const handleYandexLogin = async () => {
    setErrorMsg('');
    setOauthError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:yandex',
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) setErrorMsg(`Ошибка входа через Яндекс: ${error.message}`);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!isLogin) {
      if (password.length < 8) {
        setErrorMsg('Пароль должен быть не короче 8 символов.');
        return;
      }
      if (password !== passwordRepeat) {
        setErrorMsg('Пароли не совпадают.');
        return;
      }
    }

    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setErrorMsg(translateError(error.message));
      } else {
        // 1. Проверяем приглашение (RPC из миграции 001)
        const { data: allowed, error: inviteError } = await supabase.rpc('verify_invite', {
          p_email: email,
          p_code: inviteCode.trim() || null,
        });

        if (inviteError) {
          const missing = /function|schema cache|does not exist/i.test(inviteError.message || '');
          setErrorMsg(
            missing
              ? 'Регистрация закрыта: администратор ещё не настроил приглашения (выполните SQL-миграцию 001).'
              : `Не удалось проверить приглашение: ${inviteError.message}`,
          );
          setLoading(false);
          return;
        }

        if (!allowed) {
          setErrorMsg(
            'Доступ только по приглашению: этой почты нет в списке, либо код неверный, либо приглашение уже использовано.',
          );
          setLoading(false);
          return;
        }

        // 2. Регистрируем (триггер guard_signup проверит приглашение ещё раз на сервере)
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: authRedirectUrl() },
        });

        if (error) {
          setErrorMsg(translateError(error.message));
        } else {
          setSuccessMsg('Готово! Проверьте почту и подтвердите аккаунт — после этого можно войти.');
          setPassword('');
          setPasswordRepeat('');
        }
      }
    } catch (unexpected) {
      setErrorMsg(translateError(unexpected?.message || 'Неизвестная ошибка'));
    }

    setLoading(false);
  };

  return (
    <div className="app-bg flex min-h-screen items-center justify-center p-4">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Презентационная часть */}
        <div className="hidden flex-col justify-between rounded-3xl p-2 lg:flex">
          <div>
            <div className="mb-6 flex items-center gap-3">
              <img src="/logo-mark.png" alt="Логотип" className="h-11 w-11 object-contain" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">
                  <span className="text-gradient">Мой Канбан</span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">задачи · сроки · команда</p>
              </div>
            </div>

            <h2 className="mb-2 text-3xl leading-tight font-bold text-slate-900 dark:text-white">
              Порядок в задачах,
              <br />
              прозрачность в команде
            </h2>
            <p className="mb-8 max-w-md text-sm text-slate-600 dark:text-slate-300">
              Канбан-доска, календарь сроков, архив удалённых задач и профили сотрудников
              с быстрым переходом в Telegram.
            </p>

            <ul className="space-y-3">
              {FEATURES.map(({ icon: Icon, title, text }) => (
                <li key={title} className="glass-card flex items-start gap-3 rounded-2xl p-3.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">
                    <Icon size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-8 flex items-center gap-2 text-[0.7rem] text-slate-500 dark:text-slate-400">
            <ShieldCheck size={13} /> Доступ только по приглашению администратора
          </p>
        </div>

        {/* Форма */}
        <div className="glass-panel rounded-3xl p-6 sm:p-8">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-sky-400 text-xl font-bold text-white shadow-lg lg:hidden">
              K
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {isLogin ? 'Вход в аккаунт' : 'Регистрация'}
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {isLogin
                ? 'Введите почту и пароль, чтобы открыть доску'
                : 'Нужно приглашение от администратора команды'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <label className="block">
              <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Mail size={12} /> Почта
              </span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="glass-input"
                placeholder="you@example.com"
              />
            </label>

            <div className="block">
              <label
                htmlFor="login-password"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
              >
                <Lock size={12} /> Пароль
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={isLogin ? 6 : 8}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="glass-input !pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-200"
                  title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-label={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {!isLogin && (
              <>
                <div className="block">
                  <label
                    htmlFor="login-password-repeat"
                    className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                  >
                    <Lock size={12} /> Повторите пароль
                  </label>
                  <input
                    id="login-password-repeat"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={passwordRepeat}
                    onChange={(event) => setPasswordRepeat(event.target.value)}
                    className="glass-input"
                    placeholder="••••••••"
                  />
                </div>

                <label className="block">
                  <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <KeyRound size={12} /> Код приглашения
                  </span>
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    className="glass-input"
                    placeholder="Если администратор выдал код"
                  />
                  <span className="mt-1 block text-[0.68rem] text-slate-500 dark:text-slate-400">
                    Регистрация возможна только для почты из списка приглашённых.
                  </span>
                </label>
              </>
            )}

            {errorMsg && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[0.72rem] text-rose-700 dark:text-rose-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="flex items-start gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-[0.72rem] text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <button type="submit" disabled={loading} className="glass-btn glass-btn-primary w-full !py-2.5">
              {loading ? <Loader2 size={16} className="animate-spin" /> : null}
              {loading ? 'Подождите…' : isLogin ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-slate-600 dark:text-slate-400">
            {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
            <button
              type="button"
              onClick={switchMode}
              className="ml-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-300"
            >
              {isLogin ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </p>

          <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/45 dark:border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white/60 px-2 text-[0.68rem] text-slate-500 backdrop-blur dark:bg-slate-900/60 dark:text-slate-400">
                или
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleYandexLogin}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-rose-400/40 bg-rose-500/12 py-2.5 font-medium text-rose-700 transition hover:bg-rose-500/20 dark:text-rose-300"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-rose-500 text-[0.7rem] font-bold text-white">
              Я
            </span>
            Войти через Яндекс
          </button>

          <button
            type="button"
            onClick={() => setShowDiag((prev) => !prev)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 text-[0.68rem] text-slate-500 underline-offset-2 hover:text-indigo-600 hover:underline dark:text-slate-400 dark:hover:text-indigo-300"
          >
            <Stethoscope size={12} />
            {showDiag ? 'Скрыть диагностику Яндекс-входа' : 'Не работает вход через Яндекс?'}
          </button>

          {showDiag && (
            <div className="mt-2 space-y-2.5 rounded-xl border border-white/50 bg-white/40 p-3 text-[0.68rem] text-slate-600 backdrop-blur dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              {oauthInfo && (
                <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-rose-700 dark:text-rose-300">
                  <p className="mb-0.5 font-semibold">{oauthInfo.title}</p>
                  <p>{oauthInfo.text}</p>
                </div>
              )}

              <div>
                <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">
                  1. Redirect URI в приложении Яндекс OAuth
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-white/60 px-1.5 py-1 font-mono text-[0.62rem] dark:bg-black/25">
                    {OAUTH_CALLBACK_URL}
                  </code>
                  <button
                    type="button"
                    onClick={() => copy('callback', OAUTH_CALLBACK_URL)}
                    className="glass-btn shrink-0 !px-2 !py-1 !text-[0.62rem]"
                  >
                    {copied === 'callback' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">
                  2. Supabase → Authentication → URL Configuration
                </p>
                <p>
                  Site URL и Redirect URLs должны содержать{' '}
                  <code className="font-mono">{typeof window !== 'undefined' ? window.location.origin : ''}</code>
                </p>
              </div>

              <div>
                <p className="mb-1 font-semibold text-slate-700 dark:text-slate-200">
                  3. Ошибка «Database error saving new user»
                </p>
                <p className="mb-1">
                  Значит сломался auth-триггер создания профиля. Замените его безопасной версией:
                </p>
                <div className="flex items-center gap-1.5">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-white/60 px-1.5 py-1 font-mono text-[0.62rem] dark:bg-black/25">
                    create trigger on_auth_user_created → handle_new_user()
                  </code>
                  <button
                    type="button"
                    onClick={() => copy('sql', SAFE_PROFILE_TRIGGER_SQL)}
                    className="glass-btn shrink-0 !px-2 !py-1 !text-[0.62rem]"
                  >
                    {copied === 'sql' ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />}
                    SQL
                  </button>
                </div>
              </div>

              <button type="button" onClick={handleYandexLogin} className="glass-btn w-full !py-1.5 !text-[0.68rem]">
                <Send size={12} /> Повторить вход через Яндекс
              </button>
            </div>
          )}

          <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[0.65rem] text-slate-500 dark:text-slate-400">
            <Send size={11} /> Вход через Яндекс также требует приглашения
          </p>
        </div>
      </div>
    </div>
  );
}
