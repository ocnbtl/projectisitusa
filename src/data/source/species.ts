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
      "A hitchhiking invasive planthopper that feeds on many plants and has become a major threat to vineyards, orchards, and hardwood landscapes.",
    eddMapsSubjectId: 77293,
    image: {
      src: "/species/spotted-lanternfly.jpg",
      alt: "Adult spotted lanternfly on bark",
      credit: "Penn State Extension / Wikimedia Commons",
    },
    origin: "Native to China, India, and Vietnam; introduced to the U.S. through transported goods.",
    whatToLookFor: [
      "Adults with gray forewings marked by black spots and bright red hindwings that show when the insect opens up.",
      "Egg masses that look like a smear of cracked mud on trees, stone, grills, trailers, pallets, outdoor furniture, and vehicles.",
      "Sticky honeydew, black sooty mold, and groups of nymphs or adults feeding on tree-of-heaven, grapevines, hardwoods, or fruit trees.",
    ],
    whyItMatters:
      "Spotted lanternfly drains sap from a wide range of plants and can seriously stress grapevines, orchards, nursery stock, and hardwoods. The honeydew it leaves behind promotes sooty mold, attracts other insects, and turns decks, cars, and patios into a sticky mess.",
    action: {
      mode: "both",
      summary:
        "Kill egg masses and individual insects when you can do it safely, and report sightings when your state asks for reports or when the insect appears outside the known infestation footprint.",
      steps: [
        "Inspect vehicles, trailers, outdoor gear, and anything stored outside before moving it out of an infested or quarantine area.",
        "Scrape egg masses into a sealed bag with rubbing alcohol or hand sanitizer, then throw the sealed bag in the trash.",
        "Stomp or trap adults and nymphs when practical, and report new finds through your state contact listed on the APHIS page.",
      ],
      contactName: "State plant regulatory official or plant health director",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/slf",
      contactInstructions:
        "APHIS lists state reporting contacts. Use that directory if you find spotted lanternfly in a new area or your state still requests public reports.",
      safetyNotes:
        "Do not spray improvised pesticides on public land, natural areas, or near food crops without labeled guidance.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/slf" },
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
      "A destructive wood-boring beetle that has killed ash trees across neighborhoods, forests, and stream corridors in much of North America.",
    eddMapsSubjectId: 7171,
    image: {
      src: "/species/emerald-ash-borer.jpg",
      alt: "Emerald ash borer on wood surface",
      credit: "David Cappaert / Bugwood / Wikimedia Commons",
    },
    origin: "Native to northeastern Asia; introduced through infested wood packaging material.",
    whatToLookFor: [
      "Metallic green adults about half an inch long, with a coppery red abdomen visible when the wings are open.",
      "D-shaped exit holes, bark splits, and winding S-shaped galleries hidden just under the bark of ash trees.",
      "Crown dieback, trunk sprouts, and unusually heavy woodpecker activity on ash.",
    ],
    whyItMatters:
      "Emerald ash borer has killed tens of millions of ash trees in North America. Losing ash changes street canopies, stream corridors, and forests, and it leaves communities with large removal costs and more hazardous dead trees.",
    action: {
      mode: "report",
      summary:
        "Report suspicious ash decline or beetle damage, avoid moving ash wood, and use certified arborists for any treatment or removal decisions.",
      steps: [
        "Photograph the beetle, exit holes, bark splits, or canopy decline if you can document them clearly.",
        "Do not move ash firewood, logs, or nursery stock unless it is local or certified heat treated.",
        "Use the APHIS reporting form or contact your state forestry agency if you suspect a new infestation or want confirmation.",
      ],
      contactName: "USDA APHIS or your state forestry agency",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/eab",
      contactInstructions:
        "APHIS provides a reporting form and a hotline. Local forestry agencies can also advise on disposal rules and whether treatment still makes sense for a high value ash.",
      safetyNotes:
        "Insecticide treatment and removal of large ash trees should be handled by a certified arborist.",
    },
    source: [
      { label: "USDA APHIS", url: "https://www.aphis.usda.gov/plant-pests-diseases/eab" },
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
      "A hardwood-boring beetle that can wipe out maples and other host trees, forcing large-scale removals and eradication work.",
    eddMapsSubjectId: 2178,
    image: {
      src: "/species/asian-longhorned-beetle.jpg",
      alt: "Asian longhorned beetle with banded antennae",
      credit: "USDA APHIS / Wikimedia Commons",
    },
    origin: "Native to China and Korea; introduced through wood packing material.",
    whatToLookFor: [
      "Shiny black beetles with white spots and black and white antennae that are longer than the body.",
      "Round exit holes about the size of a dime or smaller in trunks and branches of maple and other hardwoods.",
      "Egg sites chewed into bark, sap weeping from those wounds, and sawdust-like frass on branches or the ground.",
    ],
    whyItMatters:
      "Asian longhorned beetle kills maples and other hardwoods that shape neighborhood shade, fall color, and forest structure. Because infested trees cannot recover, every missed infestation can mean more tree loss and more expensive removals.",
    action: {
      mode: "report",
      summary:
        "Report any suspected beetle or damage immediately. Early detection is the main reason eradication is still possible in U.S. outbreak areas.",
      steps: [
        "Take clear photos of the beetle, exit holes, frass, or egg sites if you can do so safely.",
        "If you catch a beetle, seal it in a durable container and freeze it to preserve it for identification.",
        "Do not move firewood, logs, branches, or other hardwood material out of the area, and report the find through APHIS right away.",
      ],
      contactName: "USDA APHIS",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/about-alb",
      contactInstructions:
        "Use the APHIS online report or hotline for suspected beetles or damage. The APHIS ALB pages also explain which host trees and symptoms matter most.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/about-alb",
      },
      {
        label: "USDA APHIS Signs of Infestation",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/alb/check-trees/signs-alb",
      },
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
      "A fast-growing invasive tree that takes over disturbed ground, crowds out other plants, and helps support spotted lanternfly populations.",
    eddMapsSubjectId: 3003,
    image: {
      src: "/species/tree-of-heaven.jpg",
      alt: "Tree-of-heaven leaves and seed clusters",
      credit: "Wikimedia Commons",
    },
    origin: "Native to China and Taiwan; introduced as an ornamental street tree.",
    whatToLookFor: [
      "Very large compound leaves with many smooth-edged leaflets, each leaflet showing one or two glandular teeth near the base.",
      "A strong foul odor from crushed leaves or broken twigs, plus smooth gray bark that resembles cantaloupe skin on younger trees.",
      "Dense clusters of winged seeds on female trees and vigorous root suckers spreading through roadsides, lots, fence rows, and forest edges.",
    ],
    whyItMatters:
      "Tree-of-heaven spreads by both seed and root suckers, can quickly crowd out native plants, and releases chemicals that make it harder for other vegetation to establish. It also acts as a favored host for spotted lanternfly, which makes unmanaged stands even more problematic.",
    action: {
      mode: "diy",
      summary:
        "Small seedlings can be pulled, but mature trees need root-focused control. Cutting alone usually makes the infestation worse by triggering heavy stump and root sprouting.",
      steps: [
        "Pull seedlings when the soil is moist and you can remove the full root system.",
        "For larger trees, use a labeled systemic herbicide at the proper time of year, often mid to late summer, or hire a professional who already knows the Penn State approach.",
        "Wait for the herbicide to move into the roots before cutting the tree, then watch the site for root suckers and retreat any regrowth.",
      ],
      safetyNotes:
        "Wear gloves and eye protection, follow herbicide labels exactly, and do not start by cutting mature trees unless you are prepared for follow-up control.",
    },
    source: [
      { label: "Penn State Extension", url: "https://extension.psu.edu/tree-of-heaven" },
      {
        label: "Penn State Control Strategies",
        url: "https://extension.psu.edu/tree-of-heaven-control-strategies",
      },
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
      "A fast-growing invasive vine that can blanket trees, poles, and open ground until entire edges and rights-of-way disappear under it.",
    eddMapsSubjectId: 37840,
    image: {
      src: "/species/kudzu.jpg",
      alt: "Kudzu vine covering trees",
      credit: "Forest & Kim Starr / Wikimedia Commons",
    },
    origin: "Native to East Asia; introduced for erosion control and forage.",
    whatToLookFor: [
      "Twining woody vines with three broad leaflets, often with smooth or slightly lobed edges and a hairy underside.",
      "Dense blankets of growth smothering trees, poles, roadside edges, old fields, and sunny disturbed ground.",
      "Purple to wine-colored flower clusters in summer, often followed by fuzzy bean-like pods.",
    ],
    whyItMatters:
      "Kudzu can grow fast enough to overtop shrubs, trees, and structures, shutting out light and pulling down vegetation under its weight. Once established, it can dominate edges, openings, and rights-of-way for years.",
    action: {
      mode: "diy",
      summary:
        "Kudzu control is a repeat project, not a one-time pull. Most sites need repeated cutting, follow-up herbicide work, or both over multiple seasons.",
      steps: [
        "Cut climbing vines near ground level to relieve trees and keep seed or vine growth from expanding upward.",
        "Treat regrowth with a labeled foliar or cut stump herbicide method suited to the site, especially if the patch is too large to dig by hand.",
        "Return for several seasons because rooted crowns, rooted nodes, and missed stems can restart the infestation.",
      ],
      safetyNotes:
        "Use extra caution on steep slopes and near streams, ponds, or wetlands. Large patches usually need a site-specific control plan.",
    },
    source: [
      { label: "National Park Service", url: "https://www.nps.gov/neri/learn/nature/kudzu.htm" },
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
      "A very large invasive plant with phototoxic sap that can cause severe skin burns, blistering, and eye injury.",
    eddMapsSubjectId: 4536,
    image: {
      src: "/species/giant-hogweed.jpg",
      alt: "Giant hogweed flower umbels",
      credit: "H. Zell / Wikimedia Commons",
    },
    origin: "Native to the western Caucasus; introduced as an ornamental plant.",
    whatToLookFor: [
      "A very large plant, often over 8 feet tall, with thick hollow stems marked by purple blotches and stiff hairs.",
      "Huge white umbrella-shaped flower heads that can be much larger than look-alike plants such as Queen Anne's lace or cow parsnip.",
      "Massive jagged leaves and a stem broad enough to be noticeably oversized compared with most roadside herbs.",
    ],
    whyItMatters:
      "Giant hogweed crowds out other vegetation, especially along roadsides and stream corridors, but the immediate human-health risk is what makes it especially serious. The sap can trigger severe burns, blisters, and eye injury when it gets on skin and is then exposed to sunlight.",
    action: {
      mode: "both",
      summary:
        "Do not touch giant hogweed casually. Confirm the plant first, keep people away from it, and only attempt control if you can follow strict protective steps.",
      steps: [
        "Keep children, pets, and bare skin away from the plant, and do not mow, weed-whack, or break stems that could spray sap.",
        "Photograph the whole plant, leaves, stem, and flower head from a safe distance so an agency can help confirm the identification.",
        "If the infestation is on your property and you are directed to manage it yourself, wear water-resistant gloves, long sleeves, long pants, and eye protection, work when plants are small if possible, and keep monitoring for seedlings for years.",
      ],
      contactName: "State invasive plant or agriculture program",
      contactUrl: "https://www.maine.gov/dacf/php/horticulture/gianthogweed.shtml",
      contactInstructions:
        "Use your state invasive plant reporting process for confirmation and safety guidance before removal. Accurate identification matters because several harmless look-alikes are common.",
      safetyNotes:
        "If sap touches your skin, wash immediately with soap and water and keep the area out of sunlight for at least 48 hours. If sap gets in the eyes, seek medical care.",
    },
    source: [
      {
        label: "Maine DACF Control and Safety Information",
        url: "https://www.maine.gov/dacf/php/horticulture/gianthogweed.shtml",
      },
      {
        label: "Maine DACF Identification Information",
        url: "https://www1.maine.gov/dacf/php/horticulture/hogweedlookalikes.shtml",
      },
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
      "A submerged invasive plant that forms thick underwater growth and surface mats, making lakes, ponds, canals, and reservoirs harder to manage or enjoy.",
    eddMapsSubjectId: 3028,
    image: {
      src: "/species/hydrilla.jpg",
      alt: "Hydrilla underwater stems and leaves",
      credit: "Krzysztof Ziarnek, Kenraiz / Wikimedia Commons",
    },
    origin: "Native to the Old World and spread in the U.S. through aquarium, water-garden, and plant-fragment pathways.",
    whatToLookFor: [
      "Submerged stems with leaves in whorls of 4 to 8, with 5 leaves around the stem being especially common.",
      "Saw-toothed leaf edges and a rough midrib that may have small spines, with stems branching heavily near the water surface.",
      "Dense underwater growth or surface mats in ponds, lakes, ditches, marshes, rivers, and reservoirs.",
    ],
    whyItMatters:
      "Hydrilla can dominate entire waterbodies, shade out native aquatic plants, alter water chemistry, and interfere with boating, fishing, swimming, and waterfowl habitat. It is also hard to eradicate because fragments, tubers, and turions can all restart the infestation.",
    action: {
      mode: "report",
      summary:
        "Report hydrilla quickly and focus on spread prevention. Aquatic infestations usually need coordinated treatment because even small fragments can start new colonies.",
      steps: [
        "Take photos, note the exact waterbody and launch or shoreline location, and report the sighting to your state aquatic invasive species program.",
        "Clean, drain, and dry boats, trailers, anchors, fishing gear, waders, and anything else that leaves the water.",
        "Never dump aquarium or water-garden plants into natural waters, and never move suspicious aquatic plants from one pond or lake to another.",
      ],
      contactName: "State aquatic invasive species program",
      contactInstructions:
        "Agencies need the exact waterbody, a precise access point or shoreline location, photos, and the date of the observation.",
    },
    source: [
      {
        label: "Michigan Invasive Species Program",
        url: "https://www.michigan.gov/invasives/id-report/plants/aquatic/hydrilla",
      },
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
      "An invasive water mold that kills oaks and tanoaks, infects many other plants, and has reshaped parts of the West Coast forest landscape.",
    eddMapsSubjectId: 4603,
    image: {
      src: "/species/sudden-oak-death.jpg",
      alt: "Sudden oak death symptoms on tree trunk",
      credit: "USDA APHIS / Wikimedia Commons",
    },
    origin: "An invasive plant pathogen associated with nursery and plant-movement pathways.",
    whatToLookFor: [
      "Bleeding trunk or branch cankers on oaks and tanoaks.",
      "Brown to black leaf lesions and twig dieback on susceptible hosts such as rhododendron and other nursery or landscape plants.",
      "Clusters of declining host trees where infected plants or wet conditions may be helping the pathogen spread.",
    ],
    whyItMatters:
      "Phytophthora ramorum has killed millions of trees in coastal California and southern Oregon and can infect more than 100 plant species. It changes forest structure, increases dead material, threatens nursery trade, and has no cure once a plant is infected.",
    action: {
      mode: "report",
      summary:
        "This disease needs professional confirmation. Focus on preventing movement of infected plant material and getting an official diagnosis rather than trying home treatments.",
      steps: [
        "Photograph cankers, leaves, twigs, and the whole plant, and check whether the host species is on the official susceptible host list.",
        "Do not move sick plants, soil, mulch, firewood, or trimmings from the site.",
        "Disinfect pruning tools between plants and contact your state agriculture or forestry program for sampling and confirmation.",
      ],
      contactName: "State forestry or agriculture agency",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/pramorum",
      contactInstructions:
        "APHIS explains the host list, symptoms, and prevention steps. State agencies handle official diagnosis, quarantines, and nursery movement rules.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/pramorum",
      },
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
      "An emerging forest disease linked to an invasive nematode that is causing decline and mortality in both native and ornamental beech trees.",
    eddMapsSubjectId: 85517,
    image: {
      src: "/species/beech-leaf-disease.jpg",
      alt: "Beech leaves with dark interveinal banding",
      credit: "National Park Service",
    },
    origin: "A recently recognized disease associated with the nematode Litylenchus crenatae mccannii, first detected in Ohio and now spreading through the Northeast and Great Lakes region.",
    whatToLookFor: [
      "Dark striping between the veins of beech leaves, often easiest to see by looking up through the canopy or holding a leaf to the light.",
      "Curled, leathery, thickened, or undersized leaves, along with reduced bud and leaf production.",
      "Thinning crowns, premature leaf loss, and decline in both saplings and mature beech trees.",
    ],
    whyItMatters:
      "Beech leaf disease can kill beech of all ages, with younger trees often declining fastest. Because beech is an important mast tree and a common part of eastern forests, this disease can change wildlife food supplies, nesting habitat, shade patterns, and long-term forest composition.",
    action: {
      mode: "report",
      summary:
        "Document symptoms and report them. Research is still developing, so accurate tracking and expert confirmation are more useful than improvised treatment.",
      steps: [
        "Photograph the leaves, bark, the full canopy, and nearby beech trees with similar symptoms.",
        "Record the exact location and avoid moving firewood from the site if symptoms look suspicious.",
        "Report the tree to your state forest health or invasive species program, and ask whether a licensed arborist is warranted for treatment options on high value landscape trees.",
      ],
      contactName: "State forest health or extension office",
      contactUrl: "https://dec.ny.gov/nature/forests-trees/forest-health/beech-leaf-disease",
      contactInstructions:
        "State forest health programs often want photos and a precise location. The New York DEC page is a good model for the kind of documentation agencies need.",
    },
    source: [
      {
        label: "New York State Department of Environmental Conservation",
        url: "https://dec.ny.gov/nature/forests-trees/forest-health/beech-leaf-disease",
      },
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
      "A lethal oak disease that can move through connected roots and by insects, killing red oaks quickly and threatening whole pockets of trees.",
    eddMapsSubjectId: 86451,
    image: {
      src: "/species/oak-wilt.jpg",
      alt: "Oak wilt leaf symptoms on red oak",
      credit: "Wikimedia Commons",
    },
    origin: "A destructive fungal disease that was likely introduced to North America and now spreads by insects and root grafts between nearby oaks.",
    whatToLookFor: [
      "Sudden wilting and leaf drop in summer, especially in red oaks, often while some green color still remains on the fallen leaves.",
      "Browning that starts at the leaf edge and moves inward toward the midvein, plus dieback that begins high in the canopy.",
      "Groups of nearby oaks declining together, or fungal mats under the bark of recently killed red oaks.",
    ],
    whyItMatters:
      "Oak wilt can kill red oaks in weeks or months and can spread underground from tree to tree through connected roots. Losing oaks means losing mast for wildlife, canopy cover, timber value, and a major part of many eastern and Midwestern forests.",
    action: {
      mode: "both",
      summary:
        "Prevent fresh wounds during the risky season, do not move suspect oak wood, and report likely cases quickly so professionals can confirm the disease and decide whether root disruption or sanitation is needed.",
      steps: [
        "Avoid pruning or wounding oaks during the growing season when beetles can move spores, and seal accidental fresh wounds right away if they happen.",
        "Do not move oak logs, branches, or untreated firewood from a suspect site.",
        "Take photos of fallen leaves, the whole tree, and the base of the trunk, then submit a report to your state forest health program or extension office.",
      ],
      contactName: "State forest health program",
      contactUrl: "https://dec.ny.gov/nature/forests-trees/forest-health/oak-wilt",
      contactInstructions:
        "Management timing varies by region and oak group. State forest health programs can tell you whether testing, trenching, removal, or quarantine rules apply where you are.",
      safetyNotes:
        "Do not assume every summer-brown oak has oak wilt. Confirmation matters before removal or trenching decisions.",
    },
    source: [
      {
        label: "New York State Department of Environmental Conservation",
        url: "https://dec.ny.gov/nature/forests-trees/forest-health/oak-wilt",
      },
      {
        label: "Texas A&M Forest Service",
        url: "https://tfsweb.tamu.edu/trees/tree-health/diseases/texas-oak-wilt/",
      },
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
