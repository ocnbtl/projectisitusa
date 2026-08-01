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
  limitation: string;
  listClass: "prohibited" | "restricted";
};

const ROOT = process.cwd();
const SOURCE_ID = "ga-40-12-4-01";
const SOURCE_URL = "https://rules.sos.ga.gov/gac/40-12-4";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__ga-40-12-4-01__540ff38116a4",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/georgia-40-12-4-2026.html",
);
const ARTIFACT_SHA256 =
  "540ff38116a41dd03faa9613a750a26a14b83f2ca0241214afd39e992ac24828";
const ARTIFACT_BYTES = 16541;
const AS_OF = "2026-08-01";
const RETRIEVED_AT = "2026-08-01T06:12:55.000Z";
const REVIEWED_AT = "2026-08-01T06:17:00.000Z";

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
  assert(
    response.ok,
    `Georgia rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Georgia rule bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

function sourceRows(html: string): SourceRow[] {
  const tables = [...html.matchAll(/<TABLE border="1">([\s\S]*?)<\/TABLE>/gu)];
  assert(tables.length === 2, `Expected two Georgia rule tables, found ${tables.length}.`);
  return tables.flatMap((tableMatch, tableIndex) => {
    const listClass = tableIndex === 0 ? "prohibited" : "restricted";
    const rows: SourceRow[] = [];
    for (const rowMatch of (tableMatch[1] ?? "").matchAll(
      /<TR>([\s\S]*?)<\/TR>/gu,
    )) {
      const cells = [...(rowMatch[1] ?? "").matchAll(/<TD[^>]*>([\s\S]*?)<\/TD>/gu)].map(
        (cellMatch) => stripMarkup(cellMatch[1] ?? ""),
      );
      if (cells.length !== 2 || cells[0] === "Name") continue;
      const sourceRowText = cells[0];
      const limitation = cells[1];
      assert(sourceRowText && limitation, "Georgia source row parsing failed.");
      const taxonMatch = sourceRowText.match(/\(([^)]+)\)/u);
      assert(taxonMatch, `Georgia row lacks parenthesized taxonomy: ${sourceRowText}`);
      const scientificName = (taxonMatch[1] ?? "").replace(/\s+/gu, " ").trim();
      rows.push({
        sourceRecordId: `GA-40-12-4-.01/${listClass}/${String(rows.length + 1).padStart(2, "0")}`,
        scientificName,
        sourceRowText,
        limitation,
        listClass,
      });
    }
    return rows;
  });
}

async function main() {
  if (process.argv.includes("--capture")) {
    await captureArtifact();
  }
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Georgia rule artifact hash or byte count changed.",
  );
  const html = artifact.toString("utf8");
  assert(
    html.includes("7 C.F.R. 360 Noxious Weed Regulations is") &&
      html.includes("hereby incorporated by reference"),
    "Georgia rule no longer exposes the federal incorporation marker.",
  );
  const rows = sourceRows(html);
  assert(
    rows.length === 40 &&
      rows.filter((row) => row.listClass === "prohibited").length === 11 &&
      rows.filter((row) => row.listClass === "restricted").length === 29 &&
      rows[0]?.scientificName === "Cardiospermum halicacabum" &&
      rows.at(-1)?.scientificName === "Cirsium arvense",
    `Expected 11 prohibited and 29 restricted Georgia rows, found ${rows.length} total.`,
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const isExactBinomial = (value: string) =>
    /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
  const acceptedEvents = rows.flatMap((row) => {
    const species = catalogByScientificName.get(row.scientificName.toLowerCase());
    if (!species || !isExactBinomial(row.scientificName)) return [];
    return [
      {
        eventId: `${SOURCE_ID}-${row.listClass}-${species.id}`,
        sourceRecordId: row.sourceRecordId,
        originalTaxonText: row.scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: `Exact current Georgia Rule 40-12-4-.01 ${row.listClass} noxious-seed membership as of ${AS_OF} establishes state seed-commerce regulatory applicability only. The retained row is "${row.sourceRowText}" with limitation "${row.limitation}". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = rows
    .filter((row) => {
      const species = catalogByScientificName.get(
        row.scientificName.toLowerCase(),
      );
      return !species || !isExactBinomial(row.scientificName);
    })
    .map((row) => ({
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: row.sourceRowText,
      reason:
        "No exact current catalog binomial was accepted. Genus, composite, source spelling, variety, exception, or unmatched taxonomy requires separate review.",
      reviewStatus: "blocked" as const,
    }));
  assert(
    acceptedEvents.length === 18 &&
      new Set(acceptedEvents.map((event) => event.speciesId)).size === 16 &&
      blockedRows.length === 22,
    `Expected 18 accepted events across 16 species and 22 blocked Georgia rows; found ${acceptedEvents.length}, ${new Set(acceptedEvents.map((event) => event.speciesId)).size}, and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Georgia accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "ga-40-12-4-01-20260801",
    sourceId: SOURCE_ID,
    stateCode: "GA",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/georgia-40-12-4-2026.html",
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
        prohibitedRows: rows.filter((row) => row.listClass === "prohibited")
          .length,
        restrictedRows: rows.filter((row) => row.listClass === "restricted")
          .length,
        acceptedEvents: acceptedEvents.length,
        acceptedSpecies: new Set(acceptedEvents.map((event) => event.speciesId))
          .size,
        blockedRows: blockedRows.length,
        reusedFederalSource: "usda-aphis-federal-noxious-weeds",
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
