# VoiceStage

PWA для музыкальной студии: расписание, кабинеты, посещаемость, нагрузка
педагогов. План и статус модулей — в [ROADMAP.md](ROADMAP.md).

**Прод:** https://voice-studio-ruby.vercel.app

Стек: React + TypeScript + Vite (PWA) · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel.

## Локальный запуск

1. Скопировать `.env.example` в `.env.local` и заполнить значениями из
   Supabase (Project Settings → API).
2. `npm install`
3. `npm run dev` → http://localhost:5173

Прочие команды: `npm run build` (проверка типов + сборка), `npm run lint`.

## Деплой (Vercel)

- Проект Vercel `voice-studio` (команда VoiceStage, Hobby) связан с GitHub
  `Crystal-io/VoiceStudio`. **Каждый пуш в `main` автоматически собирается и
  выкладывается** за 1–2 минуты. Статус сборок: Vercel → проект → Deployments.
- [vercel.json](vercel.json): все пути без расширения отдают `index.html`
  (роутинг React), `sw.js` не кэшируется — телефоны быстро получают обновления.
- Переменные окружения в Vercel (Settings → Environment Variables, тип
  **Config**, окружение Production):
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

  Они встраиваются в код при сборке — после их изменения нужна пересборка
  (Deployments → ⋯ → Redeploy или любой пуш). Ключ `service_role` в Vercel
  не добавлять никогда.
- Supabase → Authentication → URL Configuration:
  - Site URL: `https://voice-studio-ruby.vercel.app`
  - Redirect URLs: `https://voice-studio-ruby.vercel.app/**`, `http://localhost:5173/**`

  Без прод-адреса вход через Google после авторизации уводит на localhost.

## Вход и роли

- Вход без пароля: код на почту (Email OTP, письма через Resend) или
  «Продолжить с Google».
- Директор приглашает педагога по email (раздел «Педагоги»); при первом входе
  с этим email профиль педагога привязывается автоматически.
- Пока домен в Resend не подтверждён, код по почте доходит только директору —
  педагоги входят через Google.

## Если после обновления виден старый или пустой экран

Приложение кэшируется как PWA. Обновить страницу 1–2 раза (Ctrl+F5); на
телефоне — закрыть и открыть заново.
