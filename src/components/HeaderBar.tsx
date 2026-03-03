interface HeaderBarProps {
  title?: string
  subtitle?: string
  stats?: {
    dates: number
    markets: number
  }
  onOverviewClick?: () => void
}

export function HeaderBar({ 
  title = "WORLD TOUR 2026-2027",
  subtitle = "Premium Experience",
  stats = { dates: 2, markets: 2 },
  onOverviewClick
}: HeaderBarProps) {
  return (
    <div className="header-container">
      {/* Main Title Header */}
      <div className="main-header">
        <h1 className="main-title">{title}</h1>
        <p className="main-subtitle">{subtitle}</p>
      </div>
      
      {/* Stats and Controls Section */}
      <div className="header-stats">
        {/* Overview Button */}
        <button 
          className="overview-button"
          onClick={onOverviewClick}
          title="View entire tour route"
        >
          Overview
        </button>
        
        {/* Stats */}
        <div className="stat-chip">
          Dates
          <span className="stat-chip-value">{stats.dates}</span>
        </div>
        <div className="stat-chip">
          Markets
          <span className="stat-chip-value">{stats.markets}</span>
        </div>
      </div>
    </div>
  )
}