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
    id: "popillia-japonica",
    slug: "popillia-japonica",
    commonName: "Japanese Beetle",
    scientificName: "Popillia japonica",
    category: "insects",
    profileType: "curated",
    displayGroup: "Beetles",
    summary:
      "A highly visible invasive beetle whose adults skeletonize leaves and flowers while its grubs damage turf by feeding on grass roots.",
    origin: "Native to Japan and first detected in the United States in New Jersey in 1916 after accidental introduction.",
    whatToLookFor: [
      "Metallic green beetles with coppery wing covers and small white hair tufts along each side of the abdomen.",
      "Leaves chewed between the veins so only a lace-like network of tissue remains.",
      "Browning turf that lifts easily like a loose carpet when grubs have eaten the roots below.",
    ],
    whyItMatters:
      "Japanese beetles feed on more than 300 kinds of plants and can quickly strip ornamentals, grapes, roses, and fruit crops. Their grub stage also weakens lawns and attracts skunks, raccoons, and birds that tear up turf while feeding.",
    action: {
      mode: "both",
      summary:
        "Start management early, knock down small adult populations by hand when practical, and avoid moving soil, sod, or infested plants out of areas where regulations apply.",
      steps: [
        "Inspect susceptible plants in late June and July so you catch adults before large groups build up.",
        "For small plantings, hand-pick or shake beetles into soapy water instead of letting them feed for weeks.",
        "If grubs or adults are causing serious damage, follow local extension guidance and movement rules for plants, sod, or soil.",
      ],
      contactName: "State agriculture agency or extension office",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/japanese-beetle",
      contactInstructions:
        "Use APHIS for quarantine and movement guidance, and your state extension service for yard and garden management advice.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/japanese-beetle",
      },
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/node/11076",
      },
    ],
  },
  {
    id: "halyomorpha-halys",
    slug: "halyomorpha-halys",
    commonName: "Brown Marmorated Stink Bug",
    scientificName: "Halyomorpha halys",
    category: "insects",
    profileType: "curated",
    displayGroup: "Bugs & sap-feeders",
    summary:
      "An invasive stink bug that damages fruit and vegetable crops outside, then becomes a major nuisance when it overwinters inside homes.",
    origin: "Native to East Asia and first detected in Pennsylvania in the late 1990s after accidental introduction.",
    whatToLookFor: [
      "Shield-shaped brown bugs with a marbled appearance and pale bands on the antennae, legs, and outer edge of the abdomen.",
      "Clusters of adults gathering on sunny exterior walls, window frames, soffits, and attic spaces in fall.",
      "Pitted, corky, or misshapen fruit and vegetable damage caused by feeding through the skin.",
    ],
    whyItMatters:
      "Brown marmorated stink bug is both an agricultural pest and a household nuisance. It injures apples, peaches, peppers, tomatoes, and many other crops, and it can invade buildings in large numbers while searching for winter shelter.",
    action: {
      mode: "both",
      summary:
        "For homes, exclusion is the main fix. For gardens and orchards, use monitoring and crop-specific extension guidance instead of reacting after heavy damage is already underway.",
      steps: [
        "Seal gaps around doors, windows, siding, vents, and utility penetrations before fall to reduce indoor overwintering.",
        "Vacuum bugs that make it inside instead of crushing them, which releases a strong odor and can stain surfaces.",
        "If plants or fruit are being damaged, document the pest and use local extension recommendations for monitoring and management.",
      ],
      safetyNotes:
        "Perimeter pesticide applications are a last-resort measure and should be used carefully, especially around occupied buildings.",
    },
    source: [
      {
        label: "Penn State Extension",
        url: "https://extension.psu.edu/brown-marmorated-stink-bug",
      },
      {
        label: "Cornell CALS",
        url: "https://cals.cornell.edu/new-york-state-integrated-pest-management/outreach-education/whats-bugging-you/brown-marmorated-stink-bug",
      },
    ],
  },
  {
    id: "lymantria-dispar",
    slug: "lymantria-dispar",
    commonName: "Spongy Moth",
    scientificName: "Lymantria dispar",
    category: "insects",
    profileType: "curated",
    displayGroup: "Moths & butterflies",
    summary:
      "A destructive invasive moth whose caterpillars can strip leaves from hundreds of kinds of trees and shrubs.",
    origin: "Native to Europe and introduced to the United States more than a century ago, with spread greatly aided by people moving egg masses on outdoor items.",
    whatToLookFor: [
      "Buff-colored, fuzzy egg masses on trees, stones, firewood, trailers, grills, toys, and lawn equipment.",
      "Hairy caterpillars with five pairs of blue dots followed by six pairs of red dots along the back.",
      "Trees that look suddenly bare in spring or summer, often with frass pellets and chewed leaves below.",
    ],
    whyItMatters:
      "Repeated defoliation weakens and can kill trees, especially oaks and other favored hosts. When large outbreaks happen, they reshape forest cover, stress yard trees, and make human movement of infested items a major spread pathway.",
    action: {
      mode: "both",
      summary:
        "Destroy reachable egg masses, inspect outdoor items before moving them, and report finds if you are outside regulated or known infested areas.",
      steps: [
        "Inspect outdoor household goods, firewood, vehicles, and equipment for egg masses before moving them.",
        "Scrape egg masses into hot soapy water or a sealed bag so they are fully destroyed.",
        "If you are outside a quarantine area or unsure of the status, report suspect egg masses or caterpillars to your state agriculture contact.",
      ],
      contactName: "State plant regulatory official or plant health director",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/spongy-moth",
      contactInstructions:
        "APHIS provides quarantine maps, self-inspection guidance, and state contact information for reporting.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/spongy-moth",
      },
    ],
  },
  {
    id: "drosophila-suzukii",
    slug: "drosophila-suzukii",
    commonName: "Spotted-wing Drosophila",
    scientificName: "Drosophila suzukii",
    category: "insects",
    profileType: "curated",
    displayGroup: "Flies",
    summary:
      "An invasive fruit fly that attacks ripening soft fruit, not just overripe fruit, by laying eggs under the skin before harvest.",
    origin: "Native to East Asia and first detected in the continental United States in California in 2008 before spreading rapidly across fruit-growing regions.",
    whatToLookFor: [
      "Male flies with a single dark spot near the tip of each wing and red eyes on both sexes.",
      "Soft fruit with tiny punctures, dimpling, wrinkling, or collapse a few days after eggs are laid.",
      "Small white larvae inside berries, cherries, or other thin-skinned fruit that looked sound at first pick.",
    ],
    whyItMatters:
      "Unlike typical vinegar flies, spotted-wing drosophila attacks marketable fruit before harvest. That makes it a major pest in berries, cherries, grapes, and other soft fruit, and even low infestation levels can ruin an otherwise usable crop.",
    action: {
      mode: "both",
      summary:
        "Pick fruit promptly, remove infested fruit fast, and monitor early if you grow susceptible berries or cherries.",
      steps: [
        "Harvest ripe fruit often and do not leave overripe or damaged fruit hanging on the plant or rotting on the ground.",
        "Seal and dispose of infested fruit instead of composting it in a way that lets flies keep developing.",
        "Use traps and extension guidance if you grow susceptible fruit and need to time protective management.",
      ],
      contactName: "Extension fruit or garden program",
      contactUrl: "https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/spotted-wing-drosophila",
      contactInstructions:
        "Cornell's fact sheet links to monitoring and management resources that are especially useful for berry and orchard growers.",
    },
    source: [
      {
        label: "Cornell CALS",
        url: "https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/spotted-wing-drosophila",
      },
    ],
  },
  {
    id: "solenopsis-invicta",
    slug: "solenopsis-invicta",
    commonName: "Red Imported Fire Ant",
    scientificName: "Solenopsis invicta",
    category: "insects",
    profileType: "curated",
    displayGroup: "Wasps, ants & bees",
    summary:
      "A venomous invasive ant that builds aggressive mound colonies, harms people and animals, and spreads easily in soil, nursery stock, and equipment.",
    origin: "Native to South America and introduced into the United States through cargo pathways, likely in soil carried by ships.",
    whatToLookFor: [
      "Hard, dome-shaped mounds in open sunny places such as lawns, fields, pastures, parks, and roadsides.",
      "Reddish-brown ants of mixed sizes that swarm rapidly when the mound is disturbed.",
      "Painful repeated stings that leave burning welts and itchy white pustules.",
    ],
    whyItMatters:
      "Red imported fire ants injure people, livestock, pets, and wildlife, displace native ants, interfere with field work, and can damage crops, seedlings, and equipment in infested areas.",
    action: {
      mode: "both",
      summary:
        "Avoid disturbing suspected mounds, follow quarantine rules on moving soil and related materials, and use local treatment guidance if the ants are established on your property.",
      steps: [
        "Do not stand in or kick suspect mounds, especially where children, pets, or livestock could be stung.",
        "Do not move soil, baled hay, nursery plants, or soil-moving equipment out of quarantine areas without following the rules.",
        "If you need treatment guidance, use APHIS and your local extension service rather than improvised remedies.",
      ],
      contactName: "State plant regulatory official or extension office",
      contactUrl: "https://www.aphis.usda.gov/plant-pests-diseases/ifa",
      contactInstructions:
        "APHIS provides quarantine maps and regulated articles information. Local extension programs can help with mound treatment options.",
      safetyNotes:
        "Fire ants can sting repeatedly. Seek medical care immediately if stings trigger breathing trouble, widespread swelling, or other signs of a serious allergic reaction.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/plant-pests-diseases/ifa",
      },
    ],
  },
  {
    id: "ophiostoma-novo-ulmi",
    slug: "ophiostoma-novo-ulmi",
    commonName: "Dutch Elm Disease",
    scientificName: "Ophiostoma novo-ulmi",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Fungi & pathogens",
    summary:
      "A lethal elm disease spread by bark beetles and root grafts that has already transformed streets, towns, and river-bottom forests across North America.",
    origin: "An invasive fungal disease complex introduced from outside North America and now spread by elm bark beetles and underground root connections between nearby elms.",
    whatToLookFor: [
      "Outer branches that turn yellow, wilt, then brown, often starting in late spring or early summer.",
      "Leaves falling from one section of the canopy while the rest of the tree still appears green.",
      "Brown streaking in the sapwood if bark is peeled from a recently wilted branch.",
    ],
    whyItMatters:
      "Dutch elm disease has killed millions of elms, removing one of the classic shade trees of North American towns and floodplains. Once established in a tree, it can also move underground into neighboring elms through root grafts.",
    action: {
      mode: "both",
      summary:
        "Catch it early, keep beetles from breeding in dead elm wood, and use an arborist when you are dealing with a valuable landscape elm.",
      steps: [
        "Do not store recently cut elm logs or firewood with bark attached, because bark beetles can breed in that material.",
        "If an elm shows fresh wilt, get a sample confirmed quickly instead of waiting to see if it recovers.",
        "For high-value trees, ask a certified arborist about pruning infected limbs, fungicide injections, and root-graft disruption where appropriate.",
      ],
      contactName: "Certified arborist or extension diagnostic program",
      contactUrl: "https://extension.umn.edu/plant-diseases/dutch-elm-disease",
      contactInstructions:
        "The UMN guide explains the main symptoms, how the fungus spreads, and when professional treatment or removal decisions make sense.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/plant-diseases/dutch-elm-disease",
      },
    ],
  },
  {
    id: "cryphonectria-parasitica",
    slug: "cryphonectria-parasitica",
    commonName: "Chestnut Blight",
    scientificName: "Cryphonectria parasitica",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Fungi & pathogens",
    summary:
      "The invasive fungal disease that nearly eliminated mature American chestnut from eastern forests and still kills stems before they can reclaim their former role.",
    origin: "Introduced from Asia on resistant chestnut stock in the late 1800s and spread through the nursery trade and natural spore movement.",
    whatToLookFor: [
      "Sunken or swollen cankers on chestnut trunks or branches, often with orange or yellow-brown bark around the infection.",
      "Leaves that yellow and brown but stay attached after stems are girdled.",
      "Orange pimple-like fruiting bodies and yellowish spore masses on active cankers during wet weather.",
    ],
    whyItMatters:
      "Chestnut blight removed a dominant mast-producing canopy tree from eastern forests and changed wildlife food supplies, forest composition, and local economies. Even where chestnut roots still resprout, the blight often kills stems before they mature.",
    action: {
      mode: "report",
      summary:
        "For most people, the best response is confirmation and sanitation, not do-it-yourself treatment. Existing chestnut sprouts and plantings are worth documenting because restoration efforts depend on good information.",
      steps: [
        "Photograph cankers, leaves, and the overall tree or sprout before cutting anything.",
        "Do not move infected chestnut wood, nursery stock, or bark-covered material to new sites.",
        "Report suspect trees to an extension, forest health, or chestnut restoration program if the tree could matter for monitoring or conservation work.",
      ],
      contactName: "Extension plant disease or forest health program",
      contactUrl: "https://extension.psu.edu/chestnut-diseases",
      contactInstructions:
        "Penn State's chestnut disease page summarizes the classic canker symptoms and notes that infected trees should be removed rather than casually left in place.",
    },
    source: [
      {
        label: "Penn State Extension",
        url: "https://extension.psu.edu/chestnut-diseases",
      },
      {
        label: "National Park Service",
        url: "https://www.nps.gov/articles/ecological-threats-plants-animals.htm",
      },
    ],
  },
  {
    id: "rosa-multiflora",
    slug: "rosa-multiflora",
    commonName: "Multiflora Rose",
    scientificName: "Rosa multiflora",
    category: "plants",
    profileType: "curated",
    displayGroup: "Other plants",
    summary:
      "A thorny invasive shrub that forms dense, arching thickets in fields, forest edges, stream corridors, and pastures.",
    origin: "Native to East Asia and intentionally planted in the United States for ornament, erosion control, wildlife cover, and living fences.",
    whatToLookFor: [
      "Arching canes with many recurved thorns and compound leaves made up of 5 to 11 toothed leaflets.",
      "A small fringed structure at the base of each leaf stalk, which helps separate it from many native roses.",
      "Clusters of white to pinkish flowers in late spring followed by bright red rose hips that persist into winter.",
    ],
    whyItMatters:
      "Multiflora rose creates thickets so dense that they crowd out native plants, block movement, and take over edges, pastures, and young woods. Birds and mammals spread the seeds widely, and the seed bank can last for many years.",
    action: {
      mode: "diy",
      summary:
        "Small plants can be removed, but established thickets usually need repeated cutting, browsing, herbicide follow-up, or a combination of methods over time.",
      steps: [
        "Pull or dig isolated young plants before they fruit if you can remove the root crown.",
        "Cut or mow repeat growth before the patch sets seed, knowing that one pass will not finish the job.",
        "Use an integrated control plan for larger thickets and wear heavy gloves, sleeves, and eye protection when cutting or treating canes.",
      ],
      safetyNotes:
        "Dense thickets hide sharp canes and can snap back while cutting, so face and eye protection matter.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/multiflora-rose",
      },
      {
        label: "Penn State Extension",
        url: "https://extension.psu.edu/multiflora-rose-control-in-pastures/",
      },
    ],
  },
  {
    id: "lonicera-japonica",
    slug: "lonicera-japonica",
    commonName: "Japanese Honeysuckle",
    scientificName: "Lonicera japonica",
    category: "plants",
    profileType: "curated",
    displayGroup: "Other plants",
    summary:
      "A vigorous invasive vine that climbs, trails, and forms thick tangles over shrubs, young trees, fences, and field edges.",
    origin: "Native to Asia and introduced to the United States as an ornamental and for erosion control.",
    whatToLookFor: [
      "Opposite oval leaves on twining woody vines, with upper leaves separate rather than fused around the stem.",
      "Fragrant white flowers that turn yellow with age, followed by dark berries spread by birds.",
      "Dense evergreen or semi-evergreen mats that smother shrubs and wrap tightly around small trees.",
    ],
    whyItMatters:
      "Japanese honeysuckle grows fast, shades out native ground plants, and can pull down or girdle young shrubs and trees. Because it stays green late into the season, it keeps competing even after many native plants have gone dormant.",
    action: {
      mode: "diy",
      summary:
        "Cut vines to release trees and shrubs, then follow up on the regrowth. Large infestations usually come back if you only cut them once.",
      steps: [
        "Cut climbing vines near the base to stop them from continuing to feed the stems that are already in the canopy.",
        "Pull or dig small patches when the soil is workable and you can remove as much root material as possible.",
        "For bigger patches, plan for repeated mowing, cutting, or labeled herbicide follow-up during the periods extension or land managers recommend.",
      ],
      safetyNotes:
        "Do not pull vines out of tree canopies from above head height, because falling stems can bring down dead branches or create trip hazards.",
    },
    source: [
      {
        label: "National Park Service",
        url: "https://www.nps.gov/cuva/learn/nature/japanese-honeysuckle.htm",
      },
    ],
  },
  {
    id: "bromus-tectorum",
    slug: "bromus-tectorum",
    commonName: "Cheatgrass",
    scientificName: "Bromus tectorum",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "An invasive annual grass that dries early, spreads aggressively in disturbed places, and fuels more frequent and intense wildfire across western landscapes.",
    origin: "Native to Eurasia and accidentally introduced to the United States in the 1800s, likely as a contaminant in grain and other materials.",
    whatToLookFor: [
      "Soft, hairy leaves and drooping seed heads that turn from green to purplish to straw-colored as the season advances.",
      "Dense stands that green up early, set seed quickly, then become dry and brittle by summer.",
      "Barbed seeds that stick to socks, bootlaces, fur, and clothing after walking through infested ground.",
    ],
    whyItMatters:
      "Cheatgrass changes the fire cycle by creating a broad layer of flashy fine fuel that burns readily and then comes back fast after fire. That pattern can push out native grasses, sagebrush, and wildflowers and reduce habitat quality over huge areas.",
    action: {
      mode: "both",
      summary:
        "Prevent spread first. Small patches can be tackled locally, but landscape-scale cheatgrass usually needs coordinated long-term management.",
      steps: [
        "Brush seeds off boots, socks, pet fur, tires, and gear before leaving an infested site.",
        "Bag and remove small patches before they set seed if you can do it without spreading seeds further.",
        "Report new infestations on public land or in high-value native habitat to the land manager, weed district, or extension contact for your area.",
      ],
      safetyNotes:
        "Avoid working in dry dense cheatgrass during high fire danger, because the dead plants ignite easily and the sharp seeds are hard on skin and pets.",
    },
    source: [
      {
        label: "National Park Service",
        url: "https://www.nps.gov/articles/000/cheatgrass.htm",
      },
    ],
  },
  {
    id: "convolvulus-arvensis",
    slug: "convolvulus-arvensis",
    commonName: "Field Bindweed",
    scientificName: "Convolvulus arvensis",
    category: "plants",
    profileType: "curated",
    displayGroup: "Other plants",
    summary:
      "A persistent invasive perennial vine that creeps, climbs, and re-sprouts from deep roots and rhizomes.",
    origin: "Native to Europe and Asia and introduced to North America as a long-standing agricultural and roadside weed.",
    whatToLookFor: [
      "Slender twining stems that trail across the ground or wrap around crops, shrubs, fences, and stems.",
      "Arrowhead-shaped leaves with rounded tips and small backward-pointing lobes near the base.",
      "Small white to pink funnel-shaped flowers followed by seed capsules, often mixed with a mat of older re-sprouting vines.",
    ],
    whyItMatters:
      "Field bindweed competes hard for water and nutrients, tangles around other plants, and is notoriously difficult to eliminate because roots and rhizomes store energy deep below ground. Disturbing it can easily turn one patch into many more shoots.",
    action: {
      mode: "diy",
      summary:
        "Repeated suppression works better than one big effort. Cutting or digging once almost never finishes the infestation because the root system can keep feeding new growth.",
      steps: [
        "Pull or cut the vines repeatedly to exhaust the root system before seed production.",
        "Do not till an infested patch unless you are prepared for follow-up, because root fragments can help it spread.",
        "Use a labeled systemic herbicide only when you can treat active regrowth correctly and keep the application off nearby desirable plants.",
      ],
      safetyNotes:
        "Hand pulling helps on small patches, but expect regrowth and avoid wrapping vines around your own plantings while removing them.",
    },
    source: [
      {
        label: "Penn State Extension",
        url: "https://extension.psu.edu/the-noxious-persistent-invasive-and-perennial-bindweeds",
      },
    ],
  },
  {
    id: "alliaria-petiolata",
    slug: "alliaria-petiolata",
    commonName: "Garlic Mustard",
    scientificName: "Alliaria petiolata",
    category: "plants",
    profileType: "curated",
    displayGroup: "Other plants",
    summary:
      "A shade-tolerant invasive biennial that spreads through woodlands and floodplains, crowding out native spring wildflowers and understory plants.",
    origin: "Introduced from Europe in the 1800s for food and medicinal use before escaping into forests and disturbed ground.",
    whatToLookFor: [
      "First-year rosettes with rounded to kidney-shaped leaves that stay green through winter.",
      "Second-year stems with heart-shaped toothed leaves and small white four-petaled flowers.",
      "A distinct garlic smell when leaves or stems are crushed.",
    ],
    whyItMatters:
      "Garlic mustard can dominate the forest floor, crowd out native herbs, and alter soil processes in ways that make recovery harder for native plants. Because deer often avoid it while browsing native plants, infestations can expand quickly once they take hold.",
    action: {
      mode: "both",
      summary:
        "Small infestations are very manageable if you act before seed drop. Larger woodland infestations need repeated follow-up and sometimes coordinated treatment.",
      steps: [
        "Pull plants before the seed pods mature, making sure to remove the root crown so the plant does not keep growing.",
        "If plants have already flowered or started setting seed, bag and remove them instead of leaving them on site.",
        "Report large infestations in parks, preserves, or naturalized areas and use local invasive plant guidance for follow-up control.",
      ],
      safetyNotes:
        "Hand pulling is easiest when the soil is moist, but do not leave seed-bearing stems on the ground where seeds can still mature.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/garlic-mustard",
      },
      {
        label: "National Park Service",
        url: "https://www.nps.gov/cuva/learn/nature/garlic-mustard.htm",
      },
    ],
  },
  {
    id: "lythrum-salicaria",
    slug: "lythrum-salicaria",
    commonName: "Purple Loosestrife",
    scientificName: "Lythrum salicaria",
    category: "plants",
    profileType: "curated",
    displayGroup: "Aquatic plants",
    summary:
      "A striking but harmful wetland invader that forms dense stands along ponds, marshes, ditches, and stream edges.",
    origin: "Introduced from Europe and Asia in the 1800s, both accidentally and as an ornamental and medicinal plant.",
    whatToLookFor: [
      "Tall stems topped with showy magenta flower spikes in mid to late summer.",
      "Opposite or whorled leaves on square stems, often without noticeable leaf stalks.",
      "Large clumps with many stems rooted in wet soils, ditches, pond edges, or floodplain ground.",
    ],
    whyItMatters:
      "Purple loosestrife can take over wetlands, reduce plant diversity, and replace habitat structure that waterfowl, amphibians, insects, and other wetland species depend on. It spreads both by huge numbers of seeds and by vegetative growth from the rootstock.",
    action: {
      mode: "both",
      summary:
        "Act early on small patches and report bigger wetland infestations. Wet sites make careless pulling or herbicide use easy to get wrong.",
      steps: [
        "Hand-pull small new infestations before seeds develop and remove as much root material as possible.",
        "Bag flowering or seed-bearing plants so seeds do not spread during transport or disposal.",
        "Report large or expanding wetland patches to the local invasive species, park, or natural resource program before attempting a bigger treatment.",
      ],
      safetyNotes:
        "Use extra caution near wetlands and flowing water, where soil disturbance and herbicide mistakes can damage non-target plants and habitat.",
    },
    source: [
      {
        label: "National Park Service",
        url: "https://www.nps.gov/cuva/learn/nature/purple-loosestrife.htm",
      },
      {
        label: "USFWS Media Description",
        url: "https://www.fws.gov/media/purple-loosestrife",
      },
    ],
  },
  {
    id: "dreissena-polymorpha",
    slug: "dreissena-polymorpha",
    commonName: "Zebra Mussel",
    scientificName: "Dreissena polymorpha",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Mollusks",
    summary:
      "A small invasive freshwater mussel that clings to hard surfaces, clogs water infrastructure, and damages native aquatic communities.",
    origin: "Native to Eurasia and introduced into the Great Lakes in ballast water before spreading through connected waters and trailered boats.",
    whatToLookFor: [
      "Small D-shaped shells, often striped, attached in clusters to rocks, docks, boats, buoys, and native mussels.",
      "Hard encrusting growth on submerged equipment and water intake structures.",
      "Sharp shells washed up along shorelines and cut edges around infested docks, beaches, or ramps.",
    ],
    whyItMatters:
      "Zebra mussels filter huge amounts of plankton from the water, disrupt food webs, smother native mussels, and cost water systems and other facilities large sums to keep pipes and intakes clear.",
    action: {
      mode: "report",
      summary:
        "Treat any suspected new find as a spread-prevention problem first. Boats, trailers, anchors, and bait gear are the main things to clean before moving to another waterbody.",
      steps: [
        "Clean, drain, and dry boats, trailers, anchors, live wells, and gear every time you leave the water.",
        "Do not move water, plants, or attached mussels from one lake or river to another.",
        "If you suspect a new infestation, photograph the mussels, note the exact waterbody and access point, and report it to the relevant invasive species program.",
      ],
      contactName: "State aquatic invasive species program",
      contactUrl: "https://extension.umn.edu/identify-invasive-species/zebra-mussel",
      contactInstructions:
        "The UMN page links to reporting guidance and reinforces the core Clean, Drain, Dry approach that many state programs use.",
    },
    source: [
      {
        label: "U.S. Geological Survey",
        url: "https://www.usgs.gov/faqs/what-are-zebra-mussels-and-why-should-we-care-about-them",
      },
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/zebra-mussel",
      },
    ],
  },
  {
    id: "cyprinus-carpio",
    slug: "cyprinus-carpio",
    commonName: "Common Carp",
    scientificName: "Cyprinus carpio",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Fish",
    summary:
      "A widespread invasive fish that uproots plants, muddies shallow water, and degrades habitat for native fish and waterfowl.",
    origin: "Native to Eurasia and intentionally introduced for food and stocking before spreading widely through North American waters.",
    whatToLookFor: [
      "Large brown to golden fish with a long dorsal fin and two pairs of barbels at the mouth.",
      "Cloudy or muddy water in shallow areas where fish are actively rooting and feeding.",
      "Shallow vegetated backwaters or ponds where aquatic plants have been uprooted and habitat quality has declined.",
    ],
    whyItMatters:
      "Common carp stir up bottom sediments while feeding, which increases turbidity, releases nutrients, and reduces rooted aquatic vegetation. That combination degrades habitat used by native fish, amphibians, and waterfowl and can push already stressed waters even further out of balance.",
    action: {
      mode: "both",
      summary:
        "Do not move or release carp into public waters, and report problem populations where local managers are trying to protect shallow lakes, marshes, or restoration sites.",
      steps: [
        "Never release live carp into a lake, pond, wetland, or stream.",
        "If you catch common carp where regulations require harvest or restrict transport, follow those rules exactly.",
        "Report heavy carp activity or habitat damage in managed lakes, marshes, or restoration areas to the local fish or invasive species program.",
      ],
      contactName: "State fisheries or invasive species program",
      contactUrl: "https://extension.umn.edu/identify-invasive-species/common-carp",
      contactInstructions:
        "Use the UMN guide for basic identification and the USGS profile for ecology and impact context when reporting or discussing the fish.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/common-carp",
      },
      {
        label: "U.S. Geological Survey NAS",
        url: "https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=4",
      },
    ],
  },
  {
    id: "cronartium-ribicola",
    slug: "cronartium-ribicola",
    commonName: "White-pine Blister Rust",
    scientificName: "Cronartium ribicola",
    category: "fungi-diseases",
    profileType: "curated",
    displayGroup: "Fungi & pathogens",
    summary:
      "An invasive rust disease that cycles between five-needle pines and currants or gooseberries, killing branches, tree tops, and sometimes entire young pines.",
    origin:
      "Introduced to North America on infected nursery stock and now spread through the alternating host cycle between white pines and Ribes plants such as currants and gooseberries.",
    whatToLookFor: [
      "Flagged branches on white pine where all the needles turn yellow, then rusty red, while the rest of the tree still looks green.",
      "Swollen or cracked cankers on branches or trunks that ooze sticky pale sap and later develop pale blisters or orange spore masses.",
      "Angular yellow leaf spots on currant or gooseberry leaves, often with orange pustules or hair-like structures on the underside later in the season.",
    ],
    whyItMatters:
      "White-pine blister rust can kill branches year by year until it reaches the main stem, where young trees may die outright and older trees can lose major canopy structure. It also complicates planting decisions where five-needle pines and susceptible Ribes plants grow close together.",
    action: {
      mode: "both",
      summary:
        "Catch infections early on pines, prune branch cankers before they reach the trunk, and avoid creating landscapes where susceptible white pines and Ribes hosts keep reinfecting each other.",
      steps: [
        "Inspect white pines yearly for flagged branches, resinous cankers, and blister-like spore structures, especially in cool and moist sites.",
        "Prune infected branches at the branch union or well back from visible symptoms if the canker has not reached the trunk.",
        "If the disease is on the main stem or affecting multiple trees, get local extension or arborist guidance and avoid planting susceptible currants or gooseberries next to white pines.",
      ],
      safetyNotes:
        "Large white pines and trunk cankers are not good do-it-yourself jobs. Use a qualified arborist when climbing, major pruning, or removal is involved.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/plant-diseases/white-pine-blister-rust",
      },
    ],
  },
  {
    id: "cyperus-esculentus",
    slug: "cyperus-esculentus",
    commonName: "Yellow Nutsedge",
    scientificName: "Cyperus esculentus",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A persistent sedge that grows faster than turf, survives mowing, and keeps coming back from underground tubers in lawns, beds, and disturbed moist soil.",
    origin:
      "Yellow nutsedge has a complicated native-versus-introduced history, but in managed landscapes it spreads mainly through moved soil, rhizomes, and underground tubers rather than by seed.",
    whatToLookFor: [
      "Bright yellow-green shoots that stand above the surrounding lawn or groundcover and often appear slick or waxy.",
      "Solid triangular stems that you can feel if you roll them between your fingers.",
      "Umbrella-like seedheads and underground nutlets or tubers at the tips of wiry rhizomes.",
    ],
    whyItMatters:
      "Yellow nutsedge competes hard in turf and planting beds because it tolerates mowing and stores energy in tubers below the soil. Pulling the top growth alone usually fails, so patches can keep expanding if moisture and disturbance stay favorable.",
    action: {
      mode: "diy",
      summary:
        "Fix the site conditions first, then expect repeat control. Yellow nutsedge is rarely solved in one pass because the underground tubers can keep sending up new shoots.",
      steps: [
        "Reduce chronic overwatering or drainage problems where possible, because wet compacted sites favor nutsedge.",
        "Pull small plants early if you can remove the tubers, but do not assume snapped stems or shallow weeding solved the patch.",
        "For larger turf or landscape infestations, use a labeled nutsedge treatment and expect repeat applications over more than one season.",
      ],
      safetyNotes:
        "Always match herbicide use to the site and follow the product label. Nutsedge products for turf are not automatically safe for gardens, pondsides, or edible plantings.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://apps.extension.umn.edu/garden/diagnose/weed/idlist.html",
      },
      {
        label: "Michigan State University Extension",
        url: "https://www.canr.msu.edu/news/controlling_yellow_nutsedge_in_turfgrass",
      },
    ],
  },
  {
    id: "elaeagnus-umbellata",
    slug: "elaeagnus-umbellata",
    commonName: "Autumn Olive",
    scientificName: "Elaeagnus umbellata",
    category: "plants",
    profileType: "curated",
    displayGroup: "Trees & shrubs",
    summary:
      "A fast-growing invasive shrub or small tree that spreads across field edges, roadsides, and open woods, often turning mixed habitat into dense thickets.",
    origin:
      "Native to East Asia and widely planted in the United States for wildlife cover, ornament, windbreaks, and reclamation before escaping into natural areas.",
    whatToLookFor: [
      "Shrubs or small trees with silvery undersides on the leaves and silvery to golden speckles on stems and fruit.",
      "Fragrant pale yellow tubular flowers in the leaf axils, followed by abundant red fruits with silver flecking.",
      "Thorny branches and spreading patches along old fields, roadsides, forest edges, and sunny disturbed ground.",
    ],
    whyItMatters:
      "Autumn olive fixes nitrogen, which changes soil chemistry in a way that can favor more invasive growth and disrupt native plant communities adapted to leaner soils. It also produces heavy fruit crops that birds and mammals spread widely.",
    action: {
      mode: "both",
      summary:
        "Small plants are manageable, but established shrubs resprout hard after cutting. Treat it like a repeat woody invasive project, not a one-time trimming job.",
      steps: [
        "Pull seedlings and small saplings when the soil allows you to remove the root crown cleanly.",
        "For larger shrubs, use a cut stump or basal bark method with a labeled woody plant herbicide, or hire a professional who handles invasive shrub control.",
        "Bag or remove fruiting branches when practical and revisit the site for sprouts and new seedlings over the next few seasons.",
      ],
      safetyNotes:
        "Do not simply shear or mow mature autumn olive and walk away. That usually leads to vigorous resprouting and a harder cleanup later.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/autumn-olive",
      },
      {
        label: "University of Minnesota Extension Woody Vegetation Control",
        url: "https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control",
      },
    ],
  },
  {
    id: "morus-alba",
    slug: "morus-alba",
    commonName: "White Mulberry",
    scientificName: "Morus alba",
    category: "plants",
    profileType: "curated",
    displayGroup: "Trees & shrubs",
    summary:
      "A widely planted mulberry that escaped cultivation and now spreads through fencerows, vacant lots, stream corridors, and disturbed woods.",
    origin:
      "Native to East Asia and brought to North America for silk production, shade, and fruit before naturalizing across much of the country.",
    whatToLookFor: [
      "Glossy leaves that vary wildly on the same tree, with some unlobed and others mitten-shaped or deeply lobed.",
      "Milky sap from cut leaves or twigs, along with smooth orange-brown twigs that later age into gray ridged bark.",
      "Sweet elongated fruits that ripen from pale to pink, red, or dark purple and attract heavy bird use.",
    ],
    whyItMatters:
      "White mulberry can outcompete native mulberries in disturbed habitats, but the bigger long-term concern is that it hybridizes with native red mulberry. That makes careless planting and spread a conservation problem, not just a yard nuisance.",
    action: {
      mode: "both",
      summary:
        "Verify the identification carefully before removing a mulberry, then control seedlings and unwanted trees before they start seeding heavily into nearby habitat.",
      steps: [
        "Confirm you are not looking at native red mulberry, especially where native populations are still present or being restored.",
        "Pull or dig out small volunteer seedlings and saplings before they become fruiting trees.",
        "For larger unwanted trees, use a cut stump treatment or hire a professional, then watch the area for bird-dispersed seedlings.",
      ],
      safetyNotes:
        "Do not rely on fruit color alone for identification. Leaf texture, twig traits, and the local presence of red mulberry matter.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/white-mulberry",
      },
      {
        label: "University of Minnesota Extension Woody Vegetation Control",
        url: "https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control",
      },
    ],
  },
  {
    id: "frangula-alnus",
    slug: "frangula-alnus",
    commonName: "Glossy Buckthorn",
    scientificName: "Frangula alnus",
    category: "plants",
    profileType: "curated",
    displayGroup: "Trees & shrubs",
    summary:
      "A shade-casting invasive shrub or small tree that fills wetlands, forests, and old fields with dense understory growth.",
    origin:
      "Native to Europe, Asia, and North Africa and introduced as an ornamental before spreading into wetlands, woods, and disturbed sites.",
    whatToLookFor: [
      "Smooth oval leaves with a glossy surface, untoothed margins, and a habit of staying green late into fall.",
      "Multiple stems with brown bark marked by pale elongated corky flecks.",
      "Berries that ripen from red to dark purple or black along the stems, often in the leaf axils.",
    ],
    whyItMatters:
      "Glossy buckthorn leafs out early and hangs onto its leaves late, which helps it build dense shade that crowds out native understory plants. Once established, it can replace the layered habitat structure that birds, amphibians, and forest wildflowers depend on.",
    action: {
      mode: "both",
      summary:
        "Act early on seedlings and small shrubs, then plan for follow-up on larger patches. Mature buckthorn usually resprouts unless the root system or stump is treated correctly.",
      steps: [
        "Pull or dig small plants when the soil is workable and the full root crown can come out.",
        "For established shrubs, use a labeled cut stump or basal bark treatment, or work with a contractor who already manages woody invasives.",
        "Return for several years to catch new seedlings and stump sprouts before the site closes over again.",
      ],
      safetyNotes:
        "Fruit-bearing branches can spread seed during transport. If you cut reproductive stems, dispose of them in a way that does not spread berries to new sites.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/glossy-buckthorn",
      },
      {
        label: "University of Minnesota Extension Woody Vegetation Control",
        url: "https://extension.umn.edu/planting-and-growing-guides/woody-vegetation-control",
      },
    ],
  },
  {
    id: "imperata-cylindrica",
    slug: "imperata-cylindrica",
    commonName: "Cogongrass",
    scientificName: "Imperata cylindrica",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A highly aggressive invasive grass that forms dense stands, spreads by rhizomes and windblown seed, and can take over roadsides, forests, and southern natural areas.",
    origin:
      "Native to tropical and subtropical parts of the eastern hemisphere and introduced into the southern United States both accidentally and on purpose for forage and erosion control.",
    whatToLookFor: [
      "Dense patches of upright grass with an off-center white midrib that sits closer to one leaf edge than the other.",
      "Fluffy white or silvery seedheads in spring and after disturbance, giving the patch a feathery look.",
      "Extensive underground rhizome mats that let the grass rebound after mowing, burning, or soil disturbance.",
    ],
    whyItMatters:
      "Cogongrass chokes out native vegetation, spreads quickly along disturbed corridors, and is notorious for coming back from rhizomes after surface growth is knocked down. In fire-prone landscapes it can also change fuel structure and make control more difficult over time.",
    action: {
      mode: "report",
      summary:
        "Do not treat cogongrass like ordinary roadside grass. New patches should be documented and reported because moving soil, mowing, or half-done treatment can spread it farther.",
      steps: [
        "Photograph the patch, including leaves and seedheads, and note the exact location before disturbing it.",
        "Avoid moving soil, mowers, or equipment through the patch unless they can be cleaned before going elsewhere.",
        "Report suspected cogongrass to the relevant agriculture, extension, or invasive species program and expect repeated professional or coordinated treatment if the patch is confirmed.",
      ],
      safetyNotes:
        "Mowing or burning alone will not eliminate cogongrass. Those methods can actually open the stand and trigger new growth from rhizomes.",
    },
    source: [
      {
        label: "National Invasive Species Information Center",
        url: "https://www.invasivespeciesinfo.gov/terrestrial/plants/cogongrass",
      },
      {
        label: "Mississippi State University Extension Service",
        url: "https://extension.msstate.edu/publications/cogongrass",
      },
    ],
  },
  {
    id: "tamarix-ramosissima",
    slug: "tamarix-ramosissima",
    commonName: "Saltcedar",
    scientificName: "Tamarix ramosissima",
    category: "plants",
    profileType: "curated",
    displayGroup: "Trees & shrubs",
    summary:
      "A thirsty riparian invader that forms dense stands along western rivers and washes, crowding out native vegetation and altering streamside habitat.",
    origin:
      "Introduced from Eurasia in the 1800s for ornament, windbreaks, and erosion control before spreading through western river corridors.",
    whatToLookFor: [
      "Feathery blue-green to gray-green branchlets with tiny scale-like leaves and rough bark on older stems.",
      "Pink to whitish flower spikes on shrubs or small trees growing in riparian corridors, washes, and floodplains.",
      "Dense thickets along waterways where native cottonwoods, willows, and other streamside plants have been pushed back.",
    ],
    whyItMatters:
      "Saltcedar can lower water tables, increase soil salinity, trap sediment, and create dense shade that suppresses native riparian seedlings. It also changes fire behavior and can complicate habitat management where sensitive wildlife are already under pressure.",
    action: {
      mode: "report",
      summary:
        "Small seedlings can sometimes be removed, but mature saltcedar along rivers should usually be handled as coordinated restoration work rather than casual cutting by individual visitors or neighbors.",
      steps: [
        "Document the location and extent of the patch, especially if it is along a river, wash, irrigation corridor, or protected natural area.",
        "Do not assume cutting alone solves the problem, because mature plants often resprout unless roots or stumps are treated correctly.",
        "Contact the land manager, invasive species program, or local restoration group before treatment, since some sites also have wildlife habitat considerations that affect timing and methods.",
      ],
      safetyNotes:
        "Riparian restoration can be sensitive. Some areas now have nesting or other wildlife considerations that make the right timing and method important.",
    },
    source: [
      {
        label: "National Invasive Species Information Center",
        url: "https://www.invasivespeciesinfo.gov/terrestrial/plants/saltcedar",
      },
      {
        label: "National Park Service",
        url: "https://www.nps.gov/sagu/learn/nature/tamarisk.htm",
      },
    ],
  },
  {
    id: "sturnus-vulgaris",
    slug: "sturnus-vulgaris",
    commonName: "European Starling",
    scientificName: "Sturnus vulgaris",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Birds",
    summary:
      "A widespread invasive bird that forms large noisy flocks, damages crops and feedlots, fouls structures, and competes with native cavity-nesting birds.",
    origin:
      "Introduced from Europe in the 1890s and now spread across nearly all of North America through its ability to thrive around farms, towns, and disturbed habitat.",
    whatToLookFor: [
      "Medium-sized dark birds with short tails, pointed yellow bills in breeding season, and a glossy or speckled look depending on season.",
      "Large flocks feeding in fields, feedlots, fruit plantings, or roosting in dense trees and urban structures.",
      "Aggressive use of nest cavities where bluebirds, woodpeckers, flickers, or purple martins would otherwise breed.",
    ],
    whyItMatters:
      "European starlings are not just noisy backyard birds. Large flocks foul buildings, contaminate feed, increase agricultural losses, and push native cavity nesters out of limited nesting sites. In some settings they also create serious health and aviation hazards.",
    action: {
      mode: "both",
      summary:
        "Do not feed or shelter them unintentionally, use exclusion first around buildings and nest boxes, and contact wildlife specialists if a large roost or livestock conflict is developing.",
      steps: [
        "Seal openings, repair vents, and use starling-resistant nest box or building exclusion methods before birds settle in.",
        "Reduce easy access to livestock feed, pooled water, and other concentrated food sources that keep flocks on site.",
        "If a large roost or farm problem is building, contact USDA Wildlife Services or your state wildlife agency for legal and technical guidance.",
      ],
      contactName: "USDA Wildlife Services",
      contactUrl: "https://www.aphis.usda.gov/operational-wildlife-activities/starlings-blackbirds",
      contactInstructions:
        "APHIS explains exclusion, harassment, trapping, and legal context for managing damaging starling flocks and roosts.",
    },
    source: [
      {
        label: "USDA APHIS",
        url: "https://www.aphis.usda.gov/operational-wildlife-activities/starlings-blackbirds",
      },
      {
        label: "National Invasive Species Information Center",
        url: "https://www.invasivespeciesinfo.gov/terrestrial/vertebrates/european-starling",
      },
    ],
  },
  {
    id: "corbicula-fluminea",
    slug: "corbicula-fluminea",
    commonName: "Asiatic Clam",
    scientificName: "Corbicula fluminea",
    category: "wildlife",
    profileType: "curated",
    displayGroup: "Mollusks",
    summary:
      "A small invasive clam that forms dense colonies in lakes and rivers, competes in benthic habitats, and clogs pipes and industrial water systems.",
    origin:
      "Native to parts of Asia, Africa, and Australia, first found in the United States in 1938 and then spread widely through freshwater systems.",
    whatToLookFor: [
      "Small rounded triangular clams with strong concentric ridges on the shell, often light tan to yellow-brown.",
      "Large numbers of shells or live clams in shallow water, sandy margins, intake areas, or along receding shorelines.",
      "Reports of fouled pipes, irrigation systems, or industrial water infrastructure in infested waters.",
    ],
    whyItMatters:
      "Asiatic clams reproduce in dense colonies and can dominate bottom habitat, changing local food webs and displacing other aquatic life. They are also a serious infrastructure pest because their shells and juveniles clog water intake systems, pipes, and firefighting equipment.",
    action: {
      mode: "report",
      summary:
        "Prevent spread first. Do not move water, sediment, or gear between waterbodies without cleaning it, and treat suspected new infestations as an aquatic invasive species report.",
      steps: [
        "Clean, drain, and dry boats, anchors, pumps, waders, buckets, and other gear after leaving the water.",
        "Do not move live clams, shell material, bait water, or sediment from one waterbody to another.",
        "Photograph the clams and report suspected new infestations to the local aquatic invasive species or natural resource program.",
      ],
      contactName: "State aquatic invasive species program",
      contactUrl: "https://www.invasivespeciesinfo.gov/aquatic/invertebrates/asian-clam",
      contactInstructions:
        "Use the NISIC overview for public-facing background and your local aquatic invasive species contacts for actual reporting channels.",
    },
    source: [
      {
        label: "National Invasive Species Information Center",
        url: "https://www.invasivespeciesinfo.gov/aquatic/invertebrates/asian-clam",
      },
      {
        label: "U.S. Geological Survey NAS",
        url: "https://nas.er.usgs.gov/queries/factsheet.aspx?speciesid=92",
      },
    ],
  },
  {
    id: "pastinaca-sativa",
    slug: "pastinaca-sativa",
    commonName: "Wild Parsnip",
    scientificName: "Pastinaca sativa",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A tall invasive biennial with yellow flower umbels and sap that can cause severe blistering burns when skin is exposed to sunlight.",
    origin:
      "Descended from the cultivated parsnip brought from Europe and now widespread along roadsides, fields, trail edges, and other disturbed ground.",
    whatToLookFor: [
      "Rosettes in the first year and tall flowering stalks in the second year, often reaching several feet high.",
      "Flat-topped clusters of many small yellow flowers rather than the white flowers seen on many look-alikes.",
      "Yellow-green grooved stems and pinnate leaves with broad toothed leaflets.",
    ],
    whyItMatters:
      "Wild parsnip crowds into open habitat, roadsides, and rights-of-way, but the immediate concern for most people is safety. Its sap can trigger painful phototoxic burns and blistering when it touches skin and then gets sunlight.",
    action: {
      mode: "both",
      summary:
        "Treat wild parsnip as both a safety hazard and an invasive plant problem. Small patches can be managed, but skin protection and timing are not optional.",
      steps: [
        "Keep bare skin away from the sap by using gloves, long sleeves, eye protection, and immediate washing if contact occurs.",
        "Pull or cut small plants before seeds ripen, but only when you can avoid sap exposure and safely bag or dispose of seed-bearing material.",
        "Report larger roadside, park, or natural area infestations so they can be handled before they spread into more public-facing sites.",
      ],
      safetyNotes:
        "If sap contacts skin, wash the area promptly and keep it out of sunlight. Severe blistering or eye exposure warrants medical attention.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/wild-parsnip",
      },
    ],
  },
  {
    id: "conium-maculatum",
    slug: "conium-maculatum",
    commonName: "Poison Hemlock",
    scientificName: "Conium maculatum",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A highly toxic invasive biennial whose stems, leaves, roots, and seeds can poison people and livestock if ingested.",
    origin:
      "Native to Europe and North Africa and now spread along ditches, railways, rivers, farm edges, and other sunny disturbed sites in North America.",
    whatToLookFor: [
      "Smooth hollow green stems marked with purple blotches or streaking.",
      "Large fern-like lacy leaves on a tall plant that can reach well above head height.",
      "Umbrella-shaped clusters of small white flowers, with a deadly carrot-like root below.",
    ],
    whyItMatters:
      "Poison hemlock is one of the more dangerous invasive plants a homeowner can encounter. It spreads by seed, invades disturbed ground, and poses a real poisoning risk to people, pets, and livestock if it is misidentified or handled carelessly.",
    action: {
      mode: "report",
      summary:
        "Identification and safety come first. If you suspect poison hemlock, document it carefully and lean toward professional help rather than casual hand removal.",
      steps: [
        "Keep children, pets, and livestock away from the patch until the plant is confirmed and a control plan is in place.",
        "Photograph the stem, leaves, and flowers, then report the plant through the local invasive plant or agriculture channel if your state tracks it.",
        "If the patch is on your property, use professional help or full protective gear and follow-up monitoring rather than treating it as an ordinary weed.",
      ],
      safetyNotes:
        "Do not eat, burn, weed-whack, or casually handle poison hemlock. All parts are highly toxic, and the sap and plant fragments should be treated with care.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/poison-hemlock",
      },
    ],
  },
  {
    id: "centaurea-stoebe",
    slug: "centaurea-stoebe",
    commonName: "Spotted Knapweed",
    scientificName: "Centaurea stoebe",
    category: "plants",
    profileType: "curated",
    displayGroup: "Grasses & herbs",
    summary:
      "A long-lived invasive forb that colonizes dry disturbed ground, spreads into prairies and open woods, and builds seedbanks that keep a site infested for years.",
    origin:
      "Introduced from Europe and now spread through hay, vehicles, livestock movement, roadside disturbance, and other open corridors.",
    whatToLookFor: [
      "Rosettes of rough bluish-green leaves low to the ground before the plant bolts.",
      "Branched wiry stems with pink to purple flower heads and dark bracts marked with a spotted V-shaped pattern.",
      "Dry roadsides, gravel pits, railroad edges, field margins, or open grasslands where it forms scattered to dense colonies.",
    ],
    whyItMatters:
      "Spotted knapweed can reduce plant diversity, degrade forage, and hold ground for years because one plant can produce many seeds that persist in the soil. Once it gets into prairies and open natural areas, it can be costly to reverse.",
    action: {
      mode: "both",
      summary:
        "Small patches are worth tackling early, but do not wait for a large seedbank to build. Bigger infestations usually need repeated follow-up and sometimes coordinated treatment.",
      steps: [
        "Hand-pull or dig small plants before seeds mature, especially when the soil is moist enough to remove the taproot.",
        "Bag flowering or seeding stems so they do not keep maturing after you cut or pull them.",
        "Report larger infestations in prairies, natural areas, rights-of-way, or restoration sites and expect follow-up for several years.",
      ],
      safetyNotes:
        "Some people develop skin irritation when handling spotted knapweed, so wear gloves and long sleeves during control work.",
    },
    source: [
      {
        label: "University of Minnesota Extension",
        url: "https://extension.umn.edu/identify-invasive-species/spotted-knapweed",
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
