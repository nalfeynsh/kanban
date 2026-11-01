import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true); // Переключатель: Вход или Регистрация
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Вход через Яндекс (оставляем)
  const handleYandexLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'custom:yandex',
      options: { redirectTo: window.location.origin },
    });
    if (error) alert("Ошибка входа через Яндекс: " + error.message);
  };

  // Вход или Регистрация по Email/Паролю
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    let error;
    if (isLogin) {
      // Вход
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      error = signInError;
    } else {
      // Регистрация с обязательным подтверждением почты
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // Куда вернуть пользователя после клика по ссылке в письме
          emailRedirectTo: window.location.origin,
        },
      });
      error = signUpError;

      if (!error) {
        // Если регистрация прошла успешно (письмо отправлено)
        setSuccessMsg('Регистрация успешна! Проверьте вашу почту для подтверждения аккаунта.');
        setEmail('');
        setPassword('');
      }
    }

    if (error) {
      setErrorMsg(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-200 dark:bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg mx-auto mb-4">
            K
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Мой Канбан</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
          </p>
        </div>

        {/* Форма Email/Пароль */}
        <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
            />
          </div>

          {errorMsg && <p className="text-red-500 text-sm">{errorMsg}</p>}
          {successMsg && <p className="text-green-500 text-sm">{successMsg}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>

        {/* Переключатель Вход/Регистрация */}
        <p className="text-center text-sm text-gray-600 dark:text-gray-400 mb-6">
          {isLogin ? 'Нет аккаунта?' : 'Уже есть аккаунт?'}
          <button
            type="button"
            onClick={() => { setIsLogin(!isLogin); setErrorMsg(''); setSuccessMsg(''); }}
            className="ml-1 text-blue-600 hover:underline font-medium"
          >
            {isLogin ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>

        {/* Разделитель */}
        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white dark:bg-gray-800 text-gray-500">Или</span>
          </div>
        </div>

        {/* Кнопка Яндекса */}
        <button
          onClick={handleYandexLogin}
          className="w-full flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-xl transition-colors shadow-md"
        >
          <span className="text-xl font-bold">Я</span>
          Войти через Яндекс
        </button>
      </div>
    </div>
  );
}