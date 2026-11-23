-- 046_board_realtime_delete.sql
-- Для Realtime DELETE нужен полный old record, иначе фильтр по board_id
-- не доставляет удаление объекта другим участникам доски.
alter table public.board_objects replica identity full;
