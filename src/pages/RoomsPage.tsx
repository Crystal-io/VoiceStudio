import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useProfile } from '@/lib/profile'
import type { Room } from '@/lib/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Modal,
  Spinner,
} from '@/components/ui'
import { DoorIcon, PencilIcon, PlusIcon } from '@/components/icons'

export function RoomsPage() {
  const { profile } = useProfile()
  const [rooms, setRooms] = useState<Room[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Room | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('rooms')
      .select('id, studio_id, name, is_active, created_at')
      .order('name')
    setRooms((data as Room[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    void load()
  }, [])

  async function toggleActive(room: Room) {
    await supabase
      .from('rooms')
      .update({ is_active: !room.is_active })
      .eq('id', room.id)
    void load()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Кабинеты</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Комнаты, в которых проходят занятия.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} className="shrink-0">
          <PlusIcon className="size-5" />
          Добавить
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : rooms.length === 0 ? (
        <Card>
          <EmptyState
            icon={<DoorIcon className="size-6" />}
            title="Пока нет кабинетов"
            hint="Добавьте первый кабинет, чтобы потом ставить в него занятия."
          />
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {rooms.map((room) => (
              <li key={room.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
                  <DoorIcon className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {room.name}
                    {!room.is_active && (
                      <span className="ml-2 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        выключен
                      </span>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(room)}
                  aria-label="Переименовать"
                  className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                >
                  <PencilIcon className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(room)}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {room.is_active ? 'Выключить' : 'Включить'}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {(adding || editing) && profile && (
        <RoomModal
          studioId={profile.studio_id}
          room={editing}
          onClose={() => {
            setAdding(false)
            setEditing(null)
          }}
          onDone={() => {
            setAdding(false)
            setEditing(null)
            void load()
          }}
        />
      )}
    </div>
  )
}

function RoomModal({
  studioId,
  room,
  onClose,
  onDone,
}: {
  studioId: string
  room: Room | null
  onClose: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(room?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const trimmed = name.trim()
    const { error } = room
      ? await supabase.from('rooms').update({ name: trimmed }).eq('id', room.id)
      : await supabase
          .from('rooms')
          .insert({ studio_id: studioId, name: trimmed })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    onDone()
  }

  return (
    <Modal title={room ? 'Переименовать кабинет' : 'Новый кабинет'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field
          label="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Кабинет 1"
          required
          autoFocus
        />
        {error && <ErrorNote text={error} />}
        <Button type="submit" disabled={busy || !name.trim()} className="w-full">
          {busy ? 'Сохраняем…' : room ? 'Сохранить' : 'Добавить'}
        </Button>
      </form>
    </Modal>
  )
}
