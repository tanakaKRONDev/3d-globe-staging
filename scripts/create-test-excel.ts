import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'

// Create a test Excel file for development
const testData = [
  ['City', 'Venue', 'Capacity'],
  ['Chicago', 'United Center', '23,500'],
  ['Toronto', 'Scotiabank Arena', '19,800']
]

const worksheet = XLSX.utils.aoa_to_sheet(testData)
const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, worksheet, 'US & CAN')

const outputPath = path.join(process.cwd(), 'data', 'Cities, Venues.xlsx')
XLSX.writeFile(workbook, outputPath)

console.log('✅ Test Excel file created at:', outputPath)