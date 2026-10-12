# About and Credits verification

- User authorized new hero tagline, mission heading removal, equal source disclaimer size, broad credits and production release.
- Code: ee986ab67c, followed by 7a6d8155c8 to include four license files omitted by the sparse checkout staging rules.
- Superseded preview HGS6rvANM38ReQis9rN98G6z5RDU canceled; complete preview BF1yc48SHDQmNeEzA5RM4dJ8NAGZ building.
- Lint: 174 files, zero warnings/errors. Scoped whitespace check passed.
- Credits inventory traced to imports in us-county-map.tsx, species-county-map.tsx and county-card.ts; county-equivalent-registry source identifies Census 2025 boundaries; us-atlas README identifies 2017 boundaries for county-card state outlines.
- Font provenance: public/fonts/isitusa-botanical/README.md and OFL.txt identify Chonburi by Cadson Demak, 2015, plus ISITUSA modifications.
- Lucide, D3 Geo, TopoJSON client and U.S. Atlas license notices copied byte-for-byte from installed package licenses.
- Flag credits render all 51 actual STATE_FLAGS entries, using jurisdiction names and source/artist/license metadata. Maine CC BY-SA and Mississippi free-use source pages rechecked online. Old malformed template/insignia metadata cleaned only for display; source data unchanged.
- Photo credits remain attached to individual directory/profile images; no blanket image license asserted.
- Footer now links to /about#credits; legacy #map-credits anchor retained.
- No research data, authentication, payment, or external service configuration changes. No local full build.
- Hosted and live visual verification pending.

## Completed release verification

- Preview BF1yc48SHDQmNeEzA5RM4dJ8NAGZ READY in 4m04s; promoted commit 7a6d8155c8ad72f235c89818dd873c62314465dd.
- Production 8DmsDR3Fo88Un6tPKZAgc1Bu85Uw READY in 6m43s, isitusa.com alias confirmed in Vercel.
- Public /about verified: exact requested hero tagline; mission paragraph preserved; no Our mission heading; both source paragraphs computed at 16px; footer Credits links /about#credits; 51 flag entries.
- Simulated desktop 1440x1000 and phone 390x844 inspected. No horizontal overflow. Credits uses two desktop columns and one phone column; live disclosure opened and closed successfully.
- All four production /credits/*-LICENSE.txt URLs return HTTP 200 with copyright notices.
- Screenshots saved outside repo: about-credits-live.png and credits-section-live.png under the task visualization root.
- Existing unrelated working-tree changes preserved. Viewport override reset. Updated public About page left open.
