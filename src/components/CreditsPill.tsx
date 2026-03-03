import { useState, useRef, useEffect } from 'react'

export function CreditsPill() {
  const [isExpanded, setIsExpanded] = useState(false)
  const creditContainerRef = useRef<HTMLDivElement>(null)

  // Provide the credit container to Cesium
  useEffect(() => {
    if (creditContainerRef.current) {
      // Make the container available globally for Cesium
      ;(window as any).cesiumCreditContainer = creditContainerRef.current
    }
  }, [])

  return (
    <div
      className="relative inline-block self-end"
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Credits Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="glass-panel-subtle interactive"
        style={{
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          background: 'rgba(12, 16, 24, 0.25)',
          backdropFilter: 'var(--blur-sm)',
          transition: 'all var(--transition-fast)'
        }}
      >
        Credits
      </button>

      {/* Expanded Credits Panel */}
      {isExpanded && (
        <div
          className="absolute right-0 glass-panel"
          style={{
            bottom: '100%',
            marginBottom: '8px',
            minWidth: '280px',
            maxWidth: '400px',
            padding: 'var(--space-3)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-muted)',
            lineHeight: 'var(--line-height-relaxed)',
            zIndex: 100,
            animation: 'fadeIn var(--transition-fast) ease-out forwards'
          }}
        >
          <div className="space-y-2">
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>Imagery:</strong>
              <br />
              NASA EOSDIS Global Imagery Browse Services (GIBS)
            </div>
            <div>
              <strong style={{ color: 'var(--text-secondary)' }}>3D Engine:</strong>
              <br />
              CesiumJS - Open Source Geospatial Platform
            </div>
            
            {/* Cesium Credits Container */}
            <div 
              ref={creditContainerRef}
              style={{
                fontSize: 'var(--font-size-xs)',
                color: 'var(--text-muted)',
                opacity: 0.7
              }}
            />
            <div
              style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                opacity: 0.5,
                lineHeight: 1.4,
                marginTop: 'var(--space-2)',
                paddingTop: 'var(--space-2)',
                borderTop: '1px solid var(--border)'
              }}
            >
              We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).
            </div>
          </div>
        </div>
      )}
    </div>
  )
}