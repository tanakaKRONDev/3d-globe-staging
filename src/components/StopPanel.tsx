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

      {/* Header: City, Country, Timeline, Venue */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <h2
            style={{
              fontSize: 'var(--font-size-2xl)',
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text)',
              letterSpacing: 'var(--letter-spacing-tight)',
            }}
          >
            {stop.city}
          </h2>
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              fontFamily: 'var(--font-family-mono)',
              color: 'var(--accent)',
              background: 'rgba(231, 209, 167, 0.1)',
              padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
            }}
          >
            {stop.countryCode}
          </span>
        </div>
        {timeline && (
          <div
            style={{
              fontSize: 'var(--font-size-sm)',
              color: 'var(--accent-muted)',
              marginBottom: 'var(--space-2)',
            }}
          >
            {timeline}
          </div>
        )}
        <h3
          style={{
            fontSize: 'var(--font-size-lg)',
            color: 'var(--accent-muted)',
            fontWeight: 'var(--font-weight-medium)',
          }}
        >
          {stop.venue}
        </h3>
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
