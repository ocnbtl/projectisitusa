import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceRow = {
  sourceRecordId: string;
  scientificName: string;
  sourceRowText: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "ca-3-ccr-4500";
const SOURCE_URL =
  "https://govt.westlaw.com/calregs/Document/IA726D610093D11EFB745E3F7EC85B8C4?needToInjectTerms=False&originationContext=document&transitionType=Default&viewType=FullText";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260730__ca-3-ccr-4500__f305ea2e7205",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/california-3-ccr-4500-2026.html",
);
const ARTIFACT_SHA256 =
  "f305ea2e7205067ca00bc4c565866b44849278eb5883a4a6d9dfc966e3d730fd";
const ARTIFACT_BYTES = 44693;
const AS_OF = "2026-07-30";
const RETRIEVED_AT = "2026-07-31T05:27:52.798Z";
const REVIEWED_AT = "2026-07-31T05:32:00.000Z";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function decodeHtml(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#([0-9]+);/gu, (_match, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&nbsp;/gu, " ")
    .replace(/&quot;/gu, "\"")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function stripMarkup(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const artifact = fs.readFileSync(ARTIFACT_PATH);
assert(
  artifact.length === ARTIFACT_BYTES &&
    createHash("sha256").update(artifact).digest("hex") === ARTIFACT_SHA256,
  "California browser-serialized current-code artifact hash or byte count changed.",
);
const html = artifact.toString("utf8");
assert(
  html.includes("This database is current through 7/17/26 Register 2026, No. 29."),
  "California regulation currentness marker changed.",
);
const startIndex = html.indexOf(
  "It has been determined that the following species of plants are noxious weeds",
);
const endIndex = html.indexOf(
  "This regulation shall in no way restrict",
  startIndex,
);
assert(
  startIndex >= 0 && endIndex > startIndex,
  "Cannot resolve the California Section 4500 taxon span.",
);
const sourceRows = [
  ...html
    .slice(startIndex, endIndex)
    .matchAll(
      /<div class="co_paragraph"[^>]*><div class="co_paragraphText co_indentLeft1">([\s\S]*?)<\/div><\/div>/gu,
    ),
].map((match, index): SourceRow => {
  const rowHtml = match[1] ?? "";
  const taxonMatch = rowHtml.match(/<em>([\s\S]*?)<\/em>/u);
  assert(taxonMatch, `California row ${index + 1} has no emphasized taxon.`);
  return {
    sourceRecordId: `3-CCR-4500/${String(index + 1).padStart(3, "0")}`,
    scientificName: stripMarkup(taxonMatch[1] ?? ""),
    sourceRowText: stripMarkup(rowHtml),
  };
});
assert(
  sourceRows.length === 176 &&
    sourceRows.every((row) => row.scientificName && row.sourceRowText),
  `Expected 176 California regulatory rows; found ${sourceRows.length}.`,
);

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.toLowerCase(), species]),
);
const isExactBinomial = (value: string) =>
  /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
const acceptedEvents = sourceRows.flatMap((row) => {
  const species = catalogByScientificName.get(row.scientificName.toLowerCase());
  if (!species || !isExactBinomial(row.scientificName)) return [];
  return [
    {
      eventId: `${SOURCE_ID}-${species.id}`,
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: row.scientificName,
      scientificName: species.scientificName,
      speciesId: species.id,
      applicability: "applicable",
      priority: "regulated",
      matchMethod: "exact-canonical-binomial",
      reviewStatus: "accepted",
      note: `Exact current California 3 CCR Section 4500 membership as of ${AS_OF} establishes state regulatory applicability only. The retained source row is "${row.sourceRowText}". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
    },
  ];
});
const blockedRows = sourceRows
  .filter((row) => {
    const species = catalogByScientificName.get(row.scientificName.toLowerCase());
    return !species || !isExactBinomial(row.scientificName);
  })
  .map((row) => ({
    sourceRecordId: row.sourceRecordId,
    originalTaxonText: row.sourceRowText,
    reason:
      "No exact current catalog binomial was accepted. Synonym, spelling, hybrid, variety, genus, aggregate, condition, or unmatched taxonomy requires separate review.",
    reviewStatus: "blocked" as const,
  }))
  .sort((left, right) => compareText(left.sourceRecordId, right.sourceRecordId));
assert(
  acceptedEvents.length === 86 && blockedRows.length === 90,
  `Expected 86 accepted and 90 blocked California rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "California accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "ca-3-ccr-4500-20260730",
  sourceId: SOURCE_ID,
  stateCode: "CA",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/california-3-ccr-4500-2026.html",
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
      currentThrough: "2026-07-17",
      register: "2026-29",
      regulatoryRows: sourceRows.length,
      acceptedEvents: acceptedEvents.length,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
      captureMethod: "browser-serialized-designated-current-code-dom",
    },
    null,
    2,
  )}\n`,
);
