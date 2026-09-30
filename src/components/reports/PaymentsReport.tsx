import { useEffect, useState } from 'react'
import type { Directory } from '@/lib/directory'
import type { Student } from '@/lib/types'
import { loadDebts, type LessonMark } from '@/lib/attendance'
import { formatDayShort } from '@/lib/dates'
import { plural } from '@/lib/format'
import { byDateTime } from '@/lib/reports'
import { Badge, Card, EmptyState, ErrorNote, Spinner } from '@/components/ui'
import { CheckIcon, ChevronRightIcon } from '@/components/icons'
import { SectionTitle } from '@/components/reports/parts'
import { StudentMarksModal } from '@/components/reports/StudentMarksModal'

type StudentDebt = { student: Student; marks: LessonMark[] }

/**
 * Неоплаченные посещения за всё время, по ученикам: у кого сколько занятий
 * без оплаты и с какого числа. Оплату можно отметить прямо отсюда.
 */
export function PaymentsReport({ dir }: { dir: Directory }) {
  const [debts, setDebts] = useState<LessonMark[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadDebts().then((res) => {
      if (!alive) return
      setDebts(res.debts)
      setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [version])

  if (!debts) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    )
  }

  const byStudent = new Map<string, StudentDebt>()
  for (const d of debts) {
    const student = dir.studentById.get(d.row.student_id)
    if (!student) continue
    const item = byStudent.get(student.id) ?? { student, marks: [] }
    item.marks.push(d)
    byStudent.set(student.id, item)
  }
  const list = [...byStudent.values()]
    .map((i) => ({ ...i, marks: i.marks.sort(byDateTime) }))
    .sort(
      (a, b) =>
        b.marks.length - a.marks.length ||
        a.student.full_name.localeCompare(b.student.full_name, 'ru'),
    )
  const total = list.reduce((n, i) => n + i.marks.length, 0)
  const open = list.find((i) => i.student.id === openId)

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-slate-500 dark:text-slate-400">
        Занятия за всё время, где ребёнок был («есть» или «опоздание»), а оплата ещё не
        отмечена. Пропуски сюда не попадают.
      </p>

      {error && <ErrorNote text={error} />}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckIcon className="size-6" />}
            title="Долгов нет"
            hint="Все посещённые занятия оплачены."
          />
        </Card>
      ) : (
        <section className="space-y-2">
          <SectionTitle aside={`у ${plural(list.length, ['ученика', 'учеников', 'учеников'])}`}>
            Не оплачено · {plural(total, ['занятие', 'занятия', 'занятий'])}
          </SectionTitle>
          <Card className="divide-y divide-slate-100 dark:divide-slate-800">
            {list.map(({ student, marks }) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setOpenId(student.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {student.full_name}
                    {!student.is_active && <Badge>архив</Badge>}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {marks.length === 1
                      ? `занятие ${formatDayShort(marks[0].session.date)}`
                      : `с ${formatDayShort(marks[0].session.date)} по ${formatDayShort(marks[marks.length - 1].session.date)}`}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                  {marks.length}
                </span>
                <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
              </button>
            ))}
          </Card>
        </section>
      )}

      {open && (
        <StudentMarksModal
          student={open.student}
          marks={open.marks}
          dir={dir}
          caption="За всё время"
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null)
            setVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}
