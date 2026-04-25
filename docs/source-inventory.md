# Source Inventory

This file tracks the external sources currently used by Project Isitusa, what each source is used for, where that data lands in the repo, and when it was last fetched or consulted.

If you add a new data or content source, update this file in the same change.

## Core Structured Data Sources

| Source | Used for | Repo artifacts | How acquired | Last tracked fetch or use |
| --- | --- | --- | --- | --- |
| US-RIIS v2 lower-48 invasive species snapshot, U.S. Geological Survey, DOI: https://doi.org/10.5066/P9KFFTOD | Core registry catalog, taxonomy, status, habitats, pathways, intro year, authority name, authority URL, occurrence IDs | `src/data/source/usriis-snapshot.json`, `src/data/generated/species.json`, `public/generated/species.json`, `src/data/generated/explorer-species.json`, `public/generated/explorer-species.json` | `scripts/import-usriis.ts` downloads the ScienceBase ZIP and parses `USRIISv2_MasterList.csv` | `2026-04-15T00:49:36.752Z` |
| EDDMapS, Early Detection and Distribution Mapping System, https://www.eddmaps.org/ | County-level invasive species presence, mainly for manually curated species and for merged county coverage | `src/data/source/eddmaps-snapshot.json`, `src/data/source/county-presence-snapshot.json` | `scripts/import-eddmaps.ts` calls EDDMapS county and subject endpoints, and the merged county snapshot currently preserves those existing EDDMapS rows while broader federal supplementation is refreshed separately | `2026-04-14T23:30:32.151Z`, then carried forward into the merged snapshot refreshed at `2026-04-23T06:02:34.172Z` |
| USGS Nonindigenous Aquatic Species, https://nas.er.usgs.gov/ | County-level occurrence support for aquatic and related mapped species in the merged county snapshot | `src/data/source/county-presence-snapshot.json` | `scripts/import-county-presence.ts` downloads the official NAS Darwin Core archive and normalizes county occurrences from `occurrence.txt` into the merged snapshot | Access date recorded in snapshot citation as `2026-04-22`, merged on `2026-04-23T06:02:34.172Z` |
| SERNEC Portal, https://sernecportal.org/portal/collections/harvestparams.php | County-level Alabama plant occurrence support for a vetted invasive-species supplement in the merged county snapshot | `src/data/source/county-presence-snapshot.json`, `src/data/generated/presence.json`, `public/generated/presence.json` | `scripts/import-county-presence.ts` posts public SERNEC Alabama specimen queries for a reviewed tranche of invasive catalog plants and normalizes county specimen results into the merged snapshot | Accessed and merged on `2026-04-23` |
| Alabama Invasive Plant Council list mirrored by Invasive Plant Atlas of the United States, https://www.invasiveplantatlas.org/list.html?id=71 | County-level Alabama plant occurrence support for ALIPC denominator species with reviewed catalog matches | `src/data/source/state-denominator-snapshots/alipc-2012.json`, `src/data/source/state-species-denominators.ts`, `src/data/source/county-presence-snapshot.json`, `src/data/generated/presence.json`, `public/generated/presence.json` | `scripts/import-alipc-list.ts` imports the ALIPC list snapshot and `scripts/import-county-presence.ts` queries EDDMapS subject county presence for matched Alabama ALIPC species | Accessed and merged on `2026-04-25` |
| Alabama Forestry Commission Cogongrass GIS, https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/Cogongrass/MapServer | County-level Alabama cogongrass occurrence support in the merged county snapshot | `src/data/source/county-presence-snapshot.json`, `src/data/generated/presence.json`, `public/generated/presence.json` | `scripts/import-county-presence.ts` queries the public ArcGIS county layer, extracts distinct county values, normalizes county names, and merges the resulting Alabama county coverage into `imperata-cylindrica` | Accessed and merged on `2026-04-23` |
| USDA APHIS emerald ash borer known infested counties FeatureServer, https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9 | County-level Alabama emerald ash borer occurrence support in the merged county snapshot | `src/data/source/county-presence-snapshot.json`, `src/data/generated/presence.json`, `public/generated/presence.json` | `scripts/import-county-presence.ts` queries the public ArcGIS county layer for Alabama rows, normalizes county FIPS, and merges the result into `Agrilus planipennis` coverage | Accessed and merged on `2026-04-23` |
| USDA Forest Service laurel wilt public county layer, https://services2.arcgis.com/iXA1dC6ldRMKRwra/arcgis/rest/services/Laurel_WIlt_Disease_Distribution_Public_View/FeatureServer/1 | County-level Alabama laurel wilt occurrence support in the merged county snapshot | `src/data/source/county-presence-snapshot.json`, `src/data/generated/presence.json`, `public/generated/presence.json` | `scripts/import-county-presence.ts` queries the public ArcGIS county layer for Alabama rows with non-null detection years, normalizes county FIPS, and merges the result into `Raffaelea lauricola` coverage | Accessed and merged on `2026-04-23` |
| `us-atlas` county topology package | County geometry used to normalize county matches and power map geometry in the app | Imported through `scripts/import-county-presence.ts` and runtime map code | Installed as an npm dependency, not fetched by a custom project importer | Exact acquisition date is not currently tracked in repo data files |

## Registry-Derived Authority Links

Many registry species pages expose an `Authority source` link. These links are carried through from US-RIIS `WebLink` values during `scripts/build-data.ts`.

- Used for: giving contributors and readers an upstream authority pointer for registry species
- Important limit: these authority URLs are not yet manually reviewed one by one
- Contributor guidance: treat them as upstream references, not as fully curated profile sources

## Image Sources

| Source | Used for | Repo artifacts | How acquired | Last tracked fetch or use |
| --- | --- | --- | --- | --- |
| Wikidata exact scientific-name match with Wikimedia Commons image property (P18) | Primary image acquisition path for catalog species | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries Wikidata, resolves Commons file paths, and downloads a web-sized image | `src/data/source/species-image-manifest.json` updated at `2026-04-15T09:04:34.342Z` |
| iNaturalist exact scientific-name taxon match fallback with commercially reusable license allowlist | Secondary image fallback when Wikidata does not produce a safe exact match | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries iNaturalist taxa and downloads only allowlisted licenses | `2026-04-15T09:04:34.342Z` |
| GBIF exact or accepted exact scientific-name match with still-image occurrence media fallback and commercially reusable license allowlist | Tertiary image fallback when Wikidata and iNaturalist do not produce a safe match | `src/data/source/species-image-manifest.json`, `public/species/catalog/*` | `scripts/import-species-images.ts` queries GBIF species and occurrence media | `2026-04-15T09:04:34.342Z` |
| Curated hero images stored directly in `src/data/source/species.ts` | Hero and lead images for curated profiles | `src/data/source/species.ts`, generated species JSON, top-level files under `public/species/` | Manually selected and stored in repo | Several legacy curated image credits are present, but source URLs and original acquisition timestamps are not yet tracked in one place |

## Curated Profile Content Sources

This section tracks sources used to write or maintain the hand-written species profiles in `src/data/source/species.ts`.

### Chunk 1, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aphis.usda.gov/plant-pests-diseases/slf | Spotted Lanternfly | Summary, visual ID cues, host impacts, travel and reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/eab | Emerald Ash Borer | Symptoms, impact framing, reporting path, wood movement guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/about-alb | Asian Longhorned Beetle | Beetle description, host context, reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/signs-alb | Asian Longhorned Beetle | Exit holes, egg sites, frass, other infestation cues |
| https://extension.psu.edu/tree-of-heaven | Tree-of-Heaven | ID cues, spread pattern, why the species matters |
| https://extension.psu.edu/tree-of-heaven-control-strategies | Tree-of-Heaven | Action section, root-focused control guidance, follow-up expectations |
| https://www.nps.gov/neri/learn/nature/kudzu.htm | Kudzu | Visual ID, growth pattern, ecological impact, repeat-control guidance |
| https://www.maine.gov/dacf/php/horticulture/gianthogweed.shtml | Giant Hogweed | Safety, action steps, reporting expectations, human-health risk |
| https://www1.maine.gov/dacf/php/horticulture/hogweedlookalikes.shtml | Giant Hogweed | Look-alike caution and identification guardrails |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/hydrilla | Hydrilla | ID details, spread pathways, prevention, reporting guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/pramorum | Sudden Oak Death | Host range, symptoms, plant movement restrictions, diagnosis framing |
| https://dec.ny.gov/nature/forests-trees/forest-health/beech-leaf-disease | Beech Leaf Disease | Visual symptoms, forest impact, documentation and reporting guidance |
| https://dec.ny.gov/nature/forests-trees/forest-health/oak-wilt | Oak Wilt | Symptoms, wound prevention, reporting path |
| https://tfsweb.tamu.edu/trees/tree-health/diseases/texas-oak-wilt/ | Oak Wilt | Management framing, timing context, practical response guidance |

### Pre-existing curated profile sources observed in repo on 2026-04-16

These sources are already referenced by current curated profiles, but the original research date was not tracked before the source inventory existed.

| Source URL | Species using it | Used for | Tracking note |
| --- | --- | --- | --- |
| https://www.aphis.usda.gov/operational-wildlife-activities/feral-swine | Feral Swine | Current curated profile copy and contact link | Observed in repo on `2026-04-16`; original consult date unknown |
| https://www.fws.gov/program/invasive-species | Nutria, Northern Snakehead | Current broad federal reference link | Observed in repo on `2026-04-16`; should be replaced with species-specific sources during those rewrites |
| https://www.eddmaps.org/ | Feral Swine, Nutria, Northern Snakehead | Broad mapping reference in current curated profile sources | Observed in repo on `2026-04-16`; should be replaced with more targeted profile sources during those rewrites |

### Chunk 2A pilot, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aphis.usda.gov/plant-pests-diseases/japanese-beetle | Japanese Beetle | Origin, host breadth, visual ID, movement concerns |
| https://extension.umn.edu/node/11076 | Japanese Beetle | Early action timing, hand removal, grub and yard management framing |
| https://extension.psu.edu/brown-marmorated-stink-bug | Brown Marmorated Stink Bug | Home invasion behavior, crop risk, exclusion and removal guidance |
| https://cals.cornell.edu/new-york-state-integrated-pest-management/outreach-education/whats-bugging-you/brown-marmorated-stink-bug | Brown Marmorated Stink Bug | Indoor nuisance framing, visual ID, exclusion and vacuum guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/spongy-moth | Spongy Moth | Egg-mass ID, caterpillar ID, quarantine and self-inspection guidance |
| https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/spotted-wing-drosophila | Spotted-wing Drosophila | Fruit injury, fly ID, trap and harvest guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/ifa | Red Imported Fire Ant | Mound ID, sting risk, quarantine and commodity movement guidance |
| https://extension.umn.edu/plant-diseases/dutch-elm-disease | Dutch Elm Disease | Symptoms, bark beetle spread, root-graft spread, pruning and arborist guidance |
| https://extension.psu.edu/chestnut-diseases | Chestnut Blight | Canker symptoms, spore signs, removal guidance |
| https://www.nps.gov/articles/ecological-threats-plants-animals.htm | Chestnut Blight | Forest impact, introduction pathway, ecosystem consequence framing |
| https://extension.umn.edu/identify-invasive-species/multiflora-rose | Multiflora Rose | Identification, reporting context, seed longevity, spread cues |
| https://extension.psu.edu/multiflora-rose-control-in-pastures/ | Multiflora Rose | Integrated control and repeat-treatment guidance |
| https://www.nps.gov/cuva/learn/nature/japanese-honeysuckle.htm | Japanese Honeysuckle | ID, spread pattern, control methods |
| https://www.nps.gov/articles/000/cheatgrass.htm | Cheatgrass | ID, fire-cycle impact, seed spread and prevention framing |
| https://extension.psu.edu/the-noxious-persistent-invasive-and-perennial-bindweeds | Field Bindweed | ID cues, persistence, root and rhizome management cautions |
| https://extension.umn.edu/identify-invasive-species/garlic-mustard | Garlic Mustard | ID, hand-pull timing, reporting and spread prevention |
| https://www.nps.gov/cuva/learn/nature/garlic-mustard.htm | Garlic Mustard | Forest impact, biennial life cycle, bagging guidance |
| https://www.nps.gov/cuva/learn/nature/purple-loosestrife.htm | Purple Loosestrife | ID, wetland impact, hand-pull vs larger-treatment framing |
| https://www.fws.gov/media/purple-loosestrife | Purple Loosestrife | Wetland habitat consequence framing |
| https://www.usgs.gov/faqs/what-are-zebra-mussels-and-why-should-we-care-about-them | Zebra Mussel | Spread pathway, ecosystem and infrastructure impact |
| https://extension.umn.edu/identify-invasive-species/zebra-mussel | Zebra Mussel | Identification and Clean, Drain, Dry style public action guidance |
| https://extension.umn.edu/identify-invasive-species/common-carp | Common Carp | Identification, reporting guidance, habitat-effect summary |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=4 | Common Carp | Ecology, habitat damage, turbidity and plant-loss impacts |

### Chunk 2B follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/plant-diseases/white-pine-blister-rust | White-pine blister rust | Disease cycle, pine and Ribes symptoms, pruning guidance, host-pairing guidance |
| https://apps.extension.umn.edu/garden/diagnose/weed/idlist.html | Yellow nutsedge | Basic control framing, tuber persistence, lawn and landscape context |
| https://www.canr.msu.edu/news/controlling_yellow_nutsedge_in_turfgrass | Yellow nutsedge | Homeowner management framing, repeat-treatment expectations, practical turf guidance |
| https://extension.umn.edu/identify-invasive-species/autumn-olive | Autumn Olive | Identification, origin, fruiting behavior, soil-change impact, reporting context |
| https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control | Autumn Olive, White Mulberry, Glossy Buckthorn | Cut stump and woody invasive control framing, resprout cautions, follow-up expectations |
| https://extension.umn.edu/identify-invasive-species/white-mulberry | White Mulberry | Identification, hybridization risk, escaped-cultivation context |
| https://extension.umn.edu/identify-invasive-species/glossy-buckthorn | Glossy Buckthorn | Identification, understory displacement, reporting context |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/cogongrass | Cogongrass | Origin, introduction pathway, dense-stand impact, reporting context |
| https://extension.msstate.edu/publications/cogongrass | Cogongrass | Identification details, rhizome spread, disturbance response, control cautions |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/saltcedar | Saltcedar | Introduction history, water-table and salinity impacts, broad invasive context |
| https://www.nps.gov/sagu/learn/nature/tamarisk.htm | Saltcedar | Riparian habitat effects, management cautions, wildlife-habitat caveat |
| https://www.aphis.usda.gov/operational-wildlife-activities/starlings-blackbirds | European Starling | Property and agricultural damage, native bird competition, exclusion and management guidance |
| https://www.invasivespeciesinfo.gov/terrestrial/vertebrates/european-starling | European Starling | Introduction history and broad invasive context |
| https://www.invasivespeciesinfo.gov/aquatic/invertebrates/asian-clam | Asiatic Clam | Origin, U.S. introduction timeline, colony-forming impact, public spread-prevention framing |
| https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=92 | Asiatic Clam | Ecology, infrastructure fouling, pipe-clogging impact, spread context |
| https://extension.umn.edu/identify-invasive-species/wild-parsnip | Wild Parsnip | Phototoxic burn risk, identification, reporting and handling guidance |
| https://extension.umn.edu/identify-invasive-species/poison-hemlock | Poison Hemlock | Toxicity, purple-blotched stem ID, reporting path, conservative handling guidance |
| https://extension.umn.edu/identify-invasive-species/spotted-knapweed | Spotted Knapweed | Identification, seed spread, handling caution, reporting context |

### Chunk 2C follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/identify-invasive-species/norway-maple | Norway Maple | Identification, woodland impact, reporting context |
| https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control | Norway Maple | Cut stump and woody invasive control framing, follow-up expectations |
| https://extension.psu.edu/japanese-stiltgrass | Japanese Stiltgrass | Identification, spread pathways, understory impact, timing of control |
| https://extension.psu.edu/controlling-japanese-stiltgrass-in-your-garden | Japanese Stiltgrass | Home landscape management framing, practical control timing |
| https://extension.umn.edu/identify-invasive-species/white-and-yellow-sweetclover | Yellow Sweetclover | Identification, habitat impact, seedbank and reporting context |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/johnsongrass | Johnsongrass | Origin, introduction pathway, agricultural impact framing |
| https://extension.msstate.edu/publications/johnsongrass | Johnsongrass | Identification, livestock risk, practical management cautions |
| https://extension.umn.edu/nuisance-insects/multicolored-asian-lady-beetles | Multicolored Asian Lady Beetle | Identification, indoor nuisance framing, exclusion guidance |
| https://extension.umn.edu/yard-and-garden-news/soybean-harvest-brings-familiar-pest-asian-lady-beetles | Multicolored Asian Lady Beetle | Origin context, seasonal movement, crop-to-home transition framing |
| https://extension.umn.edu/identify-invasive-species/canada-thistle | Canada Thistle | Identification, rhizome spread, reporting context |
| https://blog-fruit-vegetable-ipm.extension.umn.edu/2023/04/a-war-of-attrition-canada-thistle.html | Canada Thistle | Repeat-management framing and root-focused control expectations |
| https://extension.umn.edu/identify-invasive-species/oxeye-daisy | Oxeye Daisy | Identification, habitat impact, reporting context |
| https://extension.umn.edu/identify-invasive-species/butter-and-eggs | Butter and Eggs | Identification, root spread, seed persistence, reporting context |
| https://extension.umn.edu/weed-identification/annual-broadleaf-weeds | Velvetleaf | Identification details, seed capsule traits, general weed framing |
| https://extension.umn.edu/yard-and-garden-news/zero-seed-rain | Velvetleaf | Seedbank persistence and practical removal timing |
| https://extension.okstate.edu/fact-sheets/ecology-and-management-of-sericea-lespedeza | Sericea Lespedeza | Origin, ecosystem impact, integrated management framing |
| https://extension.okstate.edu/programs/plant-id/plant-profiles/sericea-lespedeza/ | Sericea Lespedeza | Identification, leaflet traits, habitat context |
| https://apps.extension.umn.edu/garden/diagnose/plant/deciduous/butternut/trunkdieback.html | Butternut Canker Fungus | Canker symptoms, dieback pattern, tree-level diagnosis cues |
| https://extension.umn.edu/invasive-species/terrestrial-invasive-species-participatory-science-tips-projects | Butternut Canker Fungus | Reporting and conservation-monitoring context |
| https://extension.psu.edu/toxic-weed-in-the-landscape-jimsonweed | Jimsonweed | Toxicity, identification, seed pod cues, safe removal framing |
| https://extension.umn.edu/identify-invasive-species/leafy-spurge | Leafy Spurge | Identification, ecological impact, reporting context |
| https://apps.extension.umn.edu/garden/diagnose/weed/broadleaf/upright/leafyspurge.html | Leafy Spurge | Milky sap caution and weed-ID confirmation details |
| https://extension.umn.edu/identify-invasive-species/orange-hawkweed | Orange Hawkweed | Identification, spread by runners and seed, reporting context |
| https://extension.umn.edu/identify-invasive-species/common-and-cutleaf-teasel | Cutleaf Teasel | Identification, biennial life cycle, seedbank and reporting context |
| https://www.cdc.gov/dengue/stories/unwanted-mosquitoes.html | Yellow Fever Mosquito | Public health significance, adult ID, household prevention framing |
| https://www.cdc.gov/mosquitoes/about/life-cycle-of-aedes-mosquitoes.html | Yellow Fever Mosquito | Container breeding behavior and practical source-reduction guidance |
| https://extension.umn.edu/identify-invasive-species/common-tansy | Common Tansy | Identification, toxicity, reporting context |
| https://extension.umn.edu/identify-invasive-species/crown-vetch | Crown Vetch | Identification, rhizome spread, habitat impact, reporting context |
| https://extension.umn.edu/forage-variety-selection/forage-legumes | Crown Vetch | Origin, historical planting context, livestock caution |

### Chunk 2D follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.psu.edu/callery-pear | Callery Pear | Introduction history, ID cues, spread pattern, removal framing |
| https://extension.psu.edu/english-ivy-in-the-landscape | English Ivy | Evergreen vine ID, canopy impact, cut-and-pull control framing |
| https://www.tn.gov/protecttnforests/invasive-plants/bush-honeysuckle.html | Amur Honeysuckle | Shrub honeysuckle ID, seasonality, thicket impact, control framing |
| https://extension.psu.edu/oriental-bittersweet | Oriental Bittersweet | Vine ID, fruiting cues, canopy impact, root-sprout control framing |
| https://www.nps.gov/chat/learn/nature/privet.htm | Chinese Privet | Thicket-forming habit, habitat context, fruiting and spread pattern |
| https://extension.psu.edu/invasive-autumn-and-russian-olives | Russian Olive | Silvery foliage ID, riparian impact, woody control framing |
| https://wildlife.ca.gov/Conservation/Plants/Dont-Plant-Me/Giant-Reed | Giant Reed | Riparian impact, fragment spread risk, report-first management framing |
| https://www.tn.gov/protecttnforests/invasive-plants/paulownia.html | Princess Tree | Disturbed-site colonization, seed and sprout behavior, control framing |
| https://extension.umn.edu/identify-invasive-species/black-swallow-wort | Black Swallow-Wort | Vine ID, monarch impact, early-report emphasis |
| https://extension.psu.edu/mile-a-minute | Mile-a-Minute Vine | Barbed stem ID, fruiting cues, early pull-and-bag management |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/giant-salvinia | Giant Salvinia | Floating fern ID, reporting pathway, containment framing |
| https://www.texasinvasives.org/giantsalvinia/ | Giant Salvinia | Mat-forming growth, spread by fragments, public prevention framing |
| https://www.seagrant.wisc.edu/our-work/focus-areas/ais/invasive-species/invasive-species-fact-sheets/plants/eurasian-watermilfoil/ | Eurasian Watermilfoil | Submerged plant ID, fragment spread, clean-drain-dry prevention framing |
| https://edis.ifas.ufl.edu/publication/IN278 | Formosan Termite | Swarm timing, mud tube cues, structural risk, professional-treatment framing |
| https://www.aphis.usda.gov/plant-pests-diseases/box-tree-moth | Box Tree Moth | Caterpillar and moth ID, defoliation risk, reporting path |
| https://www.umass.edu/agriculture-food-environment/landscape/fact-sheets/dogwood-anthracnose | Dogwood Anthracnose | Leaf and twig symptoms, cool-shade disease pattern, management limits |
| https://extension.psu.edu/dogwood-diseases | Dogwood Anthracnose | Confirmation cues, pruning and stress-reduction framing |
| https://www.fisheries.noaa.gov/southeast/ecosystems/impacts-invasive-lionfish | Lionfish | Ecological impact, range context, removal-program framing |
| https://oceanservice.noaa.gov/facts/lionfish-facts.html | Lionfish | Venomous-spine caution, aquarium-release prevention, public context |
| https://www.nps.gov/grca/learn/nature/nzmudsnail.htm | New Zealand Mud Snail | Density and ecological impact, spread context, prevention emphasis |
| https://www.nps.gov/cure/learn/nature/mussel_facts.htm?fullweb=1 | New Zealand Mud Snail | Gear-hitchhiking behavior, decontamination and prevention framing |
| https://extension.umn.edu/identify-invasive-species/jumping-worms | Jumping Worm | Clitellum cue, soil-impact framing, prevention guidance |
| https://hort.extension.wisc.edu/articles/jumping-worms/ | Jumping Worm | Movement behavior, coffee-ground casting cue, disposal and sanitation framing |

### Chunk 2E follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/identify-invasive-species/burning-bush | Winged Burning Bush | Stem wing cues, fruiting traits, ornamental escape history, replacement framing |
| https://extension.umn.edu/identify-invasive-species/common-buckthorn | Common Buckthorn | Thorn and leaf cues, late leaf retention, understory impact, soybean aphid context |
| https://extension.umn.edu/identify-invasive-species/yellow-iris | Yellow Flag Iris | Shoreline ID cues, rhizome spread, reporting context |
| https://extension.umn.edu/identify-invasive-species/flowering-rush | Flowering Rush | Triangular leaf cue, bulbil spread, shallow-water habitat, report-first framing |
| https://www.michigan.gov/invasives/0%2C5664%2C7-324-68002_71240_73848-368761--%2C00.html | Curly-Leaf Pondweed | Cool-season growth timing, wavy serrated leaf cue, aquatic impact and reporting framing |
| https://extension.umn.edu/identify-invasive-species/common-barberry | Common Barberry | Spine and berry ID, stem rust host context, resprout and seed persistence risk |
| https://extension.umn.edu/identify-invasive-species/hoary-alyssum | Hoary Alyssum | Hairy gray-green ID, habitat context, seed production, invasive spread framing |
| https://extension.umn.edu/horse-pastures-and-facilities/hoary-alyssum-most-common-poisonous-plant-horses-minnesota | Hoary Alyssum | Horse toxicity, hay contamination risk, removal urgency |
| https://www.montana.edu/extension/montguides/montguidehtml/MT199709AG.html | Common Houndstongue | Biennial life cycle, bur spread, livestock toxicity, root-crown removal framing |
| https://extension.usu.edu/pests/ipm/ornamental-pest-guide/weeds/w_puncturevine.php | Puncturevine | Growth form, burr ID, seed timing, hand-pull guidance |
| https://adams.extension.colostate.edu/ag-acreage/puncturevine/ | Puncturevine | Goathead hazard framing, seedpod containment, mechanical control timing |
| https://extension.umn.edu/identify-invasive-species/siberian-elm | Siberian Elm | Twig and leaf ID, prairie invasion context, prolific seed and resprout framing |
| https://www.michigan.gov/invasives/id-report/plants/shrubs/japanese-knotweed | Japanese Knotweed | Bamboo-like stems, rhizome spread, riparian impact, report-first control framing |
| https://www.michigan.gov/invasives/id-report/plants/herbs/lesser-celandine | Lesser Celandine | Spring-ephemeral timing, bulbil and tuber spread, floodplain impact, reporting guidance |
| https://www.mda.state.mn.us/es/node/737 | Larger Pine Shoot Beetle | Shoot-feeding damage cues, pine host context, movement caution and reporting framing |
| https://extension.psu.edu/black-vine-weevil/ | Black Vine Weevil | Adult notching, root-feeding larvae, host range, monitoring and timing guidance |
| https://www.fs.usda.gov/eng/active_dev/views/balsam_woolly_adelgid.html | Balsam Woolly Adelgid | Cottony tuft cue, fir decline pattern, nonnative origin, movement caution |
| https://extension.psu.edu/elm-leaf-beetle | Elm Leaf Beetle | Egg, larva, and adult ID, skeletonizing damage, repeated-defoliation risk |
| https://www.maine.gov/dacf/mfs/forest_health/invasive_threats/browntail_moth_info.htm | Browntail Moth | Winter web timing, host use, tree impact, web-removal framing |
| https://www.maine.gov/dhhs/browntailmoth | Browntail Moth | Toxic hair exposure, rash and breathing risk, public-health caution |
| https://extension.umd.edu/resource/beech-bark-disease | Beech Bark Disease | Scale-plus-fungus disease complex, bark symptoms, mortality pattern, limited control framing |
| https://extension.umn.edu/disease-management/basil-downy-mildew | Basil Downy Mildew | Leaf symptom progression, underside spore growth, seed and transplant spread, resistant-variety prevention |
| https://extension.umn.edu/soybean-pest-management/soybean-rust | Asian Soybean Rust | Lower-canopy symptoms, pustule cues, weather timing, scout-and-confirm guidance |
| https://edis.ifas.ufl.edu/publication/UW486 | Brown Anole | Native range, Florida introduction pathway, ID cues, spread in potted plants and cargo |
| https://dec.ny.gov/nature/animals-fish-plants/mute-swan | Mute Swan | Bill and knob ID, submerged vegetation impact, aggression and reporting context |
| https://www.nps.gov/lake/learn/nature/quaggamussels.htm | Quagga Mussel | Boat-spread prevention, infrastructure fouling, clean-drain-dry public guidance |
| https://www.nps.gov/cure/learn/nature/mussel_facts.htm | Quagga Mussel | Veligers, life cycle, dense colonization, aquatic hitchhiker framing |
| https://www.fws.gov/carp/species/bighead-carp-hypophthalmichthys-nobilis | Bighead Carp | Head and eye placement ID, introduction history, feeding impact, report-and-do-not-move guidance |

### Chunk 2F follow-up, consulted on 2026-04-16

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.tn.gov/protecttnforests/invasive-plants/kudzu.html | Kudzu | Vine ID, tuber and node spread, integrated control framing, sanitation after mowing |
| https://extension.umn.edu/identify-invasive-species/exotic-honeysuckles | Bell's Honeysuckle; Morrow's Honeysuckle; Tatarian Honeysuckle | Species distinctions, hollow stem cue, berry spread, understory impact |
| https://www.tn.gov/protecttnforests/invasive-plants/privet.html | European Privet | Privet thicket impact, opposite leaf and flower traits, management framing |
| https://mdc.mo.gov/discover-nature/field-guide/common-periwinkle | Common Periwinkle | Escaped groundcover framing, stem-rooting behavior, woodland-mat impact |
| https://invasive-species.extension.org/populus-alba-white-poplar/ | White Poplar | White-backed leaf cue, clonal suckering, brittle growth habit, colony-forming spread |
| https://site.extension.uga.edu/forsyth/2024/06/two-invasive-plants-to-weed-out-now/ | Mimosa Tree | Introduction history, public-facing naming, ornamental escape context |
| https://extension.umn.edu/identify-invasive-species/giant-knotweed | Giant Knotweed | Leaf and stem distinctions from Japanese knotweed, rhizome spread, report-first framing |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/water-chestnut | Water Chestnut | Floating rosette ID, spiny nuts, fish-kill risk, report-fast framing |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/water-hyacinth | Water Hyacinth | Air-bladder leaf stalk cue, ornamental-escape pathway, colony growth and reporting guidance |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/yellow-floating-heart | Yellow Floating Heart | Fringed flower ID, floating-leaf cue, mat-forming impact, look-alike separation |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/parrot-feather | Parrot Feather | Emergent feathery shoot ID, fragmentation spread, report-first aquatic guidance |
| https://www.michigan.gov/invasives/id-report/plants/aquatic/starry-stonewort | Starry Stonewort | Bulbil and branchlet cues, macroalga framing, underwater spread and reporting context |
| https://www.texasinvasives.org/plant_database/detail.php?symbol=TRSE6 | Chinese Tallow | Introduction history, leaf and fruit cues, habitat breadth, ecological threat |
| https://www.texasinvasives.org/professionals/management_detail.php?symbol=TRSE6 | Chinese Tallow | Root-sprout management framing, cut-stump and girdle follow-up guidance |
| https://www.caes.uga.edu/research/impact/impact-statement/4398/invasive-insect-pest-of-legumes-threatens-georgia-agriculture.html | Kudzu Bug | U.S. introduction history, kudzu and soybean linkage, nuisance swarm context |
| https://extensionentomology.tamu.edu/resources/management-guides/sorghum/stem-and-leaf-feeding-insects/ | Yellow Sugarcane Aphid | Aphid ID, sorghum damage pattern, scouting and threshold framing |
| https://www.fws.gov/species/silver-carp-hypophthalmichthys-molitrix | Silver Carp | Jumping hazard, head and eye placement ID, introduction history, do-not-move guidance |

### Chunk 2G follow-up, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/st-johnswort | Common St. John's Wort | Origin, pasture impact, livestock toxicity framing, early-removal guidance |
| https://ag.colorado.gov/conservation/noxious-weeds/noxious-weed-species-id/cypress-spurge | Cypress Spurge | Identification, rhizome spread, toxic sap caution, pasture and grassland impact |
| https://gardeningsolutions.ifas.ufl.edu/care/weeds-and-invasive-plants/chinaberry.html | Chinaberry Tree | Ornamental escape history, fruit toxicity, colony-forming spread, management framing |
| https://plantatlas.usf.edu/flip/plant.aspx?id=145 | Castor Bean | Identification, disturbed-site ecology, toxicity context, disposal caution |
| https://mdc.mo.gov/discover-nature/field-guide/golden-rain-tree | Goldenrain Tree | Identification, seed-pod cues, escape-from-cultivation framing |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/brazilian-peppertree | Brazilian Peppertree | Introduction pathway, dense-thicket impact, report-first natural-area guidance |
| https://research.fs.usda.gov/feis/species-reviews/soldul | Climbing Nightshade | Introduction context, wetland-edge habitat, berry toxicity, identification cues |
| https://extension.umn.edu/identify-invasive-species/narrow-leaf-cattail | Narrowleaf Cattail | Flower-spike gap cue, wetland monoculture risk, report guidance |
| https://www.dnr.state.mn.us/invasives/aquaticplants/brittlenaiad/index.html | Brittle Waternymph | Submerged ID cues, fragment and seed spread, clean-drain-dry prevention framing |
| https://invasive-species.extension.org/impatiens-glandulifera-ornamental-jewelweed/ | Himalayan Balsam | Hollow stem and flower cues, explosive seedpod spread, riparian impact framing |
| https://plantscience.psu.edu/outreach/plant-id/grasses/dayflower | Asiatic Dayflower | Flower structure, rooting-stem habit, early control framing |
| https://plants.ces.ncsu.edu/plants/acer-pseudoplatanus/ | Sycamore Maple | Seedling-carpet spread, bark and samara cues, invasive-tree framing |
| https://ento.psu.edu/outreach/extension/ipm/english/agriculture/pest-problem-solver/vegetable-insect-pests/european-corn-borer | European Corn Borer | Crop damage cues, egg and larval ID, threshold-based scouting framing |
| https://extension.usu.edu/pests/ipm/ornamental-pest-guide/arthopods/bark-beetles/elm-bark-beetles | Banded Elm Bark Beetle | Beetle ID, under-bark damage, Dutch elm disease vector context |
| https://www.mda.state.mn.us/elongate-hemlock-scale | Elongate Hemlock Scale | Needle symptom cues, host range, nursery and tree-movement caution |
| https://extension.psu.edu/oystershell-scale | Oystershell Scale | Bark-encrusting ID, host range, crawler-stage treatment timing framing |
| https://extension.missouri.edu/publications/pa100 | Asian Chestnut Gall Wasp | Gall ID, spread through plant material, chestnut growth and nut-production impact |
| https://www.fws.gov/species/argentine-black-and-white-tegu-salvator-merianae | Argentine Black and White Tegu | Identification, pet-trade introduction, wildlife-predation risk, report guidance |
| https://www.invasivespeciesinfo.gov/terrestrial/invertebrates/sirex-woodwasp | Sirex Woodwasp | Pine attack pathway, fungus-associated tree decline, wood-movement caution |
| https://icrcc.fws.gov/carp/invasive-carp/grass-carp | Grass Carp | Body-shape ID, vegetation-removal impact, do-not-move guidance |
| https://www.michigan.gov/invasives/id-report/mollusks/brown-garden-snail | Brown Garden Snail | Shell ID, garden and orchard damage, reporting context for regulated detections |
| https://hort.extension.wisc.edu/articles/viburnum-leaf-beetle/ | Viburnum Leaf Beetle | Egg-scar cue, repeated defoliation pattern, host vulnerability and seasonal guidance |
| https://extension.psu.edu/european-pine-shoot-moth | European Pine Shoot Moth | Resin and crooking cues, pine-host impact, pruning and timing guidance |
| https://extension.psu.edu/birch-leafminer | Birch Leafminer | Leaf-mine symptoms, host preference, early-season management framing |

### Chunk 2H scale-up pass, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/white-clover | White Clover | Growth habit, stolon spread, lawn and disturbed-ground identification |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/curly-dock | Curly Dock | Wavy-leaf ID, taproot persistence, seed-stalk timing |
| https://ag.colorado.gov/conservation/noxious-weeds/noxious-weed-species-id/common-mullein | Common Mullein | Rosette and flower-spike ID, disturbed-ground ecology, seed-bank framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/shepherds-purse | Shepherd's Purse | Rosette and purse-pod ID, cool-season annual behavior, early-removal framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/black-medic | Black Medick | Clover look-alike separation, pod cue, compacted-site behavior |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/lambsquarter | Lambsquarters | Mealy new-growth cue, fast-growth habit, seed-heavy annual framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/wild-carrot | Queen Anne's Lace | Umbel ID, bird's-nest seedhead cue, carrot-family look-alike caution |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/prickleylettuce | Prickly Lettuce | Midrib spine cue, tall annual habit, early-seed prevention guidance |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/buckhorn-plantain | Buckhorn Plantain | Ribbed leaf and seedhead ID, compacted-turf framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/henbit | Henbit | Clasping upper leaves, cool-season spread, simple yard-management framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/bull-thistle | Bull Thistle | Rosette and flowering-thistle ID, seed-head timing, pasture impact |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/common-chickweed | Common Chickweed | Hair-line stem cue, mat-forming habit, moist-soil spread pattern |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/red-sorrel | Common Sheep Sorrel | Arrowhead leaf cue, rhizome spread, low-fertility soil context |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/chicory | Chicory | Blue-flower ID, roadside habit, taproot persistence |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/ground-ivy | Ground Ivy | Creeping stem ID, shade-mat growth, stolon-driven spread |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/pennycress-1 | Field Pennycress | Coin-like pod cue, annual habit, seed-timing guidance |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/burdock | Common Burdock | Large-leaf rosette ID, hooked bur spread, trail and pasture relevance |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/broadleaf-plantain | Common Plantain | Broad rosette ID, compacted-ground context, turf-management framing |
| https://plantscience.psu.edu/outreach/plant-id/grasses/orchardgrass | Orchardgrass | Bunchgrass ID, large ligule cue, old-field and restoration context |
| https://plantscience.psu.edu/outreach/plant-id/grasses/quackgrass | Quackgrass | Clasping auricle cue, rhizome spread, soil-movement caution |
| https://plantscience.psu.edu/outreach/plant-id/grasses/barnyardgrass | Barnyardgrass | No-ligule ID, seedhead cue, wet disturbed-ground behavior |
| https://extension.illinois.edu/invasives/invasive-wintercreeper | Wintercreeper | Forest-mat impact, climbing-vine behavior, removal framing |
| https://www.mfc.ms.gov/forest-health/invasive-plants/chinese-japanese-wisteria/ | Chinese Wisteria | Twining-vine ID, canopy impact, staged woody-vine control framing |
| https://extension.psu.edu/privet | Japanese Privet; Border Privet | Privet thicket behavior, berry spread, woody shrub management framing |
| https://extension.umd.edu/resource/invasives-your-woodland-japanese-hop/ | Japanese Hop | Hooked-hair ID, riparian spread, skin-irritation caution |
| https://www.mfc.ms.gov/forest-health/invasive-plants/japanese-climbing-fern/ | Japanese Climbing Fern | Climbing-frond ID, fire-ladder risk, report-first framing |
| https://invasive-species.extension.org/miscanthus-sinensis-chinese-silvergrass/ | Chinese Silvergrass | Ornamental-escape context, plume ID, fire-risk framing |
| https://extension.umn.edu/node/21931 | Dalmatian Toadflax | Clasping-leaf and flower ID, root-spread risk, report guidance |
| https://extension.umn.edu/identify-invasive-species/diffuse-knapweed | Diffuse Knapweed | Knapweed ID, forage loss, long-distance seed-spread context |
| https://mdc.mo.gov/discover-nature/field-guide/yellow-bluestem | Yellow Bluestem | Seedhead ID, prairie-invasion context, old-seeding escape framing |
| https://dnr.wisconsin.gov/topic/Invasives/fact/BishopsGoutweed | Bishop's Goutweed | Groundcover-mat impact, rhizome spread, woodland-edge context |
| https://wildlife.ca.gov/Conservation/Plants/Dont-Plant-Me/Big-Periwinkle | Bigleaf Periwinkle | Riparian mat impact, rooting-fragment risk, ornamental-escape framing |
| https://www.invasivespeciesinfo.gov/terrestrial/plants/sacred-bamboo | Sacred Bamboo | Berry and cane traits, ornamental-escape context, fruit-spread risk |
| https://mdc.mo.gov/discover-nature/field-guide/sweet-autumn-virgins-bower-autumn-clematis | Sweet Autumn Clematis | Flower and seedhead cues, vine-mass impact, edge-spread framing |
| https://invasive-species.extension.org/arthraxon-hispidus-small-carpgrass/ | Small Carpgrass | Hairy-leaf-margin cue, wet-habitat invasion, report framing |
| https://ag.colorado.gov/conservation/noxious-weeds/noxious-weed-species-id/scotch-thistle | Scotch Thistle | Giant rosette and winged-stem ID, access and forage impact |
| https://www.invasivespeciesinfo.gov/aquatic/plants/brazilian-waterweed | Brazilian Waterweed | Submerged-whorl ID, aquarium pathway, clean-drain-dry framing |
| https://research.fs.usda.gov/feis/species-reviews/rubpho | Wine Raspberry | Red-haired cane ID, thicket behavior, edge-invasion framing |
| https://www.dnr.state.mn.us/invasives/terrestrialplants/erect-hedgeparsley.html | Erect Hedgeparsley | White-umbel ID, burr spread, look-alike caution |
| https://www.dnr.state.mn.us/invasives/terrestrialplants/herbaceous/cowvetch.html | Bird Vetch | Tendril vine ID, smothering growth, roadside and restoration impact |
| https://www.deq.nc.gov/about/divisions/water-resources/water-planning/water-supply-planning/aquatic-weed-control-program/alligatorweed-alternanthera-philoxeroides | Alligatorweed | Floating-mat ID, hollow-stem cue, navigation and flood impact |
| https://extension.psu.edu/lawn-and-turfgrass-weeds-creeping-buttercup | Creeping Buttercup | Runner-based spread, wet-soil context, livestock and lawn caution |
| https://extension.umn.edu/identify-invasive-species/smooth-brome-grass | Smooth Brome | M-shaped leaf cue, prairie dominance pattern, rhizome spread |
| https://www.fs.usda.gov/wildflowers/plant-of-the-week/nasturtium_officinale.shtml | Watercress | Aquatic mustard ID, edible-plant introduction context, spring and seep invasion framing |
| https://mdc.mo.gov/discover-nature/field-guide/orange-daylily | Orange Daylily | Clonal spread, old-planting escape pattern, ditch and stream-edge context |
| https://dnr.wisconsin.gov/topic/Invasives/fact/Moneywort | Moneywort | Coin-leaf mat ID, wet-ground spread, ornamental-pond escape framing |
| https://extension.umn.edu/identify-invasive-species/white-and-yellow-sweetclover | White Sweet Clover | Tall biennial habit, open-grassland impact, seed-bank and report context |
| https://plantscience.psu.edu/outreach/plant-id/grasses/velvet-grass-1 | Common Velvetgrass | Hairy leaf and sheath cue, moist-field behavior, grass-layer simplification |
| https://plantscience.psu.edu/outreach/plant-id/grasses/goosegrass | Goosegrass | Flat clump and finger-spike ID, compaction tolerance, turf-management framing |

### Chunk 2I mixed category pass, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/soybean-pest-management/soybean-aphid | Soybean Aphid | Aphid ID, buckthorn link, scouting value, threshold-ready action framing |
| https://extension.psu.edu/european-pine-sawfly | European Pine Sawfly | Needle-feeding damage, introduction history, landscape and nursery relevance |
| https://extension.psu.edu/cereal-leaf-beetle/ | Cereal Leaf Beetle | Larval ID, flag-leaf damage, scouting and threshold framing |
| https://extension.okstate.edu/programs/digital-diagnostics/insects-and-arthropods/hessian-fly-mayetiola-destructor/ | Hessian Fly | Flaxseed puparia cue, wheat injury pattern, crop-focused management context |
| https://edis.ifas.ufl.edu/publication/IN156 | Pink Hibiscus Mealybug | Host breadth, waxy pink body, deformation damage, homeowner and regulatory framing |
| https://extension.umd.edu/resource/calico-scale | Calico Scale | Female and crawler ID, honeydew and soot mold impacts, monitoring timing |
| https://extension.psu.edu/tree-fruit-insect-pest-pear-thrips | Pear Thrips | Introduction note, blossom injury, outbreak timing, orchard context |
| https://content.ces.ncsu.edu/stink-bug-in-soybean | Southern Green Stink Bug | Red-banded antenna cue, pod injury, scouting threshold context |
| https://www.canr.msu.edu/resources/caterpillar_pests_in_cole_crops | Cabbage White Butterfly | Adult imported-cabbageworm link, garden crop damage, public-facing ID lead |
| https://research.fs.usda.gov/treesearch/39945 | Phytophthora lateralis | Port-Orford-cedar root disease framing, pathogen background, forest context |
| https://research.fs.usda.gov/treesearch/44240 | Phytophthora cinnamomi | Oak decline association, eastern forest distribution, root rot framing |
| https://cropprotectionnetwork.org/encyclopedia/southern-corn-leaf-blight-of-corn | Southern Corn Leaf Blight | Lesion shape, ear and stalk symptoms, resistant-hybrid and fungicide framing |
| https://www.aphis.usda.gov/plant-pests-diseases/black-stem-rust-barberry | Stem Rust | Host alternation, stem lesion cues, regulatory and barberry context |
| https://research.fs.usda.gov/treesearch/10524 | Scleroderris Canker | Young pine mortality pattern, Lake States distribution, nursery and plantation risk |
| https://www.fws.gov/species/mediterranean-gekko-hemidactylus-turcicus | Mediterranean Gecko | Species overview, nonnative status, and public-facing range context |
| https://www.floridamuseum.ufl.edu/southflorida/regions/keys/introduced-species/ | Mediterranean Gecko | Florida establishment context and introduced-built-environment framing |
| https://myfwc.com/wildlifehabitats/profiles/birds/monk-parakeet/ | Monk Parakeet | Nest behavior, regulatory status, urban nuisance and infrastructure context |
| https://myfwc.com/wildlifehabitats/profiles/reptiles/lizards/green-iguana/ | Green Iguana | Invasive status, native-plant and seawall impacts, humane removal framing |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=2633 | Giant Applesnail | Shell and egg-mass ID, habitat, status, and ecological impact notes |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=713 | Round Goby | Fused pelvic-fin ID, ballast pathway, mussel and fish impact framing |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/walking-catfish/ | Walking Catfish | Air-breathing and overland movement, Florida status, and possession rule context |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=457 | African Jewelfish | Canal habitat, aggressive behavior, spread in Florida, and impact notes |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=61 | Greenhouse Frog | Toe-pad separation, yard habitat, established spread, and public ID notes |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/blue-tilapia/ | Blue Tilapia | Quick field ID, broad Florida habitat, invasive status, and angler-facing relevance |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=931 | Brown Trout | Nonnative range context, stream habitat, and injurious-listing note |
| https://www.michigan.gov/dnr/education/michigan-species/fish-species/brown-trout | Brown Trout | Identification details, introduction background, and careful public-use context |
| https://ag.colorado.gov/conservation/noxious-weeds/noxious-weed-species-id/jointed-goatgrass | Jointed Goatgrass | Hairy auricle cue, wheat look-alike problem, agronomic impact |
| https://extension.illinois.edu/invasives/invasive-chaff-flower | Japanese Chaff Flower | Seed-bract cue, riparian spread, dense monoculture impact |
| https://extension.umd.edu/resource/vines-maryland-gardens | Chocolate Vine | Invasive-vine warning, garden-escape context, and homeowner framing |
| https://www.nps.gov/rocr/learn/nature/non-native-plants.htm | Chocolate Vine | Natural-area escape confirmation and park-land invasion context |
| https://extension.psu.edu/wild-onion-and-wild-garlic | Crow Garlic | Hollow-leaf cue, bulbil reproduction, turf and landscape management framing |

### Chunk 2J targeted backup-pool pass, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://extension.umn.edu/yard-and-garden-insects/sawflies | Introduced Pine Sawfly | Larval ID, host range, two-generation timing, and sawfly-specific management framing |
| https://research.fs.usda.gov/treesearch/658 | Introduced Pine Sawfly | U.S. introduction context, white-pine damage framing, and regional host note |
| https://www.fs.usda.gov/r10/natural-resources/forest-health/spruce-aphid | Spruce Aphid | Current Alaska distribution, mild-winter outbreak framing, host range, and public symptom language |
| https://research.fs.usda.gov/treesearch/48048 | Spruce Aphid | Naming correction from green spruce aphid to spruce aphid in North American usage, size cue, and dormant-needle feeding context |
| https://www.fs.usda.gov/main/r3/forest-grasslandhealth/insects-diseases | Spruce Aphid | Honeydew, yellow-to-brown needle symptom progression, and lower-crown thinning cues |
| https://ant-pests.extension.org/imported-fire-ants/ | Black Imported Fire Ant | Introduction history, limited range note, and medical-economic impact framing |
| https://fieldreport.caes.uga.edu/publications/B1191/ | Black Imported Fire Ant | Urban management framing, nuisance impact, and local-action language |
| https://www.fws.gov/media/ecological-risk-screening-summary-egyptian-goose-alopochen-aegyptiaca-high-risk | Egyptian Goose | Introduction pathway, nest-site competition, crop-damage risk, and high-risk context |
| https://myfwc.com/hunting/regulations/nongame/ | Egyptian Goose | Florida regulatory note and conservative state-wildlife action framing |
| https://www.fws.gov/species/black-spiny-tailed-iguana-ctenosaura-similis | Black Spiny-tailed Iguana | Species overview and public-facing naming support |
| https://myfwc.com/get-involved/volunteer/regional-programs/s-region/ | Black Spiny-tailed Iguana | Burrowing-owl displacement context and management relevance in south Florida |
| https://myfwc.com/wildlifehabitats/nonnatives/report/ | Black Spiny-tailed Iguana | Reporting workflow, IveGot1 guidance, and photo-location-date requirements |
| https://plant-directory.ifas.ufl.edu/plant-directory/abrus-precatorius/ | Rosary Pea | Public-facing common-name cleanup, seed toxicity, fruit and foliage cues, and Florida invasion context |
| https://ask.ifas.ufl.edu/publication/WG209 | Rosary Pea | Mechanical and herbicide management framing, plus seed toxicity caution |
| https://www.nps.gov/viis/planyourvisit/plants-to-avoid-while-hiking.htm?fullweb=1 | Rosary Pea | Visitor-safety framing and immediate-medical-attention caution for ingestion or exposure |
| https://dnr.wisconsin.gov/topic/Invasives/fact/BlackAlder | European Alder | Sticky-leaf ID, cone and catkin cues, water-dispersed seed framing, hybridization risk, and resprout-aware control guidance |
| https://www.michigan.gov/dnr/managing-resources/forestry/urban/recommended-trees | European Alder | Secondary confirmation that Alnus glutinosa remains listed as invasive and not recommended for community planting |

### Chunk 2K mixed public-impact pass, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.cdc.gov/dengue/stories/unwanted-mosquitoes.html | Asian Tiger Mosquito | Public-health framing, distinguishing features, and household prevention language |
| https://www.cdc.gov/mosquitoes/about/life-cycle-of-aedes-mosquitoes.html | Asian Tiger Mosquito | Container-breeding behavior, day-biting context, egg survival, and yard-level control framing |
| https://www.cdc.gov/mosquitoes/php/toolkit/potential-range-of-aedes.html | Asian Tiger Mosquito | Broader temperature tolerance, U.S. range context, and comparison with Aedes aegypti |
| https://ipm.ucanr.edu/TOOLS/ANTKEY/argentine.html | Argentine Ant | Identification, trailing behavior, nest placement, and household nuisance framing |
| https://ipm.ucanr.edu/PMG/GARDEN/CONTROLS/antmanagement.html | Argentine Ant | Bait-first management, honeydew link, and moisture-food sanitation framing |
| https://research.fs.usda.gov/treesearch/57231 | Redbay Ambrosia Beetle | Laurel wilt linkage, southeastern spread, and host-family impact framing |
| https://research.fs.usda.gov/treesearch/47935 | Redbay Ambrosia Beetle | Species overview, vector role, and host-association detail |
| https://myfwc.com/wildlifehabitats/profiles/amphibians/cane-toad/ | Cane Toad | Florida identification, pet-risk framing, and legal removal guidance |
| https://edis.ifas.ufl.edu/publication/UW432 | Cane Toad | Introduction history, current Florida spread, and distinction from native toads |
| https://www.fws.gov/species/greater-capybara-hydrochoerus-hydrochaeris | Capybara | Public-facing naming support and baseline species overview |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?speciesID=2587 | Capybara | Identification, U.S. nonindigenous occurrence context, and escape-from-captivity framing |
| https://myfwc.com/wildlifehabitats/nonnatives/report/ | Capybara | Florida nonnative reporting workflow and contact path |

### Chunk 2L same-pass plant cluster, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/mouse-ear-chickweed | Common Mouse-ear Chickweed | Hairy-mat identification, flower cue, cool moist turf and bed context |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/coltsfoot | Coltsfoot | Flower-before-leaf timing, hoof-shaped leaf cue, rhizomatous colony framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/redstem-filaree-1 | Redstem Stork's Bill | Lacy rosette ID, reddish stem cue, corkscrew seed-beak behavior |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/prostrate-knotweed | Prostrate Knotweed | Compacted-ground habit, papery node sheath cue, traffic-tolerant growth form |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/ladys-thumb | Lady's Thumb; Bristly Lady's Thumb | Smartweed flower-spike ID, leaf-mark cue, moist disturbed-ground context |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/mallow | Common Mallow | Round crinkled leaf ID, cheese-wheel fruit cue, taprooted garden-weed framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/mayweed | Stinking Chamomile | Daisy-flower ID, rank odor cue, pasture and field-edge spread framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/pineapple-weed | Pineapple Weed | Rayless flower-head cue, pineapple scent, compacted-path habitat framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/mugwort | Mugwort | Silver leaf underside, aromatic foliage, rhizome-colony spread pattern |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/morning-glory | Tall Morning-glory | Twining-vine habit, trumpet flower cue, crop and fence-line tangling behavior |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/broadleaf-dock | Broadleaf Dock | Large blunt leaf ID, seed-stalk timing, fertile disturbed-ground persistence |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/yellow-rocket | Yellow Rocket | Glossy rosette cue, spring mustard flowers, cool-season field spread |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/sowthistle | Spiny Sowthistle; Common Sowthistle; Field Sowthistle | Annual-versus-perennial sowthistle separation, milky-sap cue, open-ground colonizing behavior |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/thymeleaf-speedwell | Thymeleaf Speedwell | Low creeping speedwell ID, pale flower cue, damp turf and bed spread pattern |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/birdsfoot | Bird's-foot Trefoil | Five-part leaf cue, yellow pea flower clusters, pod-shape and meadow-escape framing |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/groundsel | Common Groundsel | Small cylindrical flower-head ID, rapid life cycle, nursery and container-ground context |
| https://plantscience.psu.edu/outreach/plant-id/grasses/bentgrass_creeping | Creeping Bentgrass | Stolon spread, fine-textured wet-turf habit, patch-expansion framing |
| https://plantscience.psu.edu/outreach/plant-id/grasses/bluegrass-annual | Annual Bluegrass | Light-green patch ID, low seedhead cue, compacted moist turf behavior |
| https://plantscience.psu.edu/outreach/plant-id/grasses/rough-bluegrass | Rough Bluegrass | Pale creeping patch cue, rough leaf texture, damp shade spread pattern |
| https://plantscience.psu.edu/outreach/plant-id/grasses/dallis-grass | Dallisgrass | Coarse clump ID, dark-speckled seed branch cue, lawn and roadside persistence |
| https://plantscience.psu.edu/outreach/plant-id/grasses/perennial-ryegrass | Perennial Ryegrass | Glossy bunchgrass cue, seeded-cover persistence, management-goal framing |
| https://plantscience.psu.edu/outreach/plant-id/grasses/smutgrass | Smutgrass | Wiry bunchgrass ID, narrow seedhead structure, low-quality warm-site persistence |
| https://plantscience.psu.edu/outreach/plant-id/grasses/stinkgrass-1 | Stinkgrass | Odor cue, granular panicle look, hot compacted-ground annual behavior |
| https://plantscience.psu.edu/outreach/plant-id/grasses/green-foxtail | Green Foxtail | Bottlebrush seedhead cue, annual grassy-weed growth pattern, garden and field-edge context |
| https://plantscience.psu.edu/outreach/plant-id/grasses/crabgrass | Hairy Crabgrass | Sprawling summer growth, hairy sheath cue, fingered seedhead identification |
| https://plantscience.psu.edu/outreach/plant-id/broadleaf/leafy-spurge | Leafy Spurge | Milky-sap warning, yellow-green bract cue, deep-rooted colony persistence |
| https://plantscience.psu.edu/outreach/plant-id/grasses/fine-fescue | Red Fescue | Fine-leaved stand structure, seeded-cover persistence, low-input turf context |

### Chunk 2M second large weed-ID pass, consulted on 2026-04-17

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://weedid.cals.vt.edu/profile/476 | Red Clover | Upright clover habit, whitish V-mark cue, forage-escape context |
| https://weedid.cals.vt.edu/profile/648 | Hairy Vetch | Tendrilled vine habit, leaflet count, flower-cluster and field-edge behavior |
| https://weedid.cals.vt.edu/profile/77 | Field Brome | Winter annual habit, drooping panicle cue, cover-crop and field-margin context |
| https://weedid.cals.vt.edu/profile/82 | Corn Speedwell | Heart-shaped pod cue, low mat habit, dry lawn and garden setting |
| https://weedid.cals.vt.edu/profile/246 | Redtop | Rhizomatous grass behavior, reddish panicle cue, humid-field persistence |
| https://weedid.cals.vt.edu/profile/207 | Yellow Salsify | Grass-like leaf cue, morning-opening flower habit, oversized seedhead context |
| https://weedid.cals.vt.edu/profile/492 | Purple Deadnettle | Square stem, purple upper leaves, winter annual lawn-weed framing |
| https://weedid.cals.vt.edu/profile/266 | Ivyleaf Speedwell | Ivy-shaped leaf cue, four-chambered pod, cool-season turf and crop context |
| https://weedid.cals.vt.edu/profile/256 | Sticky Chickweed | Sticky hair cue, low winter annual habit, field-edge and turf context |
| https://weedid.cals.vt.edu/profile/198 | Lesser Swinecress | Rank odor cue, wet compacted-site behavior, mustard-fruit context |
| https://weedid.cals.vt.edu/profile/583 | Japanese Clover | Low summer annual legume habit, open-ground persistence, forage-introduction framing |
| https://weedid.cals.vt.edu/profile/511 | Sulphur Cinquefoil | Pale yellow flower cue, leaflet count, long-lived disturbed-site persistence |
| https://weedid.cals.vt.edu/profile/145 | Catnip | Aromatic mint foliage, escaped-herb context, dry disturbed-ground persistence |
| https://weedid.cals.vt.edu/profile/410 | Common Speedwell | Creeping rooted stems, opposite leaf pattern, lawn and bed-edge spread behavior |
| https://weedid.cals.vt.edu/profile/355 | Dovefoot Geranium | Hairy rosette and beaked-fruit cues, winter annual lawn-weed framing |
| https://weedid.cals.vt.edu/profile/81 | Corn Spurry | Needle-like whorled foliage, sandy-soil affinity, winter annual field-weed framing |
| https://weedid.cals.vt.edu/profile/528 | Purple Nutsedge | Tubers and rhizomes, abrupt leaf tip, reddish spikelet and warm-site persistence |
| https://weedid.cals.vt.edu/profile/146 | Rescuegrass | Tufted cool-season brome habit, drooping panicle cue, pasture and roadside persistence |
| https://weedid.cals.vt.edu/profile/475 | Timothy Grass | Bristly cylindrical seedhead cue, toothed ligule, low-maintenance turf and roadside context |
| https://weedid.cals.vt.edu/profile/189 | Bermudagrass | Stolons and rhizomes, finger-like seedhead cue, cool-season turf invasion context |
| https://weedid.cals.vt.edu/profile/218 | Giant Foxtail | Hairy leaf and ligule cues, nodding foxtail head, cultivated-ground competition framing |
| https://weedid.cals.vt.edu/profile/507 | Hairy Cat's Ear | Rough hairy rosette cue, yellow heads, dry pasture and lawn persistence |
| https://weedid.cals.vt.edu/profile/212 | Tall Oatgrass | Tall bunchgrass form, awned panicle cue, low-fertility roadside and old-field persistence |
| https://weedid.cals.vt.edu/profile/399 | Sweet Vernalgrass | Sweet scent cue, early seedhead timing, pasture and ditch-bank persistence |
| https://weedid.cals.vt.edu/profile/105 | Moth Mullein | Hairless mullein rosette cue, peduncled flowers, pasture and right-of-way context |
| https://weedid.cals.vt.edu/profile/67 | Deptford Pink | Needlelike opposite leaves, speckled pink flowers, dry-field and roadside persistence |
| https://weedid.cals.vt.edu/profile/75 | Rabbitfoot Clover | Silky cylindrical flower-head cue, hairy annual habit, sandy infertile-soil context |
| https://weedid.cals.vt.edu/profile/402 | Hedgemustard | Pods pressed to stem, wiry roadside habit, compacted-edge persistence |
| https://weedid.cals.vt.edu/profile/597 | Littlepod False Flax | Glaucous clasping leaves, narrow pod cue, winter annual dry-field behavior |
| https://weedid.cals.vt.edu/profile/458 | Birdeye Speedwell | Showier blue flower cue, heart-shaped capsule, cool-season garden and turf context |
| https://weedid.cals.vt.edu/profile/777 | Red Sandspurry | Slender stipulate stems, tiny pink flowers, gritty open-ground persistence |
| https://weedid.cals.vt.edu/profile/95 | Gallant Soldier | Fast-cycling cultivated-ground habit, tiny daisy heads, nursery and garden context |

### Chunk 2N mixed category repair pass, consulted on 2026-04-19

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://ipm.ucanr.edu/home-and-landscape/bagrada-bug/ | Bagrada Bug | Origin, broad host range, landscape detection, and exclusion or vacuum-based control framing |
| https://ipm.ucanr.edu/agriculture/cole-crops/bagrada-bug/ | Bagrada Bug | Size, nymph coloration, starburst feeding lesions, seedling damage, and weed-host reduction guidance |
| https://www.aphis.usda.gov/plant-pests-diseases/south-american-cactus-moth | Cactus Moth | Origin, egg-stick and larval identification, quarantine states, removal guidance, and reporting path |
| https://www.ars.usda.gov/office-of-international-research-engagement-and-cooperation/overseas-biological-control-obcl-highlights/saving-prickly-pear-populations-from-the-cactus-moth/ | Cactus Moth | Prickly pear ecosystem importance, cactus-pad destruction, and spread-risk framing |
| https://ipm.ucanr.edu/agriculture/avocado/polyphagous-shot-hole-borer-and-kuroshio-shot-hole-borer/ | Polyphagous Shot Hole Borer | Beetle size, host-hole symptoms, fungal dieback effects, and early branch-removal framing |
| https://www.iscc.ca.gov/ishb.html | Polyphagous Shot Hole Borer | Green-waste pathway risk, survey context, and state detection or response framing |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=1209 | Asian Tiger Shrimp | Identification, aquaculture introduction pathway, Atlantic and Gulf occurrence context, and impact framing |
| https://oceanservice.noaa.gov/facts/tigershrimp.html | Asian Tiger Shrimp | Current federal concern around disease, competition, predation, and coastal ecosystem effects |
| https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=974 | Asian Swamp Eel | Identification against eels and lampreys, live-food introduction pathway, and predator ecology |
| https://myfwc.com/wildlifehabitats/nonnatives/report/ | Asian Swamp Eel; Vermiculated Sailfin Catfish; Brown Hoplo | Credible-report workflow, location and photo requirements, and report-first action framing |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=767 | Vermiculated Sailfin Catfish | Armored-catfish identification, aquarium or fish-farm introduction context, and bank-burrow impacts |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=338 | Brown Hoplo | Air-breathing ecology, possible food-fish introduction pathway, and illegal movement or fishery-spread framing |
| https://www.aphis.usda.gov/plant-pests-diseases/european-larch-canker | European Larch Canker | Disease impact, regulated Maine range, quarantine scope, and APHIS response |
| https://www.maine.gov/dacf/mfs/forest_health/quarantine_information.html | European Larch Canker | Maine quarantine details, regulated articles, and state forest-health contact context |

### Chunk 2O wildlife cluster pass, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://research.fs.usda.gov/treesearch/66181 | European Spruce Sawfly | Spruce host range, invasion history, taxonomy context, and official forest-health reference path |
| https://natural-resources.canada.ca/sites/nrcan/files/forest/sof2022/SoF_Annual2022_EN_access.pdf | European Spruce Sawfly | Historic outbreak scale in eastern Canada and the forest-survey context created in response |
| https://edis.ifas.ufl.edu/publication/UW412 | Rhesus Macaque | Silver Springs introduction history, appearance, ecology, and Florida conflict context |
| https://edis.ifas.ufl.edu/publication/UW491 | Rhesus Macaque | Broader Florida monkey-population context, public-safety concerns, and nonnative-mammal framing |
| https://www.cdc.gov/herpes-b-virus/about/index.html | Rhesus Macaque | Bite and scratch medical-risk framing, immediate first-aid advice, and keep-distance action language |
| https://www.nps.gov/articles/researching-flatworms-to-protect-florida-s-native-snails.htm | New Guinea Flatworm | Current Florida park impacts, tree-snail predation, and gear or plant-movement spread framing |
| https://dlnr.hawaii.gov/wildlife/files/2026/03/FINAL-2025-SWAP.pdf | New Guinea Flatworm | Hawaii-native-snail threat context and Pacific-island spread significance |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/oscar/ | Oscar | Florida appearance, habitat, angler-facing context, and established south Florida range |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=436 | Oscar | Introduction pathway, broader U.S. establishment context, and warm-water spread framing |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/spotted-tilapia/ | Spotted Tilapia | Identification, Florida canal abundance, and live-possession rule context |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=482 | Spotted Tilapia | Introduction pathway, distribution beyond Florida, and competition-impact framing |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/black-acara/ | Black Acara | Identification, shallow disturbed-water habitat, and practical Florida context |
| https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=441 | Black Acara | Introduction pathway and native-sunfish competition framing |
| https://myfwc.com/wildlifehabitats/profiles/freshwater/sailfin-catfish/ | Suckermouth Catfish | Field separation from other loricariids, bank-burrow relevance, and Florida habitat context |
| https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=761 | Suckermouth Catfish | Aquarium-release pathway, genus-level ID caution, and nonnative occurrence context |
| https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=980 | Channeled Applesnail | Shell and egg-mass identification, invasion biology, crop-risk framing, and U.S. status |
| https://edis.ifas.ufl.edu/publication/IN598 | Channeled Applesnail | Applesnail comparison points, Florida context, and biosecurity relevance around introduced Pomacea species |

### County audit Alabama chunk 1, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx | Alabama county audit | Statewide forestry and invasive-species baseline used before county-by-county review |
| https://www.aces.edu/counties/autauga/ | Alabama county audit | Autauga County extension office check during county-source review |
| https://www.aces.edu/blog/topics/autauga/autauga-county-annual-report/ | Alabama county audit | Autauga County annual report check; not sufficient as a county invasive-species inventory |
| https://www.aces.edu/counties/baldwin/ | Alabama county audit | Baldwin County extension office check during county-source review |
| https://agi.alabama.gov/2022/02/citrus-canker-quarantine-established-in-baldwin-county-alabama/ | Alabama county audit | Verified county-specific official plant-disease report for Baldwin County |
| https://www.aces.edu/counties/barbour/ | Alabama county audit | Barbour County extension office check during county-source review |
| https://www.aces.edu/wp-content/uploads/2023/07/ACES-2734_BarbourCountyAnnualReport2022_062223L.pdf | Alabama county audit | Barbour County annual report check; not sufficient as a county invasive-species inventory |
| https://agi.alabama.gov/plantprotection/2025/06/africanized-honeybees-detected-in-alabama-2/ | Alabama county audit | Verified county-specific official insect-detection report for Barbour County |
| https://www.aces.edu/counties/bibb | Alabama county audit | Bibb County extension office check during county-source review |
| https://www.aces.edu/counties/blount/ | Alabama county audit | Blount County extension office check during county-source review |
| https://www.aces.edu/blog/topics/blount/blount-county-annual-report/ | Alabama county audit | Blount County annual report check; mentions invasive-plant programming but not a county invasive-species inventory |

### County audit Alabama chunk 2, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aces.edu/counties/bullock/ | Alabama county audit | Bullock County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/bullock/ | Alabama county audit | Bullock County official category page check during county-source review |
| https://www.aces.edu/wp-content/uploads/2023/10/ACES-2750-BullockCountyAnnualReport2022_090123L-G.pdf | Alabama county audit | Bullock County annual report check; mentions invasive plant management and aquatic weeds but not a county invasive-species inventory |
| https://www.aces.edu/counties/butler/ | Alabama county audit | Butler County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/butler/ | Alabama county audit | Butler County official category page check during county-source review |
| https://www.aces.edu/counties/calhoun/ | Alabama county audit | Calhoun County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/calhoun/ | Alabama county audit | Calhoun County official category page check during county-source review |
| https://www.aces.edu/counties/chambers/ | Alabama county audit | Chambers County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/chambers/ | Alabama county audit | Chambers County official category page check during county-source review |
| https://www.aces.edu/counties/cherokee/ | Alabama county audit | Cherokee County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/cherokee/ | Alabama county audit | Cherokee County official category page check during county-source review |

### County audit Alabama chunk 3, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aces.edu/counties/chilton/ | Alabama county audit | Chilton County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/chilton/ | Alabama county audit | Chilton County official category page check during county-source review |
| https://www.aces.edu/counties/choctaw/ | Alabama county audit | Choctaw County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/choctaw/ | Alabama county audit | Choctaw County official category page check during county-source review |
| https://www.aces.edu/counties/clarke/ | Alabama county audit | Clarke County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/clarke/ | Alabama county audit | Clarke County official category page check during county-source review |
| https://www.aces.edu/counties/clay/ | Alabama county audit | Clay County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/clay/ | Alabama county audit | Clay County official category page check during county-source review |
| https://www.aces.edu/counties/cleburne/ | Alabama county audit | Cleburne County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/cleburne/ | Alabama county audit | Cleburne County official category page check during county-source review |

### County audit Alabama chunk 4, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aces.edu/counties/coffee/ | Alabama county audit | Coffee County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/coffee/ | Alabama county audit | Coffee County official category page check during county-source review |
| https://www.aces.edu/counties/colbert/ | Alabama county audit | Colbert County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/colbert/ | Alabama county audit | Colbert County official category page check during county-source review |
| https://www.aces.edu/counties/conecuh/ | Alabama county audit | Conecuh County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/conecuh/ | Alabama county audit | Conecuh County official category page check during county-source review |
| https://www.aces.edu/counties/coosa/ | Alabama county audit | Coosa County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/coosa/ | Alabama county audit | Coosa County official category page check during county-source review |
| https://www.aces.edu/counties/covington/ | Alabama county audit | Covington County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/covington/ | Alabama county audit | Covington County official category page check during county-source review |

### County audit Alabama chunk 5, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aces.edu/counties/crenshaw/ | Alabama county audit | Crenshaw County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/crenshaw/ | Alabama county audit | Crenshaw County official category page check during county-source review |
| https://www.aces.edu/counties/cullman/ | Alabama county audit | Cullman County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/cullman/ | Alabama county audit | Cullman County official category page check during county-source review |
| https://www.aces.edu/counties/dale/ | Alabama county audit | Dale County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/dale/ | Alabama county audit | Dale County official category page check during county-source review |
| https://www.aces.edu/counties/dallas/ | Alabama county audit | Dallas County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/dallas/ | Alabama county audit | Dallas County official category page check during county-source review |
| https://www.aces.edu/counties/dekalb/ | Alabama county audit | DeKalb County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/dekalb/ | Alabama county audit | DeKalb County official category page check during county-source review |

### County audit Alabama chunk 6, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.aces.edu/counties/elmore/ | Alabama county audit | Elmore County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/elmore/ | Alabama county audit | Elmore County official category page check during county-source review |
| https://www.aces.edu/counties/escambia/ | Alabama county audit | Escambia County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/escambia/ | Alabama county audit | Escambia County official category page check during county-source review |
| https://www.aces.edu/counties/etowah/ | Alabama county audit | Etowah County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/etowah/ | Alabama county audit | Etowah County official category page check during county-source review |
| https://www.aces.edu/counties/fayette/ | Alabama county audit | Fayette County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/fayette/ | Alabama county audit | Fayette County official category page check during county-source review |

### Alabama county re-audit corrections and coverage overrides, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://www.outdooralabama.com/node/1477 | Feral Swine; Alabama county audit | Official statewide Alabama confirmation used for the manual authoritative all-county feral-swine override and statewide Alabama wildlife fallback |
| https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct%202021.pdf | Alabama county audit; Silver Carp; Asiatic Clam | Broader-source Alabama re-audit correction for Bibb, Calhoun, Colbert, and Covington plus manual authoritative county-presence overrides for Colbert silver carp and Covington Asiatic clam |

### County audit Alabama chunk 7, consulted on 2026-04-20

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://forestry.alabama.gov/Pages/News/2022/RFCogongrassBid.aspx | Alabama county audit; Cogongrass | County-specific cogongrass evidence for Geneva, Greene, Hale, Henry, and Houston through Alabama Forestry Commission focused-county response records |
| https://forestry.alabama.gov/Pages/Informational/Images/Cogongrass_Landowner_Packet.pdf | Alabama county audit; Cogongrass | Additional county-specific cogongrass documentation for Greene and Hale through documented infestation materials |
| https://www.aces.edu/blog/topics/farming/cotton-jassid-confirmed-in-alabama/ | Alabama county audit; Cotton Jassid | Explicit Henry County cotton jassid confirmation used to strengthen Henry County beyond cogongrass-only evidence |
| https://forestry.alabama.gov/Pages/Management/Cogongrass.aspx | Alabama county audit; Cogongrass | Alabama statewide cogongrass program background used to support county-detail resources for chunk 7 |

### County audit Alabama chunk 8, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://jacksoncountyal.gov/DocumentCenter/View/1301/Jackson-County-Resiliency-Plan-Adopted | Alabama county audit | Jackson County plan evidence for invasive eel grass along the Tennessee River corridor |
| https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx | Alabama county audit; Emerald Ash Borer | Official Jackson County emerald ash borer confirmation used for county-detail evidence and a manual county-presence override |
| https://www.aphis.usda.gov/plant-pests-diseases/alabama | Alabama county audit | Alabama statewide pest-information cross-check used during chunk 8 statewide-only review |
| https://www.forestry.alabama.gov/Pages/News/2022/DCNR-CDW.aspx | Alabama county audit | Lauderdale County county-specific wildlife disease notice reviewed and explicitly excluded from invasive-species coverage decisions |
| https://alabamasoilandwater.gov/lauderdale/ | Alabama county audit | Lauderdale County local conservation-district context reviewed during chunk 8 county-source search |
| https://www.outdooralabama.com/articles/adcnr-installs-invasive-carp-signs-tennessee-river-public-boat-ramps | Alabama county audit | Regional Tennessee River invasive-carp context reviewed during Lawrence County county-source search |
| https://www.aces.edu/counties/franklin/ | Alabama county audit | Franklin County extension office check during county-source review |
| https://www.aces.edu/blog/category/counties/franklin/ | Alabama county audit | Franklin County official category page check during county-source review |

### County audit Alabama chunk 9, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=1107 | Alabama county audit; Brazilian waterweed | Lee County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130002&SpeciesID=235&State=AL | Alabama county audit; Parrot feather | Lee County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=06030002&SpeciesID=5&State=AL | Alabama county audit; Zebra mussel | Limestone County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=2943&State=AL | Alabama county audit; Wandering hydrilla | Limestone County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=31502&SpeciesID=551 | Alabama county audit; Bighead carp | Lowndes County county-specific aquatic invasive evidence and manual county-presence override |
| https://www.aces.edu/blog/topics/forestry-wildlife/down-south-on-the-farm-the-emerald-ash-borer-is-here/ | Alabama county audit | Lowndes County contradiction check showing statewide emerald ash borer context without a county detection |
| https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx | Alabama county audit; Emerald Ash Borer | Madison County county-specific confirmation and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=5&State=AL&YearFrom=1992&YearTo=1992 | Alabama county audit; Zebra mussel | Madison County county-specific aquatic invasive evidence and manual county-presence override |
| https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx | Alabama county audit | Alabama statewide invasive-program fallback used during Macon County review and chunk 9 county-detail resources |
| https://www.aphis.usda.gov/plant-pests-diseases/alabama | Alabama county audit | Alabama statewide pest-information fallback used during Macon County review |

### County audit Alabama chunk 10, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://forestry.alabama.gov/Pages/Other/Forms/Annual_Reports/Annual_Report_2012.pdf | Alabama county audit; Laurel wilt | Marengo County official laurel wilt confirmation and manual county-presence override |
| https://www.aces.edu/counties/marion/ | Alabama county audit | Marion County extension office review during county-source search |
| https://www.aces.edu/blog/topics/counties/marion-county-annual-report/ | Alabama county audit | Marion County county-report review during statewide-only determination |
| https://www.outdooralabama.com/articles/wff-fisheries-continues-monitor-invasive-carp-species | Alabama county audit | Marshall County county-specific invasive-carp evidence and county-detail support |
| https://www.aces.edu/blog/topics/aquatic-invasive-species/alabama-aquatic-nuisance-species-amazonian-apple-snail/ | Alabama county audit | Mobile County county-specific apple-snail history used for county-detail evidence |
| https://www.mobilecountyal.gov/pdf/bids/20161005_165944.pdf | Alabama county audit | Mobile County project-level invasive-species evidence for Chinese privet and Chinese tallow in county mitigation work |
| https://nas.er.usgs.gov/Queries/SpecimenViewer.aspx?SpecimenID=609640 | Alabama county audit; Common Carp | Monroe County structured county-specific federal occurrence record and manual county-presence override |

### County audit Alabama chunk 11, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=2679 | Alabama county audit; Narrow-leaved cattail | Montgomery County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=292 | Alabama county audit; Small water-clover | Montgomery and Pike county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=549 | Alabama county audit; Silver Carp | Morgan County county-specific invasive fish evidence and manual county-presence override |
| https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct_2021.pdf | Alabama county audit; Silver Carp | Morgan County county-specific silver carp context tied to Wheeler Reservoir and Decatur |
| https://forestry.alabama.gov/Pages/Other/Forms/Annual_Reports/Annual_Report_2017.pdf | Alabama county audit; Laurel wilt | Perry County official laurel wilt confirmation and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=31601&SpeciesID=227 | Alabama county audit; Alligatorweed | Pickens County county-specific aquatic invasive evidence and manual county-presence override |

### County audit Alabama chunk 12, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130002&SpeciesID=235&State=AL | Alabama county audit; Parrot feather | Randolph County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03130003&SpeciesID=1130&State=AL | Alabama county audit; Water hyacinth | Russell County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/collectioninfo.aspx?SpeciesID=1118 | Alabama county audit; Brittle waternymph | St. Clair County county-specific aquatic invasive evidence and manual county-presence override |
| https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx | Alabama county audit; Emerald Ash Borer | St. Clair County reinforcement check showing prior official county documentation alongside the aquatic record |
| https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=229420 | Alabama county audit; Hydrilla | Shelby County county-specific hydrilla evidence and manual county-presence override |
| https://nas.er.usgs.gov/Queries/SpecimenViewer.aspx?SpecimenID=1695757 | Alabama county audit; Pond loach | Shelby County secondary county-specific nonindigenous aquatic record used to strengthen the county-specific evidence determination |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=3160202&SpeciesID=92&fmb=0&pathway=0&status=0 | Alabama county audit; Freshwater golden clam | Sumter County county-specific aquatic invasive evidence and manual county-presence override |

### County audit Alabama chunk 13, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=263551 | Alabama county audit; Pond loach | Talladega County county-specific aquatic invasive evidence |
| https://www.forestry.alabama.gov/Pages/News/2025/Emerald_Ash.aspx | Alabama county audit; Emerald Ash Borer | Talladega County reinforcement check showing prior official county documentation |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?SpeciesID=549 | Alabama county audit; Silver Carp | Tallapoosa County county-specific carp evidence used for county-detail support |
| https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=26240 | Alabama county audit; Bighead Carp | Tallapoosa County secondary county-specific carp evidence used to strengthen the county-specific determination |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=03160112&SpeciesID=5&State=AL | Alabama county audit; Zebra Mussel | Tuscaloosa County county-specific aquatic invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/CollectionInfo.aspx?HUCNumber=11&SpeciesID=1068 | Alabama county audit | Walker County contradiction check showing a county-specific nonnative record outside the current Project Isitusa catalog |
| https://www.aces.edu/blog/topics/counties/washington-county-annual-report/ | Alabama county audit | Washington County county-report review during statewide-only determination |
| https://www.aces.edu/counties/washington/ | Alabama county audit | Washington County extension office review during county-source search |

### County audit Alabama chunk 14, consulted on 2026-04-21

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=230460 | Alabama county audit; Wild Taro | Wilcox County county-specific aquatic and shoreline invasive evidence and manual county-presence override |
| https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=168047 | Alabama county audit | Wilcox County secondary nonnative aquatic record used to strengthen the county-specific determination |
| https://www.forestry.alabama.gov/Pages/Informational/Treasured_Forests/Magazine/2020_Spring.pdf | Alabama county audit; Cogongrass | Winston County official county-specific cogongrass reporting and manual county-presence override |

### Alabama post-import gap assessment, consulted on 2026-04-24

| Source URL | Species using it | Used for |
| --- | --- | --- |
| https://forestry.alabama.gov/Pages/Fire/Invasive_Species.aspx | Alabama gap assessment | Official forestry invasive-species denominator check against current live Alabama mapped coverage |
| https://www.invasiveplantatlas.org/list.html?id=71 | Alabama gap assessment | Alabama Invasive Plant Council list mirror showing `91` plant species reported invasive in Alabama natural areas |
| https://www.eddmaps.org/lists/list.cfm?id=71 | Alabama gap assessment | EDDMapS Alabama Invasive Plant Council list cross-check and possible future county-record source path |
| https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct%202021.pdf | Alabama gap assessment | Alabama ANS denominator check, including the `90` non-native aquatic species in Appendix 12.B |
| https://www.aces.edu/blog/topics/forestry-wildlife/2026-year-of-invasive-plants/ | Alabama gap assessment | Current Alabama Extension invasive-plant outreach context and possible non-county source lead |
| https://www.aces.edu/blog/topics/landscaping/native-replacements-for-commonly-sold-invasive-plants/ | Alabama gap assessment | Alabama Extension ornamental invasive plant priority check against current live mapped coverage |
| https://agi.alabama.gov/plantprotection/ | Alabama gap assessment | Alabama Department of Agriculture and Industries regulatory pest notice source path for county-specific future checks |
| https://www.se-eppc.org/alabama/2012-updatedALIPCinvasiveplantlist.pdf | Alabama denominator reconciliation | Maintained `ALIPC-2012` denominator list in `src/data/source/state-species-denominators.ts`, reconciled against generated catalog and Alabama county-species matrix |
| https://www.invasiveplantatlas.org/list.html?id=71 | Alabama denominator snapshot | Source-table snapshot for the `ALIPC-2012` denominator list, including EDDMapS subject IDs, family, and nativity metadata in `src/data/source/state-denominator-snapshots/alipc-2012.json` |
| https://www.outdooralabama.com/sites/default/files/PDF%20documents/AL%20ANS%20Management%20Plan_FINAL_Oct%202021.pdf | Alabama ANS denominator reconciliation | Maintained `AL-ANS-2021` denominator list in `src/data/source/state-species-denominators.ts`, reconciled against generated catalog and Alabama county-species matrix |

## Contributor Rules

1. Prefer official agency, university extension, or public research program sources for curated profile writing.
2. Log every new source the same day you use it.
3. Record the actual date you fetched or consulted the source when that information is available.
4. If the exact date is unknown, say so plainly instead of inventing one.
5. When a source is only carried through from upstream data, label it as upstream-derived rather than curated.
