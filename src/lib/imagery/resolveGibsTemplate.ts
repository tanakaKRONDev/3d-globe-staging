import type { GibsTemplate } from './gibsTemplates'
import { preloadTiles } from './preloadTile'

/**
 * Try templates in order of preference and return the first one that works
 */
export async function resolveGibsTemplate(templates: GibsTemplate[]): Promise<GibsTemplate> {
  if (templates.length === 0) {
    throw new Error('No templates provided')
  }
  
  console.log(`🔍 Testing ${templates.length} GIBS templates...`)
  
  for (const template of templates) {
    console.log(`📡 Testing ${template.name}...`)
    
    try {
      const isWorking = await preloadTiles(template.url)
      
      if (isWorking) {
        console.log(`✅ ${template.name} is working (${template.description})`)
        return template
      } else {
        console.log(`❌ ${template.name} failed to load tiles`)
      }
    } catch (error) {
      console.log(`❌ ${template.name} error:`, error)
    }
  }
  
  // If all templates fail, return the last one as fallback
  const fallback = templates[templates.length - 1]
  console.warn(`⚠️ All templates failed, using fallback: ${fallback.name}`)
  return fallback
}

/**
 * Resolve both day and night templates in parallel
 */
export async function resolveImageryTemplates(
  dayTemplates: GibsTemplate[],
  nightTemplates: GibsTemplate[]
): Promise<{
  dayTemplate: GibsTemplate
  nightTemplate: GibsTemplate
}> {
  console.log('🌍 Resolving imagery templates...')
  
  const [dayTemplate, nightTemplate] = await Promise.all([
    resolveGibsTemplate(dayTemplates),
    resolveGibsTemplate(nightTemplates)
  ])
  
  console.log('🎉 Imagery templates resolved:', {
    day: dayTemplate.name,
    night: nightTemplate.name
  })
  
  return { dayTemplate, nightTemplate }
}