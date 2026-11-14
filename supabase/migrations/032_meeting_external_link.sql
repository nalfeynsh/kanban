-- 032_meeting_external_link.sql
-- Позволяет привязать к встрече внешнюю комнату (SberJazz, Телемост, Толк и т.п.),
-- когда встроенный Jitsi/LiveKit недоступен. Пустое значение — встроенная комната.

alter table public.meetings
  add column if not exists external_join_url text;

comment on column public.meetings.external_join_url is
  'Необязательная ссылка на внешнюю видеокомнату; если задана, кнопка «Подключиться» ведёт туда.';
