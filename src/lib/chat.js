/**
 * Клиент внутреннего чата (общий и личные диалоги).
 * Схема и RPC — в supabase/migrations/004_chat.sql, файлы — 009_chat_files.sql.
 */
import { supabase } from '../supabaseClient';

export const CHAT_SQL_FILE = 'supabase/migrations/004_chat.sql';
export const CHAT_FILES_BUCKET = 'chat-files';
export const MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024;

const BASE_FIELDS =
  'id, body, created_at, author_id, author:profiles!messages_author_id_fkey(id, full_name, color)';
const FULL_FIELDS = `${BASE_FIELDS}, attachment_path, attachment_name, attachment_type, attachment_size`;

/** Похоже ли, что миграция 004 не применена */
export function isChatSchemaMissing(error) {
  if (!error) return false;
  const text = `${error.code || ''} ${error.message || ''}`;
  return /PGRST205|42P01|does not exist|schema cache|relation .* does not exist/i.test(text);
}

/** Публичная ссылка на файл чата (bucket публичный, путь неугадываемый) */
export function chatFileUrl(path) {
  if (!path) return '';
  return supabase.storage.from(CHAT_FILES_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function fetchDialogs() {
  const { data, error } = await supabase.rpc('my_dialogs');
  return { dialogs: Array.isArray(data) ? data : [], error };
}

export async function ensureTeamChat() {
  const { data, error } = await supabase.rpc('get_or_create_team_chat');
  return { conversationId: data, error };
}

/** Кому можно написать: только зарегистрированные пользователи */
export async function fetchChatCandidates() {
  const { data, error } = await supabase.rpc('chat_candidates');
  return { candidates: Array.isArray(data) ? data : [], error };
}

export async function openDialog(peerId) {
  const { data, error } = await supabase.rpc('get_or_create_dialog', { p_other: peerId });
  return { conversationId: data, error };
}

export async function fetchMessages(conversationId, limit = 200) {
  const load = (fields) =>
    supabase
      .from('messages')
      .select(fields)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);

  let { data, error } = await load(FULL_FIELDS);

  // Мягкая деградация: колонок вложения ещё нет (миграция 009 не применена)
  if (error && /attachment_|schema cache|does not exist/i.test(`${error.message || ''} ${error.details || ''}`)) {
    ({ data, error } = await load(BASE_FIELDS));
  }

  return { messages: Array.isArray(data) ? data : [], error };
}

export async function sendMessage(conversationId, body, authorId, attachment = null) {
  const payload = { conversation_id: conversationId, author_id: authorId, body };

  if (attachment?.path) {
    payload.attachment_path = attachment.path;
    payload.attachment_name = attachment.name || null;
    payload.attachment_type = attachment.type || null;
    payload.attachment_size = Number.isFinite(attachment.size) ? attachment.size : null;
  }

  const { data, error } = await supabase
    .from('messages')
    .insert([payload])
    .select(attachment?.path ? FULL_FIELDS : BASE_FIELDS)
    .single();

  return { message: data, error };
}

/** Загружает файл в Storage: <conversation>/<user>/<uuid>.<ext> */
export async function uploadChatFile({ conversationId, userId, file }) {
  if (!conversationId || !userId || !file) {
    return { error: new Error('Недостаточно данных для загрузки файла') };
  }
  if (file.size > MAX_CHAT_FILE_SIZE) {
    return { error: new Error('Файл больше 20 МБ') };
  }

  const dot = file.name.lastIndexOf('.');
  const ext = dot > 0 ? file.name.slice(dot).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12) : '';
  const path = `${conversationId}/${userId}/${crypto.randomUUID()}${ext}`;

  const { error } = await supabase.storage.from(CHAT_FILES_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    cacheControl: '3600',
  });

  return { path, error };
}

/** Удаляет сообщение и его файл (RLS разрешает только автору) */
export async function deleteChatMessage(message) {
  if (!message?.id) return { error: new Error('Сообщение не найдено') };

  if (message.attachment_path) {
    const { error: storageError } = await supabase.storage
      .from(CHAT_FILES_BUCKET)
      .remove([message.attachment_path]);
    if (storageError) return { error: storageError };
  }

  const { error } = await supabase.from('messages').delete().eq('id', message.id);
  return { error };
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
