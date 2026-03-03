/**
 * Password gate for the 3D Globe landing page.
 * Uses HTTP Basic Auth at the Worker level.
 * Password must be set via Cloudflare secret: SITE_PASSWORD
 */

const encoder = new TextEncoder()

function timingSafeEqual(a, b) {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) {
    return !crypto.subtle.timingSafeEqual(aBytes, aBytes)
  }
  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}

function unauthorized() {
  return new Response('Unauthorized', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Internal"' },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response('OK', { status: 200 })
    }

    if (request.method === 'GET' && url.pathname === '/api/stops') {
      try {
        const { results } = await env.DB.prepare(
          `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes
           FROM stops
           ORDER BY stop_order ASC`
        ).all()
        return new Response(JSON.stringify(results ?? []), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=60',
          },
        })
      } catch (err) {
        console.error('[api/stops]', err)
        return new Response(JSON.stringify({ error: 'Failed to fetch stops' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }

    const PASS = env.SITE_PASSWORD
    if (!PASS) {
      return new Response('Site password not configured. Set SITE_PASSWORD secret.', { status: 500 })
    }

    const auth = request.headers.get('Authorization')
    if (!auth || !auth.startsWith('Basic ')) {
      return unauthorized()
    }

    try {
      const encoded = auth.slice(6)
      const decoded = atob(encoded)
      const colonIndex = decoded.indexOf(':')
      if (colonIndex === -1) return unauthorized()
      const pass = decoded.slice(colonIndex + 1)
      if (!timingSafeEqual(pass, PASS)) {
        return unauthorized()
      }
    } catch {
      return unauthorized()
    }

    return env.ASSETS.fetch(request)
  },
}
