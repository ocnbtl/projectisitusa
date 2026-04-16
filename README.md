# Project Isitusa

Project Isitusa is a public-facing Next.js app for exploring Invasive Species in the USA (hence the acronym ISITUSA) through species pages, county-level presence data, and location based discovery.

## Why This Matters

Invasive species are not just "non-native" plants or animals. When they establish and spread, they can outcompete native species, alter habitats, disrupt food webs, increase disease pressure, change water and fire patterns, reduce biodiversity, and create real costs for agriculture, forestry, fisheries, infrastructure, and local communities.

If people only notice invasive species after major damage is visible, they are already late in the response cycle. Better public awareness and clearer local context make earlier detection and better decisions more likely.

## What The App Does

- Lets people browse invasive species profiles with images and supporting context
- Surfaces county-level presence and local insight data
- Supports ZIP-based lookup through an internal API route
- Publishes static species pages for broad public access and fast loading

## How To Use It

1. Open the home page and browse the map explorer.
2. Search for a species to view its profile page.
3. Use the location lookup flow to jump from a ZIP code to county context.
4. Review local presence, impact, and action guidance for the species that matter in that area.

## Local Development

```bash
npm ci
npm run dev
```

Useful verification commands:

```bash
npm run typecheck
npm run build
```

The current app does not require project-specific environment variables for local build or deployment.

## Data And Project Shape

- Framework: Next.js + TypeScript
- Routing: App Router
- Data model: generated local JSON files committed with the app
- Images: local species image catalog under `public/species`
- Current runtime routes include `/`, `/about`, `/api/lookup/zip`, and statically generated `/species/[slug]`

## Open Source

This project is open-sourced under the MIT License. See [LICENSE](./LICENSE).
