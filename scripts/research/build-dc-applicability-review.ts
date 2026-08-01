import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceRow = {
  sourceRecordId: string;
  commonName: string;
  scientificName: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "dc-doee-invasive-pollinator-plants";
const SOURCE_URL =
  "https://doee.dc.gov/service/native-and-invasive-pollinator-plants";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__dc-doee-invasive-pollinator-plants__a809591eb8c6",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/native-and-invasive-pollinator-plants.html",
);
const ARTIFACT_SHA256 =
  "a809591eb8c6e77fa9dff216b5c78bb932dcfb0a26bb886ca41d240cd68dfa65";
const ARTIFACT_BYTES = 4468;
const AS_OF = "2026-08-01";
const RETRIEVED_AT = "2026-08-01T05:52:00.000Z";
const REVIEWED_AT = "2026-08-01T05:56:00.000Z";

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

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(response.ok, `DC DOEE acquisition failed with HTTP ${response.status}.`);
  const html = await response.text();
  const heading = html.indexOf("DC INVASIVE POLLINATOR PLANTS");
  const tableStart = html.lastIndexOf("<table", heading);
  const tableEnd = html.indexOf("</table>", heading);
  assert(
    heading >= 0 && tableStart >= 0 && tableEnd > heading,
    "DC DOEE live page lacks the expected invasive-plant table.",
  );
  const artifact = Buffer.from(
    html.slice(tableStart, tableEnd + "</table>".length).replace(/\r\n/gu, "\n"),
    "utf8",
  );
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "DC DOEE live bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

function sourceRows(html: string): SourceRow[] {
  const heading = html.indexOf("DC INVASIVE POLLINATOR PLANTS");
  assert(heading >= 0, "DC DOEE artifact lacks the invasive-plant heading.");
  const tableStart = html.lastIndexOf("<table", heading);
  const tableEnd = html.indexOf("</table>", heading);
  assert(
    tableStart >= 0 && tableEnd > heading,
    "DC DOEE invasive-plant table boundaries changed.",
  );
  const table = html.slice(tableStart, tableEnd + "</table>".length);
  const rows: SourceRow[] = [];
  for (const rowMatch of table.matchAll(/<tr>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...(rowMatch[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)]
      .map((cellMatch) => stripMarkup(cellMatch[1] ?? ""));
    if (cells.length !== 2 || cells[0] === "Common Name") continue;
    const commonName = cells[0];
    const scientificName = cells[1];
    assert(commonName && scientificName, "DC DOEE source row parsing failed.");
    rows.push({
      sourceRecordId: `DC-DOEE/invasive-pollinator-plants/${String(rows.length + 1).padStart(2, "0")}`,
      commonName,
      scientificName,
    });
  }
  assert(
    rows.length === 22 &&
      rows[0]?.scientificName === "Lonicera spp." &&
      rows.at(-1)?.scientificName === "Nandina domestica",
    `Expected the 22-row DC DOEE invasive table, found ${rows.length} rows.`,
  );
  return rows;
}

async function main() {
  if (process.argv.includes("--capture")) {
    await captureArtifact();
  }
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "DC DOEE applicability artifact hash or byte count changed.",
  );
  const rows = sourceRows(artifact.toString("utf8"));
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const acceptedEvents = rows.flatMap((row) => {
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
        priority: "high",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: `Exact official DC DOEE invasive-pollinator guide membership as of ${AS_OF} establishes high-priority District applicability only. The retained row is ${row.commonName} (${row.scientificName}). It creates no regulatory, county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = rows
    .filter((row) => !catalogByScientificName.has(row.scientificName.toLowerCase()))
    .map((row) => ({
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: row.scientificName,
      reason:
        "No exact current catalog binomial was accepted. Genus scope, multiple taxa, abbreviation, source spelling, synonym, or unmatched taxonomy requires separate review.",
      reviewStatus: "blocked" as const,
    }));
  assert(
    acceptedEvents.length === 14 && blockedRows.length === 8,
    `Expected 14 accepted and 8 blocked DC rows, found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  const review = {
    schemaVersion: 1,
    reviewId: "dc-doee-invasive-pollinator-plants-20260801",
    sourceId: SOURCE_ID,
    stateCode: "DC",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/native-and-invasive-pollinator-plants.html",
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
        sourceRows: rows.length,
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
