import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Save,
  Loader2,
  Mail,
  Phone,
  Palette,
  EyeOff,
  Send,
  BadgeCheck,
  AlertTriangle,
  Copy,
  Check,
  ExternalLink,
  Camera,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { supabase, authRedirectUrl } from '../supabaseClient';
import { pickFields, supports } from '../lib/schema';
import { normalizeTelegram, telegramUrl } from '../lib/telegram';
import { formatPhone } from '../lib/phone';
import { resizeAvatarFile } from '../lib/image';
import { YANDEX_LOGIN_ENABLED } from '../lib/features';
import Avatar from './Avatar';

const EMPTY_FORM = {
  full_name: '',
  position_title: '',
  work_phone: '',
  personal_phone: '',
  work_email: '',
  personal_email: '',
  telegram: '',
  color: '#6366f1',
  show_personal_data: false,
  avatar_url: '',
};

/** Кэш-бастер для публичной ссылки: один и тот же путь, но новое фото */
const avatarVersion = () => Date.now();

function toForm(profile) {
  if (!profile) return { ...EMPTY_FORM };
  return {
    full_name: profile.full_name || '',
    position_title: profile.position_title || '',
    work_phone: formatPhone(profile.work_phone),
    personal_phone: formatPhone(profile.personal_phone),
    work_email: profile.work_email || '',
    personal_email: profile.personal_email || '',
    telegram: profile.telegram || '',
    color: profile.color || '#6366f1',
    show_personal_data: Boolean(profile.show_personal_data),
    avatar_url: profile.avatar_url || '',
  };
}

export default function ProfileModal({
  isOpen,
  onClose,
  profile,
  user,
  allowedFields,
  onUpdateProfile,
}) {
  const [formData, setFormData] = useState(() => toForm(profile));
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedMsg, setSavedMsg] = useState('');
  const [sqlCopied, setSqlCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const [identities, setIdentities] = useState([]);
  const [identitiesError, setIdentitiesError] = useState('');
  const [linkingYandex, setLinkingYandex] = useState(false);
  const avatarInputRef = useRef(null);

  const profileId = profile?.id || user?.id || null;
  const telegramSupported = supports(allowedFields, 'telegram');
  const avatarSupported = supports(allowedFields, 'avatar_url');
  const telegramPreview = telegramUrl(formData.telegram);
  const telegramSql = 'alter table public.profiles add column if not exists telegram text;';
  const avatarSql =
    'alter table public.profiles add column if not exists avatar_url text; -- + bucket avatars, см. migration 008';

  const yandexIdentity = identities.find(
    (identity) => identity.provider === 'custom:yandex' || identity.provider === 'yandex',
  );

  useEffect(() => {
    if (!YANDEX_LOGIN_ENABLED || !isOpen) return undefined;
    let alive = true;
    supabase.auth
      .getUserIdentities()
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) {
          setIdentitiesError(`Не удалось загрузить способы входа: ${error.message}`);
          return;
        }
        setIdentitiesError('');
        setIdentities(data?.identities || []);
      })
      .catch((error) => {
        if (alive) setIdentitiesError(`Не удалось загрузить способы входа: ${error.message}`);
      });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const explainIdentityError = (message) => {
    const raw = String(message || '');
    if (/manual linking/i.test(raw)) {
      return 'В Supabase выключено ручное связывание. Включите Authentication → Providers → Manual linking и повторите.';
    }
    if (/already|exists|linked/i.test(raw)) {
      return 'Яндекс уже привязан к другому аккаунту. Выйдите из него и попробуйте снова.';
    }
    return `Не удалось привязать Яндекс: ${raw}`;
  };

  const linkYandex = async () => {
    setLinkingYandex(true);
    setIdentitiesError('');
    const { error } = await supabase.auth.linkIdentity({
      provider: 'custom:yandex',
      options: { redirectTo: authRedirectUrl() },
    });
    if (error) {
      setLinkingYandex(false);
      setIdentitiesError(explainIdentityError(error.message));
    }
    // При успехе браузер уходит на Яндекс и возвращается уже с привязанным входом.
  };

  const copyTelegramSql = async () => {    try {
      await navigator.clipboard.writeText(telegramSql);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 2000);
    } catch {
      setSqlCopied(false);
    }
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !profileId) return;

    if (!file.type.startsWith('image/')) {
      setAvatarError('Нужен файл изображения: JPG, PNG или WebP.');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError('Файл больше 8 МБ — выберите картинку поменьше.');
      return;
    }

    setUploadingAvatar(true);
    setAvatarError('');
    try {
      const blob = await resizeAvatarFile(file, 256);
      const path = `${profileId}/avatar.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setField('avatar_url', `${data.publicUrl}?v=${avatarVersion()}`);
    } catch (error) {
      const message = error?.message || 'неизвестная ошибка';
      setAvatarError(
        /bucket|not found|does not exist/i.test(message)
          ? 'Хранилище для аватарок ещё не создано — примените миграцию 008.'
          : `Не удалось загрузить фото: ${message}`,
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarError('');
    setField('avatar_url', '');
    if (!profileId) return;
    try {
      await supabase.storage.from('avatars').remove([`${profileId}/avatar.jpg`]);
    } catch {
      // файла может уже не быть — ссылку всё равно убираем
    }
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const setField = (key, value) => setFormData((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!profileId) {
      setErrorMsg('Не удалось определить пользователя. Обновите страницу и войдите заново.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSavedMsg('');

    const telegramValue = normalizeTelegram(formData.telegram) || null;

    const desired = {
      id: profileId,
      full_name: formData.full_name.trim() || user?.email?.split('@')[0] || 'Сотрудник',
      position_title: formData.position_title.trim() || null,
      work_phone: formData.work_phone.trim() || null,
      personal_phone: formData.personal_phone.trim() || null,
      work_email: formData.work_email.trim() || null,
      personal_email: formData.personal_email.trim() || null,
      telegram: telegramValue,
      color: formData.color,
      show_personal_data: formData.show_personal_data,
      avatar_url: formData.avatar_url || null,
    };

    const migrationHint = telegramSupported
      ? ''
      : ' Колонки profiles.telegram ещё нет в базе — ник сохранён только в этом браузере.';

    const upsert = async (payload) =>
      supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select().maybeSingle();

    let { data, error } = await upsert(pickFields(desired, allowedFields));

    // Страховка: если новых колонок ещё нет — сохраняем базовый набор полей
    if (error && /column|schema cache|does not exist/i.test(error.message || '')) {
      const fallback = pickFields(
        desired,
        new Set([
          'id',
          'full_name',
          'color',
          'show_personal_data',
          'work_phone',
          'personal_phone',
          'work_email',
          'personal_email',
        ]),
      );
      const retry = await upsert(fallback);
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Профиль не сохранён:', error);
      const hint =
        error.code === '42501'
          ? ' Нет прав на запись профиля: примените RLS-политики из миграции.'
          : '';
      setErrorMsg(`Ошибка сохранения: ${error.message}.${hint}${migrationHint}`);
      setLoading(false);
      return;
    }

    const updated = data || { ...profile, ...pickFields(desired, allowedFields) };
    onUpdateProfile(updated, { telegram: telegramValue || '', localOnly: !telegramSupported });
    setSavedMsg(
      telegramSupported
        ? 'Профиль сохранён'
        : 'Профиль сохранён. Telegram пока хранится в этом браузере — примените миграцию для синхронизации.',
    );
    setLoading(false);
    setTimeout(() => onClose(), telegramSupported ? 500 : 1600);
  };

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal-panel glass-panel w-full max-w-xl overflow-hidden rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-300/50 px-6 py-4 dark:border-white/10">
          <div className="flex items-center gap-3">
            <Avatar
              name={formData.full_name || user?.email}
              color={formData.color}
              src={formData.avatar_url}
              shape="rounded-2xl"
              className="h-11 w-11 text-sm shadow-lg"
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Мой профиль</h2>
              <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                <Mail size={12} /> {user?.email || 'аккаунт'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-1.5 text-slate-500 transition hover:bg-white/60 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            title="Закрыть"
          >
            <X size={20} />
          </button>
        </div>

        <div className="scrollbar-slim max-h-[70vh] space-y-6 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
              <BadgeCheck size={13} /> Основное
            </h3>

            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-300/60 bg-white/70 p-3 dark:border-white/10 dark:bg-white/5">
              <Avatar
                name={formData.full_name || user?.email}
                color={formData.color}
                src={formData.avatar_url}
                shape="rounded-2xl"
                className="h-16 w-16 text-lg shadow-md"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => avatarInputRef.current?.click()}
                    disabled={uploadingAvatar || !avatarSupported}
                    className="glass-btn !px-2.5 !py-1.5 !text-[0.7rem]"
                  >
                    {uploadingAvatar ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Camera size={13} />
                    )}
                    {formData.avatar_url ? 'Заменить фото' : 'Загрузить фото'}
                  </button>
                  {formData.avatar_url && (
                    <button
                      type="button"
                      onClick={removeAvatar}
                      className="glass-btn !px-2.5 !py-1.5 !text-[0.7rem]"
                      title="Удалить фото"
                    >
                      <Trash2 size={13} /> Удалить
                    </button>
                  )}
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarFile}
                  className="hidden"
                />
                <p className="text-[0.65rem] text-slate-500 dark:text-slate-400">
                  JPG, PNG или WebP. Обрежем в квадрат и сожмём до 256×256 — как иконка в шапке.
                </p>
                {!avatarSupported && (
                  <p className="text-[0.65rem] text-amber-700 dark:text-amber-300">
                    В базе ещё нет колонки <code className="font-mono">profiles.avatar_url</code> — примените
                    миграцию <code className="font-mono">008_avatars.sql</code>. {avatarSql}
                  </p>
                )}
                {avatarError && (
                  <p className="text-[0.65rem] text-rose-600 dark:text-rose-300">{avatarError}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">ФИО</span>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(event) => setField('full_name', event.target.value)}
                  className="glass-input"
                  placeholder="Иванов Иван"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Должность</span>
                <input
                  type="text"
                  value={formData.position_title}
                  onChange={(event) => setField('position_title', event.target.value)}
                  className="glass-input"
                  placeholder="Например, дизайнер"
                  disabled={!supports(allowedFields, 'position_title')}
                />
              </label>
            </div>

            <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr]">
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Palette size={12} /> Цвет
                </span>
                <input
                  type="color"
                  value={formData.color}
                  onChange={(event) => setField('color', event.target.value)}
                  className="h-10 w-16 cursor-pointer rounded-xl border border-slate-300/50 bg-transparent p-0 dark:border-white/15"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                <input
                  type="checkbox"
                  checked={formData.show_personal_data}
                  onChange={(event) => setField('show_personal_data', event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <EyeOff size={13} /> Показывать личные контакты команде
                </span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-[0.68rem] font-semibold tracking-[0.12em] text-slate-500 uppercase dark:text-slate-400">
              <Phone size={13} /> Контакты
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Рабочий телефон</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={formData.work_phone}
                  onChange={(event) => setField('work_phone', formatPhone(event.target.value))}
                  className="glass-input"
                  placeholder="+7 (999) 123-45-67"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Личный телефон</span>
                <input
                  type="tel"
                  inputMode="tel"
                  value={formData.personal_phone}
                  onChange={(event) => setField('personal_phone', formatPhone(event.target.value))}
                  className="glass-input"
                  placeholder="+7 (999) 123-45-67"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Рабочая почта</span>
                <input
                  type="email"
                  value={formData.work_email}
                  onChange={(event) => setField('work_email', event.target.value)}
                  className="glass-input"
                  placeholder="ivanov@company.ru"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Личная почта</span>
                <input
                  type="email"
                  value={formData.personal_email}
                  onChange={(event) => setField('personal_email', event.target.value)}
                  className="glass-input"
                  placeholder="ivan@mail.ru"
                />
              </label>
            </div>

            <div>
              <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                <Send size={12} /> Telegram
              </span>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.telegram}
                  onChange={(event) => setField('telegram', event.target.value)}
                  onBlur={(event) => setField('telegram', normalizeTelegram(event.target.value))}
                  className="glass-input flex-1"
                  placeholder="@username или t.me/username"
                  autoComplete="off"
                  spellCheck={false}
                />

                <a
                  href={telegramPreview || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={!telegramPreview}
                  onClick={(event) => {
                    if (!telegramPreview) event.preventDefault();
                  }}
                  className={`glass-btn shrink-0 !px-2.5 ${
                    telegramPreview ? '' : 'pointer-events-none opacity-40'
                  }`}
                  title={telegramPreview ? 'Открыть чат в Telegram' : 'Сначала укажите ник'}
                >
                  <ExternalLink size={15} />
                  Открыть
                </a>
              </div>

              {telegramPreview ? (
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-slate-500 dark:text-slate-400">
                  Ссылка в профиле:
                  <a
                    href={telegramPreview}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-sky-700 hover:underline dark:text-sky-300"
                  >
                    t.me/{telegramPreview.replace('https://t.me/', '')}
                  </a>
                  · откроет чат с вами
                </span>
              ) : (
                <span className="mt-1.5 block text-[0.7rem] text-slate-500 dark:text-slate-400">
                  Ник покажется ссылкой в профиле сотрудника — коллега сразу откроет чат с вами.
                </span>
              )}

              {!telegramSupported && (
                <div className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-2 text-[0.68rem] text-amber-800 dark:text-amber-200">
                  <p className="flex items-start gap-1.5">
                    <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                    <span>
                      В базе ещё нет колонки <code className="font-mono">profiles.telegram</code>, поэтому ник
                      сохранится только в этом браузере. Команда увидит его после миграции.
                    </span>
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-white/50 px-1.5 py-1 font-mono text-[0.62rem] dark:bg-black/25">
                      {telegramSql}
                    </code>
                    <button
                      type="button"
                      onClick={copyTelegramSql}
                      className="glass-btn shrink-0 !px-2 !py-1 !text-[0.65rem]"
                      title="Скопировать SQL"
                    >
                      {sqlCopied ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      {sqlCopied ? 'Скопировано' : 'SQL'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {YANDEX_LOGIN_ENABLED && (
              <div className="rounded-xl border border-slate-300/60 bg-white/70 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <KeyRound size={12} /> Вход через Яндекс
                    </p>
                    <p className="mt-0.5 text-[0.7rem] leading-snug text-slate-500 dark:text-slate-400">
                      {yandexIdentity
                        ? 'Привязан — на экране входа работает кнопка «Войти через Яндекс».'
                        : 'Не привязан. Привяжите, чтобы входить в этот же аккаунт через Яндекс.'}
                    </p>
                  </div>
                  {yandexIdentity ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[0.65rem] font-medium text-emerald-700 dark:text-emerald-300">
                      <BadgeCheck size={12} /> Привязан
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={linkYandex}
                      disabled={linkingYandex}
                      className="glass-btn shrink-0 !px-2.5 !py-1.5 !text-[0.7rem]"
                    >
                      {linkingYandex ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                      Привязать
                    </button>
                  )}
                </div>
                {identitiesError && (
                  <p className="mt-1.5 text-[0.65rem] text-rose-600 dark:text-rose-300">{identitiesError}</p>
                )}
              </div>
            )}
          </section>

          {errorMsg && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {savedMsg && (
            <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {savedMsg}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-300/50 px-6 py-4 dark:border-white/10">
          <button type="button" onClick={onClose} className="glass-btn">
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="glass-btn glass-btn-primary"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {loading ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
