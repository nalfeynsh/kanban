import { supabase } from '../../supabaseClient';

export async function getOrCreateBoard(projectId) {
  const { data, error } = await supabase.rpc('get_or_create_board', { p_project: projectId });
  return { board: Array.isArray(data) ? data[0] : data, error };
}

export async function fetchBoardData(boardId) {
  const [objects, comments, votes] = await Promise.all([
    supabase.from('board_objects').select('*').eq('board_id', boardId).order('z', { ascending: true }),
    supabase.from('board_comments').select('*').eq('board_id', boardId).order('created_at', { ascending: true }),
    supabase.from('board_votes').select('*').eq('board_id', boardId),
  ]);
  return {
    objects: objects.data ?? [],
    comments: comments.data ?? [],
    votes: votes.data ?? [],
    error: objects.error || comments.error || votes.error || null,
  };
}

export async function createBoardObject(boardId, object, userId) {
  const { data, error } = await supabase
    .from('board_objects')
    .insert({
      board_id: boardId,
      type: object.type,
      data: object.data || {},
      x: object.x,
      y: object.y,
      width: object.width,
      height: object.height,
      rotation: object.rotation || 0,
      z: object.z || Date.now() % 100000,
      created_by: userId,
    })
    .select()
    .single();
  return { object: data, error };
}

export async function updateBoardObject(objectId, patch) {
  const { data, error } = await supabase
    .from('board_objects')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', objectId)
    .select()
    .maybeSingle();
  return { object: data, error };
}

export async function deleteBoardObject(objectId) {
  const { error } = await supabase.from('board_objects').delete().eq('id', objectId);
  return { error };
}

export async function updateBoard(boardId, patch) {
  const { data, error } = await supabase
    .from('boards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', boardId)
    .select()
    .maybeSingle();
  return { board: data, error };
}

export async function uploadBoardMedia(file, userId, boardId) {
  const safeName = String(file.name || 'image').replace(/[^\w.-]+/g, '_').slice(-80);
  const path = `${userId}/${boardId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('board-media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type,
  });
  if (error) return { error };
  const { data } = supabase.storage.from('board-media').getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function addBoardComment(boardId, body, userId, point = null) {
  const { data, error } = await supabase
    .from('board_comments')
    .insert({
      board_id: boardId,
      body: body.trim(),
      created_by: userId,
      x: point?.x ?? null,
      y: point?.y ?? null,
      object_id: point?.objectId ?? null,
    })
    .select()
    .single();
  return { comment: data, error };
}

export async function resolveBoardComment(commentId, resolved) {
  const { error } = await supabase
    .from('board_comments')
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq('id', commentId);
  return { error };
}

export async function deleteBoardComment(commentId) {
  const { error } = await supabase.from('board_comments').delete().eq('id', commentId);
  return { error };
}

export async function toggleBoardVote(boardId, objectId, userId, voted) {
  if (voted) {
    const { error } = await supabase
      .from('board_votes')
      .delete()
      .eq('board_id', boardId)
      .eq('object_id', objectId)
      .eq('created_by', userId);
    return { error };
  }
  const { error } = await supabase
    .from('board_votes')
    .insert({ board_id: boardId, object_id: objectId, created_by: userId });
  return { error };
}
