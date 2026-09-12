-- ============================================================================
-- VoiceStage — схема базы данных (Этап 2)
-- Выполнять в Supabase → SQL Editor. Можно запускать повторно (idempotent-ish).
--
-- Принципы:
--  * Мультиарендность: у каждой строки есть studio_id (одна студия сейчас,
--    задел под много студий в будущем).
--  * Безопасность через RLS: педагог видит данные только своей студии,
--    свои занятия; директор — всё в своей студии.
--  * Доступ только для вошедших пользователей (роль authenticated). Анонимам
--    (anon) не открыто ничего.
-- ============================================================================

-- Всё в схеме public.
create extension if not exists pgcrypto;  -- для gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Справочные функции (SECURITY DEFINER, чтобы не упереться в рекурсию RLS)
-- ---------------------------------------------------------------------------

-- studio_id текущего пользователя
create or replace function public.current_studio_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select studio_id from public.profiles where id = auth.uid();
$$;

-- является ли текущий пользователь директором
create or replace function public.is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'director'
  );
$$;

-- ---------------------------------------------------------------------------
-- Таблицы
-- ---------------------------------------------------------------------------

-- Студия (арендатор)
create table if not exists public.studios (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Профили пользователей: педагоги и директор. 1:1 с auth.users.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  full_name   text not null,
  role        text not null default 'teacher' check (role in ('teacher','director')),
  color       text,                       -- цвет в календаре
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_studio_idx on public.profiles(studio_id);

-- Кабинеты
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists rooms_studio_idx on public.rooms(studio_id);

-- Ученики (дети)
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references public.studios(id) on delete cascade,
  full_name      text not null,
  birth_date     date,
  parent_contact text,
  notes          text,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists students_studio_idx on public.students(studio_id);

-- Группы (для групповых занятий)
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists groups_studio_idx on public.groups(studio_id);

-- Состав групп (многие-ко-многим ученик ↔ группа)
create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  primary key (group_id, student_id)
);
create index if not exists group_members_student_idx on public.group_members(student_id);

-- Шаблон повторяющегося занятия («каждый вторник 15:00»)
create table if not exists public.lesson_series (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  type          text not null check (type in ('individual','group')),
  student_id    uuid references public.students(id) on delete cascade,  -- для индивидуальных
  group_id      uuid references public.groups(id) on delete cascade,    -- для групповых
  weekday       int  not null check (weekday between 0 and 6),           -- 0=Пн … 6=Вс
  start_time    time not null,
  duration_min  int  not null default 45 check (duration_min > 0),
  start_date    date not null,
  end_date      date,                                                    -- null = бессрочно
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  -- у индивидуального занятия должен быть ученик, у группового — группа
  constraint series_target_ck check (
    (type = 'individual' and student_id is not null and group_id is null) or
    (type = 'group'      and group_id  is not null and student_id is null)
  )
);
create index if not exists lesson_series_studio_idx  on public.lesson_series(studio_id);
create index if not exists lesson_series_teacher_idx on public.lesson_series(teacher_id);

-- Конкретное занятие (экземпляр). Может быть порождён шаблоном или разовым.
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  series_id     uuid references public.lesson_series(id) on delete set null,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  type          text not null check (type in ('individual','group')),
  student_id    uuid references public.students(id) on delete cascade,
  group_id      uuid references public.groups(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  duration_min  int  not null default 45 check (duration_min > 0),
  status        text not null default 'scheduled'
                  check (status in ('scheduled','done','cancelled')),
  note          text,
  created_at    timestamptz not null default now(),
  constraint session_target_ck check (
    (type = 'individual' and student_id is not null and group_id is null) or
    (type = 'group'      and group_id  is not null and student_id is null)
  )
);
create index if not exists sessions_studio_date_idx  on public.sessions(studio_id, date);
create index if not exists sessions_teacher_date_idx on public.sessions(teacher_id, date);
create index if not exists sessions_room_date_idx    on public.sessions(room_id, date);

-- Посещаемость: статус ученика на конкретном занятии.
create table if not exists public.attendance (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  status      text not null default 'present'
                check (status in ('present','absent','late','excused')),
  marked_by   uuid references public.profiles(id) on delete set null,
  marked_at   timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index if not exists attendance_student_idx on public.attendance(student_id);

-- ---------------------------------------------------------------------------
-- RLS: включаем на всех таблицах и описываем политики
-- ---------------------------------------------------------------------------

alter table public.studios       enable row level security;
alter table public.profiles      enable row level security;
alter table public.rooms         enable row level security;
alter table public.students      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.lesson_series enable row level security;
alter table public.sessions      enable row level security;
alter table public.attendance    enable row level security;

-- studios: видно свою студию; изменять может только директор.
drop policy if exists studios_select on public.studios;
create policy studios_select on public.studios
  for select to authenticated
  using (id = public.current_studio_id());

drop policy if exists studios_write on public.studios;
create policy studios_write on public.studios
  for update to authenticated
  using (id = public.current_studio_id() and public.is_director())
  with check (id = public.current_studio_id() and public.is_director());

-- profiles: все в студии видят коллег; правит только директор,
-- а сам пользователь может править свою запись (имя/цвет).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (studio_id = public.current_studio_id());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and studio_id = public.current_studio_id());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

-- Универсальный шаблон для справочников и расписания:
--   читать — всем в студии; менять — директору;
--   занятия/посещаемость дополнительно может вести педагог по своим.
-- rooms, students, groups, group_members: чтение всем в студии, запись директору.
drop policy if exists rooms_select on public.rooms;
create policy rooms_select on public.rooms
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists rooms_write on public.rooms;
create policy rooms_write on public.rooms
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists students_write on public.students;
create policy students_write on public.students
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists groups_write on public.groups;
create policy groups_write on public.groups
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists group_members_write on public.group_members;
create policy group_members_write on public.group_members
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

-- lesson_series и sessions: читать всем в студии; вести может директор
-- (любые) или педагог — только свои (teacher_id = auth.uid()).
drop policy if exists lesson_series_select on public.lesson_series;
create policy lesson_series_select on public.lesson_series
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists lesson_series_write on public.lesson_series;
create policy lesson_series_write on public.lesson_series
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.is_director() or teacher_id = auth.uid())
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or teacher_id = auth.uid())
  );

drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists sessions_write on public.sessions;
create policy sessions_write on public.sessions
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.is_director() or teacher_id = auth.uid())
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or teacher_id = auth.uid())
  );

-- attendance: читать всем в студии; отмечать может директор или педагог,
-- ведущий это занятие.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (
      public.is_director()
      or exists (
        select 1 from public.sessions s
        where s.id = attendance.session_id and s.teacher_id = auth.uid()
      )
    )
  )
  with check (
    studio_id = public.current_studio_id()
    and (
      public.is_director()
      or exists (
        select 1 from public.sessions s
        where s.id = attendance.session_id and s.teacher_id = auth.uid()
      )
    )
  );
