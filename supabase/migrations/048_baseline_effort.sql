-- 048_baseline_effort.sql
-- Плановая трудоёмкость в снимке базового плана для отчёта «План/факт».
alter table public.gantt_baseline_tasks
  add column if not exists effort_hours numeric(8,2);
