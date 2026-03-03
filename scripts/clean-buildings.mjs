#!/usr/bin/env node
/**
 * Deletes the buildings output directory and recreates it empty.
 * Run: npm run buildings:clean
 */

import { rmSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..')
const OUTPUT_DIR = 'public/data/buildings'
const outputPath = join(root, OUTPUT_DIR)

if (existsSync(outputPath)) {
  rmSync(outputPath, { recursive: true, force: true })
  console.log('[clean-buildings] Deleted', outputPath)
}

mkdirSync(outputPath, { recursive: true })
console.log('[clean-buildings] Created', outputPath)
