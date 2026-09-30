# VoiceStage

PWA для музыкальной студии: расписание, кабинеты, посещаемость, нагрузка
педагогов. План и статус модулей — в [ROADMAP.md](ROADMAP.md), подробные итоги
сделанного — в [docs/PROGRESS.md](docs/PROGRESS.md).

**Прод:** https://voice-studio-ruby.vercel.app

Стек: React + TypeScript + Vite (PWA) · Tailwind · Supabase (Postgres + Auth + RLS) · Vercel.

## Локальный запуск

1. Скопировать `.env.example` в `.env.local` и заполнить значениями из
   Supabase (Project Settings → API).
2. `npm install`
3. `npm run dev` → http://localhost:5173

Прочие команды: `npm run build` (проверка типов + сборка), `npm run lint`,
`npx vite preview --port 4173` — посмотреть прод-сборку из `dist/` локально
(в режиме разработки файлы не разбиваются на части, как на проде).

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
- Сборка разбита на части ([vite.config.ts](vite.config.ts), [src/App.tsx](src/App.tsx)):
  разделы грузятся при первом открытии, React и Supabase — отдельными файлами.
  Если после деплоя у открытой вкладки старый файл уже удалён, приложение
  один раз перезагружается само.

## Вход и роли

- Вход без пароля: код на почту (Email OTP) или «Продолжить с Google».
- Директор приглашает педагога по email (раздел «Педагоги»); при первом входе
  с этим email профиль педагога привязывается автоматически.

## Почта (коды входа)

Письма с кодом Supabase отправляет через Gmail SMTP от `voicestage.io@gmail.com`
(до 500 писем в день; домен не нужен). Раньше был Resend — без своего домена он
доставлял письма только на адрес владельца аккаунта.

Настройка (разово, в аккаунте voicestage.io@gmail.com):
1. Google-аккаунт → Безопасность → двухэтапная проверка — включить.
2. https://myaccount.google.com/apppasswords → создать «пароль приложения»
   (16 символов). Нигде не сохранять в репозитории и не пересылать.
3. Supabase → Authentication → Emails → SMTP Settings:

   | Поле | Значение |
   |---|---|
   | Sender email / Username | `voicestage.io@gmail.com` |
   | Sender name | `VoiceStage` |
   | Host / Port | `smtp.gmail.com` / `465` |
   | Password | пароль приложения, без пробелов |

4. Supabase → Authentication → Emails → Templates — **оба** шаблона,
   «Confirm signup» (первый вход нового пользователя) и «Magic link» (все
   следующие входы), должны содержать код `{{ .Token }}`, иначе вместо цифр
   придёт ссылка:
   - тема: `Код входа в VoiceStage: {{ .Token }}`
   - текст:
     ```html
     <h2>Вход в VoiceStage</h2>
     <p>Ваш код для входа:</p>
     <p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">{{ .Token }}</p>
     <p>Введите его на экране входа в приложении. Код действует 1 час.</p>
     <p style="color:#888;font-size:13px">Если вы не запрашивали вход, просто не отвечайте на это письмо.</p>
     ```

Длина кода в Supabase (Providers → Email → Email OTP length) должна быть **6** —
поле ввода в приложении рассчитано на 6 цифр.

Если на экране входа «Не удалось отправить письмо с кодом» (в ответе Supabase —
«Error sending magic link / confirmation email»), значит, почтовый сервер
отказал в отправке:
- код приходит на `voicestage.io@gmail.com`, но не на другие адреса — в SMTP
  Settings всё ещё Resend (`smtp.resend.com`, отправитель `onboarding@resend.dev`):
  без своего домена он пишет только владельцу аккаунта. Переключить на Gmail
  (шаги выше);
- не приходит никому — пароль приложения неверный, с пробелами, сменён или
  отозван: создать новый и вписать в SMTP Settings.

## Google-вход

OAuth-клиент «VoiceStage Web» в Google Cloud (проект `voicestage-508513`),
провайдер Google включён в Supabase. Приложение должно быть в статусе
**In production** (Google Auth Platform → Audience → Publish app): в статусе
«Testing» войти могут только внесённые вручную тестовые пользователи. Для
доступа к имени и почте проверка приложения Google не требуется.

## Если после обновления виден старый или пустой экран

Приложение кэшируется как PWA. Обновить страницу 1–2 раза (Ctrl+F5); на
телефоне — закрыть и открыть заново.
