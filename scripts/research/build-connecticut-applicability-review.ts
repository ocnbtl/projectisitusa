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
  effectiveDate: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "ct-cgs-22a-381d";
const SOURCE_URL = "https://prdext2.cga.ct.gov/2026/sup/chap_446i.htm";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260730__ct-cgs-22a-381d__b4ed0a14d703",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/chapter-446i-2026.html",
);
const ARTIFACT_SHA256 =
  "b4ed0a14d70359846b21935d895c1d6bf3eb89e89506b51fd3c092fbd6db472c";
const ARTIFACT_BYTES = 53329;
const AS_OF = "2026-07-30";
const RETRIEVED_AT = "2026-07-31T03:59:00.000Z";
const REVIEWED_AT = "2026-07-31T04:03:00.000Z";

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
    .replace(/&quot;/gu, "\"")
    .replace(/&amp;/gu, "&")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function sectionText(html: string) {
  const start = html.indexOf('id="sec_22a-381d"');
  assert(start >= 0, "Connecticut artifact lacks section 22a-381d.");
  const nextSection = html.indexOf('class="catchln" id="sec_', start + 1);
  const section = html.slice(start, nextSection >= 0 ? nextSection : undefined);
  return decodeHtml(section.replace(/<[^>]+>/gu, " ").replace(/\s+/gu, " ").trim());
}

function between(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert(
    startIndex >= 0 && endIndex > startIndex,
    `Cannot resolve Connecticut source span ${start} through ${end}.`,
  );
  return value.slice(startIndex, endIndex);
}

function listedRows(input: {
  text: string;
  subsection: string;
  effectiveDate: string;
  markerPattern: RegExp;
}) {
  const rows: SourceRow[] = [];
  for (const match of input.text.matchAll(input.markerPattern)) {
    const marker = match[1]?.toLowerCase();
    const scientificName = match[2]?.trim();
    assert(marker && scientificName, "Connecticut source row parsing failed.");
    rows.push({
      sourceRecordId: `CT-CGS-22a-381d/${input.subsection}/${marker}`,
      scientificName,
      effectiveDate: input.effectiveDate,
    });
  }
  return rows;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const html = fs.readFileSync(ARTIFACT_PATH, "utf8");
const artifact = fs.readFileSync(ARTIFACT_PATH);
assert(
  artifact.length === ARTIFACT_BYTES &&
    createHash("sha256").update(artifact).digest("hex") === ARTIFACT_SHA256,
  "Connecticut applicability artifact hash or byte count changed.",
);
const section = sectionText(html);
const subsectionA = between(section, "(a) Except", "(b) (1) Except");
const subsectionB1 = between(section, "(b) (1) Except", "(2) Except");
const subsectionB2 = between(section, "(2) Except", "(3) Except");
const subsectionB3 = between(section, "(3) Except", "(4) Except");
const subsectionB4 = between(section, "(4) Except", "(5) Except");
const subsectionB5 = between(section, "(5) Except", "(c) Except");

const activeRows = [
  ...listedRows({
    text: subsectionA,
    subsection: "a",
    effectiveDate: "2004-05-05",
    markerPattern: /\(([0-9]+)\)\s+[^()]*\(([A-Z][^)]+)\)/gu,
  }),
  ...listedRows({
    text: subsectionB1,
    subsection: "b-1",
    effectiveDate: "2005-10-01",
    markerPattern: /\(([A-S])\)\s+[^()]*\(([A-Z][^)]+)\)/gu,
  }),
  ...listedRows({
    text: subsectionB2,
    subsection: "b-2",
    effectiveDate: "2024-10-01",
    markerPattern: /\(([A-F])\)\s+[^()]*\(([A-Z][^)]+)\)/gu,
  }),
];
assert(
  activeRows.length === 87,
  `Expected 87 currently effective Connecticut rows, found ${activeRows.length}.`,
);
const futureB3 = /callery pear \(([^)]+)\)/iu.exec(subsectionB3)?.[1];
const futureB5 = /Norway maple \(([^)]+)\)/u.exec(subsectionB5)?.[1];
assert(futureB3 && futureB5, "Connecticut future-effective singleton rows changed.");
const futureRows = [
  {
    sourceRecordId: "CT-CGS-22a-381d/b-3",
    scientificName: futureB3,
    effectiveDate: "2027-10-01",
  },
  ...listedRows({
    text: subsectionB4,
    subsection: "b-4",
    effectiveDate: "2028-10-01",
    markerPattern: /\(([A-H])\)\s+[^()]*\(([A-Z][^)]+)\)/gu,
  }),
  {
    sourceRecordId: "CT-CGS-22a-381d/b-5",
    scientificName: futureB5,
    effectiveDate: "2030-10-01",
  },
];
assert(
  futureRows.length === 10,
  `Expected 10 future-effective Connecticut rows, found ${futureRows.length}.`,
);

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.toLowerCase(), species]),
);
const acceptedEvents = activeRows.flatMap((row) => {
  const species = catalogByScientificName.get(row.scientificName.toLowerCase());
  if (!species) return [];
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
      note: `Exact currently effective Connecticut statutory list membership as of ${AS_OF} establishes state regulatory applicability only.`,
    },
  ];
});
const blockedRows = [
  ...activeRows
    .filter(
      (row) =>
        !catalogByScientificName.has(row.scientificName.toLowerCase()),
    )
    .map((row) => ({
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: row.scientificName,
      reason:
        "No exact current catalog binomial was accepted. Synonym, spelling, hybrid, or taxonomy expansion requires separate review.",
      reviewStatus: "blocked",
    })),
  ...futureRows.map((row) => ({
    sourceRecordId: row.sourceRecordId,
    originalTaxonText: row.scientificName,
    reason: `The statutory restriction is not effective until ${row.effectiveDate}; it is preserved for future review and does not establish current applicability as of ${AS_OF}.`,
    reviewStatus: "blocked",
  })),
].sort((left, right) =>
  compareText(left.sourceRecordId, right.sourceRecordId),
);
assert(
  acceptedEvents.length === 63 && blockedRows.length === 34,
  `Expected 63 accepted and 34 blocked Connecticut rows, found ${acceptedEvents.length} and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "Connecticut accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "ct-cgs-22a-381d-20260730",
  sourceId: SOURCE_ID,
  stateCode: "CT",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/chapter-446i-2026.html",
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
      activeRows: activeRows.length,
      futureRows: futureRows.length,
      acceptedEvents: acceptedEvents.length,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
    },
    null,
    2,
  )}\n`,
);
