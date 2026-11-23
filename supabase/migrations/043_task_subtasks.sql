-- 043_task_subtasks.sql
-- Полноценные подзадачи: обычная задача со ссылкой на родителя.
alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete set null;

create index if not exists tasks_parent_idx
  on public.tasks (parent_task_id, position);
