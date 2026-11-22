-- 037_secret_santa_rollback.sql
-- Полное удаление модуля «Тайный Санта». Применять только при отказе от модуля.

delete from public.feature_flags where key = 'secret_santa';

drop table if exists public.secret_santa_assignments cascade;
drop table if exists public.secret_santa_exclusions cascade;
drop table if exists public.secret_santa_participants cascade;
drop table if exists public.secret_santa_games cascade;

drop function if exists public.secret_santa_my_assignment(uuid);
drop function if exists public.secret_santa_draw(uuid);
drop function if exists public.secret_santa_remove_exclusion(uuid);
drop function if exists public.secret_santa_add_exclusion(uuid, uuid, uuid);
drop function if exists public.secret_santa_save_wishlist(uuid, text, text, text);
drop function if exists public.secret_santa_leave(uuid);
drop function if exists public.secret_santa_join(uuid);
drop function if exists public.secret_santa_set_status(uuid, text);
drop function if exists public.secret_santa_delete_game(uuid);
drop function if exists public.secret_santa_update_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz);
drop function if exists public.secret_santa_create_game(uuid, text, text, text, numeric, numeric, text, timestamptz, timestamptz);
drop function if exists public.secret_santa_can_manage(uuid);
drop function if exists public.secret_santa_can_view(uuid);
