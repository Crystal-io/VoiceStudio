-- ============================================================================
-- VoiceStage — первичная настройка (выполнить ОДИН раз после schema.sql)
-- Создаёт студию и назначает первого пользователя директором.
--
-- Меняй при необходимости:
--   * название студии
--   * email директора (должен уже войти в приложение хотя бы раз,
--     чтобы существовать в auth.users)
-- ============================================================================

do $$
declare
  v_email  text := 'voicestage.io@gmail.com';   -- email директора
  v_studio text := 'VoiceStage';                 -- название студии
  v_uid    uuid;
  v_sid    uuid;
begin
  select id into v_uid from auth.users where lower(email) = lower(v_email);
  if v_uid is null then
    raise exception 'Пользователь % не найден в auth.users — сначала войдите в приложение этим email', v_email;
  end if;

  -- студия (если у директора уже есть профиль со студией — используем её)
  select studio_id into v_sid from public.profiles where id = v_uid;
  if v_sid is null then
    insert into public.studios (name) values (v_studio) returning id into v_sid;
  end if;

  insert into public.profiles (id, studio_id, full_name, role)
  values (v_uid, v_sid, 'Директор', 'director')
  on conflict (id) do update
    set role = 'director', studio_id = excluded.studio_id;

  raise notice 'Готово: студия %, директор % (uid %)', v_sid, v_email, v_uid;
end $$;
