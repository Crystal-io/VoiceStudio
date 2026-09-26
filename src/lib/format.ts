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
  const mod10 = n % 10
  const mod100 = n % 100
  const form =
    mod10 === 1 && mod100 !== 11
      ? forms[0]
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? forms[1]
        : forms[2]
  return `${n} ${form}`
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
