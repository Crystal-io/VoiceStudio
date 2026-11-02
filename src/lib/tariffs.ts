import type { Directory } from '@/lib/directory'
import type { Tariff, TariffKind, TariffOverride, TariffRate } from '@/lib/types'

// Тарифы и ставки — те же правила, что в базе (supabase/schema.sql, M10):
// особые условия педагога поверх общей ставки, ставка — на дату занятия.

export const KIND_LABEL: Record<TariffKind, string> = {
  group: 'Группа',
  private: 'Частное',
}

/** «Группа · 60 мин» или своё название тарифа. */
export function tariffTitle(t: Tariff): string {
  return t.name || `${KIND_LABEL[t.kind]} · ${t.duration_min} мин`
}

/** Сумма в валюте студии: 25 → «25 €», 25.5 → «25,50 €». */
export function money(amount: number, currency = 'EUR'): string {
  const whole = Number.isInteger(amount)
  try {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency,
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

/** Число из поля ввода: «25,5» → 25.5; пусто или не число — null. */
export function parseMoney(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}

/** Общая ставка тарифа на дату: последняя вступившая, а до первой — первая. */
export function baseRate(dir: Directory, tariffId: string, date: string): TariffRate | null {
  const rates = dir.ratesByTariff.get(tariffId) ?? []
  const active = rates.filter((r) => r.valid_from <= date)
  return active[active.length - 1] ?? rates[0] ?? null
}

/** Особые условия педагога по тарифу, действующие на дату (обе части пусты — их нет). */
export function overrideOn(
  dir: Directory,
  tariffId: string,
  teacherId: string,
  date: string,
): TariffOverride | null {
  const list = dir.overrides.filter(
    (o) => o.tariff_id === tariffId && o.teacher_id === teacherId && o.valid_from <= date,
  )
  const last = list[list.length - 1]
  return last && (last.price !== null || last.teacher_share !== null) ? last : null
}

export type Rate = {
  price: number
  teacherShare: number
  /** по особым условиям педагога */
  special: boolean
}

/** Что начислится за ребёнка: цена и доля педагога на дату. */
export function rateFor(
  dir: Directory,
  tariffId: string,
  teacherId: string | null,
  date: string,
): Rate | null {
  const base = baseRate(dir, tariffId, date)
  if (!base) return null
  const ov = teacherId ? overrideOn(dir, tariffId, teacherId, date) : null
  const price = ov?.price ?? base.price
  return {
    price,
    teacherShare: Math.min(ov?.teacher_share ?? base.teacher_share, price),
    special: !!ov,
  }
}

/** Подходящий тариф: того же вида, ближайший по длительности (как pick_tariff в базе). */
export function pickTariff(dir: Directory, isGroup: boolean, duration: number): Tariff | null {
  const kind: TariffKind = isGroup ? 'group' : 'private'
  const fit = dir.tariffs
    .filter((t) => t.is_active && t.kind === kind && (dir.ratesByTariff.get(t.id)?.length ?? 0) > 0)
    .sort(
      (a, b) =>
        Math.abs(a.duration_min - duration) - Math.abs(b.duration_min - duration) ||
        b.duration_min - a.duration_min ||
        a.created_at.localeCompare(b.created_at),
    )
  return fit[0] ?? null
}

/**
 * Тариф занятия: свой, если подходит к составу по виду, иначе подходящий
 * (так же считает база при отметке «Есть»).
 */
export function lessonTariff(
  dir: Directory,
  tariffId: string | null,
  isGroup: boolean,
  duration: number,
): Tariff | null {
  const own = tariffId ? dir.tariffById.get(tariffId) : null
  if (own && own.kind === (isGroup ? 'group' : 'private')) return own
  return pickTariff(dir, isGroup, duration) ?? own ?? null
}
