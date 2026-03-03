import type { Stop } from '../lib/data/types'
import { extractStopDetails } from '../lib/data/loadStops'
import { SHOW_FINANCIAL_FIELDS } from '../lib/featureFlags'

/** Parse numeric value from strings like "$1.2M", "1,200,000", "TBD" */
function parseNumericValue(s: string): number | null {
  if (!s || s === 'TBD') return null
  const cleaned = s.replace(/[$,KMkm]/g, '').replace(/\s/g, '')
  const num = parseFloat(cleaned.replace(/,/g, ''))
  if (Number.isNaN(num)) return null
  if (/M|m/i.test(s)) return num * 1_000_000
  if (/K|k/i.test(s)) return num * 1_000
  return num
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
  return `$${val.toLocaleString()}`
}

interface SummaryStripProps {
  stops: Stop[]
  scenario: 'base' | 'upside'
}

export function SummaryStrip({ stops, scenario }: SummaryStripProps) {
  const dates = stops.length
  let totalGross: number | null = null
  let totalNet: number | null = null

  for (const stop of stops) {
    const d = extractStopDetails(stop, scenario)
    const g = parseNumericValue(d.projectedGross)
    const n = parseNumericValue(d.netGuarantee)
    if (g != null) totalGross = (totalGross ?? 0) + g
    if (n != null) totalNet = (totalNet ?? 0) + n
  }

  return (
    <div className="summary-strip">
      <span className="summary-strip__item">
        Total dates
        <strong>{dates}</strong>
      </span>
      {SHOW_FINANCIAL_FIELDS && (
        <>
          <span className="summary-strip__divider" />
          <span className="summary-strip__item">
            Projected gross
            <strong>{totalGross != null ? formatCurrency(totalGross) : 'TBD'}</strong>
          </span>
          <span className="summary-strip__divider" />
          <span className="summary-strip__item">
            Net/guarantee
            <strong>{totalNet != null ? formatCurrency(totalNet) : 'TBD'}</strong>
          </span>
        </>
      )}
    </div>
  )
}
