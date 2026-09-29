import { useState } from 'react'
import type { Directory } from '@/lib/directory'
import type { LessonSeries, Profile, Session } from '@/lib/types'
import { SessionSheet } from '@/components/schedule/SessionSheet'
import { EditSeriesModal, MoveSessionModal } from '@/components/schedule/EditLessonModals'

type Mode = { kind: 'sheet' } | { kind: 'move' } | { kind: 'series'; series: LessonSeries }

/**
 * Всё, что открывается по нажатию на занятие: карточка с посещаемостью,
 * перенос и правка серии. Используется в расписании и на главной.
 */
export function LessonDialogs({
  session,
  dir,
  me,
  onClose,
  onChanged,
}: {
  session: Session
  dir: Directory
  me: Profile
  onClose: () => void
  /** что-то поменялось — перечитать список (и, если задано, перейти к дате) */
  onChanged: (goTo?: string) => void
}) {
  const [mode, setMode] = useState<Mode>({ kind: 'sheet' })
  const [dirty, setDirty] = useState(false)
  const isDirector = me.role === 'director'
  const canEdit = isDirector || session.teacher_id === me.id

  if (mode.kind === 'move') {
    return (
      <MoveSessionModal
        session={session}
        dir={dir}
        canChangeTeacher={isDirector}
        onClose={() => (dirty ? onChanged() : onClose())}
        onDone={onChanged}
      />
    )
  }

  if (mode.kind === 'series') {
    return (
      <EditSeriesModal
        series={mode.series}
        fromDate={session.date}
        dir={dir}
        canChangeTeacher={isDirector}
        onClose={() => (dirty ? onChanged() : onClose())}
        onDone={onChanged}
      />
    )
  }

  return (
    <SessionSheet
      session={session}
      dir={dir}
      canEdit={canEdit}
      onClose={() => (dirty ? onChanged() : onClose())}
      onChanged={() => onChanged()}
      onAttendanceChanged={() => setDirty(true)}
      onMove={() => setMode({ kind: 'move' })}
      onEditSeries={(series) => setMode({ kind: 'series', series })}
    />
  )
}
