-- 027_disable_development_column.sql
-- Убираем «В разработке» с текущей доски; задачи переносим в «В работе».
-- Идемпотентно: повторный запуск ничего не ломает.

do $$
declare
  v_dev uuid;
  v_work uuid;
begin
  select id into v_dev
  from public.columns
  where title = 'В разработке'
  order by position
  limit 1;

  if v_dev is null then
    return;
  end if;

  select id into v_work
  from public.columns
  where title = 'В работе'
  order by position
  limit 1;

  if v_work is not null then
    update public.tasks set column_id = v_work where column_id = v_dev;
  end if;

  delete from public.columns where id = v_dev;

  update public.columns
  set position = case title
    when 'Сделать' then 1
    when 'В работе' then 2
    when 'На тестировании' then 3
    when 'Готово' then 4
    else position
  end
  where title in ('Сделать', 'В работе', 'На тестировании', 'Готово');
end $$;
