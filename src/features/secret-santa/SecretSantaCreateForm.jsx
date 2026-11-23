import { useState } from 'react';
import { Gift, Loader2, X } from 'lucide-react';
import { createSecretSantaGame, secretSantaError, updateSecretSantaGame } from './api';
import { CURRENCIES, fromDateTimeLocal, toDateTimeLocal } from './utils';

export default function SecretSantaCreateForm({ project, game = null, onCreated, onCancel }) {
  const [form, setForm] = useState({
    title: game?.title || '',
    description: game?.description || '',
    rules: game?.rules || '',
    budgetMin: game?.budget_min ?? '',
    budgetMax: game?.budget_max ?? '',
    currency: game?.currency || 'RUB',
    drawAt: toDateTimeLocal(game?.draw_at),
    exchangeAt: toDateTimeLocal(game?.exchange_at),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!form.title.trim()) {
      setError('Укажите название игры.');
      return;
    }
    if (form.budgetMin !== '' && form.budgetMax !== '' && Number(form.budgetMin) > Number(form.budgetMax)) {
      setError('Минимум бюджета не может быть больше максимума.');
      return;
    }
    setSaving(true);
    const payload = {
      projectId: project?.id || null,
      title: form.title,
      description: form.description,
      rules: form.rules,
      budgetMin: form.budgetMin,
      budgetMax: form.budgetMax,
      currency: form.currency,
      drawAt: fromDateTimeLocal(form.drawAt),
      exchangeAt: fromDateTimeLocal(form.exchangeAt),
    };
    const { gameId, error: saveError } = game
      ? await updateSecretSantaGame(game.id, payload)
      : await createSecretSantaGame(payload);
    setSaving(false);
    if (saveError) {
      setError(secretSantaError(saveError));
      return;
    }
    onCreated?.(game ? game.id : gameId);
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
            <Gift size={17} className="text-rose-500" /> {game ? 'Редактировать игру' : 'Новая игра'}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {project?.name || 'Для всех сотрудников сервиса'}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl p-1.5 text-slate-500 hover:bg-white/60 dark:hover:bg-white/10"
          aria-label="Отменить создание"
        >
          <X size={17} />
        </button>
      </div>

      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Название
        <input
          value={form.title}
          onChange={(event) => update('title', event.target.value)}
          className="glass-input mt-1"
          placeholder="Например, Новый год команды"
          autoFocus
          maxLength={120}
        />
      </label>

      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Описание
        <textarea
          value={form.description}
          onChange={(event) => update('description', event.target.value)}
          className="glass-input mt-1 min-h-20 resize-y"
          placeholder="Что важно знать участникам"
        />
      </label>

      <div>
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Бюджет подарка</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label className="flex flex-1 items-center gap-1.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
            от
            <input
              type="number"
              min="0"
              step="1"
              value={form.budgetMin}
              onChange={(event) => update('budgetMin', event.target.value)}
              className="glass-input min-w-0 flex-1 !py-1.5"
              placeholder="1 000"
            />
          </label>
          <label className="flex flex-1 items-center gap-1.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
            до
            <input
              type="number"
              min="0"
              step="1"
              value={form.budgetMax}
              onChange={(event) => update('budgetMax', event.target.value)}
              className="glass-input min-w-0 flex-1 !py-1.5"
              placeholder="2 000"
            />
          </label>
          <select
            value={form.currency}
            onChange={(event) => update('currency', event.target.value)}
            className="glass-input !w-auto !py-1.5"
            title="Валюта"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.value} value={currency.value}>
                {currency.label}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-1 text-[0.62rem] text-slate-500 dark:text-slate-400">
          Оба поля необязательны. Можно указать только «от» или только «до».
        </p>
        <div className="mt-1.5 space-y-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.58rem] text-slate-400">мин.</span>
            {[500, 1000, 2000, 3000].map((value) => (
              <button
                key={`min-${value}`}
                type="button"
                onClick={() => update('budgetMin', String(value))}
                className="glass-chip !px-2 !py-0.5 !text-[0.6rem]"
              >
                {value.toLocaleString('ru-RU')} ₽
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[0.58rem] text-slate-400">макс.</span>
            {[1000, 2000, 3000, 5000].map((value) => (
              <button
                key={`max-${value}`}
                type="button"
                onClick={() => update('budgetMax', String(value))}
                className="glass-chip !px-2 !py-0.5 !text-[0.6rem]"
              >
                {value.toLocaleString('ru-RU')} ₽
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          Дата жеребьёвки
          <input
            type="datetime-local"
            value={form.drawAt}
            onChange={(event) => update('drawAt', event.target.value)}
            className="glass-input mt-1"
          />
        </label>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
          Дата обмена
          <input
            type="datetime-local"
            value={form.exchangeAt}
            onChange={(event) => update('exchangeAt', event.target.value)}
            className="glass-input mt-1"
          />
        </label>
      </div>

      <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
        Правила
        <textarea
          value={form.rules}
          onChange={(event) => update('rules', event.target.value)}
          className="glass-input mt-1 min-h-16 resize-y"
          placeholder="Например: подарок должен быть в пределах бюджета, вручение на встрече"
        />
      </label>

      {error && (
        <p className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="glass-btn !px-3 !py-1.5 !text-xs">
          Отмена
        </button>
        <button
          type="submit"
          disabled={saving}
          className="glass-btn glass-btn-primary !px-3 !py-1.5 !text-xs"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
          {game ? 'Сохранить' : 'Создать игру'}
        </button>
      </div>
    </form>
  );
}
