#!/usr/bin/env node
import { existsSync } from 'fs'
import { join } from 'path'

const distData = join(process.cwd(), 'dist', 'data')
const stopsAll = join(distData, 'stops.all.json')
const stopsJson = join(distData, 'stops.json')

if (existsSync(stopsAll) || existsSync(stopsJson)) {
  console.log('[verify-dist-data] ✅ Stops data found in dist/data/')
} else {
  console.warn('[verify-dist-data] ⚠️ No stops.all.json or stops.json in dist/data/')
}
