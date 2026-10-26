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

-- Ученики (дети) — карточка: имя и фамилия, дата рождения, основной педагог,
-- родитель и его телефон (WhatsApp), фото, когда пришёл в студию.
-- full_name вычисляется из имени и фамилии — по нему ищут и сортируют.
create table if not exists public.students (
  id              uuid primary key default gen_random_uuid(),
  studio_id       uuid not null references public.studios(id) on delete cascade,
  first_name      text not null,
  last_name       text not null default '',
  full_name       text generated always as (btrim(first_name || ' ' || last_name)) stored,
  birth_date      date,
  main_teacher_id uuid references public.profiles(id) on delete set null,
  parent_name     text,                   -- ФИО родителя
  parent_phone    text,                   -- телефон родителя (WhatsApp)
  photo_path      text,                   -- файл в хранилище student-photos
  joined_on       date not null default current_date,  -- в студии с
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()   -- карточка создана
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

-- Шаблон повторяющегося занятия («каждый вторник 15:00»).
-- Состав: группа (необязательно) и/или ученики из series_students (M7).
create table if not exists public.lesson_series (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  group_id      uuid references public.groups(id) on delete cascade,
  weekday       int  not null check (weekday between 0 and 6),           -- 0=Пн … 6=Вс
  start_time    time not null,
  duration_min  int  not null default 45 check (duration_min > 0),
  start_date    date not null,
  end_date      date,                                                    -- null = бессрочно
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists lesson_series_studio_idx  on public.lesson_series(studio_id);
create index if not exists lesson_series_teacher_idx on public.lesson_series(teacher_id);

-- Конкретное занятие (экземпляр). Может быть порождён шаблоном или разовым.
-- Состав: нынешние ученики группы (если она есть) + ученики из
-- session_students + все, у кого на занятии уже есть отметка.
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  series_id     uuid references public.lesson_series(id) on delete set null,
  teacher_id    uuid not null references public.profiles(id) on delete cascade,
  room_id       uuid references public.rooms(id) on delete set null,
  group_id      uuid references public.groups(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  duration_min  int  not null default 45 check (duration_min > 0),
  status        text not null default 'scheduled'
                  check (status in ('scheduled','done','cancelled')),
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists sessions_studio_date_idx  on public.sessions(studio_id, date);
create index if not exists sessions_teacher_date_idx on public.sessions(teacher_id, date);
create index if not exists sessions_room_date_idx    on public.sessions(room_id, date);

-- Ученики серии (кроме группы) — копируются в каждое новое занятие серии.
create table if not exists public.series_students (
  series_id   uuid not null references public.lesson_series(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  primary key (series_id, student_id)
);
create index if not exists series_students_student_idx on public.series_students(student_id);

-- Ученики конкретного занятия (кроме группы): индивидуальное — один,
-- «несколько учеников» или «группа и ещё кто-то» — несколько.
create table if not exists public.session_students (
  session_id  uuid not null references public.sessions(id) on delete cascade,
  student_id  uuid not null references public.students(id) on delete cascade,
  studio_id   uuid not null references public.studios(id) on delete cascade,
  primary key (session_id, student_id)
);
create index if not exists session_students_student_idx on public.session_students(student_id);

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
-- M7: перевод уже существующей базы на карточки учеников и состав занятий
-- (на новой базе таблицы сразу создаются в нужном виде — блоки ничего не делают)
-- ---------------------------------------------------------------------------

do $$
begin
  -- full_name → имя + фамилия; full_name теперь вычисляется из них
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'students'
               and column_name = 'full_name' and is_generated = 'NEVER') then
    alter table public.students add column if not exists first_name text;
    alter table public.students add column if not exists last_name text not null default '';
    update public.students
    set first_name = split_part(btrim(full_name), ' ', 1),
        last_name  = btrim(substr(btrim(full_name), length(split_part(btrim(full_name), ' ', 1)) + 1));
    alter table public.students alter column first_name set not null;
    alter table public.students drop column full_name;
    alter table public.students add column full_name text
      generated always as (btrim(first_name || ' ' || last_name)) stored;
  end if;
  -- «контакт родителя» одной строкой → ФИО родителя (телефон — отдельным полем)
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'students'
               and column_name = 'parent_contact') then
    alter table public.students add column if not exists parent_name text;
    update public.students set parent_name = coalesce(parent_name, parent_contact);
    alter table public.students drop column parent_contact;
  end if;
end;
$$;

alter table public.students add column if not exists main_teacher_id uuid
  references public.profiles(id) on delete set null;
alter table public.students add column if not exists parent_name text;
alter table public.students add column if not exists parent_phone text;
alter table public.students add column if not exists photo_path text;
alter table public.students add column if not exists joined_on date not null default current_date;
create index if not exists students_main_teacher_idx on public.students(main_teacher_id);

-- «один ученик или одна группа» → группа и/или ученики: ученик индивидуальных
-- занятий переезжает в состав, поля type и student_id уходят
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'sessions'
               and column_name = 'student_id') then
    insert into public.series_students (series_id, student_id, studio_id)
    select id, student_id, studio_id from public.lesson_series where student_id is not null
    on conflict do nothing;
    insert into public.session_students (session_id, student_id, studio_id)
    select id, student_id, studio_id from public.sessions where student_id is not null
    on conflict do nothing;
    drop trigger if exists lesson_series_refs on public.lesson_series;
    drop trigger if exists sessions_refs on public.sessions;
    alter table public.lesson_series drop constraint if exists series_target_ck;
    alter table public.sessions drop constraint if exists session_target_ck;
    alter table public.lesson_series drop column student_id, drop column type;
    alter table public.sessions drop column student_id, drop column type;
  end if;
end;
$$;

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
alter table public.series_students  enable row level security;
alter table public.session_students enable row level security;

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
-- rooms: чтение всем в студии, запись директору; students и groups — ниже.
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
-- Карточки учеников: заводит любой в студии (педагог — только действующих),
-- правит директор или основной педагог ученика (педагог не может убрать в
-- архив и передать ученика другому), удаляет — директор.
drop policy if exists students_write on public.students;
drop policy if exists students_insert on public.students;
create policy students_insert on public.students
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or is_active)
  );
drop policy if exists students_update on public.students;
create policy students_update on public.students
  for update to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.is_director() or main_teacher_id = auth.uid())
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or (main_teacher_id = auth.uid() and is_active))
  );
drop policy if exists students_delete on public.students;
create policy students_delete on public.students
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.is_director());

-- Группы: создаёт, переименовывает и комплектует любой в студии; убрать в
-- архив (и вернуть) и удалить — директор.
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists groups_write on public.groups;
drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups
  for insert to authenticated
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or is_active)
  );
drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups
  for update to authenticated
  using (studio_id = public.current_studio_id() and (public.is_director() or is_active))
  with check (studio_id = public.current_studio_id() and (public.is_director() or is_active));
drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups
  for delete to authenticated
  using (studio_id = public.current_studio_id() and public.is_director());

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists group_members_write on public.group_members;
create policy group_members_write on public.group_members
  for all to authenticated
  using (studio_id = public.current_studio_id())
  with check (studio_id = public.current_studio_id());

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

-- Состав серий и занятий: как сами серии и занятия — директор или педагог,
-- который их ведёт.
drop policy if exists series_students_select on public.series_students;
create policy series_students_select on public.series_students
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists series_students_write on public.series_students;
create policy series_students_write on public.series_students
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.is_director() or exists (
      select 1 from public.lesson_series ls
      where ls.id = series_students.series_id and ls.teacher_id = auth.uid()))
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or exists (
      select 1 from public.lesson_series ls
      where ls.id = series_students.series_id and ls.teacher_id = auth.uid()))
  );

drop policy if exists session_students_select on public.session_students;
create policy session_students_select on public.session_students
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists session_students_write on public.session_students;
create policy session_students_write on public.session_students
  for all to authenticated
  using (
    studio_id = public.current_studio_id()
    and (public.is_director() or exists (
      select 1 from public.sessions s
      where s.id = session_students.session_id and s.teacher_id = auth.uid()))
  )
  with check (
    studio_id = public.current_studio_id()
    and (public.is_director() or exists (
      select 1 from public.sessions s
      where s.id = session_students.session_id and s.teacher_id = auth.uid()))
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

-- Педагог, кабинет и группа занятия должны быть из той же студии
-- (ученики состава проверяются в session_students / series_students).
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
  if new.group_id is not null and not exists (
       select 1 from public.groups where id = new.group_id and studio_id = new.studio_id) then
    raise exception 'Группа не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_series_refs on public.lesson_series;
create trigger lesson_series_refs
  before insert or update of studio_id, teacher_id, room_id, group_id
  on public.lesson_series
  for each row execute function public.check_schedule_refs();

drop trigger if exists sessions_refs on public.sessions;
create trigger sessions_refs
  before insert or update of studio_id, teacher_id, room_id, group_id
  on public.sessions
  for each row execute function public.check_schedule_refs();

-- Создать занятия одной серии до даты p_until (включительно) — вместе с
-- составом: ученики серии копируются в каждое новое занятие (группа
-- подтягивается сама). Уже созданные вхождения пропускаются.
-- Возвращает число новых занятий.
create or replace function public.generate_series_sessions(p_series uuid, p_until date)
returns int
language plpgsql
set search_path = public
as $$
declare
  s public.lesson_series%rowtype;
  first_day date;
  last_day date;
  created uuid[];
begin
  select * into s from public.lesson_series where id = p_series;
  if not found or not s.is_active then
    return 0;
  end if;
  -- первое вхождение: ближайший нужный день недели начиная со start_date
  first_day := s.start_date
    + ((s.weekday - (extract(isodow from s.start_date)::int - 1) + 7) % 7);
  last_day := least(coalesce(s.end_date, p_until), p_until);

  with ins as (
    insert into public.sessions (
      studio_id, series_id, teacher_id, room_id, group_id,
      date, occurrence_date, start_time, duration_min
    )
    select s.studio_id, s.id, s.teacher_id, s.room_id, s.group_id,
           d::date, d::date, s.start_time, s.duration_min
    from generate_series(first_day::timestamp, last_day::timestamp, interval '7 days') d
    on conflict (series_id, occurrence_date) where series_id is not null do nothing
    returning id
  )
  select coalesce(array_agg(id), '{}') into created from ins;

  -- отдельной командой: проверка прав на состав должна видеть новые занятия
  insert into public.session_students (session_id, student_id, studio_id)
  select x, ss.student_id, s.studio_id
  from unnest(created) x
  cross join public.series_students ss
  where ss.series_id = s.id;

  return coalesce(array_length(created, 1), 0);
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
    -- старая серия заканчивается накануне, с p_from — новая с тем же составом
    update public.lesson_series set end_date = p_from - 1 where id = s.id;
    insert into public.lesson_series (
      studio_id, teacher_id, room_id, group_id,
      weekday, start_time, duration_min, start_date, end_date
    ) values (
      s.studio_id, p_teacher, p_room, s.group_id,
      p_weekday, p_start, p_duration, p_from, p_end
    )
    returning id into new_id;
    insert into public.series_students (series_id, student_id, studio_id)
    select new_id, student_id, studio_id from public.series_students where series_id = s.id;
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

-- ============================================================================
-- M6: вход только по приглашению
-- Без этого учётную запись мог создать кто угодно (Google или код на почту):
-- данных он не видел (RLS), но аккаунт оставался в базе, а код на почту можно
-- было слать на любые адреса через почту студии.
-- Supabase вызывает эту функцию перед созданием КАЖДОГО нового пользователя
-- (Google, код на почту) — только если она включена в Dashboard:
-- Authentication → Hooks → «Before User Created» → Postgres → public.before_user_created.
-- Пропускает, если почта есть в приглашениях (любой студии). Уже существующих
-- пользователей хук не касается — они входят как раньше.
-- Первый директор новой студии: создать студию и приглашение с role='director'
-- (см. bootstrap.sql), затем войти этой почтой.
-- ============================================================================

create or replace function public.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  em text := lower(trim(event->'user'->>'email'));
begin
  if em <> '' and exists (select 1 from public.invitations where lower(email) = em) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Этой почты нет в списке студии. Попросите директора добавить вас в «Педагоги» и войдите с той же почтой.'
  ));
end;
$$;

-- Вызывает только служба авторизации Supabase; из приложения — нельзя
-- (иначе по ответу можно было бы перебирать, чьи почты приглашены).
revoke execute on function public.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created(jsonb) to supabase_auth_admin;

-- ============================================================================
-- M7: карточки учеников и состав занятий
--  * карточка: имя, фамилия, дата рождения, основной педагог, родитель и его
--    телефон (WhatsApp), фото, «в студии с», «карточка создана»;
--  * состав занятия — группа и/или ученики: нынешние ученики группы
--    (меняется состав группы — меняются её занятия) плюс ученики из
--    session_students; у серии — series_students, копируются в новые занятия;
--  * педагог заводит карточки, правит своих учеников (он — основной педагог),
--    создаёт и комплектует группы, полностью ведёт свои занятия и их состав.
-- ============================================================================

-- Карточка: основной педагог — из той же студии; имя без лишних пробелов.
create or replace function public.students_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.first_name := btrim(new.first_name);
  new.last_name := btrim(coalesce(new.last_name, ''));
  if new.first_name = '' then
    raise exception 'Укажите имя ученика';
  end if;
  if new.main_teacher_id is not null and not exists (
       select 1 from public.profiles
       where id = new.main_teacher_id and studio_id = new.studio_id) then
    raise exception 'Педагог не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists students_before_write on public.students;
create trigger students_before_write
  before insert or update on public.students
  for each row execute function public.students_before_write();

-- Состав группы: студия — из группы, ученик — из той же студии.
create or replace function public.group_members_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.studio_id := (select studio_id from public.groups where id = new.group_id);
  if new.studio_id is null then
    raise exception 'Группа не найдена';
  end if;
  if not exists (select 1 from public.students
                 where id = new.student_id and studio_id = new.studio_id) then
    raise exception 'Ученик не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists group_members_before_write on public.group_members;
create trigger group_members_before_write
  before insert or update on public.group_members
  for each row execute function public.group_members_before_write();

-- Состав серии и занятия: студия — из серии/занятия, ученик — из той же студии.
create or replace function public.roster_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'series_students' then
    new.studio_id := (select studio_id from public.lesson_series where id = new.series_id);
  else
    new.studio_id := (select studio_id from public.sessions where id = new.session_id);
  end if;
  if new.studio_id is null then
    raise exception 'Занятие не найдено';
  end if;
  if not exists (select 1 from public.students
                 where id = new.student_id and studio_id = new.studio_id) then
    raise exception 'Ученик не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists series_students_before_write on public.series_students;
create trigger series_students_before_write
  before insert or update on public.series_students
  for each row execute function public.roster_before_write();

drop trigger if exists session_students_before_write on public.session_students;
create trigger session_students_before_write
  before insert or update on public.session_students
  for each row execute function public.roster_before_write();

-- Ученики, которых нужно хранить отдельно: без повторов и без тех, кто и так
-- в группе (они приходят на занятие вместе с группой).
create or replace function public.roster_extras(p_group uuid, p_students uuid[])
returns uuid[]
language sql
stable
set search_path = public
as $$
  select coalesce(array_agg(distinct x), '{}')
  from unnest(coalesce(p_students, '{}')) x
  where p_group is null
     or not exists (select 1 from public.group_members m
                    where m.group_id = p_group and m.student_id = x);
$$;

-- Новое занятие: разовое (p_weekdays пусто) или серии на дни недели.
-- Состав — группа и/или ученики; хотя бы что-то одно обязательно.
create or replace function public.create_lesson(
  p_teacher  uuid,
  p_room     uuid,
  p_group    uuid,
  p_students uuid[],
  p_date     date,
  p_start    time,
  p_duration int,
  p_weekdays int[],
  p_end      date,
  p_until    date
)
returns void
language plpgsql
set search_path = public
as $$
declare
  sid uuid := public.current_studio_id();
  extra uuid[] := public.roster_extras(p_group, p_students);
  wd int;
  new_id uuid;
begin
  if sid is null then
    raise exception 'Нет доступа';
  end if;
  if p_group is null and cardinality(extra) = 0 then
    raise exception 'Выберите группу или хотя бы одного ученика';
  end if;

  if coalesce(cardinality(p_weekdays), 0) = 0 then
    insert into public.sessions (studio_id, teacher_id, room_id, group_id, date, start_time, duration_min)
    values (sid, p_teacher, p_room, p_group, p_date, p_start, p_duration)
    returning id into new_id;
    insert into public.session_students (session_id, student_id, studio_id)
    select new_id, x, sid from unnest(extra) x;
    return;
  end if;

  foreach wd in array p_weekdays loop
    insert into public.lesson_series (
      studio_id, teacher_id, room_id, group_id, weekday, start_time, duration_min, start_date, end_date
    ) values (
      sid, p_teacher, p_room, p_group, wd, p_start, p_duration, p_date, p_end
    )
    returning id into new_id;
    insert into public.series_students (series_id, student_id, studio_id)
    select new_id, x, sid from unnest(extra) x;
    perform public.generate_series_sessions(new_id, p_until);
  end loop;
end;
$$;

-- Состав одного занятия: группа и ученики. Отметки тех, кого убрали из
-- состава, удаляются (приложение предупреждает об этом заранее).
create or replace function public.set_session_roster(p_session uuid, p_group uuid, p_students uuid[])
returns void
language plpgsql
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  extra uuid[] := public.roster_extras(p_group, p_students);
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'Занятие не найдено';
  end if;
  if not (public.is_director() or s.teacher_id = auth.uid()) then
    raise exception 'Нет прав менять это занятие';
  end if;
  if p_group is null and cardinality(extra) = 0 then
    raise exception 'Выберите группу или хотя бы одного ученика';
  end if;

  update public.sessions set group_id = p_group where id = s.id;
  delete from public.session_students where session_id = s.id and student_id <> all(extra);
  insert into public.session_students (session_id, student_id, studio_id)
  select s.id, x, s.studio_id from unnest(extra) x
  on conflict do nothing;
  delete from public.attendance a
  where a.session_id = s.id
    and a.student_id <> all(extra)
    and (p_group is null or not exists (select 1 from public.group_members m
                                        where m.group_id = p_group and m.student_id = a.student_id));
end;
$$;

-- Состав серии начиная с занятия p_from: шаблон серии и все её занятия с
-- этой даты. Отметки (посещение, оплата) не удаляются — тот, у кого они уже
-- есть, остаётся на своём занятии.
create or replace function public.set_series_roster(
  p_series   uuid,
  p_from     date,
  p_group    uuid,
  p_students uuid[]
)
returns void
language plpgsql
set search_path = public
as $$
declare
  s public.lesson_series%rowtype;
  extra uuid[] := public.roster_extras(p_group, p_students);
begin
  select * into s from public.lesson_series where id = p_series;
  if not found then
    raise exception 'Серия не найдена';
  end if;
  if not (public.is_director() or s.teacher_id = auth.uid()) then
    raise exception 'Нет прав менять эту серию';
  end if;
  if p_group is null and cardinality(extra) = 0 then
    raise exception 'Выберите группу или хотя бы одного ученика';
  end if;

  update public.lesson_series set group_id = p_group where id = s.id;
  delete from public.series_students where series_id = s.id and student_id <> all(extra);
  insert into public.series_students (series_id, student_id, studio_id)
  select s.id, x, s.studio_id from unnest(extra) x
  on conflict do nothing;

  update public.sessions set group_id = p_group where series_id = s.id and date >= p_from;
  delete from public.session_students ss
  using public.sessions se
  where ss.session_id = se.id and se.series_id = s.id and se.date >= p_from
    and ss.student_id <> all(extra);
  insert into public.session_students (session_id, student_id, studio_id)
  select se.id, x, s.studio_id
  from public.sessions se cross join unnest(extra) x
  where se.series_id = s.id and se.date >= p_from
  on conflict do nothing;
end;
$$;

revoke all on function public.roster_extras(uuid, uuid[]) from public, anon;
revoke all on function public.create_lesson(uuid, uuid, uuid, uuid[], date, time, int, int[], date, date) from public, anon;
revoke all on function public.set_session_roster(uuid, uuid, uuid[]) from public, anon;
revoke all on function public.set_series_roster(uuid, date, uuid, uuid[]) from public, anon;
grant execute on function public.roster_extras(uuid, uuid[]) to authenticated;
grant execute on function public.create_lesson(uuid, uuid, uuid, uuid[], date, time, int, int[], date, date) to authenticated;
grant execute on function public.set_session_roster(uuid, uuid, uuid[]) to authenticated;
grant execute on function public.set_series_roster(uuid, date, uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Фото учеников: закрытое хранилище student-photos, файл лежит по пути
-- <студия>/<ученик>/<имя файла>. Видят и загружают все в студии; удалить
-- (заменить) старое фото — тот, кто может править карточку.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- может ли текущий пользователь править карточку ученика (id — текстом из пути)
create or replace function public.can_edit_student(p_student text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students
    where id::text = p_student
      and studio_id = public.current_studio_id()
      and (public.is_director() or main_teacher_id = auth.uid())
  );
$$;
revoke all on function public.can_edit_student(text) from public, anon;
grant execute on function public.can_edit_student(text) to authenticated;

drop policy if exists student_photos_select on storage.objects;
create policy student_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos'
         and (storage.foldername(name))[1] = public.current_studio_id()::text);
drop policy if exists student_photos_insert on storage.objects;
create policy student_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos'
              and (storage.foldername(name))[1] = public.current_studio_id()::text);
drop policy if exists student_photos_delete on storage.objects;
create policy student_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos'
         and (storage.foldername(name))[1] = public.current_studio_id()::text
         and public.can_edit_student((storage.foldername(name))[2]));

-- ============================================================================
-- M8: кабинеты — часы работы студии, брони кабинета без урока, праздники
--  * часы работы и рабочие дни студии — от них считается загрузка кабинетов;
--  * бронь — кабинет занят не уроком (репетиция, концерт, настройщик…).
--    Бронь с auto_release снимается сама, если её не подтвердили в течение
--    15 минут после начала (считает приложение по часам устройства, как и
--    «не отмечено»); подтвердить может любой в студии — например, на табло;
--  * праздники только помечаются в календаре: занятия и брони в эти дни
--    ставятся как обычно.
-- ============================================================================

alter table public.studios add column if not exists open_time time not null default '10:00';
alter table public.studios add column if not exists close_time time not null default '21:00';
-- рабочие дни: 0=Пн … 6=Вс
alter table public.studios add column if not exists work_days int[] not null default '{0,1,2,3,4,5}';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'studios_hours_ck') then
    alter table public.studios add constraint studios_hours_ck check (close_time > open_time);
  end if;
end;
$$;

create table if not exists public.room_bookings (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  room_id       uuid not null references public.rooms(id) on delete cascade,
  date          date not null,
  start_time    time not null,
  duration_min  int  not null check (duration_min > 0),
  title         text not null,                 -- «Репетиция», «Настройщик»…
  note          text,
  auto_release  boolean not null default true, -- снять, если не подтвердят
  confirmed_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists room_bookings_studio_date_idx on public.room_bookings(studio_id, date);
create index if not exists room_bookings_room_date_idx on public.room_bookings(room_id, date);

create table if not exists public.holidays (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id) on delete cascade,
  date        date not null,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (studio_id, date)
);

alter table public.room_bookings enable row level security;
alter table public.holidays      enable row level security;

-- Брони: видят все в студии; ставит любой (от своего имени); меняет и
-- снимает автор или директор.
drop policy if exists room_bookings_select on public.room_bookings;
create policy room_bookings_select on public.room_bookings
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists room_bookings_insert on public.room_bookings;
create policy room_bookings_insert on public.room_bookings
  for insert to authenticated
  with check (studio_id = public.current_studio_id() and created_by = auth.uid());
drop policy if exists room_bookings_update on public.room_bookings;
create policy room_bookings_update on public.room_bookings
  for update to authenticated
  using (studio_id = public.current_studio_id() and (public.is_director() or created_by = auth.uid()))
  with check (studio_id = public.current_studio_id() and (public.is_director() or created_by = auth.uid()));
drop policy if exists room_bookings_delete on public.room_bookings;
create policy room_bookings_delete on public.room_bookings
  for delete to authenticated
  using (studio_id = public.current_studio_id() and (public.is_director() or created_by = auth.uid()));

-- Праздники: видят все, ведёт директор.
drop policy if exists holidays_select on public.holidays;
create policy holidays_select on public.holidays
  for select to authenticated using (studio_id = public.current_studio_id());
drop policy if exists holidays_write on public.holidays;
create policy holidays_write on public.holidays
  for all to authenticated
  using (studio_id = public.current_studio_id() and public.is_director())
  with check (studio_id = public.current_studio_id() and public.is_director());

-- Бронь: автор — тот, кто поставил (не подменить); кабинет — из той же
-- студии; название без лишних пробелов.
create or replace function public.room_bookings_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;
  new.title := btrim(new.title);
  if new.title = '' then
    raise exception 'Напишите, для чего бронь';
  end if;
  if not exists (select 1 from public.rooms
                 where id = new.room_id and studio_id = new.studio_id) then
    raise exception 'Кабинет не из этой студии';
  end if;
  return new;
end;
$$;

drop trigger if exists room_bookings_before_write on public.room_bookings;
create trigger room_bookings_before_write
  before insert or update on public.room_bookings
  for each row execute function public.room_bookings_before_write();

-- Подтвердить бронь («я в кабинете») — может любой в студии, хоть с табло.
create or replace function public.confirm_booking(p_booking uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.room_bookings
  set confirmed_at = now()
  where id = p_booking
    and studio_id = public.current_studio_id()
    and confirmed_at is null;
$$;
revoke all on function public.confirm_booking(uuid) from public, anon;
grant execute on function public.confirm_booking(uuid) to authenticated;
