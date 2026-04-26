# Alabama Post-Import Gap Assessment

Assessment date: `2026-04-26`

## Current Runtime Coverage

Alabama is audit complete, but it is not denominator complete.

Runtime data generated after the ALIPC EDDMapS import, generalized Alabama Plant Atlas import, USFS Alien Forest Pest Explorer importer, USFS current invasive plant polygon importer, GBIF and iDigBio preserved specimen snapshots, APHIS federal quarantine importer, and first USFWS invasive carp eDNA non-detection records shows:

- Alabama county audit progress: `67/67` counties and `14/14` chunks complete.
- Alabama live mapped species: `790` distinct species.
- Alabama average county species count: `156.04`.
- Alabama county-species matrix known determinations: `10455` verified present, `0` verified absent, `8` not detected, and `157305` unknown.
- Alabama county-species matrix known percent: `6.24%` of `167768` county-species determinations.
- Alabama category mix: still plant-heavy, but recent passes added broader insect, disease, wildlife, aquatic, specimen-backed, National Forest invasive plant, APHIS, and USFWS eDNA sampling signal.
- ALIPC denominator reconciliation: `91` list species, `78` catalog matched, `75` live mapped in Alabama, `3` catalog matched but unmapped, and `13` unmatched or ambiguous.
- Alabama ANS denominator reconciliation: `90` Appendix 12.B species, `46` catalog matched, `41` live mapped in Alabama, `5` catalog matched but unmapped, and `44` unmatched or ambiguous.
- National generated catalog: `2504` species, with `1502` mapped and `1002` unmatched.

This is a major improvement from the earlier Alabama coverage gap, but it does not prove that Project Isitusa maps 90 percent or more of every invasive species present in Alabama. The attempted 10 percent knowledge milestone has not been reached because new source families still mostly add presence evidence that overlaps existing records, and public non-detection sources remain narrow or not county-importable.

## Denominator Sources

The denominator problem is real because Alabama has multiple credible invasive-species source families, and they do not describe the same population of species.

| Source family | Denominator signal | County importability | Assessment |
| --- | ---: | --- | --- |
| Alabama Forestry Commission invasive species portal | 13 named forestry invasive entries plus a cogongrass location map | Mixed | Good official forestry baseline. Current live coverage includes most named plant entries, including tropical soda apple through ALIPC-backed EDDMapS records, but `Bamboo` is generic. The page is not a broad county inventory. |
| Alabama Invasive Plant Council list, mirrored by Invasive Plant Atlas and EDDMapS | `91` plant species reported invasive in Alabama natural areas | Partly importable through EDDMapS subject county records and Alabama Plant Atlas county maps | Strong plant denominator. Current live coverage maps `73` ALIPC species from county-level EDDMapS, Alabama Plant Atlas, SERNEC, NAS, AFC, or prior rows. List membership alone remains insufficient for county production mapping. |
| Alabama Plant Atlas | Vouchered county distribution maps for Alabama plants | Importable for exact species pages and reviewed accepted-name aliases | Strong county-level plant evidence. The generalized importer added `541` catalog plant species and `8243` county rows. Near-match taxa remain excluded because the importer requires exact public API scientific-name matches unless a reviewed alias is recorded. |
| USFS Current Invasive Plant Locations | Current invasive plant infestation polygons on National Forest System land in Alabama | Importable for exact accepted scientific names with geometry that resolves to an Alabama county | Strong current plant occurrence evidence for a limited land-management scope. The importer matched `1286` infestation polygon features to `23` exact catalog species and raised the Alabama matrix by `12` net verified-present determinations after unioning with existing source families. Generic genus-level rows and non-catalog plant names remain skipped. |
| Alabama Aquatic Nuisance Species Management Plan | `90` non-native aquatic species found in Alabama in Appendix 12.B, including fish, plants, crustaceans, mollusks, mammals, pathogens, and other taxa | Partly importable through USGS NAS and some state plan context | Strong aquatic denominator. Current NAS import covers many but not all catalog-matched ANS plan species. Some plan species are not in the current US-RIIS lower-48 catalog or have taxonomy/name gaps. This corrects the earlier stale `81` count. |
| Alabama Cooperative Extension invasive plant outreach | Active 2026 statewide invasive-plant education project and ornamental replacement guidance | Not county structured by itself | Useful for denominator and public-facing priority, but not production county evidence without county-specific records. |
| Alabama Department of Agriculture and Industries plant protection notices | Species-specific county detections and quarantines, including citrus canker and Africanized honey bee reports | Manual or future regulatory-notice importer | Strong county-specific evidence when species exists in the catalog. Not yet a bulk source family. |
| USFS Alien Forest Pest Explorer | County-level forest pest and tree disease detections | Importable through the PURR county dataset | Strong county-level pest/pathogen evidence. The importer currently maps `13` reviewed catalog species and `173` Alabama county detections, including Japanese beetle, chestnut blight, littleleaf disease, laurel wilt, dogwood anthracnose, cottony cushion scale, emerald ash borer, camphor scale, Dutch elm disease, mimosa webworm, peach twig borer, butternut canker, and Asian chestnut gall wasp. |
| GBIF preserved specimen records | Physical occurrence records across plants, animals, fungi, and pathogens | Importable for strict exact catalog matches with Alabama county values | Useful broad verified-present evidence. The snapshot found `686` catalog species and `6634` Alabama county rows before merged-source unioning, and generated data now carries `499` species from this source. Treat GBIF as physical occurrence evidence, not proof that a species is established, invasive in that county, absent elsewhere, or not detected. |
| iDigBio preserved specimen records | Physical occurrence records across plants, animals, fungi, and pathogens | Importable for exact catalog names with Alabama county values or coordinates that resolve to one Alabama county | Useful broad verified-present evidence and gap-finding complement to GBIF. The snapshot found `643` catalog species and `5352` Alabama county rows before merged-source unioning, and generated data now carries `458` species from this source. Treat iDigBio as physical occurrence evidence, not proof that a species is established, invasive in that county, absent elsewhere, or not detected. |
| USDA APHIS PPQ Federal Quarantine county layer | Active county quarantine rows for regulated pests and diseases | Importable for reviewed program-to-species matches | Strong regulatory county signal for exact catalog matches. This pass imported active Alabama rows for Asian citrus psyllid, red imported fire ant, and sweet orange scab, adding `3` source species and `136` Alabama county rows before generated unioning. Citrus greening rows were skipped because the current catalog has no exact `Candidatus Liberibacter asiaticus` target. |
| USFWS invasive carp eDNA sample layer | Sample-level eDNA monitoring for bighead carp and silver carp | Manually importable for conservative survey-area status records | High-quality public monitoring evidence, but narrow. Alabama has `680` no-detection sample rows across `7` counties, but only `8` county-species records were added as `not-detected` after skipping county-species pairs with current verified-present or positive eDNA conflicts. USFWS explicitly cautions that positive eDNA does not necessarily mean live carp were present when samples were taken. |
| PestTracker, CAPS, and NAPIS | Survey-status lane with positive and negative survey semantics where raw rows are exposed | Not importable from the reviewed public PestTracker map output for Alabama today | Promising survey-status source family, but current public PestTracker map checks found no Alabama county FIPS rows for the reviewed mapped pests across public map years `2017` through `2026`. CAPS status-code definitions confirm useful semantics, but raw Alabama rows remain unavailable through the public path reviewed in this pass. |
| APHIS National Honey Bee Survey | Public sampling-event diagnostics for honey bee pests and pathogens | Not county-importable from the current public Alabama CSV rows | Reputable survey data, but the public CSV has blank `sampling_county` values for the `340` Alabama rows reviewed. Exact catalog relevance is also narrow, mainly `Varroa destructor` and `Aethina tumida` from the current catalog. Do not import until public county or FIPS values are available. |

## What Alabama Covers Well Now

Current Alabama live coverage is strongest for:

- Widespread terrestrial plants with SERNEC, ALIPC-backed EDDMapS, and Alabama Plant Atlas support, including Japanese honeysuckle, cogongrass, kudzu, sericea lespedeza, Chinese privet, mimosa, Johnsongrass, Chinese wisteria, Japanese climbing fern, sacred bamboo, Japanese stiltgrass, multiflora rose, tree-of-heaven, Chinese tallow, Callery pear, English ivy, autumn olive, camphor tree, Chinese yam, Morrow's honeysuckle, Japanese barberry, and hundreds of other exact Plant Atlas catalog matches.
- Current National Forest System invasive plant polygons for exact catalog matches, including kudzu, Chinese privet, Japanese honeysuckle, Japanese climbing fern, Japanese stiltgrass, cogongrass, alligatorweed, autumn olive, sericea lespedeza, multiflora rose, and related exact-match plant records. This supports current infestation presence on National Forest System land, not statewide absence or a complete Alabama plant inventory.
- Aquatic species covered by USGS NAS and prior EDDMapS rows, including Asiatic clam, grass carp, alligatorweed, Eurasian watermilfoil, common carp, hydrilla, bighead carp, nutria, zebra mussel, Brazilian waterweed, water hyacinth, parrot feather, and several lower-count aquatic records.
- Physical specimen occurrence records from GBIF and iDigBio exact catalog matches, especially in counties with universities, museums, and herbarium collection history. These improve verified-present coverage but need source-language caution because specimen occurrence is not the same thing as a county invasive-status declaration.
- Forest pest, disease, and regulatory signals from structured public layers and imported source-family records, including emerald ash borer, laurel wilt, Japanese beetle, chestnut blight, littleleaf disease, dogwood anthracnose, cottony cushion scale, camphor scale, Dutch elm disease, mimosa webworm, peach twig borer, butternut canker, Asian chestnut gall wasp, citrus canker, Asian citrus psyllid, red imported fire ant, and sweet orange scab.
- First non-detection records from USFWS invasive carp eDNA sampling, limited to survey-area records for bighead carp and silver carp in Tennessee River counties where no current conflict exists.
- Feral swine statewide coverage from Outdoor Alabama.

## Confirmed Gaps Or Weak Spots

These gaps should not be treated as production misses unless a county-structured source is found, but they show why Alabama cannot be called complete.

| Gap class | Examples found in current catalog but not live mapped in Alabama | Likely next source path | Import decision |
| --- | --- | --- | --- |
| AFC named species not covered | Generic AFC `Bamboo` does not map cleanly to one catalog species | AFC species pages or county records tied to a reviewed species ID | Candidate source-family follow-up. Do not infer counties from the AFC landing page. |
| ALIPC catalog-matched but unmapped species | `lonicera-x-bella`, `callicarpa-japonica`, `solanum-tampicense` | Alabama Plant Atlas recheck, SERNEC expansion, EDDMapS recheck, iDigBio review, or source-specific county records | Remaining plant follow-up after the ALIPC-backed EDDMapS, Alabama Plant Atlas, SERNEC, GBIF, and iDigBio passes. `ardisia-japonica` is now live mapped from iDigBio preserved specimen records. Near matches remain excluded without reviewed species-level evidence. |
| ANS plan catalog-matched but unmapped species | `cherax-quadricarinatus`, `cyprinus-rubrofuscus`, `oreochromis-aureus`, `lycopus-europaeus`, `cipangopaludina-chinensis` | USGS NAS archive recheck, NAS aliases, state ANS plan species pages, county or HUC records | Candidate technical gap. Several plant gaps were resolved by generalized Alabama Plant Atlas coverage, and Mozambique tilapia is now live mapped from GBIF preserved specimen records. Fish and snail gaps need source-specific county evidence and status review before mapping. |
| ANS plan species unmatched or ambiguous in current catalog | `lyngbya-spp`, `alosa-aestivalis`, `alosa-pseudoharengus`, `cyprinella-lutrensis`, `faxonius-rusticus`, `faxonius-virilis`, `myriophyllum-heterphyllum`, `pistia-stratoides`, `trachemys-scripta-elegans`, `ranavirus-spp`, `vesiculovirus-spp`, `flavivirus-spp`, plus other exact-name misses in `docs/county-coverage/states/AL-al-ans-2021-reconciliation.md` | Catalog match review against US-RIIS, accepted-name aliases, and NAS taxonomy | Do not add blind aliases. First decide whether the species belongs in the catalog and whether Alabama records are invasive or merely nonnative. |
| Regulated pest notices | `xanthomonas-citri` is now live mapped for Baldwin and Mobile counties from ADAI citrus canker notices plus APHIS taxonomy support; Africanized honey bee and cotton jassid reports are not exact catalog matches today | ADAI plant protection news and quarantine pages, APHIS pest pages | Good manual evidence path where species exists. Not a bulk import yet. |
| Category balance | Alabama still has thin insect, wildlife, pathogen, and disease coverage relative to plants and aquatic species, though GBIF, APHIS, and USFS improved recent passes | APHIS, ADAI, USFS, AFC forest-health layers, state wildlife sources, CAPS or PestTracker survey data, and state pest notices | High priority for future source-family work, especially for sources that encode surveyed-and-not-found statuses. PestTracker and APHIS honey bee survey public paths were reviewed in this pass but were not county-importable for Alabama. |

On 2026-04-25, the remaining ANS plan catalog-matched but unmapped species were checked against the current local NAS and EDDMapS-backed county data. Each has national county-source coverage, but none has an Alabama county FIPS in the current source data, and the denominator names already match the generated catalog entries. Treat these as true county-evidence gaps unless another county-specific source is found.

## Contradictions To Preserve

- Alabama audit completion is true. Alabama denominator completion is not proven.
- Every Alabama county now has county-specific live coverage, but many counties still depend on narrow plant, aquatic, forest-pest, or disease source families rather than broad county invasive-species inventories.
- GBIF preserved specimens support verified physical occurrence by county. They do not prove establishment, invasive impact, absence in unsampled counties, or survey non-detection.
- iDigBio preserved specimens support verified physical occurrence by county. They overlap heavily with GBIF, IPT, Symbiota, VertNet, and collection datasets, so they should not be treated as a fully independent denominator.
- USFS Current Invasive Plant Locations supports current invasive plant infestation presence on National Forest System land in Alabama. It is not statewide plant absence evidence, and it should not be treated as complete county invasive-plant inventory coverage.
- APHIS quarantine rows support active regulatory county status for reviewed exact catalog matches. They do not cover every regulated pest, and skipped rows should remain skipped unless the species exists in the catalog or a reviewed catalog addition is made.
- USFWS eDNA `No eDNA detected` samples are survey-area non-detection records, not countywide absence. Positive eDNA rows were not promoted to verified-present because the source cautions that DNA can come from live fish, dead fish, boats, birds, or water current.
- PestTracker, CAPS, and NAPIS remain promising survey-status lanes because their status definitions can distinguish positive and negative survey records. The public PestTracker map output reviewed on `2026-04-26` did not expose Alabama county FIPS rows for the reviewed mapped pests, so this pass did not add Alabama matrix rows from that family.
- APHIS National Honey Bee Survey is reputable survey data, but the public Alabama rows reviewed on `2026-04-26` had blank `sampling_county` values. Do not promote those rows into county matrix records without a county-resolved public source.
- The APHIS emerald ash borer layer is the structured production source and currently returns `6` Alabama counties. AFC narrative reporting names a partially different set of county confirmations, and this pass added AFC-supported Etowah and Shelby County overrides. Keep both facts visible.
- The AFC cogongrass GIS layer returns `64` valid Alabama counties. The AFC cogongrass program discusses Alabama broadly and program eligibility statewide, but that does not justify inferring the three missing counties into production coverage.
- The ANS plan count was previously carried as `81`, but direct Appendix 12.B extraction shows `90` non-native aquatic species found in Alabama. Use `90` for this denominator unless a future source revision proves otherwise.
- Giant salvinia and Japanese spirea were previously listed as live-coverage gaps in older notes. Current generated reconciliation shows giant salvinia live mapped in `10` Alabama counties and Japanese spirea no longer in the ALIPC unmapped bucket.
- Camphor tree, Chinese yam, Morrow's honeysuckle, and Japanese barberry were previously listed as ALIPC live-coverage gaps. Current generated reconciliation shows those are now live mapped from Alabama Plant Atlas and reviewed alias support where needed.
- Australian-pine was previously listed as an ALIPC live-coverage gap. It is now live mapped for Baldwin County from exact SERNEC herbarium records.
- Some older page searches against `floraofalabama.org` missed species that the newer Alabama Plant Atlas public API can resolve. Current imports use exact API matches only, which is stricter than broad page-search inference.
- Statewide or list-level species presence is useful denominator evidence, but it is not county evidence by itself.

## Recommended Status

Use `research-complete-coverage-in-progress` for Alabama.

That label means:

- The county audit is complete.
- The live map is materially better and every Alabama county has county-specific mapped evidence.
- The remaining work is not normal county-by-county audit work. It is source-family adoption, denominator reconciliation, taxonomy matching, and pest/pathogen source discovery.
- Alabama should not be marketed internally or publicly as 90 percent plus complete until a defensible denominator is established.

## Recommended Next Imports

1. Alabama ANS plan reconciliation against NAS.
   - Status: first-pass `AL-ANS-2021` denominator reconciliation is generated.
   - Next goal: resolve the `13` catalog-matched but unmapped species against NAS and other county-level aquatic sources.
   - Output: county evidence additions only where a source has species-specific county records.

2. ADAI and APHIS pest notice lane.
   - Status: APHIS federal quarantine county rows are now imported for `3` exact catalog species.
   - Goal: expand toward ADAI notices, APHIS program pages, and CAPS or PestTracker survey records that may distinguish found, not found, and not surveyed.
   - Output: either narrow manual overrides with explicit source URLs or a small regulatory-notice import file. Promote `not-detected` only when a reputable source explicitly records a survey without detection.

3. USFS and land-management plant layers.
   - Status: USFS Current Invasive Plant Locations is imported for National Forest System land in Alabama exact catalog matches.
   - Next goal: look for other public land-management invasive plant layers with county-resolvable geometries and exact scientific names, while keeping their land-scope caveats visible.
   - Output: source-family imports only where geometry or attributes resolve to county evidence without inferring absence outside the managed land base.

4. Remaining ALIPC plant gap review.
   - Status: generalized Alabama Plant Atlas pass is imported and Australian-pine has a SERNEC-backed manual override.
   - Next goal: resolve the remaining `3` catalog-matched but unmapped ALIPC species only if county-level species evidence exists.
   - Output: another reviewed plant tranche only where county, species, and source records are exact.

5. GBIF and museum-portal refinement.
   - Status: broad GBIF and iDigBio preserved specimen imports are now available as repeatable snapshots.
   - Next goal: review whether dataset allowlists, direct IPT downloads, SERNEC expansion, or institution-scoped GBIF downloads can strengthen the broad specimen lane and reduce cultivated or non-established noise.
   - Output: keep verified-present records where county and species evidence is exact, but document specimen evidence separately from invasive-status declarations.

6. Survey-status source lane.
   - Status: first USFWS invasive carp eDNA `not-detected` records are added with `survey-area` evidence scope. PestTracker public map output and APHIS National Honey Bee Survey public CSV rows were reviewed but did not expose importable Alabama county records in this pass.
   - Next goal: pursue PestTracker, CAPS, NAPIS, USFWS, APHIS, or other public monitoring sources that expose county-level found and not-found records for catalog species.
   - Output: add `not-detected` only where the source explicitly records a survey without detection and where no current verified-present or positive-detection conflict exists.

## Stop Rule

Do not add Alabama production county presence from the AFC landing page, ALIPC list membership, ACES outreach pages, or the ANS plan denominator table alone.

Promote a species to Alabama county coverage only when the source has county-level evidence, or when a reviewed source-family importer can normalize county records without inventing occurrence.
