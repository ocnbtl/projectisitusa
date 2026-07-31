import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type ListClass = "A" | "B" | "C" | "Watch";

type SourceRow = {
  sourceRecordId: string;
  scientificName: string;
  listClass: ListClass;
};

const ROOT = process.cwd();
const SOURCE_ID = "co-8-ccr-1206-2";
const SOURCE_URL =
  "https://ag.colorado.gov/conservation/noxious-weeds/colorado-noxious-weed-list";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260730__co-8-ccr-1206-2__8779e4b8a255",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/colorado-noxious-weed-list-2026.html",
);
const ARTIFACT_SHA256 =
  "8779e4b8a255befa94a2b12620e53f3a640361b1fd0e8f6a1dba87715384eaa5";
const ARTIFACT_BYTES = 124110;
const AS_OF = "2026-07-30";
const RETRIEVED_AT = "2026-07-31T05:07:39.691Z";
const REVIEWED_AT = "2026-07-31T05:16:00.000Z";

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

function sectionRows(
  html: string,
  input: {
    listClass: ListClass;
    start: string;
    end?: string;
    expectedRows: number;
  },
) {
  const startIndex = html.indexOf(input.start);
  const endIndex = input.end
    ? html.indexOf(input.end, startIndex + input.start.length)
    : html.length;
  assert(
    startIndex >= 0 && endIndex > startIndex,
    `Cannot resolve Colorado List ${input.listClass} source span.`,
  );
  const section = html.slice(startIndex, endIndex);
  const rows = [...section.matchAll(/<em>([\s\S]*?)<\/em>/gu)].map(
    (match, index): SourceRow => ({
      sourceRecordId: `CCR-1206-2/list-${input.listClass.toLowerCase()}/${String(
        index + 1,
      ).padStart(2, "0")}`,
      scientificName: stripMarkup(match[1] ?? ""),
      listClass: input.listClass,
    }),
  );
  assert(
    rows.length === input.expectedRows && rows.every((row) => row.scientificName),
    `Expected ${input.expectedRows} Colorado List ${input.listClass} rows; found ${rows.length}.`,
  );
  return rows;
}

const artifact = fs.readFileSync(ARTIFACT_PATH);
assert(
  artifact.length === ARTIFACT_BYTES &&
    createHash("sha256").update(artifact).digest("hex") === ARTIFACT_SHA256,
  "Colorado browser-serialized official DOM artifact hash or byte count changed.",
);
const html = artifact.toString("utf8");
const listAStart =
  "<a class=\"ck-anchor\" id=\"a\"></a><strong><u>List A Species</u>";
const listBStart =
  "<a class=\"ck-anchor\" id=\"b\"></a><strong><u>List B Species</u>";
const listCStart =
  "<a class=\"ck-anchor\" id=\"c\"></a><strong><u>List C Species</u>";
const watchStart =
  "<a class=\"ck-anchor\" id=\"d\"></a>Watch List Species";
const sourceRows = [
  ...sectionRows(html, {
    listClass: "A",
    start: listAStart,
    end: listBStart,
    expectedRows: 25,
  }),
  ...sectionRows(html, {
    listClass: "B",
    start: listBStart,
    end: listCStart,
    expectedRows: 35,
  }),
  ...sectionRows(html, {
    listClass: "C",
    start: listCStart,
    end: watchStart,
    expectedRows: 18,
  }),
  ...sectionRows(html, {
    listClass: "Watch",
    start: watchStart,
    expectedRows: 18,
  }),
];
assert(sourceRows.length === 96, "Colorado source row denominator changed.");

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
      note: `Exact current Colorado List ${row.listClass} membership as of ${AS_OF} establishes state regulatory applicability only. It creates no county presence, absence, not-detected, or not-applicable claim, and the page's statewide distribution descriptions are not county evidence.`,
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
    originalTaxonText: row.scientificName,
    reason:
      "No exact current catalog binomial was accepted. Synonym, spelling, hybrid, subspecies, aggregate, or multi-taxon expansion requires separate review.",
    reviewStatus: "blocked" as const,
  }))
  .sort((left, right) => compareText(left.sourceRecordId, right.sourceRecordId));
assert(
  acceptedEvents.length === 77 && blockedRows.length === 19,
  `Expected 77 accepted and 19 blocked Colorado rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "Colorado accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "co-8-ccr-1206-2-20260730",
  sourceId: SOURCE_ID,
  stateCode: "CO",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/colorado-noxious-weed-list-2026.html",
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
      rowsByList: Object.fromEntries(
        (["A", "B", "C", "Watch"] as const).map((listClass) => [
          listClass,
          sourceRows.filter((row) => row.listClass === listClass).length,
        ]),
      ),
      acceptedEvents: acceptedEvents.length,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
      captureMethod: "browser-serialized-official-dom",
    },
    null,
    2,
  )}\n`,
);
