# Data Generation

This folder contains the data processing pipeline for the tour stops.

## Files

- `Cities, Venues.xlsx` - Source Excel file with venue data (place this file here)
- `stops.override.json` - Manual overrides for coordinates (highest priority)
- `geocode.cache.json` - Cached Nominatim geocoding results (auto-generated)

## Pipeline

1. **data:raw** - Reads ALL non-empty rows from Excel sheet "US & CAN", outputs `public/data/stops.raw.json` (no coordinates)
2. **data:coords** - Enriches with coordinates via Nominatim (free), uses cache + override, outputs `public/data/stops.json`
3. **data:stops** or **data:all** - Runs data:raw then data:coords

## Usage

```bash
npm run data:all
```

Or step by step:

```bash
npm run data:raw    # Generate stops.raw.json from Excel
npm run data:coords # Geocode missing coords, output stops.json
```

## Override Format

`stops.override.json` keys: `stop.id`, `"order-venue"`, or `"City, Country+Venue"`.

```json
{
  "Chicago, US+United Center": {
    "lat": 41.8806908,
    "lng": -87.6741759,
    "bullets": ["Ticket Price: TBD", "Gross Revenue: TBD", "Net/Guarantee: TBD", "Notes: Premium venue"]
  }
}
```

## Geocoding

- Uses Nominatim (OpenStreetMap), free, no API key
- 1 request/second (rate limit)
- Results cached in `geocode.cache.json`
- Stops with override coords are not geocoded
