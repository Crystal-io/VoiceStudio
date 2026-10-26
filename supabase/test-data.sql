-- ============================================================================
-- Тестовые ученики и группы — для ручной проверки приложения.
-- Карточки помечены заметкой «Тестовая карточка», группы — «(тест)» в названии.
-- Телефоны заведомо несуществующие (+7 000 …): WhatsApp и звонок никуда не уйдут.
-- Можно запускать повторно — уже добавленные пропускаются.
--
-- Убрать перед запуском студии — блок «Очистка» в конце файла.
-- ============================================================================

do $$
declare
  sid uuid := (select id from public.studios where name = 'VoiceStage');
  mikhail uuid := (select id from public.profiles where studio_id = sid and full_name = 'Михаил');
  michael uuid := (select id from public.profiles where studio_id = sid and full_name = 'Michael - test');
  choir uuid;
  ensemble uuid;
begin
  if sid is null then
    raise exception 'Студия VoiceStage не найдена';
  end if;

  insert into public.students (
    studio_id, first_name, last_name, birth_date, main_teacher_id,
    parent_name, parent_phone, joined_on, notes
  )
  select sid, t.first_name, t.last_name, t.birth_date::date, t.teacher,
         t.parent_name, t.parent_phone, t.joined_on::date, 'Тестовая карточка'
  from (values
    ('Алиса',   'Морозова',  '2016-03-14', mikhail, 'Морозова Екатерина Сергеевна', '+7 000 000-00-01', '2025-09-01'),
    ('Артём',   'Соколов',   '2015-07-02', mikhail, 'Соколов Дмитрий Андреевич',    '+7 000 000-00-02', '2024-09-02'),
    ('Дарья',   'Кузнецова', '2016-05-30', mikhail, 'Кузнецова Анна Викторовна',    '+7 000 000-00-03', '2025-01-15'),
    ('Иван',    'Волков',    '2013-09-25', mikhail, 'Волкова Мария Петровна',       '+7 000 000-00-04', '2023-09-01'),
    ('Лев',     'Смирнов',   '2017-04-17', mikhail, 'Смирнова Ольга Игоревна',      '+7 000 000-00-05', '2025-09-01'),
    ('Никита',  'Павлов',    '2014-06-21', mikhail, 'Павлов Сергей Николаевич',     '+7 000 000-00-06', '2024-02-10'),
    ('Варвара', 'Лебедева',  '2017-11-20', michael, 'Лебедева Ирина Олеговна',      '+7 000 000-00-07', '2025-09-01'),
    ('Глеб',    'Новиков',   '2014-01-09', michael, 'Новикова Татьяна Юрьевна',     '+7 000 000-00-08', '2024-09-02'),
    ('Ева',     'Попова',    '2018-02-11', michael, 'Попов Алексей Владимирович',   '+7 000 000-00-09', '2026-01-12'),
    ('Ксения',  'Фёдорова',  '2015-12-03', michael, 'Фёдорова Наталья Сергеевна',   '+7 000 000-00-10', '2025-03-03'),
    ('Мия',     'Васильева', '2016-08-08', michael, 'Васильева Елена Андреевна',    '+7 000 000-00-11', '2025-09-01'),
    ('София',   'Семёнова',  '2015-10-12', michael, 'Семёнова Юлия Михайловна',     '+7 000 000-00-12', '2024-09-02')
  ) as t(first_name, last_name, birth_date, teacher, parent_name, parent_phone, joined_on)
  where not exists (
    select 1 from public.students s
    where s.studio_id = sid and s.first_name = t.first_name and s.last_name = t.last_name
      and s.notes = 'Тестовая карточка'
  );

  -- группы и их состав
  insert into public.groups (studio_id, name)
  select sid, g.name from (values ('Младший хор (тест)'), ('Вокальный ансамбль (тест)')) as g(name)
  where not exists (select 1 from public.groups where studio_id = sid and name = g.name);

  choir := (select id from public.groups where studio_id = sid and name = 'Младший хор (тест)');
  ensemble := (select id from public.groups where studio_id = sid and name = 'Вокальный ансамбль (тест)');

  insert into public.group_members (group_id, student_id, studio_id)
  select choir, s.id, sid from public.students s
  where s.studio_id = sid and s.notes = 'Тестовая карточка'
    and s.first_name in ('Алиса', 'Варвара', 'Ева', 'Лев', 'Мия')
  on conflict do nothing;

  insert into public.group_members (group_id, student_id, studio_id)
  select ensemble, s.id, sid from public.students s
  where s.studio_id = sid and s.notes = 'Тестовая карточка'
    and s.first_name in ('Артём', 'Дарья', 'Ксения', 'Никита', 'София')
  on conflict do nothing;
end;
$$;

-- ----------------------------------------------------------------------------
-- Очистка (раскомментировать и выполнить перед запуском студии).
-- Удаляет тестовые карточки и группы вместе с их занятиями и отметками.
-- ----------------------------------------------------------------------------
-- delete from public.sessions where group_id in (select id from public.groups where name like '%(тест)');
-- delete from public.lesson_series where group_id in (select id from public.groups where name like '%(тест)');
-- delete from public.groups where name like '%(тест)';
-- delete from public.students where notes = 'Тестовая карточка';
