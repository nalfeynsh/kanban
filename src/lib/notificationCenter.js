import { supabase } from '../supabaseClient';

export async function fetchNotifications(limit = 100) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { notifications: Array.isArray(data) ? data : [], error };
}

export async function markNotificationRead(notificationId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId);
  return { error };
}

export async function markAllNotificationsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  return { error };
}

export async function createNotification({
  userId,
  kind,
  title,
  body = '',
  entityType = null,
  entityId = null,
  conversationId = null,
  meetingId = null,
  taskId = null,
  projectId = null,
  dedupeKey,
}) {
  if (!userId || !kind || !title || !dedupeKey) return { error: null, skipped: true };
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      kind,
      title,
      body,
      entity_type: entityType,
      entity_id: entityId,
      conversation_id: conversationId,
      meeting_id: meetingId,
      task_id: taskId,
      project_id: projectId,
      dedupe_key: dedupeKey,
    })
    .select()
    .maybeSingle();

  // Повторное событие с тем же dedupe_key — не ошибка.
  if (error?.code === '23505') return { notification: null, error: null, duplicate: true };
  return { notification: data, error };
}
