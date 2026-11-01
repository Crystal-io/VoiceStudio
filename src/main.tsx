import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill'
import './index.css'
import App from './App.tsx'

// Windows не рисует флаги стран (вместо 🇩🇪 — буквы «DE»): подгружаем
// шрифт только с флагами, остальной текст остаётся системным шрифтом.
polyfillCountryFlagEmojis('Twemoji Country Flags', '/fonts/TwemojiCountryFlags.woff2')

// Новая версия после выкладки: проверяем при каждом возвращении в приложение
// (телефон часто не перезапускает его, а достаёт из фона). Скачалась —
// страница перезагружается сама (registerType: 'autoUpdate').
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void reg.update()
    })
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
