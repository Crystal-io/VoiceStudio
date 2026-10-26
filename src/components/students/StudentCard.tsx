import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import type { Directory } from '@/lib/directory'
import type { Profile, Student } from '@/lib/types'
import { formatDate, toISO, todayISO } from '@/lib/dates'
import { ageFrom, plural } from '@/lib/format'
import { diff, groupIdsOf, syncMembers, toggle } from '@/lib/groups'
import {
  canEditStudent,
  phoneDigits,
  removePhoto,
  telUrl,
  uploadPhoto,
  usePhotoUrl,
  whatsappUrl,
} from '@/lib/students'
import { Badge, Button, ErrorNote, Field, Modal, SelectField, TextArea } from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import {
  ArchiveIcon,
  CameraIcon,
  ChatIcon,
  CheckIcon,
  PencilIcon,
  PhoneIcon,
  TrashIcon,
} from '@/components/icons'

/** Карточка ученика: просмотр, а у кого есть права — правка. Новая — сразу форма. */
export function StudentCardModal({
  student,
  dir,
  me,
  onClose,
  onChanged,
}: {
  student: Student | null
  dir: Directory
  me: Profile
  onClose: () => void
  /** карточку сохранили или убрали в архив — перечитать списки */
  onChanged: () => void
}) {
  const [editing, setEditing] = useState(!student)
  return (
    <Modal
      title={!student ? 'Новый ученик' : editing ? 'Изменить карточку' : 'Карточка ученика'}
      onClose={onClose}
    >
      {editing || !student ? (
        <StudentForm student={student} dir={dir} me={me} onSaved={onChanged} />
      ) : (
        <StudentView
          student={student}
          dir={dir}
          me={me}
          onEdit={() => setEditing(true)}
          onChanged={onChanged}
        />
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Просмотр
// ---------------------------------------------------------------------------

function StudentView({
  student,
  dir,
  me,
  onEdit,
  onChanged,
}: {
  student: Student
  dir: Directory
  me: Profile
  onEdit: () => void
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isDirector = me.role === 'director'
  const canEdit = canEditStudent(me, student)
  const teacher = student.main_teacher_id ? dir.profileById.get(student.main_teacher_id) : null
  const age = student.birth_date ? ageFrom(student.birth_date) : null
  const groups = groupIdsOf(student.id, dir)
    .map((id) => dir.groupById.get(id))
    .filter((g) => !!g && g.is_active)
    .map((g) => g!.name)

  async function setArchived(archived: boolean) {
    setError(null)
    setBusy(true)
    const { error } = await supabase
      .from('students')
      .update({ is_active: !archived })
      .eq('id', student.id)
    setBusy(false)
    if (error) return setError(error.message)
    onChanged()
  }

  return (
    <div className="space-y-4">
      {!student.is_active && (
        <div className="rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Ученик в архиве — его не предлагают при записи на занятия.
        </div>
      )}

      <div className="flex items-center gap-4">
        <StudentAvatar student={student} size="lg" muted={!student.is_active} />
        <div className="min-w-0">
          <p className="text-lg font-semibold leading-tight">{student.full_name}</p>
          {age !== null && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {plural(age, ['год', 'года', 'лет'])}
            </p>
          )}
        </div>
      </div>

      <ContactButtons phone={student.parent_phone} />

      <dl className="divide-y divide-slate-100 rounded-xl text-sm ring-1 ring-slate-200 dark:divide-slate-800 dark:ring-slate-800">
        <InfoRow label="Основной педагог">{teacher?.full_name ?? 'не указан'}</InfoRow>
        <InfoRow label="Дата рождения">
          {student.birth_date ? formatDate(student.birth_date) : 'не указана'}
        </InfoRow>
        <InfoRow label="Родитель">{student.parent_name || 'не указан'}</InfoRow>
        <InfoRow label="Телефон родителя">{student.parent_phone || 'не указан'}</InfoRow>
        <InfoRow label="В студии с">{formatDate(student.joined_on)}</InfoRow>
        <InfoRow label="Группы">{groups.length > 0 ? groups.join(', ') : 'нет'}</InfoRow>
        {student.notes && <InfoRow label="Заметки">{student.notes}</InfoRow>}
        <InfoRow label="Карточка создана">{formatDate(toISO(new Date(student.created_at)))}</InfoRow>
      </dl>

      {error && <ErrorNote text={error} />}

      {canEdit ? (
        <Button type="button" variant="ghost" disabled={busy} onClick={onEdit} className="w-full">
          <PencilIcon className="size-5" />
          Изменить карточку
        </Button>
      ) : (
        <p className="text-center text-xs text-slate-500 dark:text-slate-400">
          Править карточку может основной педагог ученика или директор.
        </p>
      )}
      {isDirector && (
        <Button
          type="button"
          variant={student.is_active ? 'danger' : 'ghost'}
          disabled={busy}
          onClick={() => setArchived(student.is_active)}
          className="w-full"
        >
          <ArchiveIcon className="size-5" />
          {student.is_active ? 'В архив' : 'Вернуть из архива'}
        </Button>
      )}
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <dt className="w-32 shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{children}</dd>
    </div>
  )
}

/** «WhatsApp» и «Позвонить» по телефону родителя. */
export function ContactButtons({ phone }: { phone: string | null }) {
  const digits = phoneDigits(phone)
  if (!digits) return null
  const cls =
    'inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-1 transition'
  return (
    <div className="flex gap-2">
      <a
        href={whatsappUrl(digits)}
        target="_blank"
        rel="noreferrer"
        className={`${cls} text-emerald-700 ring-emerald-200 hover:bg-emerald-50 dark:text-emerald-300 dark:ring-emerald-900 dark:hover:bg-emerald-950/40`}
      >
        <ChatIcon className="size-5" />
        WhatsApp
      </a>
      <a
        href={telUrl(digits)}
        className={`${cls} text-brand-700 ring-brand-200 hover:bg-brand-50 dark:text-brand-300 dark:ring-brand-900 dark:hover:bg-brand-950/40`}
      >
        <PhoneIcon className="size-5" />
        Позвонить
      </a>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Форма (новая карточка или правка)
// ---------------------------------------------------------------------------

type PhotoChange = { file: File; preview: string } | 'remove' | null

/**
 * Поля карточки. Отдельно от модалки — чтобы завести ученика прямо из
 * формы занятия. onSaved получает id ученика.
 */
export function StudentForm({
  student,
  dir,
  me,
  onSaved,
}: {
  student: Student | null
  dir: Directory
  me: Profile
  onSaved: (id: string) => void
}) {
  const isDirector = me.role === 'director'
  const [firstName, setFirstName] = useState(student?.first_name ?? '')
  const [lastName, setLastName] = useState(student?.last_name ?? '')
  const [birthDate, setBirthDate] = useState(student?.birth_date ?? '')
  const [teacherId, setTeacherId] = useState(
    student ? (student.main_teacher_id ?? '') : isDirector ? '' : me.id,
  )
  const [parentName, setParentName] = useState(student?.parent_name ?? '')
  const [parentPhone, setParentPhone] = useState(student?.parent_phone ?? '')
  const [joinedOn, setJoinedOn] = useState(student?.joined_on ?? todayISO())
  const [notes, setNotes] = useState(student?.notes ?? '')
  const [initialGroups] = useState(() => new Set(student ? groupIdsOf(student.id, dir) : []))
  const [groupIds, setGroupIds] = useState(initialGroups)
  const [photo, setPhoto] = useState<PhotoChange>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const savedPhotoUrl = usePhotoUrl(student?.photo_path ?? null)
  const previewUrl = photo === 'remove' ? null : photo ? photo.preview : savedPhotoUrl
  useEffect(() => {
    if (photo && photo !== 'remove') return () => URL.revokeObjectURL(photo.preview)
  }, [photo])

  // Педагог не передаёт своего ученика другому — это делает директор.
  const teacherLocked = !isDirector && !!student
  const teachers = dir.profiles.filter((p) => p.is_active || p.id === teacherId)
  const groupChoices = dir.groups.filter((g) => g.is_active || initialGroups.has(g.id))
  const age = birthDate ? ageFrom(birthDate) : null
  const phoneBad = parentPhone.trim() !== '' && !phoneDigits(parentPhone)
  const invalid = !firstName.trim() || !lastName.trim() || phoneBad

  function pickPhoto(file: File | undefined) {
    if (!file) return
    setPhoto({ file, preview: URL.createObjectURL(file) })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (invalid) return
    setError(null)
    setBusy(true)

    // id заводим заранее: фото лежит в папке ученика и грузится до записи
    const id = student?.id ?? crypto.randomUUID()
    const oldPhoto = student?.photo_path ?? null
    let photoPath = oldPhoto
    let uploaded: string | null = null
    if (photo === 'remove') photoPath = null
    else if (photo) {
      const res = await uploadPhoto(me.studio_id, id, photo.file)
      if (res.error) return fail(res.error)
      uploaded = res.path
      photoPath = res.path
    }

    const fields = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      birth_date: birthDate || null,
      main_teacher_id: teacherId || null,
      parent_name: parentName.trim() || null,
      parent_phone: parentPhone.trim() || null,
      joined_on: joinedOn || todayISO(),
      notes: notes.trim() || null,
      photo_path: photoPath,
    }
    const { error } = student
      ? await supabase.from('students').update(fields).eq('id', id)
      : await supabase.from('students').insert({ ...fields, id, studio_id: me.studio_id })
    if (error) {
      if (uploaded) void removePhoto(uploaded)
      return fail(error.message)
    }
    if (oldPhoto && oldPhoto !== photoPath) void removePhoto(oldPhoto)

    const syncError = await syncMembers({
      studioId: me.studio_id,
      pairs: (groupId) => ({ group_id: groupId, student_id: id }),
      ...diff(initialGroups, groupIds),
    })
    if (syncError) return fail(syncError)
    onSaved(id)
  }

  function fail(message: string) {
    setBusy(false)
    setError(message)
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="size-full object-cover" />
          ) : (
            <CameraIcon className="size-8" />
          )}
        </span>
        <div className="flex flex-col items-start gap-1.5">
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-brand-600 transition hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-950/40"
          >
            <CameraIcon className="size-4" />
            {previewUrl ? 'Заменить фото' : 'Добавить фото'}
          </button>
          {previewUrl && (
            <button
              type="button"
              onClick={() => setPhoto(student?.photo_path ? 'remove' : null)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            >
              <TrashIcon className="size-4" />
              Убрать фото
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              pickPhoto(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Имя"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Маша"
          required
          autoFocus={!student}
        />
        <Field
          label="Фамилия"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          placeholder="Петрова"
          required
        />
      </div>
      <Field
        label="Дата рождения"
        type="date"
        value={birthDate}
        onChange={(e) => setBirthDate(e.target.value)}
        hint={age !== null ? plural(age, ['год', 'года', 'лет']) : 'Необязательно'}
      />
      <SelectField
        label="Основной педагог"
        value={teacherId}
        disabled={teacherLocked}
        className={teacherLocked ? 'opacity-60' : ''}
        onChange={(e) => setTeacherId(e.target.value)}
      >
        <option value="">Не указан</option>
        {teachers.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name}
            {p.role === 'director' ? ' (директор)' : ''}
          </option>
        ))}
      </SelectField>
      {!isDirector && (
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
          {teacherLocked
            ? 'Передать ученика другому педагогу может директор.'
            : 'Править карточку потом сможет основной педагог и директор.'}
        </p>
      )}
      <Field
        label="ФИО родителя"
        value={parentName}
        onChange={(e) => setParentName(e.target.value)}
        placeholder="Петрова Ольга Ивановна"
      />
      <Field
        label="Телефон родителя (WhatsApp)"
        type="tel"
        inputMode="tel"
        value={parentPhone}
        onChange={(e) => setParentPhone(e.target.value)}
        placeholder="+7 900 123-45-67"
        hint={phoneBad ? 'Похоже, в номере не хватает цифр.' : undefined}
      />
      <Field
        label="В студии с"
        type="date"
        value={joinedOn}
        onChange={(e) => setJoinedOn(e.target.value)}
        required
      />
      <TextArea
        label="Заметки"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Голос, репертуар, особенности…"
      />

      {groupChoices.length > 0 && (
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
            Группы
          </span>
          <div className="flex flex-wrap gap-2">
            {groupChoices.map((g) => {
              const on = groupIds.has(g.id)
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupIds(toggle(groupIds, g.id))}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium transition ${
                    on
                      ? 'bg-brand-600 text-white'
                      : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  {on && <CheckIcon className="size-4" />}
                  {g.name}
                  {!g.is_active && <Badge>архив</Badge>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {error && <ErrorNote text={error} />}

      <Button type="submit" disabled={busy || invalid} className="w-full">
        {busy ? 'Сохраняем…' : student ? 'Сохранить' : 'Добавить ученика'}
      </Button>
    </form>
  )
}
