# Alabama Post-Import Gap Assessment

Assessment date: `2026-04-25`

## Current Runtime Coverage

Alabama is audit complete, but it is not denominator complete.

Runtime data generated after the ALIPC EDDMapS import, generalized Alabama Plant Atlas import, and narrow pest overrides shows:

- Alabama county audit progress: `67/67` counties and `14/14` chunks complete.
- Alabama live mapped species: `572` distinct species.
- Alabama average county species count: `136.33`.
- Alabama county-species matrix known determinations: `9134` verified present, `0` verified absent, `0` not detected, and `158634` unknown.
- Alabama county-species matrix known percent: `5.44%` of `167768` county-species determinations.
- Alabama category mix: still plant-heavy, but this pass added meaningful insect and disease signal from USFS Alien Forest Pest Explorer records.
- ALIPC denominator reconciliation: `91` list species, `78` catalog matched, `74` live mapped in Alabama, `4` catalog matched but unmapped, and `13` unmatched or ambiguous.
- Alabama ANS denominator reconciliation: `90` Appendix 12.B species, `46` catalog matched, `40` live mapped in Alabama, `6` catalog matched but unmapped, and `44` unmatched or ambiguous.
- National generated catalog: `2504` species, with `1388` mapped and `1116` unmatched.

This is a major improvement from the earlier Alabama coverage gap, but it does not prove that Project Isitusa maps 90 percent or more of every invasive species present in Alabama.

## Denominator Sources

The denominator problem is real because Alabama has multiple credible invasive-species source families, and they do not describe the same population of species.

| Source family | Denominator signal | County importability | Assessment |
| --- | ---: | --- | --- |
| Alabama Forestry Commission invasive species portal | 13 named forestry invasive entries plus a cogongrass location map | Mixed | Good official forestry baseline. Current live coverage includes most named plant entries, including tropical soda apple through ALIPC-backed EDDMapS records, but `Bamboo` is generic. The page is not a broad county inventory. |
| Alabama Invasive Plant Council list, mirrored by Invasive Plant Atlas and EDDMapS | `91` plant species reported invasive in Alabama natural areas | Partly importable through EDDMapS subject county records and Alabama Plant Atlas county maps | Strong plant denominator. Current live coverage maps `73` ALIPC species from county-level EDDMapS, Alabama Plant Atlas, SERNEC, NAS, AFC, or prior rows. List membership alone remains insufficient for county production mapping. |
| Alabama Plant Atlas | Vouchered county distribution maps for Alabama plants | Importable for exact species pages and reviewed accepted-name aliases | Strong county-level plant evidence. The generalized importer added `541` catalog plant species and `8243` county rows. Near-match taxa remain excluded because the importer requires exact public API scientific-name matches unless a reviewed alias is recorded. |
| Alabama Aquatic Nuisance Species Management Plan | `90` non-native aquatic species found in Alabama in Appendix 12.B, including fish, plants, crustaceans, mollusks, mammals, pathogens, and other taxa | Partly importable through USGS NAS and some state plan context | Strong aquatic denominator. Current NAS import covers many but not all catalog-matched ANS plan species. Some plan species are not in the current US-RIIS lower-48 catalog or have taxonomy/name gaps. This corrects the earlier stale `81` count. |
| Alabama Cooperative Extension invasive plant outreach | Active 2026 statewide invasive-plant education project and ornamental replacement guidance | Not county structured by itself | Useful for denominator and public-facing priority, but not production county evidence without county-specific records. |
| Alabama Department of Agriculture and Industries plant protection notices | Species-specific county detections and quarantines, including citrus canker and Africanized honey bee reports | Manual or future regulatory-notice importer | Strong county-specific evidence when species exists in the catalog. Not yet a bulk source family. |
| USFS Alien Forest Pest Explorer | County-level forest pest and tree disease detections | Importable as a future source-family importer, currently added as reviewed manual source-family overrides | Strong county-level pest/pathogen evidence. This pass added Japanese beetle, chestnut blight, dogwood anthracnose, and cottony cushion scale Alabama counties. |

## What Alabama Covers Well Now

Current Alabama live coverage is strongest for:

- Widespread terrestrial plants with SERNEC, ALIPC-backed EDDMapS, and Alabama Plant Atlas support, including Japanese honeysuckle, cogongrass, kudzu, sericea lespedeza, Chinese privet, mimosa, Johnsongrass, Chinese wisteria, Japanese climbing fern, sacred bamboo, Japanese stiltgrass, multiflora rose, tree-of-heaven, Chinese tallow, Callery pear, English ivy, autumn olive, camphor tree, Chinese yam, Morrow's honeysuckle, Japanese barberry, and hundreds of other exact Plant Atlas catalog matches.
- Aquatic species covered by USGS NAS and prior EDDMapS rows, including Asiatic clam, grass carp, alligatorweed, Eurasian watermilfoil, common carp, hydrilla, bighead carp, nutria, zebra mussel, Brazilian waterweed, water hyacinth, parrot feather, and several lower-count aquatic records.
- Forest pest and disease signals from structured public layers and reviewed source-family overrides, including emerald ash borer, laurel wilt, Japanese beetle, chestnut blight, dogwood anthracnose, cottony cushion scale, and citrus canker.
- Feral swine statewide coverage from Outdoor Alabama.

## Confirmed Gaps Or Weak Spots

These gaps should not be treated as production misses unless a county-structured source is found, but they show why Alabama cannot be called complete.

| Gap class | Examples found in current catalog but not live mapped in Alabama | Likely next source path | Import decision |
| --- | --- | --- | --- |
| AFC named species not covered | Generic AFC `Bamboo` does not map cleanly to one catalog species | AFC species pages or county records tied to a reviewed species ID | Candidate source-family follow-up. Do not infer counties from the AFC landing page. |
| ALIPC catalog-matched but unmapped species | `lonicera-x-bella`, `ardisia-japonica`, `callicarpa-japonica`, `solanum-tampicense` | Alabama Plant Atlas recheck, SERNEC expansion, EDDMapS recheck, or source-specific county records | Remaining plant follow-up after the ALIPC-backed EDDMapS, Alabama Plant Atlas, and SERNEC manual review passes. Near matches remain excluded without reviewed species-level evidence. |
| ANS plan catalog-matched but unmapped species | `cherax-quadricarinatus`, `cyprinus-rubrofuscus`, `oreochromis-aureus`, `oreochromis-mossambicus`, `lycopus-europaeus`, `cipangopaludina-chinensis` | USGS NAS archive recheck, NAS aliases, state ANS plan species pages, county or HUC records | Candidate technical gap. Several plant gaps were resolved by generalized Alabama Plant Atlas coverage. Fish and snail gaps need source-specific county evidence and status review before mapping. |
| ANS plan species unmatched or ambiguous in current catalog | `lyngbya-spp`, `alosa-aestivalis`, `alosa-pseudoharengus`, `cyprinella-lutrensis`, `faxonius-rusticus`, `faxonius-virilis`, `myriophyllum-heterphyllum`, `pistia-stratoides`, `trachemys-scripta-elegans`, `ranavirus-spp`, `vesiculovirus-spp`, `flavivirus-spp`, plus other exact-name misses in `docs/county-coverage/states/AL-al-ans-2021-reconciliation.md` | Catalog match review against US-RIIS, accepted-name aliases, and NAS taxonomy | Do not add blind aliases. First decide whether the species belongs in the catalog and whether Alabama records are invasive or merely nonnative. |
| Regulated pest notices | `xanthomonas-citri` is now live mapped for Baldwin and Mobile counties from ADAI citrus canker notices plus APHIS taxonomy support; Africanized honey bee and cotton jassid reports are not exact catalog matches today | ADAI plant protection news and quarantine pages, APHIS pest pages | Good manual evidence path where species exists. Not a bulk import yet. |
| Category balance | Alabama still has thin insect, wildlife, pathogen, and disease coverage relative to plants and aquatic species | APHIS, ADAI, USFS, AFC forest-health layers, state wildlife sources, and state pest notices | High priority for future source-family work. |

On 2026-04-25, the `13` ANS plan catalog-matched but unmapped species were checked against the current local NAS and EDDMapS-backed county data. Each has national county-source coverage, but none has an Alabama county FIPS in the current source data, and the denominator names already match the generated catalog entries. Treat these as true county-evidence gaps, not import or alias misses.

## Contradictions To Preserve

- Alabama audit completion is true. Alabama denominator completion is not proven.
- Every Alabama county now has county-specific live coverage, but many counties still depend on narrow plant, aquatic, forest-pest, or disease source families rather than broad county invasive-species inventories.
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
   - Goal: capture county-specific regulatory detections for pests and diseases already in the catalog, starting with citrus canker.
   - Output: either narrow manual overrides with explicit source URLs or a small regulatory-notice import file.

3. Remaining ALIPC plant gap review.
   - Status: generalized Alabama Plant Atlas pass is imported and Australian-pine has a SERNEC-backed manual override.
   - Next goal: resolve the remaining `4` catalog-matched but unmapped ALIPC species only if county-level species evidence exists.
   - Output: another reviewed plant tranche only where county, species, and source records are exact.

## Stop Rule

Do not add Alabama production county presence from the AFC landing page, ALIPC list membership, ACES outreach pages, or the ANS plan denominator table alone.

Promote a species to Alabama county coverage only when the source has county-level evidence, or when a reviewed source-family importer can normalize county records without inventing occurrence.
