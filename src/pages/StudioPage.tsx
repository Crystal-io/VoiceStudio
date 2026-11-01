import { Link, useSearchParams } from 'react-router-dom'
import { Segmented } from '@/components/ui'
import { ClockIcon } from '@/components/icons'
import { StudentsPage } from '@/pages/StudentsPage'
import { TeachersPage } from '@/pages/TeachersPage'
import { RoomsPage } from '@/pages/RoomsPage'

type Tab = 'students' | 'groups' | 'teachers' | 'rooms'

const TABS: { value: Tab; label: string }[] = [
  { value: 'students', label: 'Ученики' },
  { value: 'groups', label: 'Группы' },
  { value: 'teachers', label: 'Педагоги' },
  { value: 'rooms', label: 'Кабинеты' },
]

/**
 * «Студия» директора: ученики, группы, педагоги и кабинеты на одной странице
 * с табами. Часы работы и праздники — кнопкой в шапке.
 */
export function StudioPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.some((t) => t.value === params.get('tab'))
    ? (params.get('tab') as Tab)
    : 'students'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Студия</h2>
        <Link
          to="/studio/hours"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50 dark:text-brand-300 dark:ring-brand-900 dark:hover:bg-brand-950/40"
        >
          <ClockIcon className="size-4" />
          Часы и праздники
        </Link>
      </div>

      <Segmented<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'students' ? {} : { tab: t }, { replace: true })}
        options={TABS}
      />

      {tab === 'students' || tab === 'groups' ? (
        <StudentsPage embedded />
      ) : tab === 'teachers' ? (
        <TeachersPage />
      ) : (
        <RoomsPage />
      )}
    </div>
  )
}
