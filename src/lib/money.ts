import { supabase } from '@/lib/supabase'
import type { ChargeStatus, Payment, PaymentMethod } from '@/lib/types'
import { chunks } from '@/lib/schedule'
import { money } from '@/lib/tariffs'

// Деньги учеников: балансы, что оплачено, оплаты. Всё считает база
// (student_balances, charge_status — supabase/schema.sql, M10), здесь — чтение
// и подписи для интерфейса.

export const paymentColumns =
  'id, student_id, amount, method, received_by, received_at, note, cancelled_at, cancelled_by, cancel_reason'

export const chargeColumns = 'session_id, student_id, date, start_time, teacher_id, amount, covered'

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'наличные',
  transfer: 'перевод',
}

/** Балансы учеников (оплатил − начислено). Педагогу база отдаёт только его учеников. */
export async function loadBalances(
  studentIds?: string[],
): Promise<{ balances: Map<string, number>; error: string | null }> {
  const balances = new Map<string, number>()
  const parts = studentIds ? chunks(studentIds, 100) : [null]
  const results = await Promise.all(
    parts.map((ids) => {
      const q = supabase.from('student_balances').select('student_id, balance')
      return ids ? q.in('student_id', ids) : q
    }),
  )
  for (const { data } of results) {
    for (const r of (data as { student_id: string; balance: number }[]) ?? []) {
      balances.set(r.student_id, Number(r.balance))
    }
  }
  const error = results.find((r) => r.error)?.error
  return { balances, error: error ? error.message : null }
}

/** Что оплачено на занятиях: id занятия → начисления с покрытием. */
export async function loadCoverage(
  sessionIds: string[],
): Promise<{ bySession: Map<string, ChargeStatus[]>; error: string | null }> {
  const bySession = new Map<string, ChargeStatus[]>()
  const results = await Promise.all(
    chunks(sessionIds, 100).map((ids) => supabase.from('charge_status').select(chargeColumns).in('session_id', ids)),
  )
  for (const { data } of results) {
    for (const row of (data as ChargeStatus[]) ?? []) {
      const list = bySession.get(row.session_id) ?? []
      list.push(row)
      bySession.set(row.session_id, list)
    }
  }
  const error = results.find((r) => r.error)?.error
  return { bySession, error: error ? error.message : null }
}

/** Начисления ученика (от старых к новым) и его оплаты, вместе с отменёнными. */
export async function loadAccount(studentId: string): Promise<{
  charges: ChargeStatus[]
  payments: Payment[]
  error: string | null
}> {
  const [charges, payments] = await Promise.all([
    supabase
      .from('charge_status')
      .select(chargeColumns)
      .eq('student_id', studentId)
      .order('date')
      .order('start_time'),
    supabase.from('payments').select(paymentColumns).eq('student_id', studentId).order('received_at'),
  ])
  const error = charges.error ?? payments.error
  return {
    charges: (charges.data as ChargeStatus[]) ?? [],
    payments: (payments.data as Payment[]) ?? [],
    error: error ? error.message : null,
  }
}

/** Долг или аванс одним словом: «Долг 75 €», «Аванс 25 €», «0 €». */
export function balanceLabel(
  balance: number,
  currency: string,
): { text: string; tone: 'ok' | 'bad' | 'neutral' } {
  if (balance < 0) return { text: `Долг ${money(-balance, currency)}`, tone: 'bad' }
  if (balance > 0) return { text: `Аванс ${money(balance, currency)}`, tone: 'ok' }
  return { text: money(0, currency), tone: 'neutral' }
}

/** Неоплаченная часть начисления. */
export const unpaid = (c: Pick<ChargeStatus, 'amount' | 'covered'>) =>
  Math.max(Number(c.amount) - Number(c.covered), 0)

export type PaymentPlan = {
  /** какие занятия закроются (дата и сколько пойдёт на каждое) */
  closes: { charge: ChargeStatus; part: number; full: boolean }[]
  /** что останется авансом */
  advance: number
  /** сколько останется долга */
  debtLeft: number
}

/** Что сделает оплата: гасит неоплаченное с самого старого, остаток — аванс. */
export function planPayment(amount: number, charges: ChargeStatus[]): PaymentPlan {
  let left = amount
  const closes: PaymentPlan['closes'] = []
  let debtLeft = 0
  for (const c of charges) {
    const owe = unpaid(c)
    if (owe <= 0) continue
    const part = Math.min(owe, left)
    if (part > 0) closes.push({ charge: c, part, full: part >= owe })
    left -= part
    debtLeft += owe - part
  }
  return { closes, advance: Math.max(left, 0), debtLeft }
}

/** Отменить оплату с причиной (педагог — свою и до конца дня, директор — любую). */
export async function cancelPayment(id: string, reason: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_payment', { p_payment: id, p_reason: reason })
  return error ? error.message : null
}

/** Может ли человек отменить оплату сам: директор — любую, педагог — свою сегодня. */
export function canCancel(p: Payment, meId: string, isDirector: boolean): boolean {
  if (p.cancelled_at) return false
  if (isDirector) return true
  return p.received_by === meId && new Date(p.received_at).toDateString() === new Date().toDateString()
}
