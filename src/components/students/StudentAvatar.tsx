import { initials } from '@/lib/format'
import { usePhotoUrl } from '@/lib/students'

const sizes = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-24 text-2xl',
}

/** Фото ученика в кружке; пока фото нет — инициалы. */
export function StudentAvatar({
  student,
  size = 'md',
  muted = false,
}: {
  student: { full_name: string; photo_path: string | null }
  size?: keyof typeof sizes
  muted?: boolean
}) {
  const url = usePhotoUrl(student.photo_path)
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold ${sizes[size]} ${
        muted
          ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500'
          : 'bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400'
      }`}
    >
      {url ? (
        <img src={url} alt="" className={`size-full object-cover ${muted ? 'opacity-60' : ''}`} />
      ) : (
        initials(student.full_name)
      )}
    </span>
  )
}
