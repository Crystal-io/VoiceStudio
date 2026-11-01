// Телефоны родителей — из разных стран, поэтому код страны выбирают у
// каждого номера. Хранится номер целиком: «+49 151 2345678».

/** Страна (код ISO) → телефонный код. */
const DIAL: Record<string, string> = Object.fromEntries(
  (
    'AD376 AE971 AF93 AG1 AI1 AL355 AM374 AO244 AR54 AS1 AT43 AU61 AW297 AX358 AZ994 ' +
    'BA387 BB1 BD880 BE32 BF226 BG359 BH973 BI257 BJ229 BM1 BN673 BO591 BR55 BS1 BT975 BW267 BY375 BZ501 ' +
    'CA1 CD243 CF236 CG242 CH41 CI225 CK682 CL56 CM237 CN86 CO57 CR506 CU53 CV238 CW599 CY357 CZ420 ' +
    'DE49 DJ253 DK45 DM1 DO1 DZ213 EC593 EE372 EG20 ER291 ES34 ET251 ' +
    'FI358 FJ679 FM691 FO298 FR33 GA241 GB44 GD1 GE995 GF594 GG44 GH233 GI350 GL299 GM220 GN224 GP590 ' +
    'GQ240 GR30 GT502 GU1 GW245 GY592 HK852 HN504 HR385 HT509 HU36 ' +
    'ID62 IE353 IL972 IM44 IN91 IQ964 IR98 IS354 IT39 JE44 JM1 JO962 JP81 ' +
    'KE254 KG996 KH855 KI686 KM269 KN1 KP850 KR82 KW965 KY1 KZ7 ' +
    'LA856 LB961 LC1 LI423 LK94 LR231 LS266 LT370 LU352 LV371 LY218 ' +
    'MA212 MC377 MD373 ME382 MG261 MH692 MK389 ML223 MM95 MN976 MO853 MQ596 MR222 MS1 MT356 MU230 ' +
    'MV960 MW265 MX52 MY60 MZ258 NA264 NC687 NE227 NG234 NI505 NL31 NO47 NP977 NR674 NZ64 OM968 ' +
    'PA507 PE51 PF689 PG675 PH63 PK92 PL48 PR1 PS970 PT351 PW680 PY595 QA974 ' +
    'RE262 RO40 RS381 RU7 RW250 SA966 SB677 SC248 SD249 SE46 SG65 SI386 SK421 SL232 SM378 SN221 ' +
    'SO252 SR597 SS211 ST239 SV503 SY963 SZ268 TC1 TD235 TG228 TH66 TJ992 TL670 TM993 TN216 TO676 ' +
    'TR90 TT1 TV688 TW886 TZ255 UA380 UG256 US1 UY598 UZ998 VA39 VC1 VE58 VG1 VI1 VN84 VU678 ' +
    'WS685 XK383 YE967 YT262 ZA27 ZM260 ZW263'
  )
    .split(' ')
    .map((x) => [x.slice(0, 2), x.slice(2)]),
)

/** Один код у нескольких стран — по номеру без страны берём самую частую. */
const MAIN_FOR_CODE: Record<string, string> = {
  '1': 'US',
  '7': 'RU',
  '44': 'GB',
  '39': 'IT',
  '47': 'NO',
  '61': 'AU',
  '262': 'RE',
  '358': 'FI',
  '590': 'GP',
}

export type Country = { iso: string; dial: string; name: string; flag: string }

/** Флаг из кода страны: две буквы → две «буквы-флажка» Юникода. */
function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

let countries: Country[] | null = null

/** Все страны по алфавиту (названия — по-русски, из браузера). */
export function allCountries(): Country[] {
  if (countries) return countries
  let names: Intl.DisplayNames | null = null
  try {
    names = new Intl.DisplayNames(['ru'], { type: 'region' })
  } catch {
    // старый браузер — покажем коды стран
  }
  countries = Object.entries(DIAL)
    .map(([iso, dial]) => ({ iso, dial, name: names?.of(iso) ?? iso, flag: flagOf(iso) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  return countries
}

export function countryByIso(iso: string | null): Country | null {
  return (iso && allCountries().find((c) => c.iso === iso)) || null
}

/**
 * Разобрать сохранённый номер на страну и остаток: «+49 151 234» →
 * { iso: 'DE', rest: '151 234' }. Без «+» (старые записи) страна не известна.
 */
export function splitPhone(phone: string | null): { iso: string | null; rest: string } {
  const raw = (phone ?? '').trim()
  const m = /^(?:\+|00)\s*(.*)$/.exec(raw)
  if (!m) return { iso: null, rest: raw }
  const body = m[1]
  const digits = body.replace(/\D/g, '')
  // самый длинный подходящий код: «+371» — Латвия, а не «+3…»
  for (let len = 3; len >= 1; len--) {
    const code = digits.slice(0, len)
    const isos = Object.keys(DIAL).filter((iso) => DIAL[iso] === code)
    if (isos.length === 0) continue
    let iso = isos.length === 1 ? isos[0] : (MAIN_FOR_CODE[code] ?? isos[0])
    // +7 6… и +7 7… — Казахстан
    if (code === '7' && /^[67]/.test(digits.slice(1))) iso = 'KZ'
    return { iso, rest: stripDigits(body, len).trim() }
  }
  return { iso: null, rest: raw }
}

/** Убрать из начала строки n цифр (вместе с пробелами между ними). */
function stripDigits(s: string, n: number): string {
  let i = 0
  while (n > 0 && i < s.length) {
    if (/\d/.test(s[i])) n -= 1
    i += 1
  }
  return s.slice(i)
}

/** Номер целиком для записи: «+49 151 2345678». Без цифр — пусто. */
export function joinPhone(iso: string | null, rest: string): string {
  const r = rest.trim()
  if (!r.replace(/\D/g, '')) return ''
  const c = countryByIso(iso)
  return c ? `+${c.dial} ${r}` : r
}

/**
 * Цифры номера в международном виде для WhatsApp и звонка: «+49 151 234…» →
 * «49151234…». Номер без кода страны или слишком короткий — null.
 */
export function phoneDigits(phone: string | null): string | null {
  const raw = (phone ?? '').trim()
  if (!/^(\+|00)/.test(raw)) return null
  const d = raw.replace(/\D/g, '').replace(/^00/, '')
  return d.length >= 8 && d.length <= 15 ? d : null
}

const LAST_KEY = 'vs-phone-country'

/** Страна, выбранная в прошлый раз на этом устройстве. */
export function lastCountry(): string | null {
  try {
    return localStorage.getItem(LAST_KEY)
  } catch {
    return null
  }
}

export function rememberCountry(iso: string) {
  try {
    localStorage.setItem(LAST_KEY, iso)
  } catch {
    // без памяти — выберут ещё раз
  }
}
