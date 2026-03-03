export interface GibsTemplate {
  name: string
  url: string
  maxLevel: number
  description: string
}

export const DAY_TEMPLATES: GibsTemplate[] = [
  {
    name: 'BlueMarble_Level9',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    maxLevel: 9,
    description: 'Blue Marble Shaded Relief - Level 9 (Higher Resolution)'
  },
  {
    name: 'BlueMarble_Level8',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    maxLevel: 8,
    description: 'Blue Marble Shaded Relief - Level 8 (Standard Resolution)'
  }
]

export const NIGHT_TEMPLATES: GibsTemplate[] = [
  {
    name: 'VIIRS_CityLights_Level9',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg',
    maxLevel: 9,
    description: 'VIIRS City Lights 2012 - Level 9 (Higher Resolution)'
  },
  {
    name: 'VIIRS_CityLights_Level8',
    url: 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg',
    maxLevel: 8,
    description: 'VIIRS City Lights 2012 - Level 8 (Standard Resolution)'
  }
]