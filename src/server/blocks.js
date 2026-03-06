/**
 * @param {D1Database} DB
 * @param {string} ip
 * @returns {Promise<'admin'|'all'|null>}
 */
export async function getBlockScope(DB, ip) {
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
