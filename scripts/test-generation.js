import * as fs from 'fs'
import * as path from 'path'

// Simple test to generate stops.v1.json without Excel
const testStops = [
  {
    id: 'chicago-unitedcenter',
    order: 1,
    city: 'Chicago',
    countryCode: 'US',
    venue: 'United Center',
    capacityMin: 23500,
    capacityMax: 23500,
    lat: 41.8806908,
    lng: -87.6741759,
    bullets: [
      'Ticket Price: TBD',
      'Gross Revenue: TBD',
      'Net/Guarantee: TBD',
      'Notes: Premium venue in downtown Chicago'
    ]
  },
  {
    id: 'toronto-scotiabankarea',
    order: 2,
    city: 'Toronto',
    countryCode: 'CA',
    venue: 'Scotiabank Arena',
    capacityMin: 19800,
    capacityMax: 19800,
    lat: 43.64343375,
    lng: -79.3790777248373,
    bullets: [
      'Ticket Price: TBD',
      'Gross Revenue: TBD',
      'Net/Guarantee: TBD',
      'Notes: Major arena in Toronto\'s entertainment district'
    ]
  }
]

// Ensure output directory exists
const outputDir = path.join(process.cwd(), 'public', 'data')
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

// Write output JSON
const outputPath = path.join(outputDir, 'stops.v1.json')
fs.writeFileSync(outputPath, JSON.stringify(testStops, null, 2))

console.log('✅ Test stops.v1.json generated successfully')
console.log('📁 Output saved to:', outputPath)