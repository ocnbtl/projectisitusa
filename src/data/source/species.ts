import type { Species } from "@/lib/data/types";

export const speciesSeed: Species[] = [
  {
    id: "spotted-lanternfly",
    slug: "spotted-lanternfly",
    commonName: "Spotted Lanternfly",
    scientificName: "Lycorma delicatula",
    category: "insects",
    profileType: "curated",
    displayGroup: "Tree pests",
    summary:
      "A sap-feeding invasive insect that threatens vineyards, orchards, and host trees.",
    eddMapsSubjectId: 77293,
    image: {
      src: "/species/spotted-lanternfly.jpg",
      alt: "Adult spotted lanternfly on bark",
      credit: "Penn State Extension / Wikimedia Commons",
    },
    origin: "Native to China, India, and Vietnam; introduced to the U.S. through transported goods.",
    whatToLookFor: [
      "Adults with gray forewings spotted black and bright red hindwings.",
      "Mud-like egg masses on trees, outdoor furniture, vehicles, and stone.",
      "Heavy feeding on tree-of-heaven, grapevines, maples, and fruit trees.",
    ],
    whyItMatters:
      "Spotted lanternfly weakens trees and vines by feeding on sap, stresses vineyards and orchards, and leaves behind honeydew that fuels mold growth.",
    action: {
      mode: "both",
      summary:
        "Destroy egg masses and individual insects when safe, and report sightings where state guidance requests it.",
      steps: [
        "Scrape egg masses into a sealed bag or alcohol solution.",
        "Stomp or trap adults and nymphs on host trees when feasible.",
        "Check your state guidance before moving firewood, nursery stock, or outdoor equipment.",
      ],
      contactName: "State agriculture or invasive species hotline",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/slf",
      contactInstructions:
        "Use the USDA or your state reporting page when sightings are outside known quarantine zones or requested by local programs.",
      safetyNotes:
        "Do not use homemade pesticides on public land or protected areas.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/slf" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "emerald-ash-borer",
    slug: "emerald-ash-borer",
    commonName: "Emerald Ash Borer",
    scientificName: "Agrilus planipennis",
    category: "insects",
    profileType: "curated",
    displayGroup: "Forest beetles",
    summary:
      "A destructive invasive beetle killing ash trees across cities, forests, and riparian corridors.",
    eddMapsSubjectId: 7171,
    image: {
      src: "/species/emerald-ash-borer.jpg",
      alt: "Emerald ash borer on wood surface",
      credit: "David Cappaert / Bugwood / Wikimedia Commons",
    },
    origin: "Native to northeastern Asia; introduced through infested wood packaging material.",
    whatToLookFor: [
      "Metallic green beetles about half an inch long.",
      "D-shaped exit holes and bark splitting on ash trees.",
      "Canopy dieback and heavy woodpecker activity on stressed ash.",
    ],
    whyItMatters:
      "Emerald ash borer kills ash trees quickly, transforms urban canopies, and disrupts riparian and forest habitat.",
    action: {
      mode: "report",
      summary:
        "Suspected new infestations should be confirmed and handled through forestry or agriculture programs.",
      steps: [
        "Photograph exit holes, bark damage, and the beetle if visible.",
        "Avoid transporting ash firewood or untreated wood debris.",
        "Contact your state forestry or agriculture program for confirmation and management guidance.",
      ],
      contactName: "State forestry agency",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/eab",
      contactInstructions:
        "Report suspicious ash decline outside known infestation areas and follow local disposal rules.",
      safetyNotes:
        "Large tree treatment or removal should be handled by certified professionals.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/eab" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "asian-longhorned-beetle",
    slug: "asian-longhorned-beetle",
    commonName: "Asian Longhorned Beetle",
    scientificName: "Anoplophora glabripennis",
    category: "insects",
    profileType: "curated",
    displayGroup: "Forest beetles",
    summary:
      "A hardwood-boring invasive beetle that can trigger costly tree removals and eradication programs.",
    eddMapsSubjectId: 2178,
    image: {
      src: "/species/asian-longhorned-beetle.jpg",
      alt: "Asian longhorned beetle with banded antennae",
      credit: "USDA APHIS / Wikimedia Commons",
    },
    origin: "Native to China and Korea; introduced through wood packing material.",
    whatToLookFor: [
      "Glossy black beetles with white spots and banded antennae.",
      "Perfectly round exit holes in maple and other hardwoods.",
      "Sawdust-like frass around branch crotches and tree bases.",
    ],
    whyItMatters:
      "Asian longhorned beetle threatens maples and other hardwoods that anchor city streets, shade cover, and forest structure.",
    action: {
      mode: "report",
      summary:
        "Potential sightings should be reported immediately because eradication depends on early detection.",
      steps: [
        "Take clear photos of the beetle, exit holes, and damaged branches.",
        "Do not move firewood, logs, or tree trimmings from the area.",
        "Report the sighting through USDA APHIS or your state agriculture program.",
      ],
      contactName: "USDA APHIS",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/alb",
      contactInstructions:
        "Use the federal reporting resources for suspected beetles or damage on host trees.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/alb" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "tree-of-heaven",
    slug: "tree-of-heaven",
    commonName: "Tree-of-Heaven",
    scientificName: "Ailanthus altissima",
    category: "plants",
    profileType: "curated",
    displayGroup: "Trees & shrubs",
    summary:
      "A fast-spreading invasive tree that dominates disturbed ground and supports spotted lanternfly.",
    eddMapsSubjectId: 3003,
    image: {
      src: "/species/tree-of-heaven.jpg",
      alt: "Tree-of-heaven leaves and seed clusters",
      credit: "Wikimedia Commons",
    },
    origin: "Native to China and Taiwan; introduced as an ornamental street tree.",
    whatToLookFor: [
      "Large compound leaves with a strong burnt-peanut-butter odor when crushed.",
      "Smooth gray bark and rapid growth in disturbed areas.",
      "Dense seed clusters and root sprouts along roadsides and lots.",
    ],
    whyItMatters:
      "Tree-of-heaven spreads aggressively, displaces native plants, and acts as a favored host for spotted lanternfly.",
    action: {
      mode: "diy",
      summary:
        "Small plants can be removed by hand; larger trees need a cut-stump or hack-and-squirt approach timed correctly.",
      steps: [
        "Pull seedlings when soil is moist and roots can be fully removed.",
        "Bag seed clusters before disposal to reduce spread.",
        "Use your local extension guidance for herbicide timing on mature trees to avoid root suckering.",
      ],
      safetyNotes:
        "Wear gloves and eye protection when cutting or treating sap-producing plants.",
    },
    source: [
      { label: "NPS", url: "https://www.nps.gov/articles/invasive-species.htm" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "kudzu",
    slug: "kudzu",
    commonName: "Kudzu",
    scientificName: "Pueraria montana var. lobata",
    category: "plants",
    profileType: "curated",
    displayGroup: "Vines & groundcovers",
    summary:
      "A smothering invasive vine that overtops trees, roadsides, and utility corridors.",
    eddMapsSubjectId: 37840,
    image: {
      src: "/species/kudzu.jpg",
      alt: "Kudzu vine covering trees",
      credit: "Forest & Kim Starr / Wikimedia Commons",
    },
    origin: "Native to East Asia; introduced for erosion control and forage.",
    whatToLookFor: [
      "Fast-growing vines with three broad leaflets.",
      "Dense mats over trees, utility corridors, and roadsides.",
      "Purple flowers with a grape-like scent in late summer.",
    ],
    whyItMatters:
      "Kudzu blankets trees and shrubs, blocks sunlight, and can quickly reshape edges, roadsides, and forest openings.",
    action: {
      mode: "diy",
      summary:
        "Repeated cutting and targeted herbicide treatments are usually needed; single removals rarely solve the problem.",
      steps: [
        "Cut vines from host trees to reduce canopy smothering.",
        "Return repeatedly to cut regrowth or treat foliage according to local extension guidance.",
        "Monitor the site for multiple seasons because root crowns resprout aggressively.",
      ],
      safetyNotes:
        "Avoid disturbing steep slopes or applying chemicals near water without local guidance.",
    },
    source: [
      { label: "USDA", url: "https://www.usda.gov/farming-and-ranching/plants-and-crops/pest-and-weed-management/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "giant-hogweed",
    slug: "giant-hogweed",
    commonName: "Giant Hogweed",
    scientificName: "Heracleum mantegazzianum",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A dangerous invasive plant whose sap can cause severe burns and eye injury.",
    eddMapsSubjectId: 4536,
    image: {
      src: "/species/giant-hogweed.jpg",
      alt: "Giant hogweed flower umbels",
      credit: "H. Zell / Wikimedia Commons",
    },
    origin: "Native to the western Caucasus; introduced as an ornamental plant.",
    whatToLookFor: [
      "Very tall stems, often over 10 feet, with purple blotches and coarse hairs.",
      "Huge umbrella-shaped white flower clusters.",
      "Large jagged leaves and thick ridged stems.",
    ],
    whyItMatters:
      "Giant hogweed crowds riverbanks and roadsides, while its sap can cause severe skin burns and eye injury in sunlight.",
    action: {
      mode: "report",
      summary:
        "Do not handle it casually. Many states ask residents to report it so trained crews can confirm and manage infestations safely.",
      steps: [
        "Stay clear of sap and keep children or pets away from the plant.",
        "Photograph the plant from a safe distance.",
        "Report the site to your state invasive species or agriculture authority before attempting removal.",
      ],
      contactName: "State invasive plant program",
      contactInstructions:
        "Use your state reporting process for confirmation and safe treatment guidance.",
      safetyNotes:
        "Direct sap contact can cause serious phototoxic burns. Wear full skin and eye protection if instructed to handle it.",
    },
    source: [
      { label: "USDA", url: "https://www.usda.gov/farming-and-ranching/plants-and-crops/pest-and-weed-management/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "hydrilla",
    slug: "hydrilla",
    commonName: "Hydrilla",
    scientificName: "Hydrilla verticillata",
    category: "plants",
    profileType: "curated",
    displayGroup: "Aquatic plants",
    summary:
      "An aquatic invasive plant that forms dense mats and degrades lakes, ponds, and canals.",
    eddMapsSubjectId: 3028,
    image: {
      src: "/species/hydrilla.jpg",
      alt: "Hydrilla underwater stems and leaves",
      credit: "Krzysztof Ziarnek, Kenraiz / Wikimedia Commons",
    },
    origin: "Native to Asia, Africa, and Australia; introduced through the aquarium trade.",
    whatToLookFor: [
      "Submerged stems with leaves in whorls, often five leaves around the stem.",
      "Serrated leaf edges and dense surface mats in lakes, canals, and ponds.",
      "Fragments that break off easily and spread to new waters.",
    ],
    whyItMatters:
      "Hydrilla clogs waterways, outcompetes native aquatic vegetation, and can alter oxygen levels and recreation access.",
    action: {
      mode: "report",
      summary:
        "Aquatic infestations should usually be reported and managed through waterway agencies because fragments spread easily.",
      steps: [
        "Clean, drain, and dry boats, trailers, and gear after leaving the water.",
        "Do not dump aquarium or pond plants into natural waterways.",
        "Report suspected infestations to your state aquatic invasive species or natural resources program.",
      ],
      contactName: "State aquatic invasive species program",
      contactInstructions:
        "Provide the exact waterbody, launch point, and photos if visible from shore.",
    },
    source: [
      { label: "USFWS", url: "https://www.fws.gov/program/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "sudden-oak-death",
    slug: "sudden-oak-death",
    commonName: "Sudden Oak Death",
    scientificName: "Phytophthora ramorum",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Forest diseases",
    summary:
      "A destructive forest disease that kills oaks and reshapes coastal woodland ecosystems.",
    eddMapsSubjectId: 4603,
    image: {
      src: "/species/sudden-oak-death.jpg",
      alt: "Sudden oak death symptoms on tree trunk",
      credit: "USDA APHIS / Wikimedia Commons",
    },
    origin: "A plant pathogen with origins linked to Asia and introduced through nursery pathways.",
    whatToLookFor: [
      "Bleeding trunk cankers on oaks and tanoaks.",
      "Leaf blight and shoot dieback on hosts like rhododendron and bay laurel.",
      "Patches of rapid oak mortality in affected coastal forests.",
    ],
    whyItMatters:
      "Sudden oak death changes forest structure, increases fuel loads, and threatens culturally and ecologically important oak systems.",
    action: {
      mode: "report",
      summary:
        "Potential disease outbreaks should be reported through forestry or agriculture channels rather than handled casually.",
      steps: [
        "Photograph symptoms on bark, leaves, and nearby host plants.",
        "Avoid moving firewood, soil, or infected nursery stock out of the area.",
        "Report suspected cases to state forestry or agriculture authorities for confirmation.",
      ],
      contactName: "State forestry or agriculture agency",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/sod",
      contactInstructions:
        "Follow quarantine and plant movement rules if your area is regulated.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/sod" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "beech-leaf-disease",
    slug: "beech-leaf-disease",
    commonName: "Beech Leaf Disease",
    scientificName: "Litylenchus crenatae mccannii",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Forest diseases",
    summary:
      "An emerging invasive forest health threat causing decline in American beech.",
    eddMapsSubjectId: 85517,
    image: {
      src: "/species/beech-leaf-disease.jpg",
      alt: "Beech leaves with dark interveinal banding",
      credit: "National Park Service",
    },
    origin: "A recently detected invasive nematode-associated disease first identified in Ohio and now spreading through the Northeast and Great Lakes.",
    whatToLookFor: [
      "Dark interveinal bands on beech leaves when held up to light.",
      "Curled, thickened, or undersized leaves and thinning crowns.",
      "Decline of both understory saplings and mature beech trees.",
    ],
    whyItMatters:
      "Beech leaf disease is killing a foundational forest species in eastern woodlands and changing food webs, canopy shade, and regeneration.",
    action: {
      mode: "report",
      summary:
        "Because this is an emerging forest health issue, local forestry confirmation matters more than ad hoc treatment.",
      steps: [
        "Document leaves and canopy symptoms with photos.",
        "Mark the exact location and note nearby beech trees with similar symptoms.",
        "Report to your state forestry or extension program for guidance and tracking.",
      ],
      contactName: "State forestry or extension office",
      contactInstructions:
        "Use local forest health reporting channels to support surveillance.",
    },
    source: [
      { label: "USDA Forest Service", url: "https://www.fs.usda.gov/" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "oak-wilt",
    slug: "oak-wilt",
    commonName: "Oak Wilt",
    scientificName: "Bretziella fagacearum",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Forest diseases",
    summary:
      "A rapidly spreading oak disease that can move through stands and kill mature trees.",
    eddMapsSubjectId: 86451,
    image: {
      src: "/species/oak-wilt.jpg",
      alt: "Oak wilt leaf symptoms on red oak",
      credit: "Wikimedia Commons",
    },
    origin: "A destructive fungal disease spreading through root grafts and insect movement between wounded oaks.",
    whatToLookFor: [
      "Rapid browning and leaf drop in red oaks during the growing season.",
      "Veinal necrosis or bronzing that starts at leaf edges.",
      "Mortality pockets where adjacent oaks decline together.",
    ],
    whyItMatters:
      "Oak wilt can wipe through oak stands quickly, reducing canopy cover, wildlife value, and long-term forest resilience.",
    action: {
      mode: "report",
      summary:
        "Confirmed management usually requires professional trenching, pruning timing, or sanitation decisions.",
      steps: [
        "Avoid pruning oaks during periods when local authorities warn against it.",
        "Photograph symptomatic leaves and affected trees.",
        "Consult forestry or extension experts before removing or transporting wood.",
      ],
      contactName: "Extension or forestry office",
      contactInstructions:
        "Ask for regional management guidance because treatment timing varies by climate and oak group.",
    },
    source: [
      { label: "USDA", url: "https://www.usda.gov/farming-and-ranching/plants-and-crops/pest-and-weed-management/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "feral-swine",
    slug: "feral-swine",
    commonName: "Feral Swine",
    scientificName: "Sus scrofa",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Mammals",
    summary:
      "Highly destructive invasive mammals that root through crops, wetlands, and native habitat.",
    eddMapsSubjectId: 3874,
    image: {
      src: "/species/feral-swine.jpg",
      alt: "Feral swine in grassland habitat",
      credit: "USDA APHIS / Wikimedia Commons",
    },
    origin: "Descended from escaped domestic pigs and Eurasian wild boar introductions.",
    whatToLookFor: [
      "Rooted ground, wallows, tracks, and torn-up wetlands or fields.",
      "Group sightings near crop edges, creek bottoms, and forests.",
      "Heavy disturbance around feeders, food plots, or marsh edges.",
    ],
    whyItMatters:
      "Feral swine destroy crops and native vegetation, prey on wildlife, erode streambanks, and spread disease risks.",
    action: {
      mode: "report",
      summary:
        "Most effective control comes from coordinated trapping and removal programs rather than isolated hunting pressure.",
      steps: [
        "Record the location, group size, and damage signs.",
        "Avoid scattering the sounder with casual pursuit if control teams are active.",
        "Report the activity to state wildlife, agriculture, or USDA feral swine contacts.",
      ],
      contactName: "USDA APHIS feral swine program",
      contactUrl: "https://www.aphis.usda.gov/operational-wildlife-activities/feral-swine",
      contactInstructions:
        "Use local reporting contacts where available so removal efforts can be coordinated.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/operational-wildlife-activities/feral-swine" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "nutria",
    slug: "nutria",
    commonName: "Nutria",
    scientificName: "Myocastor coypus",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Mammals",
    summary:
      "An invasive wetland rodent linked to marsh loss, bank damage, and habitat degradation.",
    eddMapsSubjectId: 4334,
    image: {
      src: "/species/nutria.jpg",
      alt: "Nutria on the edge of a marsh",
      credit: "Rhododendrites / Wikimedia Commons",
    },
    origin: "Native to South America; introduced through the fur trade.",
    whatToLookFor: [
      "Large semi-aquatic rodents with orange front teeth.",
      "Heavy feeding on marsh plants and den burrows in banks or levees.",
      "Trails, slides, and clipped vegetation in freshwater or brackish wetlands.",
    ],
    whyItMatters:
      "Nutria consume wetland vegetation and accelerate marsh loss, bank instability, and habitat degradation for native birds and fish.",
    action: {
      mode: "report",
      summary:
        "Wetland control is usually coordinated through state wildlife, marsh restoration, or nutria eradication programs.",
      steps: [
        "Photograph the animal or feeding damage if possible.",
        "Note whether the sighting is in a marsh, levee, canal, or restoration site.",
        "Report repeated activity to the relevant state wildlife or invasive species program.",
      ],
      contactName: "State wildlife or wetland program",
      contactInstructions:
        "Use local eradication contacts where a formal nutria program exists.",
    },
    source: [
      { label: "USFWS", url: "https://www.fws.gov/program/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
  {
    id: "northern-snakehead",
    slug: "northern-snakehead",
    commonName: "Northern Snakehead",
    scientificName: "Channa argus",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Fish",
    summary:
      "A predatory invasive fish that can disrupt food webs in connected waters.",
    eddMapsSubjectId: 12251,
    image: {
      src: "/species/northern-snakehead.jpg",
      alt: "Northern snakehead fish out of water",
      credit: "Huangdan2060 / Wikimedia Commons",
    },
    origin: "Native to eastern Asia; introduced through live food and aquarium pathways.",
    whatToLookFor: [
      "Long torpedo-shaped fish with a snake-like head and mottled pattern.",
      "Presence in ponds, reservoirs, tidal creeks, or slow rivers.",
      "Aggressive predatory behavior and reports from anglers in new waters.",
    ],
    whyItMatters:
      "Northern snakehead can alter aquatic food webs by preying on native fish, amphibians, and invertebrates in connected waters.",
    action: {
      mode: "both",
      summary:
        "Do not transport live fish. Follow state rules, which often require harvest and reporting from new waters.",
      steps: [
        "If legally required in your state, do not release captured fish back into the water.",
        "Photograph the fish and note the waterbody access point.",
        "Report new or unusual captures to state fisheries or invasive species staff.",
      ],
      contactName: "State fisheries agency",
      contactInstructions:
        "Check local rules before handling the fish because harvest and transport regulations vary.",
    },
    source: [
      { label: "USFWS", url: "https://www.fws.gov/program/invasive-species" },
      { label: "EDDMaps", url: "https://www.eddmaps.org/" },
    ],
  },
];
