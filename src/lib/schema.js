/**
 * Мягкая деградация под схему БД.
 *
 * Supabase-таблица может ещё не содержать новых колонок (due_at, task_no,
 * priority, telegram...). Запрос select('*') возвращает только существующие
 * поля. Поэтому набор доступных полей строится из реальной выборки:
 * пишем только то, что есть в таблице, иначе PostgREST отвечает
 * ошибкой «column does not exist».
 */

/** Колонки, которые есть в проекте изначально (по handoff / итерации 1–2) */
const TASK_REQUIRED_FIELDS = [
  'id',
  'title',
  'description',
  'date',
  'column_id',
  'position',
  'created_at',
  'created_by',
  'deleted_at',
  'is_private',
  'links',
  'files',
];

const PROFILE_REQUIRED_FIELDS = [
  'id',
  'full_name',
  'color',
  'show_personal_data',
  'work_phone',
  'personal_phone',
  'work_email',
  'personal_email',
];

/** Собирает имена полей из массива строк/объектов */
export function collectFields(rows) {
  const fields = new Set();
  if (!Array.isArray(rows)) return fields;
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    Object.keys(row).forEach((key) => fields.add(key));
  }
  return fields;
}

/** Доступные поля задачи: обязательные + реально существующие в выборке */
export function taskFields(rows = []) {
  return new Set([...TASK_REQUIRED_FIELDS, ...collectFields(rows)]);
}

export function profileFields(rows = []) {
  return new Set([...PROFILE_REQUIRED_FIELDS, ...collectFields(rows)]);
}

/** Объединяет несколько наборов полей */
export function mergeFields(...sets) {
  const merged = new Set();
  for (const set of sets) {
    if (!set) continue;
    set.forEach((field) => merged.add(field));
  }
  return merged;
}

/** Оставляет в объекте только те поля, которые реально есть в таблице */
export function pickFields(desired, allowed) {
  const out = {};
  if (!desired) return out;
  for (const [key, value] of Object.entries(desired)) {
    if (value === undefined) continue;
    if (!allowed || allowed.has(key)) out[key] = value;
  }
  return out;
}

export function supports(allowed, field) {
  return Boolean(allowed && allowed.has(field));
}

export const TASK_BASE_FIELDS = TASK_REQUIRED_FIELDS;
export const PROFILE_BASE_FIELDS = PROFILE_REQUIRED_FIELDS;
