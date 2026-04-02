import { useArtist } from '../context/ArtistContext'

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
  title,
  subtitle,
  stats = { dates: 2, markets: 2 },
  onOverviewClick
}: HeaderBarProps) {
  const { artist } = useArtist()
  const displayTitle = title ?? artist.title
  const displaySubtitle = subtitle ?? artist.subtitle

  const isArtist = !!artist.slug

  return (
    <div className="header-container">
      {/* Main Title Header */}
      <div className="main-header">
        {isArtist && (
          <div className="artist-wordmark">{artist.name}</div>
        )}
        <h1 className="main-title">{displayTitle}</h1>
        {displaySubtitle && <p className="main-subtitle">{displaySubtitle}</p>}
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