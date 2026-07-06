import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "iNaturalist Research Grade observations";
const INAT_API_BASE_URL = "https://api.inaturalist.org/v1";
const INAT_ALABAMA_PLACE_ID = 19;
const PAGE_LIMIT = 200;
const MAX_OBSERVATIONS_PER_SPECIES = 2000;
const MAX_PUBLIC_POSITIONAL_ACCURACY_METERS = 10000;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/inaturalist-alabama-research-grade-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

const PILOT_TARGET_SCIENTIFIC_NAMES = [
  "Anolis sagrei",
  "Coccinella septempunctata",
  "Streptopelia decaocto",
  "Aedes albopictus",
  "Eleutherodactylus planirostris",
  "Nezara viridula",
  "Myocastor coypus",
  "Pomacea maculata",
  "Pieris rapae",
  "Pholcus phalangioides",
  "Linepithema humile",
  "Latrodectus geometricus",
  "Metaltella simoni",
  "Aphis nerii",
  "Brachymyrmex patagonicus",
  "Polistes dominula",
  "Sturnus vulgaris",
  "Columba livia",
  "Tenodera sinensis",
  "Passer domesticus",
  "Lonicera maackii",
  "Carduus nutans",
  "Plutella xylostella",
  "Iris pseudacorus",
  "Solanum sisymbriifolium",
  "Ardisia crenata",
  "Ardisia japonica",
  "Vernicia fordii",
  "Odontomachus haematodus",
  "Pseudomyrmex gracilis",
  "Blattella asahinai",
  "Naupactus peregrinus",
  "Cyprinus carpio",
  "Salvinia molesta",
  "Plodia interpunctella",
  "Lucilia cuprina",
  "Eulachnus rileyi",
  "Pyralis farinalis",
  "Galleria mellonella",
  "Eriobotrya japonica",
  "Zeuxine strateumatica",
  "Pheidole obscurithorax",
  "Blattella germanica",
  "Hibiscus mutabilis",
  "Limax maximus",
  "Hydrocotyle sibthorpioides",
  "Calyptocarpus vialis",
  "Mitracarpus hirtus",
  "Houttuynia cordata",
  "Berberis julianae",
  "Euphorbia helioscopia",
  "Ipomoea triloba",
  "Hedychium coronarium",
  "Murdannia nudiflora",
  "Ipomoea indica",
  "Canna indica",
  "Dianthus barbatus",
  "Crotalaria lanceolata",
  "Clerodendrum bungei",
  "Heliotropium amplexicaule",
  "Deparia petersenii",
  "Trifolium resupinatum",
  "Sphagneticola trilobata",
  "Emilia fosbergii",
  "Catharanthus roseus",
  "Eremochloa ophiuroides",
  "Cyrtomium falcatum",
  "Verbena brasiliensis",
  "Cosmos sulphureus",
  "Wahlenbergia marginata",
  "Ranunculus sardous",
  "Ludwigia peruviana",
  "Pteris vittata",
  "Ruellia simplex",
  "Nerium oleander",
  "Mus musculus",
  "Geranium molle",
  "Verbena rigida",
  "Phyllanthus tenellus",
  "Oxalis debilis",
  "Mazus pumilus",
  "Lolium multiflorum",
  "Firmiana simplex",
  "Cyclospermum leptophyllum",
  "Leonotis nepetifolia",
  "Lonicera fragrantissima",
  "Rosa laevigata",
  "Dioscorea bulbifera",
  "Heliotropium indicum",
  "Briza minor",
  "Cosmos bipinnatus",
  "Panicum repens",
  "Cortaderia selloana",
  "Ipomoea quamoclit",
  "Salvinia minima",
  "Buddleja davidii",
  "Fatoua villosa",
  "Rosa bracteata",
  "Cardamine hirsuta",
  "Hypochaeris glabra",
  "Parthenium hysterophorus",
  "Lagerstroemia indica",
  "Senna occidentalis",
  "Macrothelypteris torresiana",
  "Mirabilis jalapa",
  "Solanum viarum",
  "Coptotermes formosanus",
  "Soliva sessilis",
  "Cuphea carthagenensis",
  "Colocasia esculenta",
  "Veronica persica",
  "Ligustrum lucidum",
  "Sesbania punicea",
  "Youngia japonica",
  "Cardiospermum halicacabum",
  "Elaeagnus pungens",
  "Imperata cylindrica",
  "Crotalaria spectabilis",
  "Murdannia keisak",
  "Veronica hederifolia",
  "Dactyloctenium aegyptium",
  "Rubus phoenicolasius",
  "Medicago polymorpha",
  "Geranium dissectum",
  "Melilotus indicus",
  "Hemidactylus turcicus",
  "Lepidium didymum",
  "Vinca major",
  "Cyperus rotundus",
  "Cyperus iria",
  "Solenopsis invicta",
  "Arthraxon hispidus",
  "Hydrilla verticillata",
  "Lygodium japonicum",
  "Dreissena polymorpha",
  "Paspalum urvillei",
  "Phyllanthus urinaria",
  "Euonymus fortunei",
  "Triadica sebifera",
  "Sporobolus indicus",
  "Clematis terniflora",
  "Trifolium incarnatum",
  "Broussonetia papyrifera",
  "Wisteria sinensis",
  "Euonymus alatus",
  "Hypochaeris radicata",
  "Raphanus raphanistrum",
  "Harmonia axyridis",
  "Ligustrum sinense",
  "Trifolium repens",
  "Lonicera japonica",
  "Albizia julibrissin",
  "Nandina domestica",
  "Lamium amplexicaule",
  "Halyomorpha halys",
  "Sherardia arvensis",
  "Corbicula fluminea",
  "Plantago lanceolata",
  "Pueraria montana",
  "Lamium purpureum",
  "Persicaria longiseta",
  "Megacopta cribraria",
  "Trifolium campestre",
  "Perilla frutescens",
  "Lespedeza cuneata",
  "Verbascum thapsus",
  "Vicia sativa",
  "Popillia japonica",
  "Trifolium pratense",
  "Daucus carota",
  "Glechoma hederacea",
  "Melia azedarach",
  "Hedera helix",
  "Pyrus calleryana",
  "Microstegium vimineum",
  "Medicago lupulina",
  "Rosa multiflora",
  "Vicia villosa",
  "Allium vineale",
  "Commelina communis",
  "Paulownia tomentosa",
  "Sonchus asper",
  "Trifolium dubium",
  "Myriophyllum aquaticum",
  "Kummerowia striata",
  "Alternanthera philoxeroides",
  "Ailanthus altissima",
  "Stellaria media",
  "Ornithogalum umbellatum",
  "Ipomoea purpurea",
  "Sorghum halepense",
  "Sus scrofa",
  "Rumex crispus",
  "Elaeagnus umbellata",
  "Torilis arvensis",
  "Leucanthemum vulgare",
  "Capsella bursa-pastoris",
  "Melilotus albus",
  "Hemerocallis fulva",
  "Veronica arvensis",
  "Lespedeza bicolor",
  "Eleusine indica",
  "Cerastium glomeratum",
  "Verbascum blattaria",
  "Paspalum dilatatum",
  "Dactylis glomerata",
  "Vinca minor",
  "Arundo donax",
  "Poa annua",
  "Cichorium intybus",
  "Datura stramonium",
  "Trifolium arvense",
  "Lactuca serriola",
  "Securigera varia",
  "Conium maculatum",
  "Bromus catharticus",
  "Senecio vulgaris",
  "Taraxacum erythrospermum",
  "Ctenopharyngodon idella",
  "Centaurea cyanus",
  "Plantago major",
  "Lysimachia nummularia",
  "Nasturtium officinale",
  "Cynodon dactylon",
  "Morus alba",
  "Amaranthus spinosus",
  "Lolium perenne",
  "Cirsium vulgare",
  "Lathyrus latifolius",
  "Buglossoides arvensis",
  "Chenopodium album",
  "Cyperus esculentus",
  "Celastrus orbiculatus",
  "Arenaria serpyllifolia",
  "Abutilon theophrasti",
  "Asclepias curassavica",
  "Ficus pumila",
  "Stephanitis pyrioides",
  "Bothriochloa ischaemum",
  "Miscanthus sinensis",
  "Artemisia vulgaris",
  "Saponaria officinalis",
  "Ricinus communis",
  "Dianthus armeria",
  "Pyracantha koidzumii",
  "Cunninghamia lanceolata",
  "Pheidole navigans",
  "Scleranthus annuus",
  "Tradescantia fluminensis",
  "Rattus rattus",
  "Etiella zinckenella",
  "Drymaria cordata",
  "Ligustrum japonicum",
  "Kerria japonica",
  "Clerodendrum indicum",
  "Gladiolus dalenii",
  "Vicia hirsuta",
  "Icerya purchasi",
  "Erigeron sumatrensis",
  "Melochia corchorifolia",
  "Zingiber zerumbet",
  "Lamium galeobdolon",
  "Liriope spicata",
  "Crotalaria juncea",
  "Tropaeolum majus",
  "Draba verna",
  "Setaria viridis",
  "Cornus kousa",
  "Ficus carica",
  "Lythrum salicaria",
  "Rumex obtusifolius",
  "Echinochloa colona",
  "Desmodium incanum",
  "Iris domestica",
  "Pseudaulacaspis cockerelli",
  "Sonchus oleraceus",
  "Myriophyllum spicatum",
  "Lumbricus rubellus",
  "Osmia taurus",
  "Digitalis purpurea",
  "Ranunculus muricatus",
  "Anthoxanthum odoratum",
  "Ranunculus parviflorus",
  "Sphenoclea zeylanica",
  "Tridax procumbens",
  "Potentilla recta",
  "Potamogeton crispus",
  "Styela plicata",
  "Rattus norvegicus",
  "Nephrolepis cordifolia",
  "Antigonon leptopus",
  "Hypericum perforatum",
  "Ipomoea cairica",
  "Pittosporum tobira",
  "Calibrachoa parviflora",
  "Sitona hispidulus",
  "Exomala orientalis",
  "Verbena incompta",
  "Erodium cicutarium",
  "Lilium formosanum",
  "Papaver rhoeas",
  "Polycarpon tetraphyllum",
  "Acanthospermum australe",
  "Zephyranthes candida",
  "Tetrapanax papyrifer",
  "Aedes japonicus",
  "Populus alba",
  "Galinsoga quadriradiata",
  "Melilotus officinalis",
  "Koelreuteria paniculata",
  "Echinochloa crus-galli",
  "Centaurium pulchellum",
  "Spiraea japonica",
  "Impatiens balsamina",
  "Podocarpus macrophyllus",
  "Achyranthes japonica",
  "Indigofera spicata",
  "Solanum pseudocapsicum",
  "Narcissus tazetta",
  "Alliaria petiolata",
  "Lobularia maritima",
  "Polypogon monspeliensis",
  "Manihot grahamii",
  "Rottboellia cochinchinensis",
  "Osteopilus septentrionalis",
  "Pyracantha coccinea",
  "Melissa officinalis",
  "Centaurea stoebe",
  "Salpichroa origanifolia",
  "Verbena bonariensis",
  "Lumbricus terrestris",
  "Sacciolepis indica",
  "Xylosandrus crassiusculus",
  "Rumex acetosella",
  "Silene gallica",
  "Veronica serpyllifolia",
  "Euphorbia cyparissias",
  "Narcissus poeticus",
  "Cimex lectularius",
  "Thlaspi arvense",
  "Hypophthalmichthys molitrix",
  "Gloriosa superba",
  "Macroptilium lathyroides",
  "Borago officinalis",
  "Amaranthus blitum",
  "Foeniculum vulgare",
  "Alopochen aegyptiaca",
  "Commelina benghalensis",
  "Lantana montevidensis",
  "Syringa vulgaris",
  "Misgurnus anguillicaudatus",
  "Dichrostachys cinerea",
  "Xanthosoma sagittifolium",
  "Begonia cucullata",
  "Malvaviscus penduliflorus",
  "Tithonia rotundifolia",
  "Nipponaclerda biwakoensis",
  "Linaria maroccana",
  "Torilis nodosa",
  "Rumex conglomeratus",
  "Bromus tectorum",
  "Berberis thunbergii",
  "Acer palmatum",
  "Impatiens walleriana",
  "Melinis repens",
  "Phoenix canariensis",
  "Nelumbo nucifera",
  "Celosia argentea",
  "Hydrocotyle bowlesioides",
  "Koelreuteria elegans",
  "Trachelospermum jasminoides",
  "Marsilea minuta",
  "Ligustrum obtusifolium",
  "Atrichonotus taeniatulus",
  "Zaprionus indianus",
  "Duponchelia fovealis",
  "Tradescantia zebrina",
  "Bromus hordeaceus",
  "Verbascum virgatum",
  "Veronica polita",
  "Eragrostis minor",
  "Nicandra physalodes",
  "Rhodotypos scandens",
  "Thunbergia alata",
  "Eragrostis tenella",
  "Spermacoce verticillata",
  "Wisteria floribunda",
  "Aglossa caprealis",
  "Dolichandra unguis-cati",
  "Maladera formosae",
  "Hesperis matronalis",
  "Ranunculus repens",
  "Linaria vulgaris",
  "Sisymbrium officinale",
  "Acer platanoides",
  "Arabidopsis thaliana",
  "Lapsana communis",
  "Cyperus difformis",
  "Geranium pusillum",
  "Asparagus aethiopicus",
  "Plumbago auriculata",
  "Polygonum aviculare",
  "Setaria faberi",
  "Deroceras reticulatum",
  "Alysicarpus vaginalis",
  "Blatta orientalis",
  "Acanthospermum hispidum",
  "Alternanthera sessilis",
  "Centella asiatica",
  "Euphorbia graminea",
  "Fimbristylis schoenoides",
  "Najas minor",
  "Phyllocnistis citrella",
  "Ephestia kuehniella",
  "Ziziphus jujuba",
  "Acizzia jamatonica",
  "Cryphonectria parasitica",
  "Lantana camara",
  "Digitaria sanguinalis",
  "Cerastium fontanum",
  "Bellis perennis",
  "Persicaria maculosa",
  "Amaranthus albus",
  "Typha angustifolia",
  "Agrilus planipennis",
  "Bromus commutatus",
  "Ligustrum ovalifolium",
  "Poa compressa",
  "Pseudococcus longispinus",
  "Akebia quinata",
  "Paederia foetida",
  "Asparagus densiflorus",
  "Ageratum conyzoides",
  "Alternanthera pungens",
  "Fimbristylis littoralis",
  "Pseudosasa japonica",
  "Dryocosmus kuriphilus",
  "Chrysomya rufifacies",
  "Silybum marianum",
  "Anthemis cotula",
  "Convolvulus arvensis",
  "Tragopogon dubius",
  "Cymbalaria muralis",
  "Spergula arvensis",
  "Salix babylonica",
  "Diplotaxis muralis",
  "Eragrostis cilianensis",
  "Eragrostis curvula",
  "Oreochromis aureus",
  "Alocasia macrorrhizos",
  "Hyalopterus pruni",
  "Crotalaria pallida",
  "Ipomoea carnea",
  "Aulacaspis yasumatsui",
  "Eragrostis japonica",
  "Bedellia somnulentella",
  "Drosophila suzukii",
  "Achroia grisella",
  "Macrosiphum lilii",
  "Scilla siberica",
  "Puccinia modiolae",
  "Dama dama",
  "Pterois volitans",
  "Lotus corniculatus",
  "Passiflora caerulea",
  "Aegopodium podagraria",
  "Aira caryophyllea",
  "Ilex aquifolium",
  "Tanacetum parthenium",
  "Lamium maculatum",
  "Tanacetum vulgare",
  "Euphorbia peplus",
  "Galium parisiense",
  "Arctium minus",
  "Hypoponera opaciceps",
  "Paratrechina longicornis",
  "Bromus japonicus",
  "Nepeta cataria",
  "Physalis philadelphica",
  "Ageratum houstonianum",
  "Erythrina crista-galli",
  "Alcea rosea",
  "Caladium bicolor",
  "Platycodon grandiflorus",
  "Zephyranthes citrina",
  "Calliandra haematocephala",
  "Geranium sanguineum",
  "Portulaca grandiflora",
  "Pseuderanthemum variabile",
  "Terminalia catappa",
  "Acorus calamus",
  "Amaranthus tricolor",
  "Ambrosiodmus minor",
  "Begonia hirtella",
  "Bothriochloa pertusa",
  "Calendula officinalis",
  "Catapodium rigidum",
  "Cenchrus americanus",
  "Cornu aspersum",
  "Culex quinquefasciatus",
  "Cynoglossum amabile",
  "Cyperus entrerianus",
  "Cyperus sanguinolentus",
  "Digitaria ischaemum",
  "Fagopyrum esculentum",
  "Gerbera jamesonii",
  "Gomphrena globosa",
  "Grapholita delineana",
  "Hypoestes phyllostachya",
  "Klambothrips myopori",
  "Lernaea cyprinacea",
  "Leucanthemum maximum",
  "Lygodium microphyllum",
  "Martyringa xeraula",
  "Mentha spicata",
  "Necrobia rufipes",
  "Nymphoides peltata",
  "Odontonema tubaeforme",
  "Oplismenus undulatifolius",
  "Panicum miliaceum",
  "Persicaria capitata",
  "Phyllostachys nigra",
  "Phyllostachys reticulata",
  "Prunus mahaleb",
  "Russelia equisetiformis",
  "Ruta graveolens",
  "Sansevieria trifasciata",
  "Selaginella kraussiana",
  "Silene latifolia",
  "Sporobolus pyramidalis",
  "Stegobium paniceum",
  "Thunbergia grandiflora",
  "Varroa destructor",
  "Washingtonia robusta",
  "Achillea filipendulina",
  "Adiantum hispidulum",
  "Aethina tumida",
  "Agrostemma githago",
  "Alopecurus myosuroides",
  "Amphibalanus reticulatus",
  "Amynthas agrestis",
  "Antonina graminis",
  "Aphis spiraecola",
  "Artemisia annua",
  "Asparagus setaceus",
  "Barbarea vulgaris",
  "Brachymyrmex obscurior",
  "Bromus secalinus",
  "Cactoblastis cactorum",
  "Calomycterus setarius",
  "Casuarina equisetifolia",
  "Cenchrus purpureus",
  "Cenchrus setaceus",
  "Centaurea montana",
  "Centratherum punctatum",
  "Charybdis hellerii",
  "Chloris gayana",
  "Clematis vitalba",
  "Clitoria ternatea",
  "Corbicula largillierti",
  "Cortaderia jubata",
  "Crioceris asparagi",
  "Cydia pomonella",
  "Cytisus scoparius",
  "Diaphania indica",
  "Dichondra micrantha",
  "Diplosoma listerianum",
  "Discula destructiva",
  "Dysphania carinata",
  "Eragrostis cumingii",
  "Eragrostis pilosa",
  "Euphorbia lathyris",
  "Fiorinia theae",
  "Gamochaeta simplicicaulis",
  "Gypsophila paniculata",
  "Hibiscus trionum",
  "Hydroides elegans",
  "Hygrophila polysperma",
  "Hylotrupes bajulus",
  "Hyperomyzus lactucae",
  "Hypophthalmichthys nobilis",
  "Hypoponera punctatissima",
  "Lagurus ovatus",
  "Laurus nobilis",
  "Lecanosticta acicola",
  "Lepidium campestre",
  "Ligustrum vulgare",
  "Linaria purpurea",
  "Linum usitatissimum",
  "Lobelia erinus",
  "Ludwigia grandiflora",
  "Malva sylvestris",
  "Matricaria discoidea",
  "Megabalanus coccopoma",
  "Megathyrsus maximus",
  "Milax gagates",
  "Momordica charantia",
  "Monomorium pharaonis",
  "Myiopsitta monachus",
  "Myosotis discolor",
  "Myosotis scorpioides",
  "Myosotis sylvatica",
  "Felis catus",
  "Prunus persica",
  "Cygnus olor",
  "Cucumis melo",
  "Triticum aestivum",
  "Solanum lycopersicum",
  "Cyprinus rubrofuscus",
  "Solanum tuberosum",
  "Ipomoea batatas",
  "Citrullus lanatus",
  "Sorghum bicolor",
  "Avena sativa",
  "Capra hircus",
  "Oryctolagus cuniculus",
  "Cocos nucifera",
  "Coriandrum sativum",
  "Brassica rapa",
  "Lablab purpureus",
  "Brassica oleracea",
  "Papaver somniferum",
  "Brassica juncea",
  "Carica papaya",
  "Cucumis sativus",
  "Medicago sativa",
  "Secale cereale",
  "Lactuca sativa",
  "Nicotiana tabacum",
  "Persea americana",
  "Neotoxoptera formosana",
  "Niditinea fuscella",
  "Oenothera glazioviana",
  "Olea europaea",
  "Ophiognomonia clavigignenti-juglandacearum",
  "Oreochromis niloticus",
  "Oryzaephilus surinamensis",
  "Oulema melanopus",
  "Paraserianthes lophantha",
  "Parthenocissus tricuspidata",
  "Peperomia pellucida",
  "Peronospora belbahrii",
  "Pholcus manueli",
  "Phyllostachys aureosulcata",
  "Platydemus manokwari",
  "Poa bulbosa",
  "Prunus cerasifera",
  "Pseudogymnoascus destructans",
  "Pyracantha angustifolia",
  "Rhinocyllus conicus",
  "Rhopalosiphum maidis",
  "Salmo trutta",
  "Selenicereus grandiflorus",
  "Setaria sphacelata",
  "Silene dioica",
  "Silene vulgaris",
  "Sisymbrium irio",
  "Solanum melongena",
  "Spodoptera exigua",
  "Stachytarpheta cayennensis",
  "Stenhomalus taiwanus",
  "Symphytum officinale",
  "Syngonium podophyllum",
  "Tagetes erecta",
  "Talinum fruticosum",
  "Tinea pellionella",
  "Tithonia diversifolia",
  "Tribulus terrestris",
  "Tripleurospermum inodorum",
  "Turnera ulmifolia",
  "Urena lobata",
  "Urochloa plantaginea",
  "Valeriana officinalis",
  "Veronica spicata",
  "Xyleborus glabratus",
  "Zachrysia provisoria",
  "Zoysia matrella",
  "Solanum nigrescens",
  "Hemidactylus garnotii",
  "Mentha pulegium",
  "Kalanchoe delagoensis",
  "Cryptomeria japonica",
  "Festuca rubra",
  "Poa trivialis",
  "Lasioderma serricorne",
  "Phleum pratense",
  "Fallopia convolvulus",
  "Digitaria violascens",
];

type InatTaxon = {
  id: number;
  name: string;
  rank?: string;
  is_active?: boolean;
  preferred_common_name?: string;
};

type InatTaxonResponse = {
  total_results?: number;
  results?: InatTaxon[];
};

type InatObservation = {
  id: number;
  uuid?: string;
  uri?: string;
  created_at?: string;
  observed_on?: string;
  time_observed_at?: string;
  quality_grade?: string;
  taxon?: InatTaxon;
  captive?: boolean;
  mappable?: boolean;
  obscured?: boolean;
  geoprivacy?: string | null;
  taxon_geoprivacy?: string | null;
  public_positional_accuracy?: number | null;
  positional_accuracy?: number | null;
  geojson?: {
    type?: string;
    coordinates?: [number, number];
  };
  location?: string | null;
  place_guess?: string | null;
  license_code?: string | null;
  user?: {
    login?: string;
    name?: string | null;
  };
};

type InatObservationResponse = {
  total_results?: number;
  page?: number;
  per_page?: number;
  results?: InatObservation[];
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string; countyFips: string }
>;

type ImportedCoverage = {
  scientificName: string;
  taxonId: number;
  relatedSpeciesIds: string[];
  observations: ImportedObservation[];
  countyFips: Set<string>;
  totalStrictObservations: number;
};

type ImportedObservation = {
  id: number;
  uuid?: string;
  uri?: string;
  observer: string;
  createdAt?: string;
  observedOn?: string;
  timeObservedAt?: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  publicPositionalAccuracyMeters?: number | null;
  geoprivacy?: string | null;
  taxonGeoprivacy?: string | null;
  licenseCode?: string | null;
  placeGuess?: string | null;
};

type InatSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  taxonId: number;
  totalStrictObservations: number;
  acceptedObservationCount: number;
  countyFips: string[];
  observations: ImportedObservation[];
};

type InatSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  lastTargetedRefreshAt?: string;
  lastTargetedRefreshScientificNames?: string[];
  placeId: number;
  filters: {
    qualityGrade: "research";
    captive: false;
    mappable: true;
    obscuration: "none";
    maxPublicPositionalAccuracyMeters: number;
  };
  targetScientificNames: string[];
  species: InatSourceSnapshotSpecies[];
  summary: {
    targetSpeciesCount: number;
    importedSpeciesCount: number;
    acceptedObservationCount: number;
    countySpeciesPairs: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function selectedTargetScientificNames() {
  const rawTargetNames = process.env.INATURALIST_TARGETS?.trim();
  if (!rawTargetNames) return PILOT_TARGET_SCIENTIFIC_NAMES;

  return [
    ...new Set(
      rawTargetNames
        .split(/[,\n|]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function curlJson<T>(url: string, maxBuffer = 15 * 1024 * 1024) {
  const response = execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "90", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer },
  );
  return JSON.parse(response) as T;
}

function buildUrl(path: string, params: Record<string, string | number | boolean>) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  return `${INAT_API_BASE_URL}${path}?${searchParams.toString()}`;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function asciiText(value: string | null | undefined) {
  return value?.replace(/[\u2013\u2014]/g, "-") ?? null;
}

function countyPresenceSpeciesId(record: Species) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
}

function relatedCountyPresenceSpeciesIds(record: Species) {
  return [
    ...new Set([record.id, record.registry?.occurrenceId, countyPresenceSpeciesId(record)].filter(
      (value): value is string => Boolean(value),
    )),
  ];
}

function uniqueSources(sources: CountyDataSourceRef[]) {
  return [
    ...new Map(
      sources.map((source) => [
        `${source.source}::${source.matchType}::${source.externalId}::${source.url}`,
        source,
      ]),
    ).values(),
  ];
}

function buildCoverageSummary(
  records: CountyCoverageSpeciesSnapshot[],
  catalogSpeciesCount: number,
) {
  const mappedRecords = records.filter((record) => record.countyFips.length > 0);
  const mappedSpeciesIds = new Set(mappedRecords.map((record) => record.speciesId));
  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] = {};

  for (const record of mappedRecords) {
    const sourceNames = new Set(record.countyDataSources.map((source) => source.source));
    for (const sourceName of sourceNames) {
      sourceSpeciesCounts[sourceName] = (sourceSpeciesCounts[sourceName] ?? 0) + 1;
    }
  }

  return {
    catalogSpeciesCount,
    mappedSpeciesCount: mappedSpeciesIds.size,
    unmatchedSpeciesCount: Math.max(0, catalogSpeciesCount - mappedSpeciesIds.size),
    sourceSpeciesCounts,
  };
}

function buildCountyFeatures() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: CountyGeometry[] } };
  };
  const countyCollection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >;
  const stateCodeByFips = Object.fromEntries(
    Object.entries(STATE_FIPS_TO_INFO).map(([fips, info]) => [fips, info.code]),
  );

  const countyFeatures: CountyFeature[] = [];
  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (stateCode !== "AL") return;

    countyFeatures.push({
      ...countyFeature,
      properties: {
        ...(countyFeature.properties ?? {}),
        countyFips,
        name: geometry.properties?.name ?? countyFeature.properties?.name,
      },
    });
  });

  return countyFeatures;
}

function resolveCoordinateCountyFips(
  coordinates: [number, number] | undefined,
  countyFeatures: CountyFeature[],
) {
  if (!coordinates) return null;
  const [longitude, latitude] = coordinates;
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;

  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, [longitude, latitude])) {
      return countyFeature.properties.countyFips;
    }
  }

  return null;
}

function loadExactActiveSpeciesTaxon(scientificName: string) {
  const payload = curlJson<InatTaxonResponse>(
    buildUrl("/taxa", {
      q: scientificName,
      rank: "species",
      is_active: true,
    }),
  );

  return (payload.results ?? []).find(
    (taxon) =>
      taxon.rank === "species" &&
      taxon.is_active !== false &&
      canonicalScientificName(taxon.name) === canonicalScientificName(scientificName),
  );
}

function isStrictUsableObservation(observation: InatObservation, taxonId: number) {
  const publicAccuracy =
    typeof observation.public_positional_accuracy === "number"
      ? observation.public_positional_accuracy
      : observation.positional_accuracy;

  return (
    observation.quality_grade === "research" &&
    observation.taxon?.id === taxonId &&
    observation.taxon?.rank === "species" &&
    observation.captive === false &&
    observation.mappable === true &&
    observation.obscured === false &&
    (observation.geoprivacy == null || observation.geoprivacy === "open") &&
    (observation.taxon_geoprivacy == null || observation.taxon_geoprivacy === "open") &&
    observation.geojson?.type === "Point" &&
    Array.isArray(observation.geojson.coordinates) &&
    (typeof publicAccuracy !== "number" ||
      publicAccuracy <= MAX_PUBLIC_POSITIONAL_ACCURACY_METERS)
  );
}

function loadStrictObservations(taxonId: number) {
  const observations: InatObservation[] = [];
  let idAbove = 0;
  let totalStrictObservations = 0;

  while (observations.length < MAX_OBSERVATIONS_PER_SPECIES) {
    const payload = curlJson<InatObservationResponse>(
      buildUrl("/observations", {
        place_id: INAT_ALABAMA_PLACE_ID,
        taxon_id: taxonId,
        quality_grade: "research",
        captive: false,
        mappable: true,
        obscuration: "none",
        acc_below_or_unknown: MAX_PUBLIC_POSITIONAL_ACCURACY_METERS,
        order_by: "id",
        order: "asc",
        id_above: idAbove,
        per_page: PAGE_LIMIT,
      }),
      35 * 1024 * 1024,
    );

    if (idAbove === 0) {
      totalStrictObservations = payload.total_results ?? totalStrictObservations;
    }
    const pageObservations = payload.results ?? [];
    if (pageObservations.length === 0) break;

    observations.push(...pageObservations);
    idAbove = Math.max(...pageObservations.map((observation) => observation.id));
    if (pageObservations.length < PAGE_LIMIT) break;
  }

  return {
    observations: observations.slice(0, MAX_OBSERVATIONS_PER_SPECIES),
    totalStrictObservations,
  };
}

function collectImportedCoverage(
  species: Species[],
  counties: Record<string, CountyRecord>,
  targetScientificNames: readonly string[],
) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const validAlCountyFips = new Set(
    Object.values(counties)
      .filter((county) => county.stateCode === "AL")
      .map((county) => county.countyFips),
  );
  const countyFeatures = buildCountyFeatures();
  const imported = new Map<string, ImportedCoverage>();
  let exactCatalogTargets = 0;
  let exactTaxonMatches = 0;
  let observationsReviewed = 0;
  let observationsAccepted = 0;
  let observationsSkipped = 0;

  for (const scientificName of targetScientificNames) {
    const speciesRecord = speciesByScientificName.get(
      canonicalScientificName(scientificName),
    );
    if (!speciesRecord) {
      console.log(`Skipped iNaturalist pilot target without exact catalog match: ${scientificName}`);
      continue;
    }

    exactCatalogTargets += 1;
    const taxon = loadExactActiveSpeciesTaxon(scientificName);
    if (!taxon) {
      console.log(`Skipped iNaturalist pilot target without exact active taxon: ${scientificName}`);
      continue;
    }

    exactTaxonMatches += 1;
    const { observations, totalStrictObservations } = loadStrictObservations(taxon.id);
    const speciesId = countyPresenceSpeciesId(speciesRecord);
    const coverage: ImportedCoverage = {
      scientificName: speciesRecord.scientificName,
      taxonId: taxon.id,
      relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
      observations: [],
      countyFips: new Set(),
      totalStrictObservations,
    };

    for (const observation of observations) {
      observationsReviewed += 1;
      if (!isStrictUsableObservation(observation, taxon.id)) {
        observationsSkipped += 1;
        continue;
      }

      const coordinates = observation.geojson?.coordinates;
      if (!coordinates) {
        observationsSkipped += 1;
        continue;
      }

      const countyFips = resolveCoordinateCountyFips(coordinates, countyFeatures);
      if (!countyFips || !validAlCountyFips.has(countyFips)) {
        observationsSkipped += 1;
        continue;
      }

      observationsAccepted += 1;
      const [longitude, latitude] = coordinates;
      coverage.observations.push({
        id: observation.id,
        uuid: observation.uuid,
        uri: observation.uri,
        observer: observation.user?.name || observation.user?.login || "unknown observer",
        createdAt: observation.created_at,
        observedOn: observation.observed_on,
        timeObservedAt: observation.time_observed_at,
        countyFips,
        latitude,
        longitude,
        publicPositionalAccuracyMeters:
          typeof observation.public_positional_accuracy === "number"
            ? observation.public_positional_accuracy
            : observation.positional_accuracy ?? null,
        geoprivacy: observation.geoprivacy ?? null,
        taxonGeoprivacy: observation.taxon_geoprivacy ?? null,
        licenseCode: observation.license_code ?? null,
        placeGuess: asciiText(observation.place_guess),
      });
      coverage.countyFips.add(countyFips);
    }

    if (coverage.countyFips.size > 0) {
      imported.set(speciesId, coverage);
      console.log(
        `Loaded iNaturalist Research Grade observations for ${coverage.scientificName}: ${coverage.countyFips.size} Alabama counties from ${coverage.observations.length} accepted observations (${coverage.totalStrictObservations} strict API matches, taxon ${coverage.taxonId}).`,
      );
    } else {
      console.log(
        `No county-resolved iNaturalist Research Grade observations imported for ${speciesRecord.scientificName} (${totalStrictObservations} strict API matches, taxon ${taxon.id}).`,
      );
    }
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Reviewed ${targetScientificNames.length} iNaturalist pilot species; ${exactCatalogTargets} exact current-catalog targets; ${exactTaxonMatches} exact active iNaturalist taxa.`,
  );
  console.log(
    `Reviewed ${observationsReviewed} iNaturalist observations; accepted ${observationsAccepted}; skipped ${observationsSkipped}.`,
  );
  console.log(
    `Loaded ${imported.size} species from iNaturalist Research Grade observations with ${countyPairs} Alabama county-species pairs.`,
  );

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const targetScientificNames = selectedTargetScientificNames();
  const isTargetedRefresh = Boolean(process.env.INATURALIST_TARGETS?.trim());
  const imported = collectImportedCoverage(species, counties, targetScientificNames);
  const accessedAt = new Date().toISOString();
  const existingBySpeciesId = new Map(
    snapshot.species.map((record) => [record.speciesId, record]),
  );
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const targetedSpeciesIds = new Set(
    targetScientificNames.flatMap((scientificName) => {
      const record = speciesByScientificName.get(canonicalScientificName(scientificName));
      return record ? relatedCountyPresenceSpeciesIds(record) : [];
    }),
  );
  const outputRecords = new Map<string, CountyCoverageSpeciesSnapshot>();

  for (const record of snapshot.species) {
    const stripSource = !isTargetedRefresh || targetedSpeciesIds.has(record.speciesId);
    outputRecords.set(record.speciesId, {
      ...record,
      countyDataSources: stripSource
        ? record.countyDataSources.filter((source) => source.source !== SOURCE_NAME)
        : record.countyDataSources,
    });
  }

  let netNewCountyPairs = 0;
  for (const [speciesId, coverage] of imported) {
    const existing = existingBySpeciesId.get(speciesId);
    const existingCountyFips = new Set(
      coverage.relatedSpeciesIds.flatMap(
        (relatedSpeciesId) => existingBySpeciesId.get(relatedSpeciesId)?.countyFips ?? [],
      ),
    );
    const countyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
      if (!existingCountyFips.has(fips)) {
        netNewCountyPairs += 1;
      }
      countyFips.add(fips);
    }

    outputRecords.set(speciesId, {
      speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []).filter(
          (source) => source.source !== SOURCE_NAME,
        ),
        {
          source: SOURCE_NAME,
          matchType: "scientific-exact",
          externalId: `taxon ${coverage.taxonId} (${coverage.scientificName}); ${coverage.observations.length} accepted observations across ${coverage.countyFips.size} Alabama counties`,
          url: `https://www.inaturalist.org/observations?place_id=${INAT_ALABAMA_PLACE_ID}&taxon_id=${coverage.taxonId}&quality_grade=research`,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation: [
      ...snapshot.citation.filter((entry) => !entry.includes("iNaturalist")),
      "iNaturalist. 2026. Research Grade public observations API, filtered to Alabama place_id 19 with exact active species taxa, non-captive/cultivated observations, mappable non-obscured coordinates, and county-resolved point locations. Available online at https://api.inaturalist.org/v1/observations.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: InatSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      taxonId: coverage.taxonId,
      totalStrictObservations: coverage.totalStrictObservations,
      acceptedObservationCount: coverage.observations.length,
      countyFips: [...coverage.countyFips].sort(),
      observations: [...coverage.observations].sort((left, right) => left.id - right.id),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const previousSourceSnapshot = isTargetedRefresh
    ? readJsonFile<InatSourceSnapshotFile>(SOURCE_SNAPSHOT_PATH)
    : null;
  const mergedSourceSnapshotSpecies = previousSourceSnapshot
    ? [
        ...previousSourceSnapshot.species.filter(
          (record) =>
            !targetedSpeciesIds.has(record.speciesId) &&
            !targetScientificNames.some(
              (scientificName) =>
                canonicalScientificName(scientificName) ===
                canonicalScientificName(record.scientificName),
            ),
        ),
        ...sourceSnapshotSpecies,
      ].sort((left, right) => left.speciesId.localeCompare(right.speciesId))
    : sourceSnapshotSpecies;
  const sourceTargetScientificNames = previousSourceSnapshot
    ? [
        ...new Set([
          ...previousSourceSnapshot.targetScientificNames,
          ...targetScientificNames,
        ]),
      ]
    : [...targetScientificNames];
  const sourceSnapshot: InatSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      "iNaturalist. 2026. Research Grade public observations API. Available online at https://api.inaturalist.org/v1/observations.",
      "iNaturalist. 2026. API documentation and Swagger schema. Available online at https://api.inaturalist.org/v1/docs/ and https://api.inaturalist.org/v1/swagger.json.",
    ],
    accessedAt,
    ...(isTargetedRefresh
      ? {
          lastTargetedRefreshAt: accessedAt,
          lastTargetedRefreshScientificNames: [...targetScientificNames],
        }
      : {}),
    placeId: INAT_ALABAMA_PLACE_ID,
    filters: {
      qualityGrade: "research",
      captive: false,
      mappable: true,
      obscuration: "none",
      maxPublicPositionalAccuracyMeters: MAX_PUBLIC_POSITIONAL_ACCURACY_METERS,
    },
    targetScientificNames: sourceTargetScientificNames,
    species: mergedSourceSnapshotSpecies,
    summary: {
      targetSpeciesCount: sourceTargetScientificNames.length,
      importedSpeciesCount: mergedSourceSnapshotSpecies.length,
      acceptedObservationCount: mergedSourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedObservationCount,
        0,
      ),
      countySpeciesPairs: mergedSourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved iNaturalist Research Grade snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved iNaturalist Research Grade source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
