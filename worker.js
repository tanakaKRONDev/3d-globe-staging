/**
 * Site gate: branded HTML login + cookie (SITE_PASSWORD, SITE_AUTH_SECRET).
 * Admin: /admin and /api/admin/* use ADMIN_PASSWORD only (no site gate).
 * Secrets: SITE_PASSWORD, SITE_AUTH_SECRET, ADMIN_PASSWORD (wrangler secret put)
 */

const encoder = new TextEncoder()
const ADMIN_COOKIE = 'admin_session'
const SESSION_MAX_AGE_SEC = 12 * 60 * 60 // 12 hours
const SITE_AUTH_COOKIE = 'site_auth'

/** Fallback branding (mirrors src/config/defaults.ts). */
const DEFAULT_TITLE = 'WORLD TOUR 2026-2027'

/** Default branding payload returned when no artist is resolved. */
const DEFAULT_BRANDING = {
  slug: null,
  name: 'Platform',
  title: DEFAULT_TITLE,
  subtitle: 'Premium Experience',
  accentColor: '#E7D1A7',
  accentMuted: '#D4C1A0',
  accentDark: '#C1AE8D',
  logoUrl: null,
}

/**
 * Parse hostname to determine site context.
 * Returns { type: 'platform'|'admin'|'artist', artistSlug?: string }
 *
 * Rules:
 *   - localhost / 127.0.0.1 / *.workers.dev / bare domain => platform
 *   - admin.domain.com => admin
 *   - <slug>.domain.com => artist (slug extracted)
 *   - ?artist=<slug> query param override (dev convenience)
 */
function parseHostContext(url) {
  const hostname = url.hostname

  // Dev override via query param (works on localhost / workers.dev)
  const artistParam = url.searchParams.get('artist')
  if (artistParam && /^[a-z0-9-]+$/.test(artistParam)) {
    return { type: 'artist', artistSlug: artistParam }
  }

  // localhost / IP / workers.dev => platform (no subdomain logic)
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.endsWith('.workers.dev')
  ) {
    return { type: 'platform' }
  }

  // Count domain parts: "sub.example.com" => 3 parts
  const parts = hostname.split('.')
  if (parts.length <= 2) {
    // bare domain like "example.com" => platform
    return { type: 'platform' }
  }

  // Subdomain is the first part
  const sub = parts[0].toLowerCase()
  if (sub === 'admin') return { type: 'admin' }
  if (sub === 'www') return { type: 'platform' }

  // Any other subdomain is treated as an artist slug
  return { type: 'artist', artistSlug: sub }
}

/**
 * Resolve artist branding from DB by slug.
 * Returns branding payload object, or null if not found.
 */
async function resolveArtistBranding(DB, slug) {
  if (!DB || !slug) return null
  try {
    const row = await DB.prepare(
      `SELECT id, slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url FROM artists WHERE slug = ?`
    ).bind(slug).first()
    if (!row) return null
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      title: row.title,
      subtitle: row.subtitle || null,
      accentColor: row.accent_color,
      accentMuted: row.accent_muted || null,
      accentDark: row.accent_dark || null,
      logoUrl: row.logo_url || null,
    }
  } catch (err) {
    console.error('[resolveArtistBranding]', err)
    return null
  }
}

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

/**
 * Parse logs time range: fromMs/toMs (integers) or from/to (ISO strings).
 * Returns { ok: true, fromMs, toMs } or { ok: false } for 400.
 */
function parseLogsTimeRange(searchParams) {
  const now = Date.now()
  const defaultFrom = now - 24 * 60 * 60 * 1000
  let fromMs = null
  let toMs = null

  const fromMsParam = searchParams.get('fromMs')
  const toMsParam = searchParams.get('toMs')
  if (fromMsParam != null && fromMsParam !== '') {
    const n = parseInt(fromMsParam, 10)
    if (Number.isInteger(n) && Number.isFinite(n)) fromMs = n
  }
  if (toMsParam != null && toMsParam !== '') {
    const n = parseInt(toMsParam, 10)
    if (Number.isInteger(n) && Number.isFinite(n)) toMs = n
  }

  function parseTimeString(s) {
    if (!s || typeof s !== 'string') return null
    s = s.trim()
    if (!s) return null
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s = s + ':00'
    if (!s.endsWith('Z') && !/[-+]\d{2}:?\d{2}$/.test(s)) s = s + 'Z'
    const ms = Date.parse(s)
    return Number.isFinite(ms) ? ms : null
  }

  const fromParam = searchParams.get('from')
  const toParam = searchParams.get('to')
  if (fromMs == null && fromParam != null && fromParam !== '') {
    fromMs = parseTimeString(fromParam)
    if (fromMs == null) return { ok: false }
  }
  if (toMs == null && toParam != null && toParam !== '') {
    toMs = parseTimeString(toParam)
    if (toMs == null) return { ok: false }
  }

  if (fromMs == null) fromMs = defaultFrom
  if (toMs == null) toMs = now
  if (fromMs > toMs) return { ok: false }
  return { ok: true, fromMs, toMs }
}

function msToSqliteDatetime(ms) {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const sec = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}-${m}-${day} ${h}:${min}:${sec}`
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

/** Set admin_session cookie. Do NOT set Domain so it works on both *.workers.dev and production. */
function sessionCookieHeader(value, request) {
  const isSecure = new URL(request.url).protocol === 'https:'
  const s = `${ADMIN_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`
  return isSecure ? s : s.replace('; Secure', '')
}

/** Clear admin_session cookie (for logout). */
function clearAdminSessionCookie() {
  return `${ADMIN_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`
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

/** Branded login page HTML (same layout as React AuthShell/AuthCard). Never throws; no external deps. */
function loginPageHtml(returnTo, error) {
  const safeReturn = typeof returnTo === 'string' && returnTo.startsWith('/') && !returnTo.startsWith('//')
    ? returnTo.replace(/"/g, '&quot;')
    : '/'
  const returnToAttr = ` value="${safeReturn}"`
  const errorHtml = error
    ? `<p class="auth-card__error">${String(error).replace(/</g, '&lt;').replace(/&/g, '&amp;')}</p>`
    : ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Sign in – ${DEFAULT_TITLE}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box}
    html,body{height:100%;margin:0;padding:0}
    .auth-shell{
      position:fixed;inset:0;display:flex;align-items:center;justify-content:center;
      padding:24px;padding-top:calc(24px + env(safe-area-inset-top,0));padding-bottom:calc(24px + env(safe-area-inset-bottom,0));
      padding-left:calc(24px + env(safe-area-inset-left,0));padding-right:calc(24px + env(safe-area-inset-right,0));
      background:#070a0f;background-image:radial-gradient(ellipse 80% 50% at 50% 0%,rgba(12,16,24,0.6),transparent),radial-gradient(ellipse 60% 40% at 100% 100%,rgba(12,16,24,0.4),transparent);
      font-family:"Roboto",system-ui,-apple-system,"Segoe UI",Arial,sans-serif;-webkit-font-smoothing:antialiased
    }
    .auth-card{max-width:420px;width:100%;background:rgba(12,16,24,0.62);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);
      border:1px solid rgba(255,255,255,0.08);border-radius:0.75rem;padding:24px;box-shadow:0 8px 32px rgba(0,0,0,0.4)}
    .auth-card__title{font-size:1.5rem;font-weight:600;letter-spacing:-0.025em;margin:0 0 0.25rem 0;color:rgba(255,255,255,0.88)}
    .auth-card__subtitle{font-size:0.875rem;color:rgba(255,255,255,0.45);margin:0 0 1.25rem 0}
    .auth-card__body{display:flex;flex-direction:column;gap:1rem}
    .auth-card__form{display:flex;flex-direction:column;gap:1rem}
    .auth-card__error{color:rgba(239,68,68,0.95);font-size:0.875rem;margin:0}
    .auth-label{display:flex;flex-direction:column;gap:0.25rem;font-size:0.875rem;color:rgba(255,255,255,0.65)}
    .auth-input{padding:0.5rem 0.75rem;font-size:1rem;font-family:inherit;color:rgba(255,255,255,0.88);background:#0a0e15;
      border:1px solid rgba(255,255,255,0.08);border-radius:0.5rem;width:100%}
    .auth-input:focus{outline:none;border-color:rgba(255,255,255,0.16)}
    .auth-btn{padding:0.5rem 1rem;font-size:0.875rem;font-family:inherit;font-weight:500;background:#e7d1a7;color:#070a0f;
      border:none;border-radius:0.5rem;cursor:pointer}
    .auth-btn:hover{background:#d4c1a0}
    @media(max-width:640px){
      .auth-shell{padding:14px;padding-top:calc(14px + env(safe-area-inset-top,0));padding-bottom:calc(14px + env(safe-area-inset-bottom,0));
        padding-left:calc(14px + env(safe-area-inset-left,0));padding-right:calc(14px + env(safe-area-inset-right,0))}
      .auth-card{width:100%;max-width:100%;border-radius:1rem;padding:20px}
      .auth-input,.auth-btn{min-height:48px;font-size:16px}
      .auth-btn{padding:0.75rem 1rem}
    }
  </style>
</head>
<body>
  <div class="auth-shell">
    <div class="auth-card">
      <h1 class="auth-card__title">${DEFAULT_TITLE}</h1>
      <p class="auth-card__subtitle">Internal Access</p>
      <div class="auth-card__body">
        <form class="auth-card__form" method="post" action="/auth/login">
          <input type="hidden" name="returnTo"${returnToAttr} />
          <label class="auth-label">Password
            <input type="password" name="password" class="auth-input" autocomplete="current-password" autofocus />
          </label>
          <button type="submit" class="auth-btn">Enter</button>
        </form>
        ${errorHtml}
      </div>
    </div>
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
  const countryRaw = body.country != null ? String(body.country).trim() : ''
  const country = countryRaw.toUpperCase()
  const venue = body.venue != null ? String(body.venue).trim() : ''
  if (!city) return { ok: false, status: 400, error: 'city is required' }
  if (!country) return { ok: false, status: 400, error: 'country is required' }
  if (country.length !== 2) {
    return { ok: false, status: 400, error: 'country must be a 2-letter ISO code (e.g. US, GB)' }
  }
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

/** Client IP: prefer cf-connecting-ip, fallback x-forwarded-for; sanitize (trim, first if comma-separated). */
function getClientIp(request) {
  const cf = request.headers.get('cf-connecting-ip')
  if (cf != null && typeof cf === 'string') {
    const trimmed = cf.trim()
    if (trimmed) return trimmed
  }
  const xff = request.headers.get('x-forwarded-for')
  if (xff == null || typeof xff !== 'string') return null
  const first = xff.split(',')[0]
  const ip = first != null ? first.trim() : ''
  return ip || null
}

/** Block scope for IP from ip_blocks. Returns 'admin'|'all'|null. */
async function getBlockScope(DB, ip) {
  if (!ip || !DB) return null
  try {
    const row = await DB.prepare('SELECT scope FROM ip_blocks WHERE ip = ?').bind(ip).first()
    if (!row || (row.scope !== 'admin' && row.scope !== 'all')) return null
    return row.scope
  } catch (err) {
    console.error('[getBlockScope]', err)
    return null
  }
}

function blockedResponse() {
  return new Response('Blocked', { status: 403 })
}

/** True if path looks like an HTML page request (no static asset extension). */
function isPagePath(pathname) {
  return !/\.(js|css|mjs|png|ico|svg|jpg|jpeg|gif|webp|woff2?|ttf|otf|json|map|xml)(\?|$)/i.test(pathname)
}

/** Log page access to D1 (IP stored as-is; optional hashing can be added via env). Fire-and-forget via ctx.waitUntil. */
async function logPageAccess(env, request, url) {
  try {
    const ip = getClientIp(request) || ''
    const country = (request.cf && request.cf.country) || ''
    const region = (request.cf && request.cf.region) || ''
    const city = (request.cf && request.cf.city) || ''
    const userAgent = request.headers.get('user-agent') || ''
    const path = url.pathname + url.search
    const id = crypto.randomUUID()
    await env.DB.prepare(
      `INSERT INTO access_logs (id, created_at, ip, country, region, city, user_agent, path) VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, ip, country, region, city, userAgent, path)
      .run()
  } catch (err) {
    console.error('[access_log]', err)
  }
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url)

      // IP block enforcement (before any routing)
      const clientIp = getClientIp(request)
      if (clientIp && env.DB) {
        const scope = await getBlockScope(env.DB, clientIp)
        if (scope === 'all') return blockedResponse()
        if (scope === 'admin' && (url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/admin'))) {
          return blockedResponse()
        }
      }

      if (url.pathname === '/health') {
        return new Response('OK', { status: 200 })
      }

      // GET /auth/login: always return HTML, never throw, no env/crypto
      if (url.pathname === '/auth/login' && request.method === 'GET') {
        if (env.DB) ctx.waitUntil(logPageAccess(env, request, url))
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

      if (url.pathname === '/api/admin/logout' && (request.method === 'POST' || request.method === 'GET')) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': clearAdminSessionCookie(),
          },
        })
      }

      // All other /api/admin/* require valid session
      const cookie = getAdminSessionCookie(request)
      if (!cookie || !(await verifyAdminToken(env, cookie))) {
        return adminUnauthorized()
      }

      // --- Admin current IP (for lockout-prevention UI) ---
      if (url.pathname === '/api/admin/me' && request.method === 'GET') {
        const ip = getClientIp(request)
        return jsonResponse({ ip: ip != null ? ip : null })
      }

      // --- Snapshot helper (keep last 20) ---
      async function saveStopsSnapshot(env) {
        try {
          const { results: stops } = await env.DB.prepare(
            `SELECT id, stop_order, city, country, venue, address, lat, lng, timeline, notes FROM stops ORDER BY stop_order ASC`
          ).all()
          const snapshot = JSON.stringify(stops ?? [])
          const versionId = crypto.randomUUID()
          await env.DB.prepare(
            `INSERT INTO stop_versions (id, created_at, snapshot_json) VALUES (?, datetime('now'), ?)`
          )
            .bind(versionId, snapshot)
            .run()
          const { results: rows } = await env.DB.prepare(
            `SELECT id FROM stop_versions ORDER BY created_at DESC LIMIT 20`
          ).all()
          const keepIds = (rows ?? []).map((r) => r.id)
          if (keepIds.length > 0) {
            const placeholders = keepIds.map(() => '?').join(',')
            await env.DB.prepare(
              `DELETE FROM stop_versions WHERE id NOT IN (${placeholders})`
            )
              .bind(...keepIds)
              .run()
          }
        } catch (err) {
          console.error('[saveStopsSnapshot]', err)
        }
      }

      // --- Admin versions list ---
      if (url.pathname === '/api/admin/versions' && request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare(
            `SELECT id, created_at FROM stop_versions ORDER BY created_at DESC LIMIT 20`
          ).all()
          return jsonResponse(results ?? [])
        } catch (err) {
          console.error('[api/admin/versions]', err)
          return jsonResponse({ error: 'Failed to fetch versions' }, 500)
        }
      }

      // --- Admin access logs (default last 24h, include block_scope from ip_blocks, newest first) ---
      if (url.pathname === '/api/admin/logs' && request.method === 'GET') {
        try {
          if (!env.DB) {
            return jsonResponse(
              { error: 'DB binding missing. Check wrangler.toml env.staging.d1_databases binding=DB' },
              500
            )
          }
          const parsed = parseLogsTimeRange(url.searchParams)
          if (!parsed.ok) {
            return jsonResponse({ error: 'Invalid time range' }, 400)
          }
          const { fromMs, toMs } = parsed
          const fromStr = msToSqliteDatetime(fromMs)
          const toStr = msToSqliteDatetime(toMs)
          const query = `SELECT l.created_at AS timestamp, l.ip, l.country, l.region, l.city, l.user_agent AS userAgent, l.path, b.scope AS block_scope
            FROM access_logs l
            LEFT JOIN ip_blocks b ON l.ip = b.ip
            WHERE l.created_at >= ? AND l.created_at <= ?
            ORDER BY l.created_at DESC LIMIT 5000`
          const stmt = env.DB.prepare(query).bind(fromStr, toStr)
          const { results } = await stmt.all()
          const logs = (results ?? []).map((r) => ({
            ...r,
            block_scope: r.block_scope === 'admin' || r.block_scope === 'all' ? r.block_scope : null,
          }))
          return jsonResponse({ logs })
        } catch (err) {
          console.error('[api/admin/logs]', err)
          const msg = err && err.message ? String(err.message) : ''
          if (/no such table:\s*access_logs/i.test(msg)) {
            return jsonResponse(
              { error: 'access_logs table missing. Run: wrangler d1 migrations apply <DB_NAME> --env staging' },
              500
            )
          }
          return jsonResponse(
            { error: 'logs query failed', details: msg || (err != null ? String(err) : 'unknown') },
            500
          )
        }
      }

      // --- Admin blocks: list ---
      if (url.pathname === '/api/admin/blocks' && request.method === 'GET') {
        try {
          const { results } = await env.DB.prepare(
            `SELECT ip, scope, created_at, updated_at, note FROM ip_blocks ORDER BY updated_at DESC`
          ).all()
          return jsonResponse(results ?? [])
        } catch (err) {
          console.error('[api/admin/blocks GET]', err)
          return jsonResponse({ error: 'Failed to fetch blocks' }, 500)
        }
      }

      // --- Admin blocks: upsert (guard: cannot block own IP) ---
      if (url.pathname === '/api/admin/blocks' && request.method === 'POST') {
        let body
        try {
          body = await request.json()
        } catch {
          return jsonResponse({ error: 'Invalid JSON' }, 400)
        }
        const ip = body && typeof body.ip === 'string' ? body.ip.trim() : ''
        const scope = body && body.scope === 'all' ? 'all' : body && body.scope === 'admin' ? 'admin' : null
        const note = body && typeof body.note === 'string' ? body.note : null
        if (!ip) return jsonResponse({ error: 'ip is required' }, 400)
        if (!scope) return jsonResponse({ error: 'scope must be admin or all' }, 400)
        const currentIp = getClientIp(request)
        if (currentIp && ip === currentIp) {
          return jsonResponse({ error: 'Cannot block your current IP' }, 400)
        }
        try {
          const now = Date.now()
          const existing = await env.DB.prepare('SELECT created_at FROM ip_blocks WHERE ip = ?').bind(ip).first()
          if (existing) {
            await env.DB.prepare(
              'UPDATE ip_blocks SET scope = ?, updated_at = ?, note = ? WHERE ip = ?'
            )
              .bind(scope, now, note, ip)
              .run()
          } else {
            await env.DB.prepare(
              'INSERT INTO ip_blocks (ip, scope, created_at, updated_at, note) VALUES (?, ?, ?, ?, ?)'
            )
              .bind(ip, scope, now, now, note)
              .run()
          }
          return jsonResponse({ ok: true })
        } catch (err) {
          console.error('[api/admin/blocks POST]', err)
          return jsonResponse({ error: 'Failed to save block' }, 500)
        }
      }

      // --- Admin blocks: update scope (PUT) or delete (DELETE) by :ip ---
      const blocksIpMatch = url.pathname.match(/^\/api\/admin\/blocks\/(.+)$/)
      if (blocksIpMatch && (request.method === 'PUT' || request.method === 'DELETE')) {
        const ip = decodeURIComponent(blocksIpMatch[1])
        if (!ip) return jsonResponse({ error: 'IP required' }, 400)
        const currentIp = getClientIp(request)
        if (currentIp && ip === currentIp) {
          return jsonResponse({ error: 'Cannot modify block for your current IP' }, 400)
        }
        if (request.method === 'DELETE') {
          try {
            const info = await env.DB.prepare('DELETE FROM ip_blocks WHERE ip = ?').bind(ip).run()
            return jsonResponse({ ok: true, deleted: info.meta.changes > 0 })
          } catch (err) {
            console.error('[api/admin/blocks DELETE]', err)
            return jsonResponse({ error: 'Failed to remove block' }, 500)
          }
        }
        let body
        try {
          body = await request.json()
        } catch {
          return jsonResponse({ error: 'Invalid JSON' }, 400)
        }
        const scope = body && body.scope === 'all' ? 'all' : body && body.scope === 'admin' ? 'admin' : null
        if (!scope) return jsonResponse({ error: 'scope must be admin or all' }, 400)
        try {
          const now = Date.now()
          const info = await env.DB.prepare(
            'UPDATE ip_blocks SET scope = ?, updated_at = ? WHERE ip = ?'
          )
            .bind(scope, now, ip)
            .run()
          if (info.meta.changes === 0) {
            return jsonResponse({ error: 'Block not found' }, 404)
          }
          return jsonResponse({ ok: true })
        } catch (err) {
          console.error('[api/admin/blocks PUT]', err)
          return jsonResponse({ error: 'Failed to update block' }, 500)
        }
      }

      // --- Admin rollback ---
      const rollbackMatch = url.pathname.match(/^\/api\/admin\/rollback\/(.+)$/)
      if (rollbackMatch && request.method === 'POST') {
        const versionId = decodeURIComponent(rollbackMatch[1])
        if (!versionId) {
          return jsonResponse({ error: 'Version id required' }, 400)
        }
        try {
          const row = await env.DB.prepare(
            `SELECT snapshot_json FROM stop_versions WHERE id = ?`
          )
            .bind(versionId)
            .first()
          if (!row || !row.snapshot_json) {
            return jsonResponse({ error: 'Version not found' }, 404)
          }
          const snapshot = JSON.parse(row.snapshot_json)
          if (!Array.isArray(snapshot)) {
            return jsonResponse({ error: 'Invalid snapshot' }, 500)
          }
          await env.DB.prepare(`DELETE FROM stops`).run()
          for (const s of snapshot) {
            const stop_order = s.stop_order != null ? s.stop_order : s.order
            const id = s.id
            const city = s.city ?? ''
            const country = s.country ?? ''
            const venue = s.venue ?? ''
            const address = s.address ?? ''
            const lat = Number(s.lat)
            const lng = Number(s.lng)
            const timeline = s.timeline ?? null
            const notes = s.notes ?? null
            if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
            await env.DB.prepare(
              `INSERT INTO stops (id, stop_order, city, country, venue, address, lat, lng, timeline, notes, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            )
              .bind(id, stop_order, city, country, venue, address, lat, lng, timeline, notes)
              .run()
          }
          return jsonResponse({ ok: true })
        } catch (err) {
          console.error('[api/admin/rollback]', err)
          return jsonResponse({ error: 'Rollback failed' }, 500)
        }
      }

      // --- Admin geocode (Nominatim proxy) ---
      const NOMINATIM_USER_AGENT = 'WorldTourAdmin/1.0 (https://github.com/your-org/3d-globe-landing-page)'
      const GEO_RATE_MS = 1000
      const GEO_CACHE_TTL = 600 // 10 min

      const geocodeRateMap = new Map()
      const geocodeMemCache = new Map()

      function getGeocodeRateKey(request, endpoint) {
        const ip = getClientIp(request) || 'unknown'
        return `${ip}:${endpoint}`
      }

      function checkGeocodeRateLimit(key) {
        const last = geocodeRateMap.get(key)
        const now = Date.now()
        if (last != null && now - last < GEO_RATE_MS) return false
        geocodeRateMap.set(key, now)
        return true
      }

      async function getGeocodeCache(env, key) {
        if (env.GEOCACHE) {
          try {
            return await env.GEOCACHE.get(key)
          } catch {
            return null
          }
        }
        const entry = geocodeMemCache.get(key)
        if (!entry) return null
        if (entry.exp < Date.now() / 1000) {
          geocodeMemCache.delete(key)
          return null
        }
        return entry.val
      }

      async function setGeocodeCache(env, key, value, ttlSec) {
        const exp = Math.floor(Date.now() / 1000) + ttlSec
        if (env.GEOCACHE) {
          try {
            await env.GEOCACHE.put(key, value, { expirationTtl: ttlSec })
          } catch {}
          return
        }
        geocodeMemCache.set(key, { val: value, exp })
      }

      function normalizeResult(item) {
        const addr = item.address || {}
        const lat = Number(item.lat)
        const lon = item.lon != null ? Number(item.lon) : item.lng != null ? Number(item.lng) : NaN
        return {
          displayName: item.display_name || '',
          lat: Number.isFinite(lat) ? lat : 0,
          lng: Number.isFinite(lon) ? lon : 0,
          address: {
            city: addr.city || addr.town || addr.village || addr.municipality || '',
            state: addr.state || addr.county || '',
            postcode: addr.postcode || '',
            countryCode: (addr.country_code || '').toUpperCase(),
          },
          raw: item,
        }
      }

      const origin = url.origin
      const nominatimHeaders = {
        'User-Agent': NOMINATIM_USER_AGENT,
        Referer: origin || 'https://example.com',
      }

      if (url.pathname === '/api/admin/geocode' && request.method === 'GET') {
        const rk = getGeocodeRateKey(request, 'geocode')
        if (!checkGeocodeRateLimit(rk)) {
          return jsonResponse({ error: 'rate_limited' }, 429)
        }
        const q = url.searchParams.get('q') || ''
        const country = (url.searchParams.get('country') || '').toLowerCase()
        const limit = Math.min(6, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 6))
        if (!q.trim()) {
          return jsonResponse({ error: 'Query parameter q is required' }, 400)
        }
        const cacheKey = `geo:${country}:${encodeURIComponent(q.trim())}:${limit}`
        const cached = await getGeocodeCache(env, cacheKey)
        if (cached) {
          return new Response(cached, {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          })
        }
        const params = new URLSearchParams({
          format: 'jsonv2',
          addressdetails: '1',
          limit: String(limit),
          q: q.trim(),
        })
        if (country) params.set('countrycodes', country)
        const nomUrl = `https://nominatim.openstreetmap.org/search?${params}`
        try {
          const res = await fetch(nomUrl, { headers: nominatimHeaders })
          if (!res.ok) {
            return jsonResponse({ error: 'Geocoding service unavailable' }, 502)
          }
          const data = await res.json()
          const results = Array.isArray(data) ? data.map(normalizeResult) : []
          const body = JSON.stringify(results)
          await setGeocodeCache(env, cacheKey, body, GEO_CACHE_TTL)
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('[geocode]', err)
          return jsonResponse({ error: 'Geocoding failed' }, 502)
        }
      }

      if (url.pathname === '/api/admin/reverse' && request.method === 'GET') {
        const rk = getGeocodeRateKey(request, 'reverse')
        if (!checkGeocodeRateLimit(rk)) {
          return jsonResponse({ error: 'rate_limited' }, 429)
        }
        const lat = parseFloat(url.searchParams.get('lat'))
        const lng = parseFloat(url.searchParams.get('lng'))
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          return jsonResponse({ error: 'Parameters lat and lng are required and must be numbers' }, 400)
        }
        const cacheKey = `rev:${lat.toFixed(4)}:${lng.toFixed(4)}`
        const cached = await getGeocodeCache(env, cacheKey)
        if (cached) {
          return new Response(cached, {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          })
        }
        const params = new URLSearchParams({
          format: 'jsonv2',
          addressdetails: '1',
          lat: String(lat),
          lon: String(lng),
        })
        const nomUrl = `https://nominatim.openstreetmap.org/reverse?${params}`
        try {
          const res = await fetch(nomUrl, { headers: nominatimHeaders })
          if (!res.ok) {
            return jsonResponse({ error: 'Reverse geocoding service unavailable' }, 502)
          }
          const data = await res.json()
          const result = normalizeResult(data)
          const body = JSON.stringify([result])
          await setGeocodeCache(env, cacheKey, body, GEO_CACHE_TTL)
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          console.error('[reverse]', err)
          return jsonResponse({ error: 'Reverse geocoding failed' }, 502)
        }
      }

      // --- Admin artists CRUD ---
      const adminArtistsMatch = url.pathname.match(/^\/api\/admin\/artists\/?(.*)$/)
      if (adminArtistsMatch) {
        const idSuffix = adminArtistsMatch[1]
        const hasId = idSuffix.length > 0
        const artistId = hasId ? decodeURIComponent(idSuffix) : null

        // GET /api/admin/artists — list all
        if (request.method === 'GET' && !hasId) {
          try {
            const { results } = await env.DB.prepare(
              `SELECT id, slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url, created_at, updated_at
               FROM artists ORDER BY name ASC`
            ).all()
            return jsonResponse(results ?? [])
          } catch (err) {
            console.error('[api/admin/artists GET]', err)
            return jsonResponse({ error: 'Failed to fetch artists' }, 500)
          }
        }

        // GET /api/admin/artists/:id — single
        if (request.method === 'GET' && hasId && artistId) {
          try {
            const row = await env.DB.prepare(
              `SELECT id, slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url, site_password, created_at, updated_at
               FROM artists WHERE id = ?`
            ).bind(artistId).first()
            if (!row) return jsonResponse({ error: 'Artist not found' }, 404)
            return jsonResponse(row)
          } catch (err) {
            console.error('[api/admin/artists GET :id]', err)
            return jsonResponse({ error: 'Failed to fetch artist' }, 500)
          }
        }

        // POST /api/admin/artists — create
        if (request.method === 'POST' && !hasId) {
          let body
          try { body = await request.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }
          const slug = body && typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
          const name = body && typeof body.name === 'string' ? body.name.trim() : ''
          const title = body && typeof body.title === 'string' ? body.title.trim() : ''
          if (!slug) return jsonResponse({ error: 'slug is required' }, 400)
          if (!/^[a-z0-9-]+$/.test(slug)) return jsonResponse({ error: 'slug must be lowercase alphanumeric with hyphens only' }, 400)
          if (slug === 'admin' || slug === 'www' || slug === 'api') return jsonResponse({ error: 'Reserved slug' }, 400)
          if (!name) return jsonResponse({ error: 'name is required' }, 400)
          if (!title) return jsonResponse({ error: 'title is required' }, 400)
          const id = body.id ? String(body.id).trim() : crypto.randomUUID()
          const accent_color = body.accent_color || body.accentColor || '#E7D1A7'
          const accent_muted = body.accent_muted || body.accentMuted || null
          const accent_dark = body.accent_dark || body.accentDark || null
          const logo_url = body.logo_url || body.logoUrl || null
          const subtitle = body.subtitle || null
          const site_password = body.site_password || body.sitePassword || null
          try {
            await env.DB.prepare(
              `INSERT INTO artists (id, slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url, site_password, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(id, slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url, site_password).run()
            const row = await env.DB.prepare('SELECT * FROM artists WHERE id = ?').bind(id).first()
            return jsonResponse(row, 201)
          } catch (err) {
            if (err && err.message && /UNIQUE/i.test(err.message)) {
              return jsonResponse({ error: 'An artist with this slug already exists' }, 409)
            }
            console.error('[api/admin/artists POST]', err)
            return jsonResponse({ error: 'Failed to create artist' }, 500)
          }
        }

        // PUT /api/admin/artists/:id — update
        if (request.method === 'PUT' && hasId && artistId) {
          let body
          try { body = await request.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }
          const slug = body && typeof body.slug === 'string' ? body.slug.trim().toLowerCase() : ''
          const name = body && typeof body.name === 'string' ? body.name.trim() : ''
          const title = body && typeof body.title === 'string' ? body.title.trim() : ''
          if (!slug) return jsonResponse({ error: 'slug is required' }, 400)
          if (!/^[a-z0-9-]+$/.test(slug)) return jsonResponse({ error: 'slug must be lowercase alphanumeric with hyphens only' }, 400)
          if (slug === 'admin' || slug === 'www' || slug === 'api') return jsonResponse({ error: 'Reserved slug' }, 400)
          if (!name) return jsonResponse({ error: 'name is required' }, 400)
          if (!title) return jsonResponse({ error: 'title is required' }, 400)
          const accent_color = body.accent_color || body.accentColor || '#E7D1A7'
          const accent_muted = body.accent_muted || body.accentMuted || null
          const accent_dark = body.accent_dark || body.accentDark || null
          const logo_url = body.logo_url || body.logoUrl || null
          const subtitle = body.subtitle || null
          const site_password = body.site_password || body.sitePassword || null
          try {
            const info = await env.DB.prepare(
              `UPDATE artists SET slug = ?, name = ?, title = ?, subtitle = ?, accent_color = ?, accent_muted = ?, accent_dark = ?, logo_url = ?, site_password = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(slug, name, title, subtitle, accent_color, accent_muted, accent_dark, logo_url, site_password, artistId).run()
            if (info.meta.changes === 0) return jsonResponse({ error: 'Artist not found' }, 404)
            const row = await env.DB.prepare('SELECT * FROM artists WHERE id = ?').bind(artistId).first()
            return jsonResponse(row)
          } catch (err) {
            if (err && err.message && /UNIQUE/i.test(err.message)) {
              return jsonResponse({ error: 'An artist with this slug already exists' }, 409)
            }
            console.error('[api/admin/artists PUT]', err)
            return jsonResponse({ error: 'Failed to update artist' }, 500)
          }
        }

        // DELETE /api/admin/artists/:id
        if (request.method === 'DELETE' && hasId && artistId) {
          try {
            // Unlink stops before deleting
            await env.DB.prepare('UPDATE stops SET artist_id = NULL WHERE artist_id = ?').bind(artistId).run()
            const info = await env.DB.prepare('DELETE FROM artists WHERE id = ?').bind(artistId).run()
            if (info.meta.changes === 0) return jsonResponse({ error: 'Artist not found' }, 404)
            return jsonResponse({ ok: true })
          } catch (err) {
            console.error('[api/admin/artists DELETE]', err)
            return jsonResponse({ error: 'Failed to delete artist' }, 500)
          }
        }

        return jsonResponse({ error: 'Not Found' }, 404)
      }

      // --- Admin: assign/unassign artist on a stop (PATCH artist_id only) ---
      const stopArtistMatch = url.pathname.match(/^\/api\/admin\/stops\/([^/]+)\/artist$/)
      if (stopArtistMatch && request.method === 'PUT') {
        const stopId = decodeURIComponent(stopArtistMatch[1])
        let body
        try { body = await request.json() } catch { return jsonResponse({ error: 'Invalid JSON' }, 400) }
        const artistId = body.artist_id != null ? String(body.artist_id) : null
        try {
          const info = await env.DB.prepare(
            `UPDATE stops SET artist_id = ?, updated_at = datetime('now') WHERE id = ?`
          ).bind(artistId || null, stopId).run()
          if (info.meta.changes === 0) return jsonResponse({ error: 'Stop not found' }, 404)
          return jsonResponse({ ok: true })
        } catch (err) {
          console.error('[api/admin/stops/:id/artist]', err)
          return jsonResponse({ error: 'Failed to update stop artist' }, 500)
        }
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
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes, artist_id
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
          const artistId = body.artist_id != null ? String(body.artist_id) : null
          try {
            await env.DB.prepare(
              `INSERT INTO stops (id, stop_order, city, country, venue, address, lat, lng, timeline, notes, artist_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
            ).bind(d.id, d.stop_order, d.city, d.country, d.venue, d.address, d.lat, d.lng, d.timeline, d.notes, artistId).run()
            const row = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes, artist_id FROM stops WHERE id = ?`
            ).bind(d.id).first()
            await saveStopsSnapshot(env)
            return jsonResponse(row ?? { id: d.id, order: d.stop_order, city: d.city, country: d.country, venue: d.venue, address: d.address, lat: d.lat, lng: d.lng, timeline: d.timeline, notes: d.notes })
          } catch (err) {
            if (err && err.message && /UNIQUE|primary key/i.test(err.message)) {
              return jsonResponse({ error: 'A stop with this id already exists' }, 409)
            }
            console.error('[api/admin/stops POST]', err)
            return jsonResponse({ error: 'Failed to create stop' }, 500)
          }
        }

        if (idSuffix === 'reorder' && (request.method === 'POST' || request.method === 'PATCH')) {
          let body
          try {
            body = await request.json()
          } catch {
            return jsonResponse({ error: 'Invalid JSON' }, 400)
          }
          const orderedIds = body.orderedIds ?? body.idOrder
          if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
            return jsonResponse({ error: 'orderedIds must be a non-empty array of stop ids' }, 400)
          }
          const ids = orderedIds.map((x) => String(x).trim()).filter(Boolean)
          if (ids.length !== orderedIds.length) {
            return jsonResponse({ error: 'Each id in orderedIds must be non-empty' }, 400)
          }
          try {
            const { results: existing } = await env.DB.prepare('SELECT id FROM stops').all()
            const existingIds = new Set((existing || []).map((r) => r.id))
            if (ids.length !== existingIds.size || ids.some((id) => !existingIds.has(id))) {
              return jsonResponse({ error: 'orderedIds must contain exactly all stop ids, each once' }, 400)
            }
            const statements = ids.map((id, i) =>
              env.DB.prepare(
                `UPDATE stops SET stop_order = ?, updated_at = datetime('now') WHERE id = ?`
              ).bind(i + 1, id)
            )
            await env.DB.batch(statements)
            await saveStopsSnapshot(env)
            const { results: stops } = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes
               FROM stops
               ORDER BY stop_order ASC`
            ).all()
            return jsonResponse(stops ?? [])
          } catch (err) {
            console.error('[api/admin/stops reorder]', err)
            return jsonResponse({ error: 'Failed to reorder stops' }, 500)
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
          const artistId = body.artist_id !== undefined ? (body.artist_id ? String(body.artist_id) : null) : undefined
          try {
            if (artistId !== undefined) {
              const info = await env.DB.prepare(
                `UPDATE stops SET stop_order = ?, city = ?, country = ?, venue = ?, address = ?, lat = ?, lng = ?, timeline = ?, notes = ?, artist_id = ?, updated_at = datetime('now') WHERE id = ?`
              ).bind(d.stop_order, d.city, d.country, d.venue, d.address, d.lat, d.lng, d.timeline, d.notes, artistId, id).run()
              if (info.meta.changes === 0) return jsonResponse({ error: 'Stop not found' }, 404)
            } else {
              const info = await env.DB.prepare(
                `UPDATE stops SET stop_order = ?, city = ?, country = ?, venue = ?, address = ?, lat = ?, lng = ?, timeline = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
              ).bind(d.stop_order, d.city, d.country, d.venue, d.address, d.lat, d.lng, d.timeline, d.notes, id).run()
              if (info.meta.changes === 0) return jsonResponse({ error: 'Stop not found' }, 404)
            }
            const row = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes, artist_id FROM stops WHERE id = ?`
            ).bind(id).first()
            await saveStopsSnapshot(env)
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
            await saveStopsSnapshot(env)
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
        if (request.method === 'GET' && env.DB) ctx.waitUntil(logPageAccess(env, request, url))
        return env.ASSETS.fetch(request)
      }

      // --- Public: GET /api/artist (returns branding for current hostname context) ---
      if (request.method === 'GET' && url.pathname === '/api/artist') {
        const hostCtx = parseHostContext(url)
        if (hostCtx.type === 'artist' && hostCtx.artistSlug) {
          const branding = await resolveArtistBranding(env.DB, hostCtx.artistSlug)
          if (branding) {
            return jsonResponse(branding)
          }
          // Unknown artist slug: return 404 with default branding hint
          return jsonResponse({ error: 'Artist not found', default: DEFAULT_BRANDING }, 404)
        }
        // Platform or admin context: return default branding
        return jsonResponse(DEFAULT_BRANDING)
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

      // Gated: GET /api/stops (artist-aware: subdomain scopes to artist's stops)
      if (request.method === 'GET' && url.pathname === '/api/stops') {
        try {
          const hostCtx = parseHostContext(url)
          let results
          if (hostCtx.type === 'artist' && hostCtx.artistSlug) {
            // Artist subdomain: only stops linked to this artist
            const artist = await env.DB.prepare('SELECT id FROM artists WHERE slug = ?').bind(hostCtx.artistSlug).first()
            if (artist) {
              const q = await env.DB.prepare(
                `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes
                 FROM stops WHERE artist_id = ? ORDER BY stop_order ASC`
              ).bind(artist.id).all()
              results = q.results ?? []
            } else {
              // Unknown artist slug: return empty set (not an error — frontend handles gracefully)
              results = []
            }
          } else {
            // Platform: return ALL stops (the platform is the global view)
            const q = await env.DB.prepare(
              `SELECT id, stop_order AS "order", city, country, venue, address, lat, lng, timeline, notes
               FROM stops ORDER BY stop_order ASC`
            ).all()
            results = q.results ?? []
          }
          return new Response(JSON.stringify(results), {
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

      // Log HTML page hits only (not static assets)
      if (request.method === 'GET' && !url.pathname.startsWith('/api/') && isPagePath(url.pathname) && env.DB) {
        ctx.waitUntil(logPageAccess(env, request, url))
      }
      return env.ASSETS.fetch(request)
    } catch (err) {
      console.error('[auth] fatal', err)
      return new Response('Worker error. Check logs.', { status: 500 })
    }
  },
}
