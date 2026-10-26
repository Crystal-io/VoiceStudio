import { supabase } from '@/lib/supabase'
import type { RoomBooking } from '@/lib/types'
import { fromMinutes, todayISO, toMinutes } from '@/lib/dates'

export const bookingColumns =
  'id, studio_id, room_id, date, start_time, duration_min, title, note, auto_release, confirmed_at, created_by, created_at'

/** Сколько минут после начала ждём подтверждения, прежде чем снять бронь. */
export const RELEASE_AFTER_MIN = 15
/** За сколько минут до начала уже можно подтвердить. */
export const CONFIRM_BEFORE_MIN = 15

/** Быстрый выбор «для чего бронь». */
export const BOOKING_TITLES = ['Репетиция', 'Концерт', 'Мероприятие', 'Настройщик', 'Ремонт']

/** Брони за период (и, если задан, только одного кабинета). */
export async function loadBookings(
  from: string,
  to: string,
  roomId?: string,
): Promise<{ bookings: RoomBooking[]; error: string | null }> {
  let q = supabase
    .from('room_bookings')
    .select(bookingColumns)
    .gte('date', from)
    .lte('date', to)
    .order('date')
    .order('start_time')
  if (roomId) q = q.eq('room_id', roomId)
  const { data, error } = await q
  return { bookings: (data as RoomBooking[]) ?? [], error: error ? error.message : null }
}

/**
 * Что с бронью сейчас:
 *  fixed — подтверждать не нужно (auto_release выключен);
 *  confirmed — подтвердили;
 *  waiting — подтвердить можно будет ближе к началу;
 *  confirm_now — пора подтвердить (за 15 минут до начала и 15 после);
 *  released — не подтвердили вовремя, кабинет свободен.
 * Считается по часам устройства — как и «не отмечено» у занятий.
 */
export type BookingState = 'fixed' | 'confirmed' | 'waiting' | 'confirm_now' | 'released'

export function bookingState(b: RoomBooking, now = new Date()): BookingState {
  if (!b.auto_release) return 'fixed'
  if (b.confirmed_at) return 'confirmed'
  const today = todayISO()
  if (b.date > today) return 'waiting'
  if (b.date < today) return 'released'
  const start = toMinutes(b.start_time)
  const min = now.getHours() * 60 + now.getMinutes()
  if (min > start + RELEASE_AFTER_MIN) return 'released'
  if (min >= start - CONFIRM_BEFORE_MIN) return 'confirm_now'
  return 'waiting'
}

/** Бронь занимает кабинет (не снята). */
export const isLiveBooking = (b: RoomBooking) => bookingState(b) !== 'released'

/** До скольких её нужно подтвердить: «16:15». */
export const confirmDeadline = (b: RoomBooking) =>
  fromMinutes(toMinutes(b.start_time) + RELEASE_AFTER_MIN)

/** Подтвердить бронь («я в кабинете») — может любой в студии. */
export async function confirmBooking(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('confirm_booking', { p_booking: id })
  return error ? error.message : null
}
