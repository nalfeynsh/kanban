/**
 * Предложения по доработке сервиса.
 * Схема — supabase/migrations/010_suggestions.sql.
 */
import { supabase } from '../supabaseClient';

const FIELDS =
  'id, body, created_at, author_id, author:profiles!suggestions_author_id_fkey(id, full_name, color, avatar_url)';

/** Похоже ли, что миграция 010 не применена */
export function isSuggestionsSchemaMissing(error) {
  if (!error) return false;
  return /PGRST205|42P01|does not exist|schema cache|relation .* does not exist/i.test(
    `${error.code || ''} ${error.message || ''}`,
  );
}

export async function fetchSuggestions(limit = 200) {
  const { data, error } = await supabase
    .from('suggestions')
    .select(FIELDS)
    .order('created_at', { ascending: false })
    .limit(limit);

  return { suggestions: Array.isArray(data) ? data : [], error };
}

export async function addSuggestion(body, authorId) {
  const text = String(body || '').trim();
  if (text.length < 3) return { error: new Error('Напишите хотя бы пару слов') };

  const { data, error } = await supabase
    .from('suggestions')
    .insert([{ body: text.slice(0, 4000), author_id: authorId }])
    .select(FIELDS)
    .single();

  return { suggestion: data, error };
}

export async function deleteSuggestion(id) {
  const { error } = await supabase.from('suggestions').delete().eq('id', id);
  return { error };
}
