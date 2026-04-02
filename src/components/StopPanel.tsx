import type { Stop } from '../lib/data/types'
import { SHOW_COORDINATES_IN_PANEL, SHOW_STOP_NUMBER_IN_PANEL } from '../config/features'
import { StickyNote, ChevronDown } from 'lucide-react'

interface StopPanelProps {
  stop: Stop | null
  onCollapseToggle?: () => void
  /** When true, show "Buildings pending update" (suppressed due to venue coord mismatch) */
  buildingsPendingUpdate?: boolean
}

export function StopPanel({ stop, onCollapseToggle, buildingsPendingUpdate }: StopPanelProps) {
  if (!stop) {
    return (
      <div className="glass-panel p-xl flex items-center justify-center">
        <div className="text-center">
          <div className="text-muted text-lg mb-sm">No stop selected</div>
          <div className="text-muted text-sm">Select a stop from the list to view details</div>
        </div>
      </div>
    )
  }

  const notes = (stop.notes ?? '').trim()
  const timeline = (stop.timeline ?? '').trim()

  return (
    <div className="stop-panel glass-panel" style={{ padding: 'var(--space-6)' }}>
      {onCollapseToggle && (
        <button
          type="button"
          className="stop-panel__collapse-btn"
          onClick={onCollapseToggle}
          aria-label="Collapse panel"
        >
          <ChevronDown size={20} />
          <span>Collapse</span>
        </button>
      )}

      {/* Header: City headline + Venue */}
      <div style={{ marginBottom: 'var(--space-5)' }}>
        <h2
          style={{
            fontSize: '2.25rem',
            fontWeight: 700,
            color: 'var(--text)',
            letterSpacing: '-0.01em',
            lineHeight: 1.1,
            textTransform: 'uppercase',
            margin: '0 0 var(--space-4) 0',
            borderBottom: '1px solid var(--border)',
            paddingBottom: 'var(--space-4)',
          }}
        >
          {stop.city}
        </h2>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-1)' }}>
          Venue:
        </div>
        <h3
          style={{
            fontSize: '1.15rem',
            color: 'var(--text)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            margin: 0,
          }}
        >
          {stop.venue}
        </h3>
        {timeline && (
          <div style={{ marginTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Timeline:</div>
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>{timeline}</div>
          </div>
        )}
        {SHOW_COORDINATES_IN_PANEL && stop.lat != null && stop.lng != null && (
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-family-mono)',
              marginTop: 'var(--space-2)',
            }}
          >
            {stop.lat.toFixed(4)}, {stop.lng.toFixed(4)}
          </div>
        )}
        {buildingsPendingUpdate && (
          <div
            style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              marginTop: 'var(--space-2)',
            }}
          >
            Buildings pending update
          </div>
        )}
      </div>

      {/* Notes section (multi-line from stop.notes) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <StickyNote
            size={14}
            style={{ color: 'var(--text-muted)', opacity: 0.7 }}
          />
          <span
            style={{
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-secondary)',
            }}
          >
            Notes
          </span>
        </div>
        <div
          style={{
            fontSize: 'var(--font-size-sm)',
            color: notes ? 'var(--text-secondary)' : 'var(--text-muted)',
            lineHeight: 'var(--line-height-relaxed)',
            paddingLeft: 'var(--space-5)',
            fontStyle: notes ? 'normal' : 'italic',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {notes || 'No notes'}
        </div>
      </div>

      {SHOW_STOP_NUMBER_IN_PANEL && (
        <div
          style={{
            marginTop: 'var(--space-6)',
            paddingTop: 'var(--space-4)',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
          }}
        >
          <span>Stop #{stop.order}</span>
        </div>
      )}
    </div>
  )
}
