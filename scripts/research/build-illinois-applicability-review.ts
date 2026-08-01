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
  effective: "current" | "future";
};

const ROOT = process.cwd();
const SOURCE_ID = "il-17-iac-1100";
const SOURCE_URL =
  "https://www.ilga.gov/ftp/JCAR/AdminCode/017/017011000000300R.html";
const AUTHORITY_URL =
  "https://www.ilga.gov/agencies/JCAR/EntirePart?titlepart=01701100";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__il-17-iac-1100__231ac5b37c4d",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/illinois-17-iac-1100-30.html",
);
const ARTIFACT_SHA256 =
  "231ac5b37c4dd4143b69c40ce85acb7a5f522e125cf3ae556e68c5252e56ccfd";
const ARTIFACT_BYTES = 18054;
const AS_OF = "2026-08-01";
const RETRIEVED_AT = "2026-08-01T06:44:00.000Z";
const REVIEWED_AT = "2026-08-01T06:49:00.000Z";

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
    `Illinois rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Illinois rule bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

function sourceRows(html: string): SourceRow[] {
  const tableMatch = html.match(
    /<table class=MsoNormalTable[\s\S]*?<\/table>/u,
  );
  assert(tableMatch, "Illinois official list table was not found.");
  const rows: SourceRow[] = [];
  for (const rowMatch of tableMatch[0].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gu)) {
    const cells = [...(rowMatch[1] ?? "").matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gu)].map(
      (cellMatch) => stripMarkup(cellMatch[1] ?? ""),
    );
    if (
      cells.length !== 2 ||
      cells[0] === "COMMON NAME" ||
      !cells[0] ||
      !cells[1]
    ) {
      continue;
    }
    const scientificName = cells[1];
    rows.push({
      sourceRecordId: `IL-17-IAC-1100.30/${String(rows.length + 1).padStart(2, "0")}`,
      commonName: cells[0],
      scientificName,
      effective: scientificName === "Pyrus calleryana" ? "future" : "current",
    });
  }
  return rows;
}

async function main() {
  if (process.argv.includes("--capture")) {
    await captureArtifact();
  }
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Illinois rule artifact hash or byte count changed.",
  );
  const html = artifact.toString("utf8");
  assert(
    html.includes("Official List of Exotic Weeds") &&
      html.includes("starting January 1, 2028") &&
      html.includes("Pyrus calleryana"),
    "Illinois rule authority or future-effective marker changed.",
  );
  const rows = sourceRows(html);
  assert(
    rows.length === 35 &&
      rows.filter((row) => row.effective === "current").length === 34 &&
      rows.filter((row) => row.effective === "future").length === 1 &&
      rows[0]?.scientificName === "Ailanthus altissima" &&
      rows.at(-1)?.scientificName === "Pyrus calleryana",
    `Expected 34 current Illinois rows and one future row, found ${rows.length} total.`,
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
    if (
      row.effective !== "current" ||
      !species ||
      !isExactBinomial(row.scientificName)
    ) {
      return [];
    }
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
        note: `Exact current Illinois 17 IAC 1100.30 exotic-weed membership as of ${AS_OF} establishes state regulatory applicability only. The retained row is "${row.commonName} (${row.scientificName})". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const blockedRows = rows
    .filter((row) => {
      const species = catalogByScientificName.get(
        row.scientificName.toLowerCase(),
      );
      return (
        row.effective !== "current" ||
        !species ||
        !isExactBinomial(row.scientificName)
      );
    })
    .map((row) => ({
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: `${row.commonName} (${row.scientificName})`,
      reason:
        row.effective === "future"
          ? "The rule makes this row effective on January 1, 2028. It is preserved but cannot establish current applicability."
          : "No exact current catalog binomial was accepted. Genus, hybrid, synonym, source spelling, or unmatched taxonomy requires separate review.",
      reviewStatus: "blocked" as const,
    }));
  assert(
    acceptedEvents.length === 24 && blockedRows.length === 11,
    `Expected 24 accepted and 11 blocked Illinois rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Illinois accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "il-17-iac-1100-20260801",
    sourceId: SOURCE_ID,
    stateCode: "IL",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/illinois-17-iac-1100-30.html",
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
        authorityUrl: AUTHORITY_URL,
        currentRows: rows.filter((row) => row.effective === "current").length,
        futureRows: rows.filter((row) => row.effective === "future").length,
        acceptedEvents: acceptedEvents.length,
        acceptedSpecies: new Set(acceptedEvents.map((event) => event.speciesId))
          .size,
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
