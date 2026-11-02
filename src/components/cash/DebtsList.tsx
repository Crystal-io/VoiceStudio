import { useEffect, useState } from 'react'
import type { Directory } from '@/lib/directory'
import type { Profile, Student } from '@/lib/types'
import { loadBalances } from '@/lib/money'
import { plural } from '@/lib/format'
import { money } from '@/lib/tariffs'
import { Badge, Card, EmptyState, ErrorNote, Spinner } from '@/components/ui'
import { StudentAvatar } from '@/components/students/StudentAvatar'
import { StudentCardModal } from '@/components/students/StudentCard'
import { CheckIcon, ChevronRightIcon } from '@/components/icons'

/**
 * Долги и авансы учеников за всё время (баланс = оплаты − занятия).
 * Педагогу — только его ученики. Нажатие — лицевой счёт.
 */
export function DebtsList({ dir, me }: { dir: Directory; me: Profile }) {
  const currency = dir.studio.currency
  const [balances, setBalances] = useState<Map<string, number> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [open, setOpen] = useState<Student | null>(null)

  useEffect(() => {
    let alive = true
    void loadBalances().then((res) => {
      if (!alive) return
      setBalances(res.balances)
      setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [version])

  if (!balances) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  const list = [...balances.entries()]
    .map(([id, balance]) => ({ student: dir.studentById.get(id), balance }))
    .filter((x): x is { student: Student; balance: number } => !!x.student && x.balance !== 0)
  const debts = list.filter((x) => x.balance < 0).sort((a, b) => a.balance - b.balance)
  const advances = list.filter((x) => x.balance > 0).sort((a, b) => b.balance - a.balance)
  const total = (xs: typeof list) => xs.reduce((n, x) => n + Math.abs(x.balance), 0)

  const row = ({ student, balance }: { student: Student; balance: number }) => (
    <button
      key={student.id}
      type="button"
      onClick={() => setOpen(student)}
      className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition first:rounded-t-2xl last:rounded-b-2xl hover:bg-slate-50 dark:hover:bg-slate-800/50"
    >
      <StudentAvatar student={student} size="sm" muted={!student.is_active} />
      <span className="min-w-0 flex-1 truncate font-medium">
        {student.full_name}
        {!student.is_active && <Badge>архив</Badge>}
      </span>
      <span
        className={`shrink-0 text-sm font-semibold tabular-nums ${
          balance < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
        }`}
      >
        {money(Math.abs(balance), currency)}
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-slate-300 dark:text-slate-600" />
    </button>
  )

  return (
    <div className="space-y-4">
      <p className="px-1 text-sm text-slate-500 dark:text-slate-400">
        Долг — занятий с «Есть» больше, чем оплачено; аванс — деньги вперёд, ими закроются следующие
        занятия.{me.role !== 'director' && ' Здесь — ваши ученики.'}
      </p>
      {error && <ErrorNote text={error} />}

      {debts.length === 0 && advances.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckIcon className="size-6" />} title="Долгов и авансов нет" hint="Все занятия оплачены ровно." />
        </Card>
      ) : (
        <>
          {debts.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Должны · {plural(debts.length, ['ученик', 'ученика', 'учеников'])}</span>
                <span className="text-rose-600 dark:text-rose-400">{money(total(debts), currency)}</span>
              </h3>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">{debts.map(row)}</Card>
            </section>
          )}
          {advances.length > 0 && (
            <section className="space-y-2">
              <h3 className="flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <span>Авансы · {plural(advances.length, ['ученик', 'ученика', 'учеников'])}</span>
                <span className="text-emerald-600 dark:text-emerald-400">{money(total(advances), currency)}</span>
              </h3>
              <Card className="divide-y divide-slate-100 dark:divide-slate-800">{advances.map(row)}</Card>
            </section>
          )}
        </>
      )}

      {open && (
        <StudentCardModal
          student={open}
          dir={dir}
          me={me}
          initialTab="money"
          onClose={() => setOpen(null)}
          onChanged={() => setOpen(null)}
          onMoneyChanged={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  )
}
