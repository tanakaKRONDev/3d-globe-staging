/**
 * Site gate: branded HTML login + cookie (SITE_PASSWORD, SITE_AUTH_SECRET).
 * Admin: /admin and /api/admin/* use ADMIN_PASSWORD only (no site gate).
 * Secrets: SITE_PASSWORD, SITE_AUTH_SECRET, ADMIN_PASSWORD (wrangler secret put)
 */

const encoder = new TextEncoder()
const ADMIN_COOKIE = 'admin_session'
const SESSION_MAX_AGE_SEC = 12 * 60 * 60 // 12 hours
const SITE_AUTH_COOKIE = 'site_auth'

function timingSafeEqual(a, b) {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) {
    return !crypto.subtle.timingSafeEqual(aBytes, aBytes)
  }
  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}

function adminUnauthorized() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function getAdminSigningKey(env) {
  const secret = env.ADMIN_PASSWORD || ''
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

/** Returns signed token string: expirationMs.hex(signature) */
async function signAdminToken(env) {
  const exp = Date.now() + SESSION_MAX_AGE_SEC * 1000
  const key = await getAdminSigningKey(env)
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(exp)))
  const hex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${exp}.${hex}`
}

/** Returns true if token is valid and not expired */
async function verifyAdminToken(env, token) {
  if (!token || typeof token !== 'string') return false
  const dot = token.indexOf('.')
  if (dot === -1) return false
  const exp = parseInt(token.slice(0, dot), 10)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const key = await getAdminSigningKey(env)
  const expectedSig = await crypto.subtle.sign('HMAC', key, encoder.encode(String(exp)))
  const expectedHex = Array.from(new Uint8Array(expectedSig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  const actualHex = token.slice(dot + 1)
  if (expectedHex.length !== actualHex.length) return false
  const expectedBytes = new Uint8Array(expectedHex.length / 2)
  const actualBytes = new Uint8Array(actualHex.length / 2)
  for (let i = 0; i < expectedBytes.length; i++) {
    expectedBytes[i] = parseInt(expectedHex.slice(i * 2, i * 2 + 2), 16)
    actualBytes[i] = parseInt(actualHex.slice(i * 2, i * 2 + 2), 16)
  }
  return crypto.subtle.timingSafeEqual(expectedBytes, actualBytes)
}

function getAdminSessionCookie(request) {
  const raw = request.headers.get('Cookie')
  if (!raw) return null
  const match = raw.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`))
  return match ? decodeURIComponent(match[1].trim()) : null
}

function sessionCookieHeader(value, request) {
  const isSecure = new URL(request.url).protocol === 'https:'
  let s = `${ADMIN_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${SESSION_MAX_AGE_SEC}; SameSite=Lax`
  if (isSecure) s += '; Secure'
  return s
}

// --- Site auth: WebCrypto-only cookie signing (no Node APIs) ---
function b64urlEncode(bytes) {
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function b64urlDecode(str) {
  str = str.replaceAll('-', '+').replaceAll('_', '/')
  while (str.length % 4) str += '='
  const bin = atob(str)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function signToken(secret, payloadObj) {
  const payloadJson = JSON.stringify(payloadObj)
  const payloadBytes = new TextEncoder().encode(payloadJson)
  const payload = b64urlEncode(payloadBytes)
  const key = await hmacKey(secret)
  const sigBytes = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  )
  const sig = b64urlEncode(sigBytes)
  return `${payload}.${sig}`
}

async function verifyToken(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null
  const [payloadB64, sig] = token.split('.', 2)
  const key = await hmacKey(secret)
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlDecode(sig),
      new TextEncoder().encode(payloadB64)
    )
    if (!ok) {
      console.error('[auth] bad signature')
      return null
    }
    const payloadJson = new TextDecoder().decode(b64urlDecode(payloadB64))
    return JSON.parse(payloadJson)
  } catch (e) {
    console.error('[auth] verify failed', e)
    return null
  }
}

function getSiteAuthCookie(request) {
  const raw = request.headers.get('Cookie')
  if (!raw) return null
  const match = raw.match(new RegExp(`${SITE_AUTH_COOKIE}=([^;]+)`))
  return match ? decodeURIComponent(match[1].trim()) : null
}

const SITE_AUTH_MAX_AGE_SEC_NUM = 604800 // 7 days

function siteAuthCookieHeader(value, request) {
  const isSecure = new URL(request.url).protocol === 'https:'
  let s = `${SITE_AUTH_COOKIE}=${encodeURIComponent(value)}; HttpOnly; Path=/; Max-Age=${SITE_AUTH_MAX_AGE_SEC_NUM}; SameSite=Lax`
  if (isSecure) s += '; Secure'
  return s
}

function clearSiteAuthCookie(request) {
  const isSecure = new URL(request.url).protocol === 'https:'
  let s = `${SITE_AUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`
  if (isSecure) s += '; Secure'
  return s
}

/** Branded login page HTML (same look as /admin). Never throws; no external deps. */
function loginPageHtml(returnTo, error) {
  const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo.replace(/"/g, '&quot;')
    : '/'
  const returnToAttr = ` value="${safeReturn}"`
  const errorHtml = error
    ? `<p class="site-login__error">${String(error).replace(/</g, '&lt;').replace(/&/g, '&amp;')}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sign in – WORLD TOUR 2026-2027</title>
  <style>
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; padding: 0; }
    body {
      font-family: "Roboto", system-ui, -apple-system, "Segoe UI", Arial, sans-serif;
      background: #070A0F;
      color: rgba(255,255,255,0.88);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      -webkit-font-smoothing: antialiased;
    }
    .site-login__card {
      background: rgba(12, 16, 24, 0.62);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.75rem;
      padding: 1.5rem;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    }
    .site-login__title { font-size: 1.5rem; font-weight: 600; margin: 0 0 0.25rem 0; letter-spacing: -0.025em; }
    .site-login__sub { color: rgba(255,255,255,0.45); font-size: 0.875rem; margin: 0 0 1.25rem 0; }
    .site-login__form { display: flex; flex-direction: column; gap: 1rem; }
    .site-login__label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.875rem; color: rgba(255,255,255,0.65); }
    .site-login__input {
      padding: 0.5rem 0.75rem;
      font-size: 1rem;
      font-family: inherit;
      color: rgba(255,255,255,0.88);
      background: #0A0E15;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 0.5rem;
    }
    .site-login__input:focus { outline: none; border-color: rgba(255,255,255,0.16); }
    .site-login__btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-family: inherit;
      font-weight: 500;
      background: #E7D1A7;
      color: #070A0F;
      border: none;
      border-radius: 0.5rem;
      cursor: pointer;
    }
    .site-login__btn:hover { background: #D4C1A0; }
    .site-login__error { color: rgba(239,68,68,0.95); font-size: 0.875rem; margin: 0; }
  </style>
</head>
<body>
  <div class="site-login__card">
    <h1 class="site-login__title">WORLD TOUR 2026-2027</h1>
    <p class="site-login__sub">Internal Access</p>
    <form class="site-login__form" method="post" action="/auth/login">
      <input type="hidden" name="returnTo"${returnToAttr} />
      <label class="site-login__label">
        Password
        <input type="password" name="password" class="site-login__input" autocomplete="current-password" autofocus />
      </label>
      ${errorHtml}
      <button type="submit" class="site-login__btn">Enter</button>
    </form>
  </div>
</body>
</html>`
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

/**
 * Validate stop payload for create/update.
 * Required: address, lat, lng; lat in [-90,90], lng in [-180,180]; order integer.
 * Returns { ok: false, status, error } or { ok: true, data } with sanitized row fields.
 */
function validateStopPayload(body, isUpdate) {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Invalid JSON body' }
  }
  const lat = body.lat != null ? Number(body.lat) : NaN
  const lng = body.lng != null ? Number(body.lng) : NaN
  if (body.address == null || body.address === '') {
    return { ok: false, status: 400, error: 'address is required' }
  }
  if (lat !== lat || !Number.isFinite(lat)) {
    return { ok: false, status: 400, error: 'lat is required and must be a number' }
  }
  if (lat < -90 || lat > 90) {
    return { ok: false, status: 400, error: 'lat must be between -90 and 90' }
  }
  if (lng !== lng || !Number.isFinite(lng)) {
    return { ok: false, status: 400, error: 'lng is required and must be a number' }
  }
  if (lng < -180 || lng > 180) {
    return { ok: false, status: 400, error: 'lng must be between -180 and 180' }
  }
  const order = body.order != null ? parseInt(body.order, 10) : NaN
  if (order !== order || !Number.isInteger(order)) {
    return { ok: false, status: 400, error: 'order must be an integer' }
  }
  const address = String(body.address ?? '').trim()
  const timeline = body.timeline != null ? String(body.timeline) : null
  const notes = body.notes != null ? String(body.notes) : null
  const city = body.city != null ? String(body.city).trim() : ''
  const country = body.country != null ? String(body.country).trim() : ''
  const venue = body.venue != null ? String(body.venue).trim() : ''
  if (!city) return { ok: false, status: 400, error: 'city is required' }
  if (!country) return { ok: false, status: 400, error: 'country is required' }
  if (!venue) return { ok: false, status: 400, error: 'venue is required' }
  if (!isUpdate) {
    const id = body.id != null ? String(body.id).trim() : ''
    if (!id) return { ok: false, status: 400, error: 'id is required' }
    return {
      ok: true,
      data: {
        id,
        stop_order: order,
        city,
        country,
        venue,
        address,
        lat,
        lng,
        timeline: timeline || null,
        notes: notes || null,
      },
    }
  }
  return {
    ok: true,
    data: {
      stop_order: order,
      city,
      country,
      venue,
      address,
      lat,
      lng,
      timeline: timeline || null,
      notes: notes || null,
    },
  }
}

/** Paths that skip site gate (no recursion into gate). */
function skipSiteGate(pathname) {
  return (
    pathname === '/auth/login' ||
    pathname === '/auth/logout' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/api/admin')
  )
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)

      if (url.pathname === '/health') {
        return new Response('OK', { status: 200 })
      }

      // GET /auth/login: always return HTML, never throw, no env/crypto
      if (url.pathname === '/auth/login' && request.method === 'GET') {
        const returnTo = url.searchParams.get('returnTo') || '/'
        return new Response(loginPageHtml(returnTo, null), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      // --- Admin API (session cookie auth); skip site gate ---
    if (url.pathname.startsWith('/api/admin/')) {
      const isLogin = url.pathname === '/api/admin/login' && request.method === 'POST'

      if (isLogin) {
        if (!env.ADMIN_PASSWORD) {
          return new Response(JSON.stringify({ error: 'Admin not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        let body
        try {
          body = await request.json()
        } catch {
          return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const password = body && body.password != null ? String(body.password) : ''
        if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) {
          return adminUnauthorized()
        }
        const token = await signAdminToken(env)
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': sessionCookieHeader(token, request),
          },
        })
      }

      // All other /api/admin/* require valid session
      const cookie = getAdminSessionCookie(request)
      if (!cookie || !(await verifyAdminToken(env, cookie))) {
        return adminUnauthorized()
      }

      // --- Admin stops CRUD ---
      const adminStopsMatch = url.pathname.match(/^\/api\/admin\/stops\/?(.*)$/)
      if (adminStopsMatch) {
        const idSuffix = adminStopsMatch[1] // '' or 'some-id'
        const hasId = idSuffix.length > 0
        const id = hasId ? decodeURIComponent(idSuffix) : null

        if (request.method === 'GET' && !hasId) {
          try {
            const { results } = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes
               FROM stops
               ORDER BY stop_order ASC`
            ).all()
            return jsonResponse(results ?? [])
          } catch (err) {
            console.error('[api/admin/stops]', err)
            return jsonResponse({ error: 'Failed to fetch stops' }, 500)
          }
        }

        if (request.method === 'POST' && !hasId) {
          let body
          try {
            body = await request.json()
          } catch {
            return jsonResponse({ error: 'Invalid JSON' }, 400)
          }
          const v = validateStopPayload(body, false)
          if (!v.ok) return jsonResponse({ error: v.error }, v.status)
          const d = v.data
          try {
            await env.DB.prepare(
              `INSERT INTO stops (id, stop_order, city, country, venue, address, lat, lng, timeline, notes, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(d.id, d.stop_order, d.city, d.country, d.venue, d.address, d.lat, d.lng, d.timeline, d.notes).run()
            const row = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes FROM stops WHERE id = ?`
            ).bind(d.id).first()
            return jsonResponse(row ?? { id: d.id, order: d.stop_order, city: d.city, country: d.country, venue: d.venue, address: d.address, lat: d.lat, lng: d.lng, timeline: d.timeline, notes: d.notes })
          } catch (err) {
            if (err && err.message && /UNIQUE|primary key/i.test(err.message)) {
              return jsonResponse({ error: 'A stop with this id already exists' }, 409)
            }
            console.error('[api/admin/stops POST]', err)
            return jsonResponse({ error: 'Failed to create stop' }, 500)
          }
        }

        if (request.method === 'PUT' && hasId && id) {
          let body
          try {
            body = await request.json()
          } catch {
            return jsonResponse({ error: 'Invalid JSON' }, 400)
          }
          const v = validateStopPayload(body, true)
          if (!v.ok) return jsonResponse({ error: v.error }, v.status)
          const d = v.data
          try {
            const info = await env.DB.prepare(
              `UPDATE stops SET stop_order = ?, city = ?, country = ?, venue = ?, address = ?, lat = ?, lng = ?, timeline = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(d.stop_order, d.city, d.country, d.venue, d.address, d.lat, d.lng, d.timeline, d.notes, id).run()
            if (info.meta.changes === 0) {
              return jsonResponse({ error: 'Stop not found' }, 404)
            }
            const row = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes FROM stops WHERE id = ?`
            ).bind(id).first()
            return jsonResponse(row)
          } catch (err) {
            console.error('[api/admin/stops PUT]', err)
            return jsonResponse({ error: 'Failed to update stop' }, 500)
          }
        }

        if (request.method === 'DELETE' && hasId && id) {
          try {
            const info = await env.DB.prepare(`DELETE FROM stops WHERE id = ?`).bind(id).run()
            if (info.meta.changes === 0) {
              return jsonResponse({ error: 'Stop not found' }, 404)
            }
            return jsonResponse({ ok: true })
          } catch (err) {
            console.error('[api/admin/stops DELETE]', err)
            return jsonResponse({ error: 'Failed to delete stop' }, 500)
          }
        }

        return jsonResponse({ error: 'Not Found' }, 404)
      }

      return jsonResponse({ error: 'Not Found' }, 404)
    }

      // POST /auth/login and /auth/logout (GET /auth/login already handled above)
      if (url.pathname === '/auth/login' && request.method === 'POST') {
        const SITE_PASSWORD = env.SITE_PASSWORD
        const SITE_AUTH_SECRET = env.SITE_AUTH_SECRET
        if (!SITE_PASSWORD || !SITE_AUTH_SECRET) {
          console.error('[auth] missing SITE_PASSWORD or SITE_AUTH_SECRET')
          return new Response('Missing SITE_PASSWORD or SITE_AUTH_SECRET', { status: 500 })
        }
        let password = ''
        let returnTo = '/'
        const ct = (request.headers.get('Content-Type') || '').toLowerCase()
        if (ct.includes('application/json')) {
          try {
            const body = await request.json()
            password = body && body.password != null ? String(body.password) : ''
            returnTo = body && body.returnTo != null ? String(body.returnTo) : '/'
          } catch {
            return new Response(loginPageHtml('/', 'Invalid request'), {
              status: 400,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            })
          }
        } else {
          const body = await request.text()
          const params = new URLSearchParams(body)
          password = params.get('password') || ''
          returnTo = params.get('returnTo') || '/'
        }
        const safeReturn = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/'
        if (!timingSafeEqual(password, SITE_PASSWORD)) {
          return new Response(loginPageHtml(safeReturn, 'Invalid password'), {
            status: 401,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        }
        const iat = Math.floor(Date.now() / 1000)
        const exp = iat + SITE_AUTH_MAX_AGE_SEC_NUM
        let token
        try {
          token = await signToken(SITE_AUTH_SECRET, { iat, exp })
        } catch (e) {
          console.error('[auth] signToken failed', e)
          return new Response('Worker error. Check logs.', { status: 500 })
        }
        const dest = new URL(safeReturn, url.origin)
        return new Response(null, {
          status: 302,
          headers: {
            Location: dest.toString(),
            'Set-Cookie': siteAuthCookieHeader(token, request),
          },
        })
      }
      if (url.pathname === '/auth/logout' && (request.method === 'POST' || request.method === 'GET')) {
        const dest = new URL('/auth/login', url.origin)
        return new Response(null, {
          status: 302,
          headers: {
            Location: dest.toString(),
            'Set-Cookie': clearSiteAuthCookie(request),
          },
        })
      }

      // Skip site gate: /admin (frontend SPA; /api/admin/* already handled above)
      if (url.pathname.startsWith('/admin')) {
        return env.ASSETS.fetch(request)
      }

      // Site gate: require valid site_auth cookie (skip /auth/login, /auth/logout, /admin, /api/admin)
      const SITE_AUTH_SECRET = env.SITE_AUTH_SECRET
      if (!SITE_AUTH_SECRET) {
        console.error('[auth] missing SITE_AUTH_SECRET for site gate')
        return new Response('Missing SITE_AUTH_SECRET', { status: 500 })
      }
      const siteCookie = getSiteAuthCookie(request)
      let siteValid = false
      if (siteCookie) {
        const payload = await verifyToken(SITE_AUTH_SECRET, siteCookie)
        const now = Math.floor(Date.now() / 1000)
        if (payload && typeof payload.exp === 'number' && payload.exp > now) {
          siteValid = true
        }
      }
      if (!siteValid) {
        if (url.pathname.startsWith('/api/')) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }
        const returnTo = url.pathname + url.search
        return new Response(loginPageHtml(returnTo || '/', null), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        })
      }

      // Gated: GET /api/stops
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

      return env.ASSETS.fetch(request)
    } catch (err) {
      console.error('[auth] fatal', err)
      return new Response('Worker error. Check logs.', { status: 500 })
    }
  },
}
