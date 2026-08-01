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
const SOURCE_ID = "oh-oac-901-5-30-01";
const SOURCE_URL =
  "https://codes.ohio.gov/ohio-administrative-code/chapter-901%3A5-30";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__oh-oac-901-5-30-01__b318d9a9c44c",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/ohio-oac-901-5-30-current.html",
);
const ARTIFACT_SHA256 =
  "b318d9a9c44c73665ce871513ed0c4f9aaeb7db898bb728e2b2fcf0f6277e811";
const ARTIFACT_BYTES = 29916;
const AS_OF = "2026-08-01";
const EFFECTIVE_DATE = "2023-02-13";
const RETRIEVED_AT = "2026-08-01T09:22:00.000Z";
const REVIEWED_AT = "2026-08-01T09:27:00.000Z";
const EXPECTED_ACCEPTED = 45;
const EXPECTED_BLOCKED = 18;

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
  return `OH-OAC-901-5-30-01/${String(taxon.row).padStart(2, "0")}/${taxonKey}`;
}

function parseSourceTaxa(artifact: Buffer): SourceTaxon[] {
  const html = artifact.toString("utf8");
  const start = html.indexOf("paragraphs (A)(1) to (A)(63)");
  const end = html.indexOf("</span>", start);
  assert(start >= 0 && end > start, "Ohio rule section was not found.");
  const section = html.slice(start, end);
  const rows = [...section.matchAll(
    /<p class='first-paragraph level-2'>\((\d+)\) ([\s\S]*?)<\/p>/gu,
  )]
    .map((match) => ({ row: Number(match[1]), text: match[2] ?? "" }))
    .filter((entry) => entry.row >= 1 && entry.row <= 63)
    .slice(0, 63)
    .map((entry) => {
      const text = entry.text
        .replace(/<[^>]+>/gu, "")
        .replace(/&amp;/gu, "&")
        .replace(/; and$/u, "")
        .replace(/[.;]$/u, "")
        .trim();
      const separator = text.search(/[,;]/u);
      assert(separator > 0, `Ohio rule row ${entry.row} lacks a taxon delimiter.`);
      return {
        row: entry.row,
        scientificName: text.slice(0, separator).trim(),
        commonName: text.slice(separator + 1).trim(),
      };
    });
  assert(
    rows.length === 63 &&
      rows.every((entry, index) => entry.row === index + 1) &&
      rows[0]?.scientificName === "Ailanthus altissima" &&
      rows.at(-1)?.scientificName === "Vincetoxicum nigrum",
    "Ohio rule did not yield the expected contiguous 63-row list.",
  );
  return rows;
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Ohio rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Ohio rule bytes changed after acquisition preflight; review the new artifact before capture.",
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
    "Ohio rule artifact hash or byte count changed.",
  );
  const sourceTaxa = parseSourceTaxa(artifact);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const isExactBinomial = (value: string) =>
    /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
  const acceptedEvents = sourceTaxa.flatMap((taxon) => {
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
        note: `Exact Ohio Administrative Code Rule 901:5-30-01 invasive-plant membership, effective ${EFFECTIVE_DATE} and current as of ${AS_OF}, establishes state regulatory applicability only. The retained row is "${taxon.scientificName}, ${taxon.commonName}". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = sourceTaxa.flatMap((taxon) => {
    const species = catalogByScientificName.get(
      taxon.scientificName.toLowerCase(),
    );
    if (species && isExactBinomial(taxon.scientificName)) return [];
    return [
      {
        sourceRecordId: sourceRecordId(taxon),
        originalTaxonText: `${taxon.scientificName}, ${taxon.commonName}`,
        reason:
          "No exact current catalog binomial was accepted. Subspecies, variety, hybrid, source spelling, synonym, or unmatched taxonomy requires separate review.",
        reviewStatus: "blocked" as const,
      },
    ];
  });
  assert(
    acceptedEvents.length === EXPECTED_ACCEPTED &&
      blockedRows.length === EXPECTED_BLOCKED,
    `Expected ${EXPECTED_ACCEPTED} accepted and ${EXPECTED_BLOCKED} blocked Ohio taxa; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Ohio accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "oh-oac-901-5-30-01-20260801",
    sourceId: SOURCE_ID,
    stateCode: "OH",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/ohio-oac-901-5-30-current.html",
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
        sourceRows: sourceTaxa.length,
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
