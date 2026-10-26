import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Profile, Student } from '@/lib/types'

export const studentColumns =
  'id, studio_id, first_name, last_name, full_name, birth_date, main_teacher_id, parent_name, parent_phone, photo_path, joined_on, notes, is_active, created_at'

/** Править карточку может директор или основной педагог ученика. */
export function canEditStudent(me: Profile, s: Student): boolean {
  return me.role === 'director' || s.main_teacher_id === me.id
}

// ---------------------------------------------------------------------------
// Телефон родителя
// ---------------------------------------------------------------------------

/**
 * Цифры номера в международном виде: «8 900 123-45-67» → «79001234567».
 * Слишком короткий — null (по такому не позвонить и не написать).
 */
export function phoneDigits(phone: string | null): string | null {
  if (!phone) return null
  let d = phone.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('8')) d = `7${d.slice(1)}`
  else if (d.length === 10 && d.startsWith('9')) d = `7${d}`
  return d.length >= 10 ? d : null
}

export const whatsappUrl = (digits: string) => `https://wa.me/${digits}`
export const telUrl = (digits: string) => `tel:+${digits}`

// ---------------------------------------------------------------------------
// Фото: закрытое хранилище, файл — <студия>/<ученик>/<имя>.jpg
// ---------------------------------------------------------------------------

const BUCKET = 'student-photos'
/** ссылка живёт час; обновляем чуть раньше */
const URL_TTL_S = 3600
const cache = new Map<string, { url: string; until: number }>()
const waiting = new Map<string, ((url: string | null) => void)[]>()
let batch: ReturnType<typeof setTimeout> | null = null

function cached(path: string | null): string | null {
  if (!path) return null
  const hit = cache.get(path)
  return hit && hit.until > Date.now() ? hit.url : null
}

/** Ссылки на фото собираем пачкой: в списке учеников — один запрос на всех. */
function requestUrl(path: string): Promise<string | null> {
  return new Promise((resolve) => {
    const list = waiting.get(path)
    if (list) list.push(resolve)
    else waiting.set(path, [resolve])
    batch ??= setTimeout(flush, 0)
  })
}

async function flush() {
  batch = null
  const paths = [...waiting.keys()]
  const resolvers = new Map(waiting)
  waiting.clear()
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_TTL_S)
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]))
  for (const path of paths) {
    const url = byPath.get(path) ?? null
    if (url) cache.set(path, { url, until: Date.now() + (URL_TTL_S - 300) * 1000 })
    for (const resolve of resolvers.get(path) ?? []) resolve(url)
  }
}

/** Ссылка на фото ученика (null — фото нет или ещё грузится). */
export function usePhotoUrl(path: string | null): string | null {
  const [state, setState] = useState(() => ({ path, url: cached(path) }))
  useEffect(() => {
    if (!path || cached(path)) return
    let alive = true
    void requestUrl(path).then((url) => {
      if (alive) setState({ path, url })
    })
    return () => {
      alive = false
    }
  }, [path])
  return cached(path) ?? (state.path === path ? state.url : null)
}

/** Уменьшить фото до 720 px по большей стороне и сжать в JPEG. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const scale = Math.min(1, 720 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale)
  canvas.height = Math.round(img.height * scale)
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
  img.close()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не удалось обработать фото'))), 'image/jpeg', 0.85),
  )
}

/** Загрузить фото ученика; возвращает путь файла для students.photo_path. */
export async function uploadPhoto(
  studioId: string,
  studentId: string,
  file: File,
): Promise<{ path: string | null; error: string | null }> {
  let blob: Blob
  try {
    blob = await shrink(file)
  } catch {
    return { path: null, error: 'Не удалось открыть фото — выберите снимок в формате JPEG или PNG.' }
  }
  const path = `${studioId}/${studentId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  return error ? { path: null, error: error.message } : { path, error: null }
}

/** Удалить старый файл фото (после замены или удаления фото в карточке). */
export async function removePhoto(path: string): Promise<void> {
  cache.delete(path)
  await supabase.storage.from(BUCKET).remove([path])
}
