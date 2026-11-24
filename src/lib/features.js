import { supabase } from '../supabaseClient';

/**
 * Временный флаг Яндекс-входа. Не путать с функциональными флагами модулей.
 * Яндекс-вход скрыт: Supabase падает на создании identity (AGENTS.md, §8 п.12).
 */
export const YANDEX_LOGIN_ENABLED = false;

export const FEATURE_KEYS = [
  'projects',
  'meetings',
  'chat',
  'gantt',
  'whiteboard',
  'calendar',
  'analytics',
  'notifications',
  'secret_santa',
];

export const DEFAULT_FEATURES = {
  ...Object.fromEntries(FEATURE_KEYS.map((key) => [key, true])),
  // Модуль появляется только после применения миграции 037 и включения флага.
  secret_santa: false,
};

export function rowsToFeatures(rows) {
  const next = { ...DEFAULT_FEATURES };
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (row?.key) next[row.key] = row.enabled !== false;
  });
  return next;
}

const PERSONAL_PREFIX = 'kanban.personalFeatures';

export function readPersonalFeatures(userId) {
  if (!userId) return {};
  try {
    const raw = localStorage.getItem(`${PERSONAL_PREFIX}.${userId}`);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writePersonalFeature(userId, key, enabled) {
  if (!userId || !FEATURE_KEYS.includes(key)) return;
  try {
    const current = readPersonalFeatures(userId);
    const next = { ...current, [key]: Boolean(enabled) };
    localStorage.setItem(`${PERSONAL_PREFIX}.${userId}`, JSON.stringify(next));
  } catch {
    // localStorage может быть недоступен — работаем без сохранения.
  }
}

export async function fetchFeatureFlags() {
  const { data, error } = await supabase
    .from('feature_flags')
    .select('*')
    .order('sort_order', { ascending: true });
  return { rows: Array.isArray(data) ? data : [], error };
}

export async function setFeatureFlag(key, enabled) {
  const { data, error } = await supabase.rpc('set_feature_flag', {
    p_key: key,
    p_enabled: enabled,
  });
  return { flag: data, error };
}
