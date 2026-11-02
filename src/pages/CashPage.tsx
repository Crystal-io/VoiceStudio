import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useDirectory } from '@/lib/directory'
import { useProfile } from '@/lib/profile'
import { ErrorNote, Segmented, Spinner } from '@/components/ui'
import { CashDay } from '@/components/cash/CashDay'
import { DebtsList } from '@/components/cash/DebtsList'
import { PriceList } from '@/components/cash/PriceList'

type Tab = 'day' | 'debts' | 'price'

/**
 * «Касса»: касса дня, долги и авансы учеников, прайс и доли (директор).
 * У педагога — только своё: принятые им деньги, его занятия и ученики.
 */
export function CashPage() {
  const { profile } = useProfile()
  const { dir, error, reload } = useDirectory()
  const [params, setParams] = useSearchParams()
  const isDirector = profile?.role === 'director'
  const tabs: { value: Tab; label: string }[] = [
    { value: 'day', label: 'День' },
    { value: 'debts', label: 'Долги' },
    ...(isDirector ? [{ value: 'price' as Tab, label: 'Прайс' }] : []),
  ]
  const tab: Tab = tabs.some((t) => t.value === params.get('tab')) ? (params.get('tab') as Tab) : 'day'

  // «до конца дня» для отмены оплаты база считает по часовому поясу студии —
  // его берём с устройства директора, если он ещё не записан
  useEffect(() => {
    if (!isDirector || !dir?.studio.id || dir.studio.timezone) return
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (tz) void supabase.from('studios').update({ timezone: tz }).eq('id', dir.studio.id)
  }, [isDirector, dir?.studio.id, dir?.studio.timezone])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{isDirector ? 'Касса' : 'Моя касса'}</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {tab === 'price'
            ? 'Прайс и доли: сколько платит ребёнок и сколько из этого — педагогу.'
            : isDirector
              ? 'Кто сколько принёс, кто должен, что оплачено.'
              : 'Деньги, которые вы приняли, и оплата ваших занятий.'}
        </p>
      </div>
      <Segmented<Tab>
        value={tab}
        onChange={(t) => setParams(t === 'day' ? {} : { tab: t }, { replace: true })}
        options={tabs}
      />
      {error && <ErrorNote text={error} />}
      {!dir || !profile ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : tab === 'day' ? (
        <CashDay dir={dir} me={profile} />
      ) : tab === 'debts' ? (
        <DebtsList dir={dir} me={profile} />
      ) : (
        <PriceList dir={dir} onChanged={reload} />
      )}
    </div>
  )
}
