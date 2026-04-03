/**
 * Admin subdomain detection + path helper.
 * On admin.* subdomain, admin routes live at / instead of /admin.
 */

const _isAdminSubdomain = (() => {
  const h = window.location.hostname
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.workers.dev')) return false
  return h.split('.')[0] === 'admin'
})()

export const isAdminSubdomain = _isAdminSubdomain

/**
 * Map an admin path for the current context.
 * On admin subdomain: "/admin" → "/", "/admin/logs" → "/logs"
 * On main domain:     paths unchanged
 */
export function adminPath(path: string): string {
  if (!_isAdminSubdomain) return path
  if (path === '/admin') return '/'
  if (path.startsWith('/admin/')) return path.slice(6) // "/admin/logs" → "/logs"
  return path
}
