export type LoadingStage = 'boot' | 'data' | 'imagery' | 'viewer' | 'finalizing' | 'ready'

interface PremiumLoaderProps {
  stage: LoadingStage
  message?: string
  progress: number
  show: boolean
}

export function PremiumLoader({ show }: PremiumLoaderProps) {
  if (!show) return null

  return (
    <div className="premium-loader premium-loader--minimal">
      <div className="premium-loader__background" />
      <div className="premium-loader__minimal-content">
        <div className="premium-loader__minimal-spinner" />
        <span className="premium-loader__minimal-text">Loading globe…</span>
      </div>
    </div>
  )
}