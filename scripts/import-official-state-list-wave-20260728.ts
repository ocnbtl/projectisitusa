import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  sha256Bytes,
  stablePrettyJson,
  type CatalogSpecies,
  type StateApplicabilityReview,
  type StateApplicabilitySource,
  type StateApplicabilitySourceRegistry,
} from "@/lib/research/state-applicability-sources";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");

type SourceSpec = {
  source: StateApplicabilitySource;
  reviewId: string;
  directory: string;
  artifactFilename: string;
  artifactMediaType: string;
  sourceUrl: string;
  retrievedAt: string;
  reviewedAt: string;
  sourceRecordPrefix: string;
  note: string;
  exactSpeciesIds: string[];
  blockedTaxa: string[];
};

const specs: SourceSpec[] = [
  {
    source: {
      id: "id-idapa-02-06-09",
      label: "Idaho noxious weeds rule",
      authority: "Idaho State Department of Agriculture",
      stateCode: "ID",
      homepage: "https://adminrules.idaho.gov/rules/current/02/020609.pdf",
      access: "download",
      claimSemantics: "regulated-state-applicability",
      negativeSemantics: "none",
      refreshCadenceDays: 90,
      status: "operational",
      caveat:
        "Rule membership establishes statewide regulatory applicability only. EDRR membership may explicitly include taxa not known in Idaho, so it never establishes occurrence.",
    },
    reviewId: "id-idapa-02-06-09-20260728",
    directory: "20260728__id-idapa-02-06-09__827ea6bb753f",
    artifactFilename: "020609.pdf",
    artifactMediaType: "application/pdf",
    sourceUrl: "https://adminrules.idaho.gov/rules/current/02/020609.pdf",
    retrievedAt: "2026-07-28T04:57:00Z",
    reviewedAt: "2026-07-28T05:16:00Z",
    sourceRecordPrefix: "IDAPA-02.06.09",
    note:
      "Exact species-level Idaho noxious-weed rule membership establishes state regulatory applicability only.",
    exactSpeciesIds: [
      "egeria-densa",
      "imperata-cylindrica",
      "hydrocharis-morsus-ranae",
      "azolla-pinnata",
      "giant-hogweed",
      "salvinia-molesta",
      "galega-officinalis",
      "hydrilla",
      "impatiens-glandulifera",
      "centaurea-calcitrapa",
      "nitellopsis-obtusa",
      "zygophyllum-fabago",
      "hieracium-piloselloides",
      "trapa-natans",
      "eichhornia-crassipes",
      "hyoscyamus-niger",
      "crupina-vulgaris",
      "isatis-tinctoria",
      "myriophyllum-spicatum",
      "butomus-umbellatus",
      "sorghum-halepense",
      "nardus-stricta",
      "centaurea-debeauxii",
      "salvia-aethiopis",
      "carduus-nutans",
      "hieracium-aurantiacum",
      "myriophyllum-aquaticum",
      "sonchus-arvensis",
      "cytisus-scoparius",
      "echium-vulgare",
      "hieracium-caespitosum",
      "cirsium-arvense",
      "potamogeton-crispus",
      "centaurea-diffusa",
      "convolvulus-arvensis",
      "berteroa-incana",
      "cynoglossum-officinale",
      "aegilops-cylindrica",
      "leucanthemum-vulgare",
      "lepidium-latifolium",
      "carduus-acanthoides",
      "conium-maculatum",
      "tribulus-terrestris",
      "lythrum-salicaria",
      "chondrilla-juncea",
      "onopordum-acanthium",
      "centaurea-stoebe",
      "bryonia-alba",
      "centaurea-solstitialis",
      "linaria-vulgaris",
    ],
    blockedTaxa: [
      "Cabomba caroliniana",
      "Centaurea iberica",
      "Centaurea triumfetti",
      "Myriophyllum heterophyllum",
      "Hieracium glomeratum",
      "Nymphoides pelata",
      "Polygonum X bohemicum",
      "Phragmites australis",
      "Polygonum sachalinense",
      "Polygonum cuspidatum",
      "Acroptilon repens",
      "Anchusa arvensis",
      "Carduus cinereus",
      "Linaria dalmatica ssp. dalmatica",
      "Euphorbia esula",
      "Milium vernale",
      "Tamarix spp.",
      "Senecio jacobaea",
      "Cardaria draba",
      "Iris pseudocorus",
      "Cytisus",
      "Genista",
      "Spartium",
      "Chamaecytisus",
    ],
  },
  {
    source: {
      id: "in-312-iac-18-3-25",
      label: "Indiana terrestrial plant rule and noxious weeds",
      authority: "Indiana Department of Natural Resources",
      stateCode: "IN",
      homepage:
        "https://www.in.gov/dnr/rules-and-regulations/invasive-species/terrestrial-invasive-species-plants",
      access: "download",
      claimSemantics: "regulated-state-applicability",
      negativeSemantics: "none",
      refreshCadenceDays: 90,
      status: "operational",
      caveat:
        "List membership establishes statewide regulatory applicability only. It does not establish state or county occurrence, absence, or survey non-detection.",
    },
    reviewId: "in-312-iac-18-3-25-20260728",
    directory: "20260728__in-312-iac-18-3-25__0088032fe057",
    artifactFilename: "terrestrial-invasive-species-plants.html",
    artifactMediaType: "text/html",
    sourceUrl:
      "https://www.in.gov/dnr/rules-and-regulations/invasive-species/terrestrial-invasive-species-plants",
    retrievedAt: "2026-07-28T04:58:00Z",
    reviewedAt: "2026-07-28T05:17:00Z",
    sourceRecordPrefix: "312-IAC-18-3-25",
    note:
      "Exact species-level Indiana regulated-plant membership establishes state regulatory applicability only.",
    exactSpeciesIds: [
      "achyranthes-japonica",
      "tree-of-heaven",
      "alliaria-petiolata",
      "alnus-glutinosa",
      "artemisia-vulgaris",
      "arthraxon-hispidus",
      "berberis-thunbergii",
      "carduus-acanthoides",
      "carduus-nutans",
      "celastrus-orbiculatus",
      "centaurea-stoebe",
      "cirsium-vulgare",
      "conium-maculatum",
      "convolvulus-arvensis",
      "dipsacus-laciniatus",
      "elaeagnus-umbellata",
      "euonymus-fortunei",
      "euphorbia-virgata",
      "frangula-alnus",
      "humulus-japonicus",
      "hesperis-matronalis",
      "lespedeza-cuneata",
      "lepidium-latifolium",
      "ligustrum-obtusifolium",
      "lonicera-japonica",
      "lonicera-morrowii",
      "lonicera-tatarica",
      "lonicera-x-bella",
      "microstegium-vimineum",
      "morus-alba",
      "phellodendron-amurense",
      "rhamnus-cathartica",
      "vincetoxicum-nigrum",
      "vincetoxicum-rossicum",
      "pueraria-montana",
      "lythrum-salicaria",
      "rosa-multiflora",
      "sorghum-halepense",
      "sorghum-bicolor",
    ],
    blockedTaxa: [
      "Coronilla varia",
      "Dioscorea polystachya (oppositifolia)",
      "Dipsacus fullonum",
      "Lonicera maacki",
      "Phalaris arundinacea",
      "Phragmites australis subspecies australis",
      "Polygonum perfoliatum",
      "Reynoutria japonica",
      "Reynoutria sachalinensis",
      "Reynoutria x bohemica",
      "Cirsium avense",
      "Sicyos angulatus",
      "Sorghum almum",
      "Amaranthus rudis",
      "Amaranthus tuberculatus",
      "Conyza xanadensis",
      "Amaranthus palmeri",
      "Amaranthus powellii",
      "Amaranthus retroflexus",
      "Amaranthus hybridus",
    ],
  },
];

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

if (process.argv.slice(2).join(" ") !== "--write") {
  throw new Error("Usage: import-official-state-list-wave-20260728.ts --write");
}

const catalog = readJson<CatalogSpecies[]>(
  path.join(ROOT, "src/data/generated/species.json"),
);
const catalogById = new Map(catalog.map((species) => [species.id, species]));
const registryPath = path.join(
  RESEARCH_ROOT,
  "state-applicability-source-registry.json",
);
const registry = readJson<StateApplicabilitySourceRegistry>(registryPath);

for (const spec of specs) {
  const duplicateIds = spec.exactSpeciesIds.filter(
    (speciesId, index) => spec.exactSpeciesIds.indexOf(speciesId) !== index,
  );
  if (duplicateIds.length > 0) {
    throw new Error(`${spec.source.id} contains duplicate species IDs.`);
  }
  const artifactDirectory = path.join(
    RESEARCH_ROOT,
    "state-list-sources",
    spec.directory,
  );
  const artifactPath = path.join(
    artifactDirectory,
    "artifacts",
    spec.artifactFilename,
  );
  const artifactBytes = readFileSync(artifactPath);
  const acceptedEvents = spec.exactSpeciesIds.map((speciesId) => {
    const species = catalogById.get(speciesId);
    if (!species) {
      throw new Error(`${spec.source.id} references unknown species ${speciesId}.`);
    }
    return {
      eventId: `${spec.source.id}-${speciesId}`,
      sourceRecordId: `${spec.sourceRecordPrefix}/${speciesId}`,
      originalTaxonText: species.scientificName,
      scientificName: species.scientificName,
      speciesId,
      applicability: "applicable" as const,
      priority: "regulated" as const,
      matchMethod: "exact-canonical-binomial" as const,
      reviewStatus: "accepted" as const,
      note: spec.note,
    };
  });
  const review: StateApplicabilityReview = {
    schemaVersion: 1,
    reviewId: spec.reviewId,
    sourceId: spec.source.id,
    stateCode: spec.source.stateCode,
    sourceUrl: spec.sourceUrl,
    retrievedAt: spec.retrievedAt,
    reviewedAt: spec.reviewedAt,
    artifact: {
      path: `artifacts/${spec.artifactFilename}`,
      sha256: sha256Bytes(artifactBytes),
      bytes: artifactBytes.length,
      mediaType: spec.artifactMediaType,
    },
    acceptedEvents,
    blockedRows: spec.blockedTaxa.map((originalTaxonText, index) => ({
      sourceRecordId: `${spec.sourceRecordPrefix}/blocked/${String(index + 1).padStart(2, "0")}`,
      originalTaxonText,
      reason:
        "No exact current catalog binomial was accepted. Synonym, spelling, hybrid, genus, or infraspecific expansion requires separate review.",
      reviewStatus: "blocked" as const,
    })),
    attestations: {
      stateApplicabilityOnly: true,
      countyDeterminationCreated: false,
      absenceCreated: false,
      notDetectedCreated: false,
      sourceSilenceCreatedNotApplicable: false,
    },
  };
  writeFileSync(
    path.join(artifactDirectory, "review.json"),
    stablePrettyJson(review),
  );
  const existing = registry.sources.find(
    (source) => source.id === spec.source.id,
  );
  if (existing && stablePrettyJson(existing) !== stablePrettyJson(spec.source)) {
    throw new Error(`Registry source ${spec.source.id} already differs.`);
  }
  if (!existing) {
    const federalIndex = registry.sources.findIndex(
      (source) => source.stateCode === "US",
    );
    registry.sources.splice(
      federalIndex < 0 ? registry.sources.length : federalIndex,
      0,
      spec.source,
    );
  }
}

registry.updatedAt = "2026-07-28";
writeFileSync(registryPath, stablePrettyJson(registry));
process.stdout.write(
  `${JSON.stringify({
    sourceCount: specs.length,
    acceptedEvents: specs.reduce(
      (sum, spec) => sum + spec.exactSpeciesIds.length,
      0,
    ),
    blockedRows: specs.reduce(
      (sum, spec) => sum + spec.blockedTaxa.length,
      0,
    ),
  }, null, 2)}\n`,
);
