import type { Stop } from '../lib/data/types'

interface StopListProps {
  stops: Stop[]
  selectedStopId: string | null
  onSelectStop: (stopId: string) => void
}

export function StopList({ stops, selectedStopId, onSelectStop }: StopListProps) {
  if (stops.length === 0) {
    return (
      <div className="stop-list glass-panel" style={{ padding: 'var(--space-6)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }}>
          No stops available
        </div>
      </div>
    )
  }

  return (
    <div className="stop-list glass-panel">
      <h3 className="stop-list__title">Tour Stops</h3>
      <div className="stop-list__items">
        {stops.map((stop) => {
          const isSelected = stop.id === selectedStopId
          const hasCoords = stop.lat != null && stop.lng != null
          const timeline = (stop.timeline ?? '').trim()

          return (
            <button
              key={stop.id}
              onClick={() => hasCoords && onSelectStop(stop.id)}
              className="stop-list__card glass-panel-subtle interactive"
              style={{
                padding: 'var(--space-3)',
                textAlign: 'left',
                border: isSelected
                  ? '1px solid var(--accent)'
                  : '1px solid var(--border)',
                background: isSelected
                  ? 'rgba(231, 209, 167, 0.05)'
                  : 'rgba(12, 16, 24, 0.35)',
                borderRadius: 'var(--radius-md)',
                transition: 'all var(--transition-fast)',
                cursor: hasCoords ? 'pointer' : 'not-allowed',
                opacity: hasCoords ? 1 : 0.6,
                boxShadow: isSelected
                  ? '0 0 20px rgba(231, 209, 167, 0.1)'
                  : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    fontSize: 'var(--font-size-xs)',
                    fontWeight: 'var(--font-weight-semibold)',
                    background: isSelected ? 'var(--accent)' : 'var(--panel)',
                    color: isSelected ? 'var(--bg)' : 'var(--text-secondary)',
                    flexShrink: 0,
                  }}
                >
                  {stop.order}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    <span
                      style={{
                        fontWeight: 'var(--font-weight-medium)',
                        color: isSelected ? 'var(--text)' : 'var(--text-secondary)',
                        fontSize: 'var(--font-size-sm)',
                      }}
                    >
                      {stop.city}
                    </span>
                    <span
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-family-mono)',
                      }}
                    >
                      {stop.countryCode}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--font-size-xs)',
                      marginTop: 'var(--space-1)',
                      color: isSelected ? 'var(--accent-muted)' : 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {stop.venue}
                  </div>
                  {timeline && (
                    <div
                      style={{
                        fontSize: 'var(--font-size-xs)',
                        marginTop: 'var(--space-1)',
                        color: 'var(--text-muted)',
                        opacity: 0.9,
                      }}
                    >
                      {timeline}
                    </div>
                  )}
                </div>

                {isSelected && (
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      flexShrink: 0,
                    }}
                  />
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
