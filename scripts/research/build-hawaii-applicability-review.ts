import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "hi-har-4-68";
const SOURCE_URL = "https://dab.hawaii.gov/pi/ppc/cm/";
const ARTIFACT_URL =
  "https://dab.hawaii.gov/wp-content/uploads/2012/12/Chapter-68.pdf";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__hi-har-4-68__13a4cf5f9ef3",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/hawaii-har-4-68-current.pdf",
);
const ARTIFACT_SHA256 =
  "13a4cf5f9ef36f4617a97149da9716a6415917567a8192a237c445ab2644fd21";
const ARTIFACT_BYTES = 810188;
const AS_OF = "2026-08-01";
const LIST_ADOPTED_DATE = "1992-06-18";
const RETRIEVED_AT = "2026-08-01T06:28:00.000Z";
const REVIEWED_AT = "2026-08-01T06:35:00.000Z";

const SOURCE_TAXA = [
  "Acacia mearnsii",
  "Acaena novae-zelandiae",
  "Acroptilon repens",
  "Aeschynomene indica",
  "Ageratina adenophora",
  "Ageratina riparia",
  "Allium vineale",
  "Andropogon bicornis",
  "Andropogon virginicus",
  "Anredera cordifolia",
  "Ardisia elliptica",
  "Bocconia frutescens",
  "Cardaria pubescens",
  "Cereus uruguayanus",
  "Chromolaena odorata",
  "Cirsium arvense",
  "Clidemia hirta var. hirta",
  "Coccinia grandis",
  "Convolvulus arvensis",
  "Cortaderia jubata",
  "Cymbopogon refractus",
  "Cyperus esculentus",
  "Cytisus monspessulanus",
  "Cytisus scoparius",
  "Dichrostachys nutans",
  "Elephantopus mollis",
  "Elytrigia repens",
  "Emex spinosa",
  "Eriocereus martinii",
  "Euphorbia esula",
  "Grevillea banksii",
  "Halogeton glomeratus",
  "Hyptis pectinata",
  "Hyptis suaveolens",
  "Imperata cylindrica",
  "Lagascea mollis",
  "Lepidium latifolium",
  "Malachra alceifolia",
  "Medinilla venosa",
  "Melastoma spp.",
  "Miconia spp.",
  "Mikania micanthra",
  "Mikania scandens",
  "Mimosa invisa",
  "Mimosa pigra",
  "Miscanthus floridulus",
  "Montanoa hibiscifolia",
  "Myrica faya",
  "Oxyspora paniculata",
  "Panicum repens",
  "Passiflora mollissima",
  "Passiflora pulchella",
  "Pennisetum setaceum",
  "Piper aduncum",
  "Pittosporum undulatum",
  "Prosopis juliflora",
  "Pueraria phaseoloides",
  "Rhodomyrtus tomentosa",
  "Rubus argutus",
  "Rubus ellipticus var. obcordatus",
  "Rubus niveus",
  "Rubus sieboldii",
  "Salsola kali",
  "Senecio madagascariensis",
  "Solanum carolinense",
  "Solanum elaeagnifolium",
  "Solanum robustum",
  "Solanum torvum",
  "Sonchus arvensis",
  "Spartium junceum",
  "Stipa trichotoma",
  "Striga spp.",
  "Themeda villosa",
  "Tibouchina spp.",
  "Triumfetta rhomboidea",
  "Triumfetta semitriloba",
  "Ulex europaeus",
  "Urena lobata",
  "Verbascum thapsus",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function captureArtifact() {
  const response = await fetch(ARTIFACT_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Hawaii rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Hawaii rule bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

async function main() {
  if (process.argv.includes("--capture")) {
    await captureArtifact();
  }
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Hawaii rule artifact hash or byte count changed.",
  );
  assert(
    SOURCE_TAXA.length === 79 &&
      new Set(SOURCE_TAXA).size === SOURCE_TAXA.length &&
      SOURCE_TAXA[0] === "Acacia mearnsii" &&
      SOURCE_TAXA.at(-1) === "Verbascum thapsus",
    "Hawaii Chapter 68 reviewed-table transcription changed.",
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const isExactBinomial = (value: string) =>
    /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
  const acceptedEvents = SOURCE_TAXA.flatMap((scientificName, index) => {
    const species = catalogByScientificName.get(scientificName.toLowerCase());
    if (!species || !isExactBinomial(scientificName)) return [];
    const sourceRecordId = `HI-HAR-4-68/list/${String(index + 1).padStart(2, "0")}`;
    return [
      {
        eventId: `${SOURCE_ID}-${species.id}`,
        sourceRecordId,
        originalTaxonText: scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: `Exact Hawaii Administrative Rules Chapter 4-68 designated-list membership, adopted ${LIST_ADOPTED_DATE} and confirmed by the current agency program as of ${AS_OF}, establishes state regulatory applicability only. The source table's island free-or-relatively-free column is retained as context and creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = SOURCE_TAXA.flatMap((scientificName, index) => {
    const species = catalogByScientificName.get(scientificName.toLowerCase());
    if (species && isExactBinomial(scientificName)) return [];
    return [
      {
        sourceRecordId: `HI-HAR-4-68/list/${String(index + 1).padStart(2, "0")}`,
        originalTaxonText: scientificName,
        reason:
          "No exact current catalog binomial was accepted. Genus, variety, synonym, source spelling, or unmatched taxonomy requires separate review. Island free-or-relatively-free context creates no county or ecological determination.",
        reviewStatus: "blocked" as const,
      },
    ];
  });
  assert(
    acceptedEvents.length === 31 && blockedRows.length === 48,
    `Expected 31 accepted and 48 blocked Hawaii rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Hawaii accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "hi-har-4-68-20260801",
    sourceId: SOURCE_ID,
    stateCode: "HI",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/hawaii-har-4-68-current.pdf",
      sha256: ARTIFACT_SHA256,
      bytes: ARTIFACT_BYTES,
      mediaType: "application/pdf",
    },
    acceptedEvents,
    blockedRows,
    attestations: {
      stateApplicabilityOnly: true,
      countyDeterminationCreated: false,
      absenceCreated: false,
      notDetectedCreated: false,
      sourceSilenceCreatedNotApplicable: false,
    },
  };
  fs.writeFileSync(
    path.join(SOURCE_DIRECTORY, "review.json"),
    `${JSON.stringify(review, null, 2)}\n`,
  );
  process.stdout.write(
    `${JSON.stringify(
      {
        sourceId: SOURCE_ID,
        listAdoptedDate: LIST_ADOPTED_DATE,
        sourceRows: SOURCE_TAXA.length,
        acceptedEvents: acceptedEvents.length,
        blockedRows: blockedRows.length,
        islandDeterminationsCreated: 0,
        artifactSha256: ARTIFACT_SHA256,
        artifactBytes: ARTIFACT_BYTES,
        reviewMethod:
          "complete-page-table-transcription-cross-checked-with-pdfplumber-and-rendered-pages",
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
