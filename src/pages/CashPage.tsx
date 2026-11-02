import { useDirectory } from '@/lib/directory'
import { ErrorNote, Spinner } from '@/components/ui'
import { PriceList } from '@/components/cash/PriceList'

/** «Касса» директора: прайс и доли педагогов. */
export function CashPage() {
  const { dir, error, reload } = useDirectory()

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Касса</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Прайс и доли: сколько платит ребёнок и сколько из этого — педагогу.
        </p>
      </div>
      {error && <ErrorNote text={error} />}
      {!dir ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <PriceList dir={dir} onChanged={reload} />
      )}
    </div>
  )
}
