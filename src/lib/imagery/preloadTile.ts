/**
 * Preload a single tile to test if a template URL works
 */
export function preloadTile(templateUrl: string, z: number = 1, x: number = 1, y: number = 1): Promise<boolean> {
  return new Promise((resolve) => {
    const url = templateUrl
      .replace('{z}', z.toString())
      .replace('{x}', x.toString())
      .replace('{y}', y.toString())
    
    const img = new Image()
    
    // Set a timeout to avoid hanging on slow/failed requests
    const timeout = setTimeout(() => {
      img.onload = null
      img.onerror = null
      resolve(false)
    }, 5000) // 5 second timeout
    
    img.onload = () => {
      clearTimeout(timeout)
      resolve(true)
    }
    
    img.onerror = () => {
      clearTimeout(timeout)
      resolve(false)
    }
    
    // Add cache busting to avoid cached 404s
    img.src = `${url}?t=${Date.now()}`
  })
}

/**
 * Preload multiple representative tiles for better coverage
 */
export async function preloadTiles(templateUrl: string, testCoordinates?: Array<{z: number, x: number, y: number}>): Promise<boolean> {
  const defaultCoordinates = [
    { z: 1, x: 1, y: 1 },   // Center tile
    { z: 2, x: 2, y: 1 },   // Different region
    { z: 2, x: 1, y: 2 }    // Another region
  ]
  
  const coordinates = testCoordinates || defaultCoordinates
  
  try {
    // Test multiple tiles in parallel
    const results = await Promise.all(
      coordinates.map(coord => preloadTile(templateUrl, coord.z, coord.x, coord.y))
    )
    
    // Return true if at least 2 out of 3 tiles load successfully
    const successCount = results.filter(Boolean).length
    return successCount >= Math.min(2, coordinates.length)
  } catch (error) {
    console.warn('Error preloading tiles:', error)
    return false
  }
}