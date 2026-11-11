# Как применить миграции в Supabase

Коротко: **SQL Editor → New query → вставить весь файл → Run (Ctrl+Enter)**.
Кнопка **Save** только сохраняет запрос в сниппеты и **не выполняет** его.

---

## 1. Что запускать

| Файл | Когда нужен |
|---|---|
| `migrations/001_kanban_upgrade.sql` | Полный апгрейд: срок с временем, начало для Ганта, номер задачи, приоритет, исполнитель, Telegram, роли, приглашения, RLS, auth-триггер |
| `migrations/002_telegram.sql` | Только если нужен лишь Telegram (колонка `profiles.telegram`) |
| `migrations/003_invites_policies.sql` | Права на приглашения: менеджеры создают, админ отзывает |
| `migrations/004_chat.sql` | Внутренний чат: диалоги, сообщения, RLS, Realtime |
| `migrations/005_team_chat.sql` | Общий чат команды: `is_team`, `get_or_create_team_chat`, расширенный `my_dialogs` |

Если делаете полный апгрейд — **002 запускать не нужно**, колонка уже входит в 001.

---

## 2. Пошагово (полная миграция)

1. Откройте проект:
   https://supabase.com/dashboard/project/theybeeteusxwxboczhe
2. Слева **SQL Editor** (иконка `>_`).
3. Нажмите **New query** (плюс в панели запросов).
4. Откройте файл `supabase/migrations/001_kanban_upgrade.sql` в редакторе кода,
   выделите **всё** (`Ctrl+A`) и скопируйте (`Ctrl+C`).
5. Вставьте в SQL Editor.
   ⚠️ Важно вставить файл целиком, вместе с `begin;` в начале и `commit;` в конце:
   без `commit` изменения откатятся при закрытии соединения.
6. Нажмите **Run** (или `Ctrl+Enter`).
7. Дождитесь сообщения **«Success. No rows returned»** — это норма для DDL-скрипта.

`Save` нажимать не обязательно. Если нажмёте — запрос сохранится как сниппет,
но выполняться от этого не начнёт.

Скрипт обёрнут в транзакцию: если где-то ошибка, **ничего не применится**,
можно исправить причину и запустить снова. Повторный запуск безопасен (все операции
идемпотентны: `if not exists`, `create or replace`, drop/create политик).

---

## 3. Если появилась ошибка

### `must be owner of relation users` / `permission denied for table users`
SQL Editor не смог создать триггер в схеме `auth`. Варианты:

- **Проще:** закомментируйте блоки `5. GUARD-ТРИГГЕР` и `5c. ПРОФИЛЬ ПРИ РЕГИСТРАЦИИ`
  (строки с `create trigger ... on auth.users`), запустите остальное, а регистрацию
  закройте в Dashboard → Authentication → Sign In / Providers → **Disable signup**.
- Либо создайте триггер через **Auth Hook**: Dashboard → Authentication → Hooks.

Проверить, какие триггеры уже висят на `auth.users`:

```sql
select t.tgname, p.proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;
```

### `duplicate key value violates unique constraint "tasks_task_no_key"`
В таблице уже есть повторяющиеся `task_no`. Сбросьте их и запустите миграцию снова:

```sql
update public.tasks set task_no = null;
```

### `violates check constraint "profiles_role_check"`
В `profiles.role` лежит значение вне списка (`admin/manager/deputy/member`):

```sql
select distinct role from public.profiles;
update public.profiles set role = 'member'
where role is null or role not in ('admin', 'manager', 'deputy', 'member');
```

### `column ... does not exist`
Скорее всего вставлен не тот файл или запускается `002` вместо `001`.
Проверьте, что в начале запроса есть `alter table public.tasks add column if not exists due_at ...`.

---

### После Яндекса возвращает на прод вместо localhost
Значит `redirect_to` не прошёл проверку белого списка, и Supabase отправил
пользователя на **Site URL** (`https://kanban.layero.app/`). Это не ошибка кода:
`authRedirectUrl()` берёт текущий origin, но Supabase сверяет его со списком.

Dashboard → **Authentication → URL Configuration → Redirect URLs** добавьте
**оба** варианта (и такой же для `127.0.0.1`, если открываете по нему):

```
http://localhost:5173/
http://localhost:5173/**
http://127.0.0.1:5173/**
```

`/**` покрывает вложенные пути (`/auth/callback`), но не всегда совпадает с
голым `/` — поэтому нужны обе строки. Порт должен совпадать с тем, на котором
запущен `npm run dev` (по умолчанию `5173`). Site URL при этом остаётся прод-адресом.

Проверить, что происходит на самом деле: Dashboard → **Logs → Auth** — там видно
`redirect_to`, с которым пришёл запрос, и итоговый адрес возврата.

---

## 4. Как проверить, что применилось

Выполните в SQL Editor по очереди:

```sql
-- 1. Новые колонки задач
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'tasks'
  and column_name in ('due_at','start_at','task_no','priority','assignee_id','deleted_by')
order by column_name;
-- ожидаем 6 строк
```

```sql
-- 2. Telegram и роль в профилях
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'profiles'
  and column_name in ('telegram','role','is_active','position_title');
-- ожидаем 4 строки
```

```sql
-- 3. Приглашения и функции
select to_regclass('public.invites') as invites_table;
select proname from pg_proc
where proname in ('is_admin','current_role','handle_new_user','verify_invite','protect_profile_role')
order by proname;
-- ожидаем invites_table != null и 5 функций
```

```sql
-- 4. Триггеры на auth.users
select t.tgname from pg_trigger t
where t.tgrelid = 'auth.users'::regclass and not t.tgisinternal;
-- ожидаем guard_signup, on_auth_user_created, zz_consume_invite
```

```sql
-- 5. Номера и сроки заполнились
select count(*) filter (where task_no is null) as без_номера,
       count(*) filter (where due_at is null) as без_срока,
       count(*) as всего
from public.tasks;
```

---

## 5. Сразу после миграции

### 5.1. Выдать себе роль администратора

```sql
select id, full_name, role from public.profiles order by created_at;
```

```sql
update public.profiles set role = 'admin' where id = '<ваш-uuid>';
```

### 5.2. Создать приглашение (обязательно, если включён guard-триггер)

После миграции **новая регистрация без приглашения невозможна**.
Приглашение на свою почту — чтобы не потерять доступ:

```sql
insert into public.invites (email, role, note)
values ('you@example.com', 'admin', 'bootstrap')
on conflict do nothing;
```

Приглашение сотрудника (можно с кодом):

```sql
insert into public.invites (email, role, code, note)
values ('ivan@example.com', 'member', 'KANBAN-2026', 'Отдел разработки');
```

### 5.3. Настроить URL для входа через Яндекс

Dashboard → **Authentication → URL Configuration**:

- **Site URL:** `https://kanban.layero.app/`
- **Redirect URLs:**
  - `https://kanban.layero.app/`
  - `http://localhost:5173/**`

В приложении Яндекс OAuth **Redirect URI** должен быть ровно:

```
https://theybeeteusxwxboczhe.supabase.co/auth/v1/callback
```

### 5.4. Обновить приложение

После миграции сделайте жёсткую перезагрузку страницы (`Ctrl+Shift+R`),
чтобы клиент заново прочитал схему (`select('*')`).

---

## 6. Что изменится в поведении

- **Анонимный доступ к задачам закроется.** Сейчас публичный ключ читает даже
  `is_private = true` — после миграции RLS это запрещает. Приложение работает
  только с авторизованной сессией, поэтому для входа это не помешает.
- **Личные задачи** видны только автору — и на доске, и в архиве.
- **Добавление профиля при регистрации** переходит на безопасный
  `handle_new_user()`: ошибка `Database error saving new user` уходит.
- **Новый пользователь без приглашения** получает отказ на этапе `signUp`.

---

## 7. Как откатить отдельные части

```sql
-- снова открыть регистрацию без приглашений
drop trigger if exists guard_signup on auth.users;

-- вернуть возможность регистрации и не проверять приглашение при signUp
drop function if exists public.verify_invite(text, text);
```

Полный откат схемы не предусмотрен: скрипт только добавляет колонки и пересоздаёт
политики; данные задач/профилей не удаляются.

---

## 8. Частые вопросы

**Нужно ли `Save`?** Нет. `Run` выполняет, `Save` сохраняет текст запроса.

**Можно запускать двумя частями?** Лучше целиком: транзакция гарантирует, что
не будет «половины» схемы. Если очень нужно — сохраните `begin;` … `commit;`
в каждом запуске.

**Сколько это займёт?** На вашем объёме данных — секунды.

**Где посмотреть ошибки выполнения?** Над результатом запроса, в панели
«Results»; там будет текст ошибки и номер строки.
