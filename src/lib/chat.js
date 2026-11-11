/**
 * Клиент внутреннего чата (1-на-1).
 * Схема и RPC — в supabase/migrations/004_chat.sql.
 */
import { supabase } from '../supabaseClient';

export const CHAT_SQL_FILE = 'supabase/migrations/004_chat.sql';

/** Похоже ли, что миграция 004 не применена */
export function isChatSchemaMissing(error) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''}`;
  return /PGRST205|42P01|does not exist|schema cache|relation .* does not exist/i.test(text);
}

export async function fetchDialogs() {
  const { data, error } = await supabase.rpc('my_dialogs');
  return { dialogs: Array.isArray(data) ? data : [], error };
}

export async function openDialog(peerId) {
  const { data, error } = await supabase.rpc('get_or_create_dialog', { p_other: peerId });
  return { conversationId: data, error };
}

export async function fetchMessages(conversationId, limit = 200) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, created_at, author_id, author:profiles!messages_author_id_fkey(id, full_name, color)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit);

  return { messages: Array.isArray(data) ? data : [], error };
}

export async function sendMessage(conversationId, body, authorId) {
  const { data, error } = await supabase
    .from('messages')
    .insert([{ conversation_id: conversationId, author_id: authorId, body }])
    .select('id, body, created_at, author_id, author:profiles!messages_author_id_fkey(id, full_name, color)')
    .single();

  return { message: data, error };
}

export async function markDialogRead(conversationId) {
  const { error } = await supabase.rpc('mark_dialog_read', { p_conversation: conversationId });
  return { error };
}

/** Подписка на новые сообщения диалога. Возвращает функцию отписки. */
export function subscribeToMessages(conversationId, onInsert) {
  const channel = supabase
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => onInsert(payload.new),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
