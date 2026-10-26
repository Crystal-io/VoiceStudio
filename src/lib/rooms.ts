// Занятость кабинетов: что и когда в кабинете, свободные окна, загрузка в
// процентах от рабочих часов студии. Всё считается на клиенте из занятий и
// броней — их за неделю немного.

import type { RoomBooking, Session, Studio } from '@/lib/types'
import { toMinutes, weekdayOf } from '@/lib/dates'
import { isLiveBooking } from '@/lib/bookings'

/** Отрезок времени в минутах от полуночи: [начало, конец). */
export type Interval = [number, number]

/** Рабочие часы студии в минутах. */
export function workRange(studio: Studio): Interval {
  return [toMinutes(studio.open_time), toMinutes(studio.close_time)]
}

export function isWorkDay(studio: Studio, date: string): boolean {
  return studio.work_days.includes(weekdayOf(date))
}

/** Склеить пересекающиеся и соседние отрезки. */
export function merge(list: Interval[]): Interval[] {
  const sorted = [...list].sort((a, b) => a[0] - b[0])
  const out: Interval[] = []
  for (const [s, e] of sorted) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

/** Когда кабинет занят в этот день: занятия (кроме отменённых) и живые брони. */
export function busyIntervals(
  roomId: string,
  date: string,
  sessions: Session[],
  bookings: RoomBooking[],
): Interval[] {
  const list: Interval[] = []
  for (const s of sessions) {
    if (s.room_id !== roomId || s.date !== date || s.status === 'cancelled') continue
    const start = toMinutes(s.start_time)
    list.push([start, start + s.duration_min])
  }
  for (const b of bookings) {
    if (b.room_id !== roomId || b.date !== date || !isLiveBooking(b)) continue
    const start = toMinutes(b.start_time)
    list.push([start, start + b.duration_min])
  }
  return merge(list)
}

/** Свободные окна внутри [from, to) не короче minLen минут. */
export function freeGaps(busy: Interval[], from: number, to: number, minLen = 30): Interval[] {
  const out: Interval[] = []
  let cursor = from
  for (const [s, e] of busy) {
    if (e <= cursor) continue
    if (s >= to) break
    if (s - cursor >= minLen) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (to - cursor >= minLen) out.push([cursor, to])
  return out
}

/** Сколько минут из рабочих часов занято и какая это доля (0–100). */
export function roomLoad(
  roomId: string,
  date: string,
  sessions: Session[],
  bookings: RoomBooking[],
  studio: Studio,
): { minutes: number; percent: number } {
  const [open, close] = workRange(studio)
  let minutes = 0
  for (const [s, e] of busyIntervals(roomId, date, sessions, bookings)) {
    minutes += Math.max(0, Math.min(e, close) - Math.max(s, open))
  }
  const total = close - open
  return { minutes, percent: total > 0 ? Math.round((minutes / total) * 100) : 0 }
}
