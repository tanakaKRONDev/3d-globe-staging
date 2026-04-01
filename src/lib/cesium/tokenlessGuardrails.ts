/**
 * Tokenless mode guardrails - dev only.
 * Warns if Ion token is set or any request hits Cesium Ion / paid tile domains.
 */
const BANNED_DOMAINS = [
  'api.cesium.com',
  'ion.cesium.com',
  'assets.cesium.com',
  'api.mapbox.com',
  'api.maptiler.com',
  'maps.googleapis.com',
  'tiles.virtualearth.net',
]

function checkIonToken(): void {
  const Cesium = (window as unknown as { Cesium?: { Ion?: { defaultAccessToken?: string } } }).Cesium
  if (Cesium?.Ion?.defaultAccessToken) {
    console.warn(
      '⚠️ [Tokenless] Cesium.Ion.defaultAccessToken is set. This app uses tokenless providers only. Remove it.'
    )
  }
}

/** Trap future writes to Ion.defaultAccessToken so we catch assignment at any time. */
function trapTokenSetter(): void {
  const Cesium = (window as unknown as { Cesium?: { Ion?: Record<string, unknown> } }).Cesium
  const ion = Cesium?.Ion
  if (!ion) return
  let current = ion.defaultAccessToken as string | undefined
  try {
    Object.defineProperty(ion, 'defaultAccessToken', {
      get() { return current },
      set(v: string) {
        current = v
        if (v) {
          console.warn(
            '⚠️ [Tokenless] Something set Cesium.Ion.defaultAccessToken. This app must stay tokenless.'
          )
        }
      },
      configurable: true,
    })
  } catch { /* property may not be configurable in some builds */ }
}

/** Run token check after Cesium may have loaded (async import). */
function scheduleTokenCheck(): void {
  checkIonToken()
  setTimeout(() => {
    checkIonToken()
    trapTokenSetter()
  }, 2000)
}

function patchFetch(): void {
  const originalFetch = window.fetch
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    for (const domain of BANNED_DOMAINS) {
      if (url.includes(domain)) {
        console.warn(`⚠️ [Tokenless] Request to paid/Ion service detected: ${url}`)
        break
      }
    }
    return originalFetch.call(window, input, init)
  }
}

export function installTokenlessGuardrails(): void {
  if (import.meta.env.DEV) {
    scheduleTokenCheck()
    patchFetch()
  }
}
