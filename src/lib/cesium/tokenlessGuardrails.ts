/**
 * Tokenless mode guardrails - dev only.
 * Warns if Ion token is set or any request hits Cesium Ion domains.
 */
const ION_DOMAINS = ['api.cesium.com', 'ion.cesium.com']

function checkIonToken(): void {
  const Cesium = (window as unknown as { Cesium?: { Ion?: { defaultAccessToken?: string } } }).Cesium
  if (Cesium?.Ion?.defaultAccessToken) {
    console.warn(
      '⚠️ [Tokenless] Cesium.Ion.defaultAccessToken is set. This app uses tokenless providers only. Remove it.'
    )
  }
}

/** Run token check after Cesium may have loaded (async import). */
function scheduleTokenCheck(): void {
  checkIonToken()
  setTimeout(checkIonToken, 2000)
}

function patchFetch(): void {
  const originalFetch = window.fetch
  window.fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url
    for (const domain of ION_DOMAINS) {
      if (url.includes(domain)) {
        console.warn(`⚠️ [Tokenless] Request to Cesium Ion detected: ${url}`)
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
