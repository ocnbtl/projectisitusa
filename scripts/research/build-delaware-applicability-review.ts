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
  listClass: "invasive" | "watch";
  enforcement: "current" | "2028-05-01" | "2029-05-01" | "labeling";
};

const ROOT = process.cwd();
const SOURCE_ID = "de-3-admin-code-806";
const SOURCE_URL =
  "https://agriculture.delaware.gov/plant-industries/nursery-inspection/";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260730__de-3-admin-code-806__fef0758b1329",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/nursery-inspection-2026.html",
);
const ARTIFACT_SHA256 =
  "fef0758b13291962490ca2824350160e21eaf263c21316a885eda70756f315cc";
const ARTIFACT_BYTES = 76699;
const FINAL_ORDER_PATH = path.join(
  ROOT,
  "src/data/research/state-list-source-support",
  "20260730__de-3-admin-code-806__final-order",
  "may-2026-register.pdf",
);
const FINAL_ORDER_SHA256 =
  "9b303812d44cdb8820417df3eb03efc27b1a9bd0535be55345aaff295fc64674";
const FINAL_ORDER_BYTES = 1217965;
const AS_OF = "2026-07-30";
const RETRIEVED_AT = "2026-07-31T04:19:47.000Z";
const REVIEWED_AT = "2026-07-31T04:42:00.000Z";

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

function stripMarkup(value: string) {
  return decodeHtml(value)
    .replace(/<[^>]+>/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function between(value: string, start: string, end: string) {
  const startIndex = value.indexOf(start);
  const endIndex = value.indexOf(end, startIndex + start.length);
  assert(
    startIndex >= 0 && endIndex > startIndex,
    `Cannot resolve Delaware source span ${start} through ${end}.`,
  );
  return value.slice(startIndex, endIndex);
}

function taxonRows(input: {
  html: string;
  sourceSection: string;
  listClass: SourceRow["listClass"];
  enforcement: SourceRow["enforcement"];
}) {
  const rows: SourceRow[] = [];
  let index = 0;
  for (const match of input.html.matchAll(/<li>([\s\S]*?)<\/li>/gu)) {
    const rowHtml = match[1] ?? "";
    if (!rowHtml.includes("<em>")) continue;
    const scientificName = [...rowHtml.matchAll(/<em>([\s\S]*?)<\/em>/gu)]
      .map((taxonMatch) => stripMarkup(taxonMatch[1] ?? ""))
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    assert(scientificName, "Delaware source taxon parsing failed.");
    index += 1;
    rows.push({
      sourceRecordId: `DDA-806/${input.sourceSection}/${String(index).padStart(2, "0")}`,
      scientificName,
      listClass: input.listClass,
      enforcement: input.enforcement,
    });
  }
  return rows;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertFile(
  filePath: string,
  expectedBytes: number,
  expectedSha256: string,
  label: string,
) {
  const artifact = fs.readFileSync(filePath);
  assert(
    artifact.length === expectedBytes &&
      createHash("sha256").update(artifact).digest("hex") === expectedSha256,
    `${label} hash or byte count changed.`,
  );
}

assertFile(
  ARTIFACT_PATH,
  ARTIFACT_BYTES,
  ARTIFACT_SHA256,
  "Delaware operative-page artifact",
);
assertFile(
  FINAL_ORDER_PATH,
  FINAL_ORDER_BYTES,
  FINAL_ORDER_SHA256,
  "Delaware final-order support artifact",
);
const html = fs.readFileSync(ARTIFACT_PATH, "utf8");
const currentSection = between(
  html,
  "<p><strong>Enforcement In Effect</strong></p>",
  "<p><strong>Newly Added Species &#8211; Enforcement Begins May 1, 2028</strong></p>",
);
const enforcement2028Section = between(
  html,
  "<p><strong>Newly Added Species &#8211; Enforcement Begins May 1, 2028</strong></p>",
  "<p><strong>Newly Added Species &#8211; Enforcement Begins May 1, 2029</strong></p>",
);
const enforcement2029Section = between(
  html,
  "<p><strong>Newly Added Species &#8211; Enforcement Begins May 1, 2029</strong></p>",
  "<p style=\"text-align: center;\"><strong>Enforcement Schedule for Newly Added Species</strong></p>",
);
const exemptionSection = between(
  html,
  "<p style=\"text-align: center;\"><strong>Exemptions to the Invasive Plant List.</strong></p>",
  "<h2>Plant Watch List</h2>",
);
const watchSection = between(
  html,
  "<h2>Plant Watch List</h2>",
  "<h3>Resources and Signage for Nursery Use</h3>",
);

const currentRows = taxonRows({
  html: currentSection,
  sourceSection: "invasive-current",
  listClass: "invasive",
  enforcement: "current",
});
const enforcement2028Rows = taxonRows({
  html: enforcement2028Section,
  sourceSection: "invasive-enforcement-2028",
  listClass: "invasive",
  enforcement: "2028-05-01",
});
const enforcement2029Rows = taxonRows({
  html: enforcement2029Section,
  sourceSection: "invasive-enforcement-2029",
  listClass: "invasive",
  enforcement: "2029-05-01",
});
const watchRows = taxonRows({
  html: watchSection,
  sourceSection: "watch-labeling",
  listClass: "watch",
  enforcement: "labeling",
});
assert(
  currentRows.length === 35 &&
    enforcement2028Rows.length === 2 &&
    enforcement2029Rows.length === 2 &&
    watchRows.length === 1,
  `Expected 35 current, 2 enforcement-2028, 2 enforcement-2029, and 1 watch row; found ${currentRows.length}, ${enforcement2028Rows.length}, ${enforcement2029Rows.length}, and ${watchRows.length}.`,
);
const sourceRows = [
  ...currentRows,
  ...enforcement2028Rows,
  ...enforcement2029Rows,
  ...watchRows,
];

const exemptionNames = [...exemptionSection.matchAll(/<li>EXEMPT:\s*([\s\S]*?)<\/li>/gu)]
  .map((match) => stripMarkup(match[1] ?? ""));
assert(
  exemptionNames.length === 12,
  `Expected 12 Delaware cultivar exemptions, found ${exemptionNames.length}.`,
);
const exemptionGroups = [
  ...Array.from({ length: 5 }, () => "chinese-fountaingrass"),
  ...Array.from({ length: 4 }, () => "chinese-silvergrass"),
  ...Array.from({ length: 3 }, () => "japanese-barberry"),
];
const exemptionCounters = new Map<string, number>();
const exemptionRows = exemptionNames.map((name, index) => {
  const group = exemptionGroups[index];
  assert(group, `Missing cultivar exemption group for row ${index + 1}.`);
  const groupIndex = (exemptionCounters.get(group) ?? 0) + 1;
  exemptionCounters.set(group, groupIndex);
  return {
    sourceRecordId: `DDA-806/cultivar-exemption/${group}/${String(groupIndex).padStart(2, "0")}`,
    originalTaxonText: name,
    reason:
      "The official row is a named cultivar exemption. It is retained as regulatory context and does not establish species-level not-applicability.",
    reviewStatus: "blocked" as const,
  };
});

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.toLowerCase(), species]),
);
const acceptedEvents = sourceRows.flatMap((row) => {
  const species = catalogByScientificName.get(row.scientificName.toLowerCase());
  if (!species) return [];
  const timing =
    row.enforcement === "current"
      ? "current enforcement"
      : row.enforcement === "labeling"
        ? "current watch-list labeling"
        : `enforcement beginning ${row.enforcement}`;
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
      note: `Exact current Delaware ${row.listClass}-list membership as of ${AS_OF} establishes state regulatory applicability only (${timing}). It does not establish county presence or species-level not-applicability for exempt cultivars.`,
    },
  ];
});
const unmatchedRows = sourceRows
  .filter(
    (row) => !catalogByScientificName.has(row.scientificName.toLowerCase()),
  )
  .map((row) => ({
    sourceRecordId: row.sourceRecordId,
    originalTaxonText: row.scientificName,
    reason:
      "No exact current catalog binomial was accepted. Subspecies, synonym, spelling, or taxonomy expansion requires separate review.",
    reviewStatus: "blocked" as const,
  }));
const blockedRows = [...unmatchedRows, ...exemptionRows].sort((left, right) =>
  compareText(left.sourceRecordId, right.sourceRecordId),
);
assert(
  acceptedEvents.length === 31 &&
    unmatchedRows.length === 9 &&
    blockedRows.length === 21,
  `Expected 31 accepted, 9 unmatched, and 21 total blocked Delaware rows; found ${acceptedEvents.length}, ${unmatchedRows.length}, and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "Delaware accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "de-3-admin-code-806-20260730",
  sourceId: SOURCE_ID,
  stateCode: "DE",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/nursery-inspection-2026.html",
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
      invasiveRows: sourceRows.filter((row) => row.listClass === "invasive")
        .length,
      watchRows: watchRows.length,
      acceptedEvents: acceptedEvents.length,
      unmatchedRows: unmatchedRows.length,
      cultivarExemptions: exemptionRows.length,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
      finalOrderSha256: FINAL_ORDER_SHA256,
      finalOrderBytes: FINAL_ORDER_BYTES,
    },
    null,
    2,
  )}\n`,
);
