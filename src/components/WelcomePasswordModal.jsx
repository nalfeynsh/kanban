import { useState } from 'react';
import { createPortal } from 'react-dom';
import { KeyRound, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { supabase } from '../supabaseClient';

export default function WelcomePasswordModal({ isOpen, onDone }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Пароль должен быть не короче 8 символов.');
      return;
    }
    if (password !== repeat) {
      setError('Пароли не совпадают.');
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setDone(true);
    setTimeout(() => onDone?.(), 900);
  };

  return createPortal(
    <div className="modal-overlay !z-[100]">
      <form onSubmit={submit} className="modal-panel glass-panel w-full max-w-md rounded-3xl p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900 dark:text-white">
              <KeyRound size={18} className="text-indigo-500" /> Пароль для входа
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Приглашение подтверждено. Придумайте пароль, чтобы входить в сервис без письма.
            </p>
          </div>
          <button type="button" onClick={onDone} className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10" title="Закрыть">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={16} /> Пароль сохранён. Добро пожаловать!
          </div>
        ) : (
          <>
            <label className="mt-4 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Новый пароль
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="glass-input mt-1"
                placeholder="Не короче 8 символов"
              />
            </label>
            <label className="mt-3 block text-xs font-medium text-slate-600 dark:text-slate-300">
              Повторите пароль
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={repeat}
                onChange={(event) => setRepeat(event.target.value)}
                className="glass-input mt-1"
                placeholder="Ещё раз"
              />
            </label>
            {error && (
              <p className="mt-3 flex items-start gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="glass-btn glass-btn-primary mt-4 w-full !py-2.5">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {busy ? 'Сохраняем…' : 'Сохранить пароль'}
            </button>
          </>
        )}
      </form>
    </div>,
    document.body,
  );
}
