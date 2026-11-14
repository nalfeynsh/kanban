-- 026_workflow_columns.sql
-- Производственный процесс: Сделать → В работе → В разработке → На тестировании → Готово.
-- Идемпотентно: недостающие колонки добавляются, позиции выравниваются.

insert into public.columns (title, position)
select 'В разработке', 3
where not exists (select 1 from public.columns where title = 'В разработке');

insert into public.columns (title, position)
select 'На тестировании', 4
where not exists (select 1 from public.columns where title = 'На тестировании');

update public.columns
set position = case title
  when 'Сделать' then 1
  when 'В работе' then 2
  when 'В разработке' then 3
  when 'На тестировании' then 4
  when 'Готово' then 5
  else position
end
where title in ('Сделать', 'В работе', 'В разработке', 'На тестировании', 'Готово');
