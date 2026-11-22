import { supabase } from '../../supabaseClient';

const ERROR_MESSAGES = {
  secret_santa_not_authenticated: 'Нужно войти в сервис.',
  secret_santa_manager_required: 'Создавать и менять игру может только организатор проекта.',
  secret_santa_title_required: 'Укажите название игры.',
  secret_santa_budget_invalid: 'Бюджет не может быть отрицательным.',
  secret_santa_budget_range_invalid: 'Минимум бюджета не может быть больше максимума.',
  secret_santa_game_not_found: 'Игра не найдена.',
  secret_santa_project_member_required: 'Вы не являетесь участником этого проекта.',
  secret_santa_join_closed: 'Набор участников уже закрыт.',
  secret_santa_leave_after_draw: 'После жеребьёвки выйти нельзя. Попросите организатора отменить игру.',
  secret_santa_participant_required: 'Сначала вступите в игру.',
  secret_santa_exclusion_self: 'Нельзя исключить участника из пары с самим собой.',
  secret_santa_participant_not_found: 'Участник не найден в этой игре.',
  secret_santa_draw_closed: 'Жеребьёвка для этой игры уже закрыта.',
  secret_santa_min_participants: 'Для жеребьёвки нужно минимум 3 участника.',
  secret_santa_draw_impossible: 'Не удалось учесть все исключения. Ослабьте ограничения и попробуйте снова.',
  secret_santa_status_invalid: 'Недопустимый статус игры.',
};

export function secretSantaError(error) {
  if (!error) return '';
  const key = String(error.message || '').trim();
  return ERROR_MESSAGES[key] || error.details || key || 'Не удалось выполнить действие.';
}

export async function fetchSecretSantaGames(projectId) {
  if (!projectId) return { games: [], error: null };
  const { data: games, error } = await supabase
    .from('secret_santa_games')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) return { games: [], error };
  if (!games?.length) return { games: [], error: null };

  const ids = games.map((game) => game.id);
  const [{ data: participants, error: participantsError }, { data: exclusions, error: exclusionsError }] =
    await Promise.all([
      supabase.from('secret_santa_participants').select('*').in('game_id', ids),
      supabase.from('secret_santa_exclusions').select('*').in('game_id', ids),
    ]);
  if (participantsError) return { games: [], error: participantsError };
  if (exclusionsError) return { games: [], error: exclusionsError };

  const byGame = new Map(ids.map((id) => [id, { participants: [], exclusions: [] }]));
  (participants || []).forEach((participant) => byGame.get(participant.game_id)?.participants.push(participant));
  (exclusions || []).forEach((exclusion) => byGame.get(exclusion.game_id)?.exclusions.push(exclusion));

  return {
    games: games.map((game) => ({ ...game, ...byGame.get(game.id) })),
    error: null,
  };
}

export async function fetchSecretSantaGame(gameId) {
  const { data: game, error } = await supabase
    .from('secret_santa_games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();
  if (error) return { game: null, error };
  if (!game) return { game: null, error: null };

  const [{ data: participants, error: participantsError }, { data: exclusions, error: exclusionsError }] =
    await Promise.all([
      supabase.from('secret_santa_participants').select('*').eq('game_id', gameId),
      supabase.from('secret_santa_exclusions').select('*').eq('game_id', gameId),
    ]);
  if (participantsError) return { game: null, error: participantsError };
  if (exclusionsError) return { game: null, error: exclusionsError };

  let assignment = null;
  if (game.status === 'drawn') {
    const { data, error: assignmentError } = await supabase.rpc('secret_santa_my_assignment', {
      p_game_id: gameId,
    });
    if (assignmentError) return { game: null, error: assignmentError };
    assignment = Array.isArray(data) ? data[0] || null : data;
  }

  return {
    game: { ...game, participants: participants || [], exclusions: exclusions || [] },
    assignment,
    error: null,
  };
}

export async function secretSantaCanManage(projectId) {
  if (!projectId) return false;
  const { data, error } = await supabase.rpc('can_manage_project', { p_project: projectId });
  if (error) return false;
  return data === true;
}

export async function createSecretSantaGame(input) {
  const { data, error } = await supabase.rpc('secret_santa_create_game', {
    p_project_id: input.projectId,
    p_title: input.title,
    p_description: input.description || null,
    p_rules: input.rules || null,
    p_budget_min: input.budgetMin === '' || input.budgetMin == null ? null : Number(input.budgetMin),
    p_budget_max: input.budgetMax === '' || input.budgetMax == null ? null : Number(input.budgetMax),
    p_currency: input.currency || 'RUB',
    p_draw_at: input.drawAt || null,
    p_exchange_at: input.exchangeAt || null,
  });
  return { gameId: data, error };
}

export async function updateSecretSantaGame(gameId, input) {
  const { error } = await supabase.rpc('secret_santa_update_game', {
    p_game_id: gameId,
    p_title: input.title,
    p_description: input.description || null,
    p_rules: input.rules || null,
    p_budget_min: input.budgetMin === '' || input.budgetMin == null ? null : Number(input.budgetMin),
    p_budget_max: input.budgetMax === '' || input.budgetMax == null ? null : Number(input.budgetMax),
    p_currency: input.currency || 'RUB',
    p_draw_at: input.drawAt || null,
    p_exchange_at: input.exchangeAt || null,
  });
  return { error };
}

export async function deleteSecretSantaGame(gameId) {
  return supabase.rpc('secret_santa_delete_game', { p_game_id: gameId });
}

export async function setSecretSantaStatus(gameId, status) {
  return supabase.rpc('secret_santa_set_status', { p_game_id: gameId, p_status: status });
}

export async function joinSecretSantaGame(gameId) {
  return supabase.rpc('secret_santa_join', { p_game_id: gameId });
}

export async function leaveSecretSantaGame(gameId) {
  return supabase.rpc('secret_santa_leave', { p_game_id: gameId });
}

export async function saveSecretSantaWishlist(gameId, { wishlist, wishlistUrl, preferences }) {
  return supabase.rpc('secret_santa_save_wishlist', {
    p_game_id: gameId,
    p_wishlist: wishlist || null,
    p_wishlist_url: wishlistUrl || null,
    p_preferences: preferences || null,
  });
}

export async function addSecretSantaExclusion(gameId, participantA, participantB) {
  return supabase.rpc('secret_santa_add_exclusion', {
    p_game_id: gameId,
    p_participant_a: participantA,
    p_participant_b: participantB,
  });
}

export async function removeSecretSantaExclusion(exclusionId) {
  return supabase.rpc('secret_santa_remove_exclusion', { p_exclusion_id: exclusionId });
}

export async function drawSecretSanta(gameId) {
  return supabase.rpc('secret_santa_draw', { p_game_id: gameId });
}
