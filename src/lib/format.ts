// Мелкие помощники форматирования для интерфейса.

/** Инициалы для аватарки: «Анна Иванова» → «АИ». */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Русское склонение по числу: plural(3, ['ученик', 'ученика', 'учеников'])
 * → «3 ученика».
 */
export function plural(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralForm(n, forms)}`
}

/** Только слово в нужной форме: pluralForm(3, ['ученик', 'ученика', 'учеников']) → «ученика». */
export function pluralForm(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10
  const mod100 = n % 100
  return mod10 === 1 && mod100 !== 11
    ? forms[0]
    : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
      ? forms[1]
      : forms[2]
}

/** Полных лет на сегодня по дате рождения «ГГГГ-ММ-ДД». */
export function ageFrom(birthDate: string): number | null {
  const [y, m, d] = birthDate.split('-').map(Number)
  if (!y || !m || !d) return null
  const now = new Date()
  let age = now.getFullYear() - y
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) {
    age -= 1
  }
  return age >= 0 ? age : null
}

/** Первый похожий на телефон фрагмент текста — для ссылки «позвонить». */
export function findPhone(text: string | null): string | null {
  if (!text) return null
  const match = text.match(/\+?\d[\d\s()-]{5,}\d/)
  return match ? match[0].replace(/[^\d+]/g, '') : null
}

/** Длительность в минутах: 135 → «2 ч 15 мин», 45 → «45 мин», 180 → «3 ч». */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

/** Доля в процентах, целым числом; при пустом знаменателе — null. */
export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) : null
}
