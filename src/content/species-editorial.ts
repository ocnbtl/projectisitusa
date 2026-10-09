/** Display-only editorial notes; source taxonomy, determinations and occurrence data are unchanged. */
export interface SpeciesEditorial { summary: string; reviewedAt: string; sources: { label: string; url: string }[] }
import batchOneCompletion from "./editorial-batch-01-completion.json";
export const SPECIES_EDITORIAL: Record<string, SpeciesEditorial> = {
  ...batchOneCompletion,
  "artemisia-absinthium": {
    "summary": "Wormwood’s finely divided, silvery leaves and strong scent make it distinctive. This perennial herb bears small yellow flower heads and can grow into a loose, shrub-like clump.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "South Dakota State University",
        "url": "https://openprairie.sdstate.edu/nativeplant/203/"
      }
    ]
  },
  "launaea-intybacea": {
    "summary": "Despite the name “achicoria azul,” this plant has yellow flowers. Its small flower heads sit on branching stems above toothed leaves; ripe seeds carry white bristles that help them travel.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Kew · Plants of the World Online",
        "url": "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:229022-1/general-information"
      }
    ]
  },
  "convoluta-convoluta": {
    "summary": "A flatworm only about 2–3 millimeters long, found on algae and other shallow-water surfaces. Researchers studied its feeding on newly settled mussels in the Gulf of Maine; those findings describe that study, not every coastline.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Byrnes & Witman · Gulf of Maine study",
        "url": "https://byrneslab.net/pdfs/Byrnes_and_Witman_2003_JEMBE.pdf"
      }
    ]
  },
  "eulachnus-rileyi": {
    "summary": "This slender aphid feeds on pine needles. A dusting of bluish-gray wax can conceal an olive or orange-brown body, so color alone is not enough to distinguish it from other pine aphids.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Iowa State University · BugGuide",
        "url": "https://www.bugguide.net/node/view/484519"
      }
    ]
  },
  "kilifia-acuminata": {
    "summary": "A soft scale insect associated with mango and other host plants. It belongs to the group of sap-feeding insects that can be overlooked on foliage; a close examination is needed to separate it from other mango scales.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "University of Florida · Mango pests",
        "url": "https://ask.ifas.ufl.edu/publication/IG073"
      }
    ]
  },
  "pineus-boerneri": {
    "summary": "Small reddish-brown insects shelter under woolly, gray-white wax on pine twigs. The wax is often easier to notice than the adelgids themselves; related pine adelgids can look very similar.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Blackman & Eastop · Aphids on the World’s Plants",
        "url": "https://aphidsonworldsplants.info.aphidnet.org/d_aphids_P/"
      }
    ]
  },
  "erysimum-cheiri": {
    "summary": "A familiar garden wallflower with clusters of yellow or orange blooms, though cultivated varieties come in other colors. It can grow in rocky crevices and walls where the soil drains freely.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NC State Extension · Wallflower",
        "url": "https://plants.ces.ncsu.edu/plants/erysimum-x-cheiri/"
      }
    ]
  },
  "amaranthus-muricatus": {
    "summary": "A low-growing amaranth with narrow leaves, dense green flower clusters and tiny, wrinkled fruits. Its common name is misleading: this plant originated in South America, not Africa.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Flora of Israel · Botanical description",
        "url": "https://flora.org.il/en/plants/amamur/"
      }
    ]
  },
  "asparagus-asparagoides": {
    "summary": "Also called bridal creeper, this climbing plant has glossy, leaf-like shoots and red berries. Beneath the surface, a thick network of roots and tubers helps it persist; in invaded Australian habitats it can smother low-growing vegetation.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NSW Government · Bridal creeper",
        "url": "https://weeds.dpi.nsw.gov.au/Weed/BridalCreeper"
      }
    ]
  },
  "cynodon-nlemfuensis": {
    "summary": "This star grass spreads along the ground on long runners, forming a dense mat. Unlike common bermudagrass, it lacks underground rhizomes. Its finger-like flower spikes are a useful clue, but closely related grasses need careful comparison.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Tropical Forages · Cynodon",
        "url": "https://tropicalforages.info/text/entities/cynodon_spp.htm"
      }
    ]
  },
  "sarotherodon-melanotheron": {
    "summary": "A tilapia adapted to estuaries and brackish lagoons. In Florida, records also come from canals and drainage ditches. Males shelter developing eggs in their mouths, a distinctive part of this fish’s breeding behavior.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "USGS · Blackchin tilapia",
        "url": "https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=477"
      }
    ]
  },
  "sansevieria-cylindrica": {
    "summary": "Often sold as a cylindrical snake plant, this succulent grows stiff, rounded leaves from a basal rosette. You may also find it named Dracaena angolensis; that name refers to the same plant in the linked botanical reference.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NC State Extension · African spear",
        "url": "https://plants.ces.ncsu.edu/plants/dracaena-angolensis/"
      }
    ]
  },
  "lycium-ferocissimum": {
    "summary": "A woody shrub armed with long thorns, small fleshy leaves and orange-red berries. It can form dense thickets. Photograph its leaves, flowers and branching pattern from a safe distance; the thorns make close handling difficult.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NSW Government · African boxthorn",
        "url": "https://weeds.dpi.nsw.gov.au/Weed/AfricanBoxthorn"
      }
    ]
  },
  "setaria-sphacelata": {
    "summary": "A perennial grass that grows in dense clumps, sometimes reaching two meters. Its long, bristly flower spikes and broad grass blades help narrow an identification, but several other Setaria grasses have a similar outline.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Royal Botanic Gardens Sydney · PlantNET",
        "url": "https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?lvl=sp&name=Setaria~sphacelata&page=nswfl"
      }
    ]
  },
  "xenopus-laevis": {
    "summary": "An aquatic frog with a flattened body, eyes on top of its head and fully webbed hind feet. Three toes on each hind foot carry dark claws. Its front fingers are unwebbed, unlike its broad swimming feet.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "USGS · African clawed frog",
        "url": "https://nas.er.usgs.gov/queries/FactSheet.aspx?SpeciesID=67"
      }
    ]
  },
  "chasmanthe-floribunda": {
    "summary": "Sword-shaped leaves rise beneath tall, branching spikes of orange flowers. This South African plant grows from an underground corm and is easily confused with Crocosmia, so the shape and arrangement of its flowers matter.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "SANBI · PlantZAfrica",
        "url": "https://pza.sanbi.org/chasmanthe-floribunda"
      }
    ]
  },
  "cenchrus-macrourus": {
    "summary": "Tall clumps carry long, narrow flower spikes surrounded by fine bristles. This grass spreads through underground stems as well as seeds; moving soil or discarded garden material can move those stems to new places.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NSW Government · African feather grass",
        "url": "https://weeds.dpi.nsw.gov.au/Weed/AfricanFeatherGrass"
      }
    ]
  },
  "zaprionus-indianus": {
    "summary": "A small brown fruit fly with crisp white stripes edged in black along its head and back. Those stripes help distinguish it from many familiar vinegar flies; close-up photographs are more useful than a distant view.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Virginia Tech · African fig fly",
        "url": "https://virginiafruit.ento.vt.edu/AFF.html"
      }
    ]
  },
  "hemichromis-letourneuxi": {
    "summary": "A small African cichlid found in fresh and brackish water. Its identification has a complicated history: older Florida records often used the name Hemichromis bimaculatus, making the source and scientific name especially important.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "USGS · African jewelfish",
        "url": "https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=457"
      }
    ]
  },
  "hemarthria-altissima": {
    "summary": "Also known as limpograss, this perennial is grown as forage on wet, poorly drained ground in Florida. It keeps growing into cooler parts of the season when many other warm-season pasture grasses slow down.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "University of Florida · Limpograss",
        "url": "https://ask.ifas.ufl.edu/publication/AG330"
      }
    ]
  },
  "strigosella-africana": {
    "summary": "A small annual mustard with pink to violet flowers and long, slender seed pods. Its hairy stems often branch close to the ground. Look for the combination of flowers and pods when comparing it with other roadside mustards.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Intermountain Herbaria · Botanical description",
        "url": "https://intermountainbiota.org/portal/taxa/index.php?taxon=1205"
      }
    ]
  },
  "elaeis-guineensis": {
    "summary": "A large palm with arching fronds and tightly packed bunches of oily fruits. Young trunks retain the bases of old leaves. Native to tropical Africa, it is the species cultivated widely for palm oil.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Kew · Plants of the World Online",
        "url": "https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:666802-1/general-information"
      }
    ]
  },
  "olea-europaea-ssp-cuspidata": {
    "summary": "An evergreen olive with a dense crown and small fruits that turn purple-black. Its leaves are green to yellow-brown underneath, unlike the silvery underside of common cultivated olives. Birds can disperse its seeds.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "NSW Government · African olive",
        "url": "https://weeds.dpi.nsw.gov.au/Weed/AfricanOlive"
      }
    ]
  },
  "lepidium-africanum": {
    "summary": "A pepperwort with tiny flowers and rows of small, flattened seed pods. The lower leaves are often toothed or divided, while leaves higher on the stem become narrower. Mature pods help distinguish it from other pepperweeds.",
    "reviewedAt": "2026-09-28",
    "sources": [
      {
        "label": "Royal Botanic Gardens Sydney · PlantNET",
        "url": "https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?lvl=sp&name=Lepidium~africanum&page=nswfl"
      }
    ]
  }
};
