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

-- Функции-хелперы объявлены раньше таблиц, на которые ссылаются. Отключаем
-- преждевременную проверку их тел, чтобы порядок в файле не имел значения.
set check_function_bodies = off;

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

-- Приглашения: директор заранее заводит педагога (email + имя + роль).
-- При первом входе педагога триггер превратит приглашение в профиль.
create table if not exists public.invitations (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  email       text not null,
  full_name   text not null,
  role        text not null default 'teacher' check (role in ('teacher','director')),
  created_at  timestamptz not null default now()
);
create unique index if not exists invitations_studio_email_uidx
  on public.invitations(studio_id, lower(email));
create index if not exists invitations_email_idx on public.invitations(lower(email));

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

-- Группы (для групповых занятий). Не удаляются, а уходят в архив
-- (is_active = false): удаление стёрло бы каскадом их занятия и посещаемость.
create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists groups_studio_idx on public.groups(studio_id);

-- M2: архив групп (для баз, созданных до появления поля)
alter table public.groups add column if not exists is_active boolean not null default true;

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
-- Оплата хранится здесь же (каждый ребёнок платит за своё занятие):
--   is_paid — факт оплаты (показываем в интерфейсе);
--   amount  — сумма (храним, но в MVP скрыта в интерфейсе — финансы прячем).
create table if not exists public.attendance (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  status      text                        -- пусто = ещё не отмечен (см. M4)
                check (status in ('present','absent','late','excused')),
  is_paid     boolean not null default false,
  amount      numeric(10,2),
  marked_by   uuid references public.profiles(id) on delete set null,
  marked_at   timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index if not exists attendance_student_idx on public.attendance(student_id);

-- На случай, если таблица attendance уже была создана ранее без полей оплаты:
alter table public.attendance add column if not exists is_paid boolean not null default false;
alter table public.attendance add column if not exists amount  numeric(10,2);

-- ---------------------------------------------------------------------------
-- RLS: включаем на всех таблицах и описываем политики
-- ---------------------------------------------------------------------------

alter table public.studios       enable row level security;
alter table public.profiles      enable row level security;
alter table public.invitations   enable row level security;
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

-- invitations: видит и управляет только директор своей студии.
drop policy if exists invitations_admin_all on public.invitations;
create policy invitations_admin_all on public.invitations
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

-- ---------------------------------------------------------------------------
-- Авто-привязка профиля при первом входе.
-- Когда появляется новый пользователь Auth, ищем приглашение по его email
-- и превращаем его в профиль (студия, имя, роль). Приглашение удаляем.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.invitations%rowtype;
begin
  select * into inv
  from public.invitations
  where lower(email) = lower(new.email)
  limit 1;

  if found then
    insert into public.profiles (id, studio_id, full_name, role)
    values (new.id, inv.studio_id, inv.full_name, inv.role)
    on conflict (id) do nothing;

    delete from public.invitations where id = inv.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Привязка приглашения «по требованию».
-- Триггер handle_new_user срабатывает лишь при СОЗДАНИИ auth-пользователя.
-- Если педагог впервые вошёл ДО того, как его пригласили (или порядок иной),
-- профиль не создастся и повторные входы триггер не запустят. Эта функция
-- вызывается приложением после входа, когда у пользователя ещё нет профиля:
-- она находит приглашение по email и создаёт профиль — когда бы аккаунт ни
-- появился. Безопасна к повторным вызовам (если профиль уже есть — выходит).
-- ---------------------------------------------------------------------------

create or replace function public.claim_invitation()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  em  text;
  inv public.invitations%rowtype;
begin
  if uid is null then
    return;
  end if;

  -- профиль уже есть — ничего не делаем
  if exists (select 1 from public.profiles where id = uid) then
    return;
  end if;

  select lower(u.email) into em from auth.users u where u.id = uid;
  if em is null then
    return;
  end if;

  select * into inv
  from public.invitations
  where lower(email) = em
  limit 1;

  if found then
    insert into public.profiles (id, studio_id, full_name, role)
    values (uid, inv.studio_id, inv.full_name, inv.role)
    on conflict (id) do nothing;

    delete from public.invitations where id = inv.id;
  end if;
end;
$$;

grant execute on function public.claim_invitation() to authenticated;

-- ============================================================================
-- M3: Расписание
--  * серия (lesson_series) — правило «каждый вторник 15:00»;
--  * занятия (sessions) создаются из серий заранее, на горизонт вперёд, —
--    чтобы на них можно было ставить посещаемость, отменять и переносить;
--  * серию меняют «с такой-то даты»: старая серия заканчивается накануне,
--    с этой даты действует новая — прошлые занятия и история не трогаются.
-- ============================================================================

-- Исходная дата вхождения серии. При переносе занятия date меняется, а
-- occurrence_date — нет: так генератор знает, что это вхождение уже создано.
alter table public.sessions add column if not exists occurrence_date date;
create unique index if not exists sessions_series_occurrence_uidx
  on public.sessions(series_id, occurrence_date) where series_id is not null;

-- Педагог, кабинет, ученик и группа занятия должны быть из той же студии.
create or replace function public.check_schedule_refs()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles
                 where id = new.teacher_id and studio_id = new.studio_id) then
    raise exception 'Педагог не из этой студии';
  end if;
  if new.room_id is not null and not exists (
       select 1 from public.rooms where id = new.room_id and studio_id = new.studio_id) then
    raise exception 'Кабинет не из этой студии';
  end if;
  if new.student_id is not null and not exists (
       select 1 from public.students where id = new.student_id and studio_id = new.studio_id) then
    raise exception 'Ученик не из этой студии';
  end if;
  if new.group_id is not null and not exists (
       select 1 from public.groups where id = new.group_id and studio_id = new.studio_id) then
    raise exception 'Группа не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_series_refs on public.lesson_series;
create trigger lesson_series_refs
  before insert or update of studio_id, teacher_id, room_id, student_id, group_id
  on public.lesson_series
  for each row execute function public.check_schedule_refs();

drop trigger if exists sessions_refs on public.sessions;
create trigger sessions_refs
  before insert or update of studio_id, teacher_id, room_id, student_id, group_id
  on public.sessions
  for each row execute function public.check_schedule_refs();

-- Создать занятия одной серии до даты p_until (включительно).
-- Уже созданные вхождения пропускаются. Возвращает число новых занятий.
create or replace function public.generate_series_sessions(p_series uuid, p_until date)
returns int
language plpgsql
set search_path = public
as $$
declare
  s public.lesson_series%rowtype;
  first_day date;
  last_day date;
  n int;
begin
  select * into s from public.lesson_series where id = p_series;
  if not found or not s.is_active then
    return 0;
  end if;
  -- первое вхождение: ближайший нужный день недели начиная со start_date
  first_day := s.start_date
    + ((s.weekday - (extract(isodow from s.start_date)::int - 1) + 7) % 7);
  last_day := least(coalesce(s.end_date, p_until), p_until);

  insert into public.sessions (
    studio_id, series_id, teacher_id, room_id, type, student_id, group_id,
    date, occurrence_date, start_time, duration_min
  )
  select s.studio_id, s.id, s.teacher_id, s.room_id, s.type, s.student_id, s.group_id,
         d::date, d::date, s.start_time, s.duration_min
  from generate_series(first_day::timestamp, last_day::timestamp, interval '7 days') d
  on conflict (series_id, occurrence_date) where series_id is not null do nothing;

  get diagnostics n = row_count;
  return n;
end;
$$;

-- Досоздать занятия всех серий студии до p_until. Вызывается приложением
-- при открытии расписания. SECURITY DEFINER: педагог, открывший календарь,
-- создаёт занятия и коллег — но только по уже существующим сериям студии.
create or replace function public.ensure_sessions(p_until date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  sid uuid := public.current_studio_id();
  lim date := least(p_until, current_date + 400);
  r record;
  total int := 0;
begin
  if sid is null then
    return 0;
  end if;
  for r in
    select id from public.lesson_series
    where studio_id = sid and is_active and start_date <= lim
      and (end_date is null or end_date >= start_date)
  loop
    total := total + public.generate_series_sessions(r.id, lim);
  end loop;
  return total;
end;
$$;

-- Изменить серию начиная с даты p_from. Будущие занятия серии (без отметок
-- посещаемости) пересоздаются по новым правилам; прошлые остаются как были.
-- Возвращает id серии, действующей с p_from (новой, если старая уже шла).
create or replace function public.update_series(
  p_series   uuid,
  p_from     date,
  p_teacher  uuid,
  p_room     uuid,
  p_weekday  int,
  p_start    time,
  p_duration int,
  p_end      date,
  p_until    date
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  s public.lesson_series%rowtype;
  new_id uuid;
begin
  select * into s from public.lesson_series where id = p_series;
  if not found then
    raise exception 'Серия не найдена';
  end if;
  if not (public.is_director() or s.teacher_id = auth.uid()) then
    raise exception 'Нет прав менять эту серию';
  end if;

  delete from public.sessions ss
  where ss.series_id = s.id and ss.date >= p_from
    and not exists (select 1 from public.attendance a where a.session_id = ss.id);

  if p_from <= s.start_date then
    -- серия ещё не началась — правим на месте
    update public.lesson_series
    set teacher_id = p_teacher, room_id = p_room, weekday = p_weekday,
        start_time = p_start, duration_min = p_duration, end_date = p_end
    where id = s.id;
    new_id := s.id;
  else
    -- старая серия заканчивается накануне, с p_from — новая
    update public.lesson_series set end_date = p_from - 1 where id = s.id;
    insert into public.lesson_series (
      studio_id, teacher_id, room_id, type, student_id, group_id,
      weekday, start_time, duration_min, start_date, end_date
    ) values (
      s.studio_id, p_teacher, p_room, s.type, s.student_id, s.group_id,
      p_weekday, p_start, p_duration, p_from, p_end
    )
    returning id into new_id;
    -- уцелевшие (с отметками) будущие занятия переходят к новой серии
    update public.sessions set series_id = new_id
    where series_id = s.id and date >= p_from;
  end if;

  perform public.generate_series_sessions(new_id, p_until);
  return new_id;
end;
$$;

-- Остановить повторение начиная с p_from: будущие занятия без отметок
-- удаляются, серия заканчивается накануне. Если от серии ничего не осталось —
-- удаляется целиком.
create or replace function public.stop_series(p_series uuid, p_from date)
returns void
language plpgsql
set search_path = public
as $$
declare
  s public.lesson_series%rowtype;
begin
  select * into s from public.lesson_series where id = p_series;
  if not found then
    raise exception 'Серия не найдена';
  end if;
  if not (public.is_director() or s.teacher_id = auth.uid()) then
    raise exception 'Нет прав менять эту серию';
  end if;

  delete from public.sessions ss
  where ss.series_id = s.id and ss.date >= p_from
    and not exists (select 1 from public.attendance a where a.session_id = ss.id);

  if not exists (select 1 from public.sessions where series_id = s.id) then
    delete from public.lesson_series where id = s.id;
  else
    update public.lesson_series
    set end_date = greatest(p_from - 1, s.start_date - 1)
    where id = s.id;
  end if;
end;
$$;

-- Пересечения: занятия студии в даты p_dates, которые идут одновременно с
-- [p_start, p_start + p_duration) у того же педагога или в том же кабинете.
-- Отменённые не считаются. p_ignore_* — само редактируемое занятие/серия.
create or replace function public.schedule_conflicts(
  p_teacher        uuid,
  p_room           uuid,
  p_dates          date[],
  p_start          time,
  p_duration       int,
  p_ignore_series  uuid default null,
  p_ignore_session uuid default null
)
returns setof public.sessions
language plpgsql
set search_path = public
as $$
declare
  st int := (extract(epoch from p_start) / 60)::int;
begin
  if coalesce(array_length(p_dates, 1), 0) = 0 then
    return;
  end if;
  -- чтобы сравнивать и с ещё не созданными занятиями серий
  perform public.ensure_sessions((select max(d) from unnest(p_dates) d));

  return query
  select s.*
  from public.sessions s
  where s.studio_id = public.current_studio_id()
    and s.date = any(p_dates)
    and s.status <> 'cancelled'
    and (s.teacher_id = p_teacher or (p_room is not null and s.room_id = p_room))
    and (extract(epoch from s.start_time) / 60)::int < st + p_duration
    and st < (extract(epoch from s.start_time) / 60)::int + s.duration_min
    and (p_ignore_series is null or s.series_id is distinct from p_ignore_series)
    and (p_ignore_session is null or s.id <> p_ignore_session)
  order by s.date, s.start_time
  limit 300;
end;
$$;

revoke all on function public.generate_series_sessions(uuid, date) from public, anon;
revoke all on function public.ensure_sessions(date) from public, anon;
revoke all on function public.update_series(uuid, date, uuid, uuid, int, time, int, date, date) from public, anon;
revoke all on function public.stop_series(uuid, date) from public, anon;
revoke all on function public.schedule_conflicts(uuid, uuid, date[], time, int, uuid, uuid) from public, anon;
grant execute on function public.generate_series_sessions(uuid, date) to authenticated;
grant execute on function public.ensure_sessions(date) to authenticated;
grant execute on function public.update_series(uuid, date, uuid, uuid, int, time, int, date, date) to authenticated;
grant execute on function public.stop_series(uuid, date) to authenticated;
grant execute on function public.schedule_conflicts(uuid, uuid, date[], time, int, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- M3: цвет педагога в календаре. Новому профилю выдаётся первый свободный
-- цвет палитры студии — у каждого педагога свой (пока их не больше восьми).
-- ---------------------------------------------------------------------------

create or replace function public.pick_profile_color(p_studio uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select c from unnest(array['#4f46e5','#0891b2','#db2777','#ea580c',
                                '#16a34a','#9333ea','#ca8a04','#dc2626'])
                   with ordinality as t(c, i)
     where c not in (select color from public.profiles
                     where studio_id = p_studio and color is not null)
     order by i limit 1),
    '#64748b'
  );
$$;

create or replace function public.profiles_default_color()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.color is null then
    new.color := public.pick_profile_color(new.studio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_default_color on public.profiles;
create trigger profiles_default_color
  before insert on public.profiles
  for each row execute function public.profiles_default_color();

-- Раскрасить уже существующие профили без цвета (по порядку появления).
do $$
declare
  r record;
begin
  for r in select id, studio_id from public.profiles where color is null order by created_at loop
    update public.profiles set color = public.pick_profile_color(r.studio_id) where id = r.id;
  end loop;
end;
$$;

-- ============================================================================
-- M4: Посещаемость и оплата
--  * строка attendance = ребёнок × занятие: статус посещения и флаг оплаты;
--  * статус может быть пустым — оплату отмечают и отдельно (например, заранее);
--  * занятие становится «проведено» (done), как только у кого-то отмечен
--    статус, и возвращается в «запланировано», если отметки сняли.
-- ============================================================================

alter table public.attendance alter column status drop not null;
alter table public.attendance alter column status drop default;

-- Перед записью: студия — из занятия, ученик — из той же студии,
-- кто и когда отметил — текущий пользователь и время.
create or replace function public.attendance_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.studio_id := (select studio_id from public.sessions where id = new.session_id);
  if new.studio_id is null then
    raise exception 'Занятие не найдено';
  end if;
  if not exists (select 1 from public.students
                 where id = new.student_id and studio_id = new.studio_id) then
    raise exception 'Ученик не из этой студии';
  end if;
  new.marked_by := auth.uid();
  new.marked_at := now();
  return new;
end;
$$;

drop trigger if exists attendance_before_write on public.attendance;
create trigger attendance_before_write
  before insert or update on public.attendance
  for each row execute function public.attendance_before_write();

-- После записи: статус занятия следует за отметками.
create or replace function public.attendance_sync_session()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  sid uuid := coalesce(new.session_id, old.session_id);
begin
  if exists (select 1 from public.attendance
             where session_id = sid and status is not null) then
    update public.sessions set status = 'done'
    where id = sid and status = 'scheduled';
  else
    update public.sessions set status = 'scheduled'
    where id = sid and status = 'done';
  end if;
  return null;
end;
$$;

drop trigger if exists attendance_sync_session on public.attendance;
create trigger attendance_sync_session
  after insert or update or delete on public.attendance
  for each row execute function public.attendance_sync_session();
