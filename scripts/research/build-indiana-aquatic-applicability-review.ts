import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceTaxon = {
  row: number;
  commonName: string;
  scientificName: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "in-312-iac-18-3-23";
const SOURCE_URL =
  "https://www.in.gov/dnr/rules-and-regulations/invasive-species/aquatic-invasive-species-plants/";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__in-312-iac-18-3-23__1fb33cdcf581",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/indiana-aquatic-invasive-species-plants.html",
);
const ARTIFACT_SHA256 =
  "1fb33cdcf581e4ee975ffa6c5fc92b68bdda76ce902eb197a7cebd6f0067880d";
const ARTIFACT_BYTES = 88609;
const AS_OF = "2026-08-01";
const RETRIEVED_AT = "2026-08-01T09:10:08.000Z";
const REVIEWED_AT = "2026-08-01T09:14:00.000Z";

const SOURCE_TAXA: SourceTaxon[] = [
  { row: 1, commonName: "anchored water hyacinth", scientificName: "Eichhornia azurea" },
  { row: 2, commonName: "arrowhead", scientificName: "Sagittaria sagittifolia" },
  { row: 3, commonName: "Asian marshweed or ambulia", scientificName: "Limnophila sessiliflora" },
  { row: 4, commonName: "Brazilian elodea, Brazilian waterweed, anacharis, or egeria", scientificName: "Egeria densa" },
  { row: 5, commonName: "brittle naiad or brittle water nymph", scientificName: "Najas minor" },
  { row: 6, commonName: "Caulerpa or Mediterranean killer algae", scientificName: "Caulerpa taxifolia" },
  { row: 7, commonName: "Chinese water spinach or swamp morning-glory", scientificName: "Ipomoea aquatica" },
  { row: 8, commonName: "curlyleaf pondweed", scientificName: "Potamogeton crispus" },
  { row: 9, commonName: "duck lettuce", scientificName: "Ottelia alismoides" },
  { row: 10, commonName: "Eurasian watermilfoil", scientificName: "Myriophyllum spicatum" },
  { row: 11, commonName: "European frogbit or common frogbit", scientificName: "Hydrocharis morsus-ranae" },
  { row: 12, commonName: "exotic bur-reed", scientificName: "Sparganium erectum" },
  { row: 13, commonName: "flowering rush", scientificName: "Butomus umbellatus" },
  { row: 14, commonName: "giant salvinia", scientificName: "Salvinia auriculata" },
  { row: 15, commonName: "giant salvinia", scientificName: "Salvinia biloba" },
  { row: 16, commonName: "giant salvinia", scientificName: "Salvinia herzogii" },
  { row: 17, commonName: "giant salvinia", scientificName: "Salvinia molesta" },
  { row: 18, commonName: "heartshape or false pickerelweed", scientificName: "Monochoria vaginalis" },
  { row: 19, commonName: "hydrilla or water thyme", scientificName: "Hydrilla verticillata" },
  { row: 20, commonName: "miramar weed, indian swampweed, or hygro", scientificName: "Hygrophilia polysperma" },
  { row: 21, commonName: "monochoria, arrowleaf, or false pickerelweed", scientificName: "Monochoria hastata" },
  { row: 22, commonName: "mosquito fern", scientificName: "Azolla pinnata" },
  { row: 23, commonName: "narrow-leaf cattail", scientificName: "Typha angustifolia" },
  { row: 24, commonName: "oxygen weed or African elodea", scientificName: "Lagarosiphon major" },
  { row: 25, commonName: "parrot feather or parrot feather watermilfoil", scientificName: "Myriophyllum aquaticum" },
  { row: 26, commonName: "starry stonewort", scientificName: "Nitellopsis obtusa" },
  { row: 27, commonName: "water chestnut", scientificName: "Trapa natans" },
  { row: 28, commonName: "water soldier", scientificName: "Stratiotes aloides" },
  { row: 29, commonName: "yellow flag iris or tall yellow iris", scientificName: "Iris pseudacorus" },
  { row: 30, commonName: "yellow floating heart", scientificName: "Nymphoides peltata" },
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
  return `IN-312-IAC-18-3-23/${String(taxon.row).padStart(2, "0")}/${taxonKey}`;
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Indiana aquatic rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Indiana aquatic rule bytes changed after acquisition preflight; review the new artifact before capture.",
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
    "Indiana aquatic rule artifact hash or byte count changed.",
  );
  assert(
    SOURCE_TAXA.length === 30 &&
      new Set(SOURCE_TAXA.map((taxon) => taxon.row)).size === 30 &&
      SOURCE_TAXA[0]?.scientificName === "Eichhornia azurea" &&
      SOURCE_TAXA.at(-1)?.scientificName === "Nymphoides peltata",
    "Indiana aquatic rule transcription changed.",
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
    return [
      {
        eventId: `${SOURCE_ID}-${species.id}`,
        sourceRecordId: sourceRecordId(taxon),
        originalTaxonText: taxon.scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: `Exact Indiana Aquatic Plant Rule 312 IAC 18-3-23 membership, current on the official DNR page as of ${AS_OF}, establishes state regulatory applicability only. The retained row is "${taxon.commonName} (${taxon.scientificName})". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
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
          "No exact current catalog binomial was accepted. Source spelling, synonym, or unmatched taxonomy requires separate review.",
        reviewStatus: "blocked" as const,
      },
    ];
  });
  assert(
    acceptedEvents.length === 20 && blockedRows.length === 10,
    `Expected 20 accepted and 10 blocked Indiana aquatic taxa; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Indiana aquatic accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "in-312-iac-18-3-23-20260801",
    sourceId: SOURCE_ID,
    stateCode: "IN",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/indiana-aquatic-invasive-species-plants.html",
      sha256: ARTIFACT_SHA256,
      bytes: ARTIFACT_BYTES,
      mediaType: "text/html",
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
        sourceRows: SOURCE_TAXA.length,
        acceptedEvents: acceptedEvents.length,
        blockedRows: blockedRows.length,
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
