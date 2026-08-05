import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceRow = {
  section: "C" | "J" | "K" | "L";
  row: number;
  originalTaxonText: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "az-r12-4-406";
const SOURCE_URL =
  "https://apps.azsos.gov/public_services/Title_12/12-04.pdf";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260805__az-r12-4-406__416d8c1ef00b",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/arizona-title-12-chapter-4-supp-26-2.pdf",
);
const ARTIFACT_SHA256 =
  "416d8c1ef00b21128bcab7c53efcf5eb4526c0d9170ffa2a34efaf1622a0bb8a";
const ARTIFACT_BYTES = 5_842_257;
const SUPPLEMENT_DATE = "2026-06-30";
const RULE_EFFECTIVE_DATE = "2026-02-01";
const RETRIEVED_AT = "2026-08-05T00:46:49.000Z";
const REVIEWED_AT = "2026-08-05T01:20:00.000Z";

const SOURCE_ROWS: SourceRow[] = [
  { section: "C", row: 1, originalTaxonText: "Hybrid wildlife resulting from interbreeding with a restricted parent species" },
  { section: "C", row: 2, originalTaxonText: "Transgenic species" },
  { section: "J", row: 1, originalTaxonText: "All species of the family Acipenseridae" },
  { section: "J", row: 2, originalTaxonText: "Amia calva" },
  { section: "J", row: 3, originalTaxonText: "Aplodinotus grunniens" },
  { section: "J", row: 4, originalTaxonText: "All species of the genus Astyanax" },
  { section: "J", row: 5, originalTaxonText: "Belonesox belizanus" },
  { section: "J", row: 6, originalTaxonText: "Shark orders, families, and genera listed in R12-4-406(J)(6)" },
  { section: "J", row: 7, originalTaxonText: "All species of the family Centrarchidae" },
  { section: "J", row: 8, originalTaxonText: "All species of the families Cetopsidae and Trichomycteridae" },
  { section: "J", row: 9, originalTaxonText: "All species of the family Channidae" },
  { section: "J", row: 10, originalTaxonText: "Cirrhinus mrigala, Gibelion catla, and Labeo rohita" },
  { section: "J", row: 11, originalTaxonText: "All species of the family Clariidae" },
  { section: "J", row: 12, originalTaxonText: "All species of the family Clupeidae except Dorosoma petenense" },
  { section: "J", row: 13, originalTaxonText: "Ctenopharyngodon idella" },
  { section: "J", row: 14, originalTaxonText: "Cyprinella lutrensis" },
  { section: "J", row: 15, originalTaxonText: "Electrophorus electricus" },
  { section: "J", row: 16, originalTaxonText: "All species of the family Esocidae" },
  { section: "J", row: 17, originalTaxonText: "All species of the family Hiodontidae" },
  { section: "J", row: 18, originalTaxonText: "Hoplias Hydrocynus" },
  { section: "J", row: 19, originalTaxonText: "Hypophthalmichthys molitrix" },
  { section: "J", row: 20, originalTaxonText: "Hypophthalmichthys nobilis" },
  { section: "J", row: 21, originalTaxonText: "All species of the family Ictaluridae" },
  { section: "J", row: 22, originalTaxonText: "All species of the genera Lates and Luciolates" },
  { section: "J", row: 23, originalTaxonText: "All species of the family Lepisosteidae" },
  { section: "J", row: 24, originalTaxonText: "Leuciscus idus" },
  { section: "J", row: 25, originalTaxonText: "Malapterurus electricus" },
  { section: "J", row: 26, originalTaxonText: "All species of the family Moronidae" },
  { section: "J", row: 27, originalTaxonText: "Mylopharyngodon piceus" },
  { section: "J", row: 28, originalTaxonText: "All species of the genus Arapaima" },
  { section: "J", row: 29, originalTaxonText: "All species of the family Percidae" },
  { section: "J", row: 30, originalTaxonText: "All species of the family Petromyzontidae" },
  { section: "J", row: 31, originalTaxonText: "All species of the genus Brachyplatystoma" },
  { section: "J", row: 32, originalTaxonText: "Polyodon spathula" },
  { section: "J", row: 33, originalTaxonText: "All species of the family Potamotrygonidae" },
  { section: "J", row: 34, originalTaxonText: "All species of the genera Pygocentrus, Pygopristis, and Serrasalmus" },
  { section: "J", row: 35, originalTaxonText: "All species of the family Salmonidae" },
  { section: "J", row: 36, originalTaxonText: "Scardinius erythrophthalmus" },
  { section: "J", row: 37, originalTaxonText: "All species of the family Serranidae" },
  { section: "J", row: 38, originalTaxonText: "All species of the genera Silurus and Wallago" },
  { section: "J", row: 39, originalTaxonText: "All species of the family Sisoridae" },
  { section: "J", row: 40, originalTaxonText: "Hybrid forms and abbreviated Tilapia taxa listed in R12-4-406(J)(40)" },
  { section: "J", row: 41, originalTaxonText: "Thymallus arcticus" },
  { section: "K", row: 1, originalTaxonText: "Freshwater species within the five crayfish families listed in R12-4-406(K)(1)" },
  { section: "K", row: 2, originalTaxonText: "Eriocheir sinensis" },
  { section: "K", row: 3, originalTaxonText: "All species of the family Mysidae" },
  { section: "L", row: 1, originalTaxonText: "All species of the family Ampullariidae" },
  { section: "L", row: 2, originalTaxonText: "Corbicula fluminea" },
  { section: "L", row: 3, originalTaxonText: "All species of the genus Cipangopaludina" },
  { section: "L", row: 4, originalTaxonText: "All species of the family Dreissenidae" },
  { section: "L", row: 5, originalTaxonText: "Euglandina rosea" },
  { section: "L", row: 6, originalTaxonText: "Mytilopsis leucophaeata" },
  { section: "L", row: 7, originalTaxonText: "Potamopyrgus antipodarum" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceRecordId(row: SourceRow) {
  return `AZ-R12-4-406/${row.section}/${String(row.row).padStart(2, "0")}`;
}

const artifact = fs.readFileSync(ARTIFACT_PATH);
assert(
  artifact.length === ARTIFACT_BYTES &&
    createHash("sha256").update(artifact).digest("hex") === ARTIFACT_SHA256,
  "Arizona Title 12 Chapter 4 artifact hash or byte count changed.",
);
assert(
  SOURCE_ROWS.length === 53 &&
    SOURCE_ROWS.filter((row) => row.section === "C").length === 2 &&
    SOURCE_ROWS.filter((row) => row.section === "J").length === 41 &&
    SOURCE_ROWS.filter((row) => row.section === "K").length === 3 &&
    SOURCE_ROWS.filter((row) => row.section === "L").length === 7 &&
    new Set(SOURCE_ROWS.map(sourceRecordId)).size === SOURCE_ROWS.length,
  "Arizona R12-4-406(C), (J), (K), and (L) review denominator changed.",
);

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.toLowerCase(), species]),
);
const isExactBinomial = (value: string) =>
  /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);

const acceptedEvents = SOURCE_ROWS.flatMap((row) => {
  const species = catalogByScientificName.get(row.originalTaxonText.toLowerCase());
  if (!species || !isExactBinomial(row.originalTaxonText)) return [];
  return [
    {
      eventId: `${SOURCE_ID}-${row.section.toLowerCase()}-${String(row.row).padStart(2, "0")}-${species.id}`,
      sourceRecordId: sourceRecordId(row),
      originalTaxonText: row.originalTaxonText,
      scientificName: species.scientificName,
      speciesId: species.id,
      applicability: "applicable",
      priority: "regulated",
      matchMethod: "exact-canonical-binomial",
      reviewStatus: "accepted",
      note: `Exact species-level Arizona Administrative Code R12-4-406(${row.section}) membership, effective ${RULE_EFFECTIVE_DATE} in the official supplement dated ${SUPPLEMENT_DATE}, establishes state regulatory applicability only. It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
    },
  ];
});

const blockedRows = SOURCE_ROWS.flatMap((row) => {
  const species = catalogByScientificName.get(row.originalTaxonText.toLowerCase());
  if (species && isExactBinomial(row.originalTaxonText)) return [];
  return [
    {
      sourceRecordId: sourceRecordId(row),
      originalTaxonText: row.originalTaxonText,
      reason:
        "No exact current catalog binomial was accepted. Order, family, genus, hybrid, transgenic, abbreviation, exclusion, multiple-taxon, source-spelling, or unmatched rows require separate review and are not expanded by inference.",
      reviewStatus: "blocked" as const,
    },
  ];
});

const acceptedSpeciesIds = acceptedEvents.map((event) => event.speciesId).sort();
assert(
  acceptedEvents.length + blockedRows.length === SOURCE_ROWS.length,
  "Arizona accepted and blocked rows do not reconcile to the source denominator.",
);
assert(
  acceptedEvents.length === 8 &&
    blockedRows.length === 45 &&
    JSON.stringify(acceptedSpeciesIds) ===
      JSON.stringify([
        "belonesox-belizanus",
        "corbicula-fluminea",
        "ctenopharyngodon-idella",
        "eriocheir-sinensis",
        "hypophthalmichthys-molitrix",
        "hypophthalmichthys-nobilis",
        "mylopharyngodon-piceus",
        "potamopyrgus-antipodarum",
      ]),
  `Expected eight exact catalog matches and 45 blocked rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "Arizona accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "az-r12-4-406-20260805",
  sourceId: SOURCE_ID,
  stateCode: "AZ",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/arizona-title-12-chapter-4-supp-26-2.pdf",
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
      supplementDate: SUPPLEMENT_DATE,
      ruleEffectiveDate: RULE_EFFECTIVE_DATE,
      sourceRows: SOURCE_ROWS.length,
      rowsBySection: Object.fromEntries(
        (["C", "J", "K", "L"] as const).map((section) => [
          section,
          SOURCE_ROWS.filter((row) => row.section === section).length,
        ]),
      ),
      acceptedEvents: acceptedEvents.length,
      acceptedSpecies: acceptedSpeciesIds,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
      acquisitionMethod: "official-pdf-direct-download-with-browser-headers",
      reviewMethod:
        "complete-r12-4-406-c-j-k-l-row-transcription-cross-checked-with-pdf-text-and-rendered-pages-74-through-76",
    },
    null,
    2,
  )}\n`,
);
