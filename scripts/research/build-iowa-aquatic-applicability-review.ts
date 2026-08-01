import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceTaxon = {
  row: number;
  category: "plant" | "fish" | "invertebrate";
  commonName: string;
  scientificName: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "ia-571-iac-90-2";
const SOURCE_URL =
  "https://www.legis.iowa.gov/docs/ACO/chapter/571.90.pdf";
const RULEMAKING_URL =
  "https://www.legis.iowa.gov/docs/aco/arc/0278D.pdf";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__ia-571-iac-90-2__caff2c77f3e9",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/iowa-571-iac-90-current.pdf",
);
const ARTIFACT_SHA256 =
  "caff2c77f3e9fd8ede3dc46a2b7cd33663dbf639b319342b85bde3faa51679d8";
const ARTIFACT_BYTES = 120451;
const AS_OF = "2026-08-01";
const EFFECTIVE_DATE = "2026-06-17";
const RETRIEVED_AT = "2026-08-01T06:52:00.000Z";
const REVIEWED_AT = "2026-08-01T06:57:00.000Z";

const SOURCE_TAXA: SourceTaxon[] = [
  { row: 1, category: "plant", commonName: "Brittle naiad", scientificName: "Najas minor" },
  { row: 2, category: "plant", commonName: "Curlyleaf pondweed", scientificName: "Potamogeton crispus" },
  { row: 3, category: "plant", commonName: "Eurasian watermilfoil", scientificName: "Myriophyllum spicatum" },
  { row: 4, category: "plant", commonName: "Flowering rush", scientificName: "Butomus umbellatus" },
  { row: 5, category: "plant", commonName: "Purple loosestrife", scientificName: "Lythrum salicaria" },
  { row: 5, category: "plant", commonName: "Purple loosestrife", scientificName: "Lythrum virgatum" },
  { row: 6, category: "plant", commonName: "Salt cedar", scientificName: "Tamarix spp." },
  { row: 7, category: "fish", commonName: "Bighead carp", scientificName: "Hypophthalmichthys nobilis" },
  { row: 8, category: "fish", commonName: "Black carp", scientificName: "Mylopharyngodon piceus" },
  { row: 9, category: "fish", commonName: "Round goby", scientificName: "Neogobius melanostomus" },
  { row: 10, category: "fish", commonName: "Rudd", scientificName: "Scardinius erythrophthalmus" },
  { row: 11, category: "fish", commonName: "Ruffe", scientificName: "Gymnocephalus cernuus" },
  { row: 12, category: "fish", commonName: "Silver carp", scientificName: "Hypophthalmichthys molitrix" },
  { row: 13, category: "fish", commonName: "White perch", scientificName: "Morone americana" },
  { row: 14, category: "invertebrate", commonName: "Fishhook waterflea", scientificName: "Cercopagis pengoi" },
  { row: 15, category: "invertebrate", commonName: "New Zealand mudsnail", scientificName: "Potamopyrgus antipodarum" },
  { row: 16, category: "invertebrate", commonName: "Quagga mussel", scientificName: "Dreissena bugensis" },
  { row: 17, category: "invertebrate", commonName: "Rusty crayfish", scientificName: "Orconectes rusticus" },
  { row: 18, category: "invertebrate", commonName: "Spiny waterflea", scientificName: "Bythotrephes cederstroemi" },
  { row: 19, category: "invertebrate", commonName: "Zebra mussel", scientificName: "Dreissena polymorpha" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRecordId(taxon: SourceTaxon) {
  const taxonKey = taxon.scientificName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  return `IA-571-IAC-90.2/${taxon.category}/${String(taxon.row).padStart(2, "0")}/${taxonKey}`;
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Iowa rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Iowa rule bytes changed after acquisition preflight; review the new artifact before capture.",
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
    "Iowa rule artifact hash or byte count changed.",
  );
  assert(
    SOURCE_TAXA.length === 20 &&
      new Set(SOURCE_TAXA.map((taxon) => `${taxon.row}:${taxon.scientificName}`)).size === SOURCE_TAXA.length &&
      new Set(SOURCE_TAXA.map((taxon) => taxon.row)).size === 19 &&
      SOURCE_TAXA[0]?.scientificName === "Najas minor" &&
      SOURCE_TAXA.at(-1)?.scientificName === "Dreissena polymorpha",
    "Iowa Chapter 571.90 reviewed-list transcription changed.",
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const isExactBinomial = (value: string) =>
    /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
  const acceptedEvents = SOURCE_TAXA.flatMap((taxon) => {
    const species = catalogByScientificName.get(
      taxon.scientificName.toLowerCase(),
    );
    if (!species || !isExactBinomial(taxon.scientificName)) return [];
    const recordId = sourceRecordId(taxon);
    return [
      {
        eventId: `${SOURCE_ID}-${species.id}`,
        sourceRecordId: recordId,
        originalTaxonText: taxon.scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: `Exact Iowa Administrative Code Chapter 571.90.2 aquatic-invasive-species membership, effective ${EFFECTIVE_DATE} and current as of ${AS_OF}, establishes state regulatory applicability only. The retained row is "${taxon.commonName} (${taxon.scientificName})". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = SOURCE_TAXA.flatMap((taxon) => {
    const species = catalogByScientificName.get(
      taxon.scientificName.toLowerCase(),
    );
    if (species && isExactBinomial(taxon.scientificName)) return [];
    return [
      {
        sourceRecordId: sourceRecordId(taxon),
        originalTaxonText: `${taxon.commonName} (${taxon.scientificName})`,
        reason:
          "No exact current catalog binomial was accepted. Genus, source spelling, synonym, or unmatched taxonomy requires separate review.",
        reviewStatus: "blocked" as const,
      },
    ];
  });
  assert(
    acceptedEvents.length === 13 && blockedRows.length === 7,
    `Expected 13 accepted and 7 blocked Iowa taxa; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Iowa accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "ia-571-iac-90-2-20260801",
    sourceId: SOURCE_ID,
    stateCode: "IA",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/iowa-571-iac-90-current.pdf",
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
        rulemakingUrl: RULEMAKING_URL,
        effectiveDate: EFFECTIVE_DATE,
        sourceRows: 19,
        reviewedTaxa: SOURCE_TAXA.length,
        acceptedEvents: acceptedEvents.length,
        blockedRows: blockedRows.length,
        incorporatedFederalListsProcessed: false,
        artifactSha256: ARTIFACT_SHA256,
        artifactBytes: ARTIFACT_BYTES,
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
