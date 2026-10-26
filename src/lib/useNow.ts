import { useEffect, useState } from 'react'

/** Текущее время, обновляется каждые everyMs (по умолчанию раз в минуту). */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(id)
  }, [everyMs])
  return now
}

/** Текущее время в минутах от полуночи; обновляется раз в минуту. */
export function useNowMinutes(): number {
  const now = useNow()
  return now.getHours() * 60 + now.getMinutes()
}
