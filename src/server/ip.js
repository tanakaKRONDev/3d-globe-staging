/**
 * Prefer cf-connecting-ip; fallback to first IP from x-forwarded-for.
 * Sanitizes: trim, take first if comma-separated.
 * @param {Request} request
 * @returns {string | null}
 */
export function getClientIp(request) {
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
