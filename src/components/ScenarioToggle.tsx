import type { Scenario } from '../lib/data/types'
import { ENABLE_UPSIDE } from '../config/features'

interface ScenarioToggleProps {
  scenario: Scenario
  onScenarioChange: (scenario: Scenario) => void
}

export function ScenarioToggle({ scenario, onScenarioChange }: ScenarioToggleProps) {
  if (!ENABLE_UPSIDE) {
    return null
  }

  const scenarios: { value: Scenario; label: string }[] = [
    { value: 'base', label: 'Base' },
    { value: 'upside', label: 'Upside' }
  ]

  return (
    <div className="glass-panel scenario-toggle-mobile-hide" style={{ padding: 'var(--space-5)' }}>
      <h3 
        style={{ 
          fontSize: 'var(--font-size-lg)', 
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--text)',
          marginBottom: 'var(--space-4)',
          letterSpacing: 'var(--letter-spacing-tight)'
        }}
      >
        Scenario
      </h3>
      
      {/* Segmented Control */}
      <div 
        style={{
          position: 'relative',
          display: 'flex',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-1)'
        }}
      >
        {/* Background Slider */}
        <div
          style={{
            position: 'absolute',
            top: 'var(--space-1)',
            bottom: 'var(--space-1)',
            left: scenario === 'base' ? 'var(--space-1)' : '50%',
            width: 'calc(50% - var(--space-1))',
            background: 'var(--accent)',
            borderRadius: 'var(--radius-md)',
            transition: 'all var(--transition-normal)',
            boxShadow: '0 2px 8px rgba(231, 209, 167, 0.25)'
          }}
        />
        
        {/* Toggle Options */}
        {scenarios.map((option) => {
          const isActive = scenario === option.value
          
          return (
            <button
              key={option.value}
              onClick={() => onScenarioChange(option.value)}
              style={{
                position: 'relative',
                flex: 1,
                padding: 'var(--space-2) var(--space-3)',
                fontSize: 'var(--font-size-sm)',
                fontWeight: 'var(--font-weight-medium)',
                color: isActive ? 'var(--bg)' : 'var(--text-secondary)',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
                transition: 'all var(--transition-normal)',
                zIndex: 1
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
      
      {/* Scenario Hint */}
      <div 
        style={{
          marginTop: 'var(--space-3)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--text-muted)',
          lineHeight: 'var(--line-height-normal)'
        }}
      >
        {scenario === 'base' 
          ? 'Conservative market estimates'
          : 'Optimistic market conditions'
        }
      </div>
    </div>
  )
}