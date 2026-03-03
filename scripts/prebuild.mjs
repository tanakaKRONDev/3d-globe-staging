#!/usr/bin/env node

import { spawn } from 'child_process'

/**
 * Prebuild for CI and deploy.
 * - Runs data:all (generate stops from Excel), then buildings:verify.
 * - Never calls Overpass; building GeoJSON must be committed or built locally.
 */

console.log('[Prebuild] Starting...')

const SKIP_DATA_GEN = process.env.SKIP_DATA_GEN === '1'

function runNpmScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`[Prebuild] Running: npm run ${scriptName}`)
    const child = spawn('npm', ['run', scriptName], { stdio: 'inherit', shell: true })
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[Prebuild] ✅ ${scriptName} completed`)
        resolve()
      } else {
        reject(new Error(`${scriptName} failed with code ${code}`))
      }
    })
    child.on('error', reject)
  })
}

async function main() {
  try {
    if (SKIP_DATA_GEN) {
      console.log('[Prebuild] SKIP_DATA_GEN=1: skipping data:all')
    } else {
      await runNpmScript('data:all')
    }

    await runNpmScript('buildings:verify')

    console.log('[Prebuild] 🎉 Prebuild completed successfully')
    process.exit(0)
  } catch (error) {
    console.error('[Prebuild] 💥 Failed:', error.message)
    console.error('')
    console.error('Troubleshooting:')
    console.error('- Ensure data/Cities, Venues.xlsx exists and run: npm run data:all')
    console.error('- Or set SKIP_DATA_GEN=1 and commit public/data/stops.all.json')
    console.error('- Building GeoJSON: commit public/data/buildings/*.geojson or run locally:')
    console.error('  npm run buildings:rebuild:batch1')
    console.error('  npm run buildings:rebuild:batch2')
    console.error('  npm run buildings:rebuild:batch3')
    process.exit(1)
  }
}

main()
