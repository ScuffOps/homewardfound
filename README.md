# Veri Casita Hunter V2

Vercel-ready house-hunt app with a static frontend and a serverless refresh route.

## What it does
- fetches listing data through HasData
- caps refreshes to 25 listings max
- filters by city, entrance clues, and tub clues
- allows CSV export in-browser
- caches server responses to reduce credit burn

## Deploy on Vercel
1. Import this folder into Vercel
2. Set framework preset to **Other**
3. Add environment variable:
   - `HASDATA_API_KEY` = your rotated HasData API key
4. Optional env vars:
   - `HASDATA_ENDPOINT` = custom HasData endpoint if different from default
   - `CACHE_TTL_MS` = cache duration in milliseconds, default 12 hours
5. Deploy

## Routes
- `/` → frontend
- `/api/listings?limit=25` → refresh endpoint

## Notes
- The server route never returns more than 25 listings, even if a higher limit is requested.
- Public-source schemas vary wildly, so normalization is best-effort.
