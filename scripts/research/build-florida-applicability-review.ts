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
  listClass: "noxious" | "prohibited-aquatic";
};

const ROOT = process.cwd();
const SOURCE_ID = "fl-5b-57-007";
const SOURCE_URL = "https://flrules.org/gateway/ruleno.asp?id=5B-57.007";
const ARTIFACT_URL =
  "https://flrules.org/gateway/readFile.asp?sid=0&tid=23639596&type=1&file=5B-57.007.doc";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__fl-5b-57-007__e4ed8ee8b326",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/florida-5b-57.007-2020.doc",
);
const ARTIFACT_SHA256 =
  "e4ed8ee8b32687675e30dabe5d33c976c9964753c3d09f7626defa188c72c754";
const ARTIFACT_BYTES = 32256;
const AS_OF = "2026-08-01";
const EFFECTIVE_DATE = "2020-09-28";
const RETRIEVED_AT = "2026-08-01T06:07:50.118Z";
const REVIEWED_AT = "2026-08-01T06:10:00.000Z";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function captureArtifact() {
  const response = await fetch(ARTIFACT_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Florida rule acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Florida rule bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

function sourceRows(artifact: Buffer): SourceRow[] {
  const printableSequences =
    artifact
      .toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9 .(),;:\-/]{5,}/gu)
      ?.map((value) => value.trim()) ?? [];
  const rows: SourceRow[] = [];
  let listClass: SourceRow["listClass"] = "noxious";
  let classRowIndex = 0;
  for (const sequence of printableSequences) {
    if (sequence === "Prohibited Aquatic Plants") {
      listClass = "prohibited-aquatic";
      classRowIndex = 0;
      continue;
    }
    const match = sequence.match(
      /^[a-z]+\)\s+([A-Z][A-Za-z-]+\s+(?:spp\.|[a-z][A-Za-z-]+))/u,
    );
    if (!match) continue;
    const scientificName = match[1];
    assert(scientificName, "Florida rule row lacks a taxon.");
    classRowIndex += 1;
    rows.push({
      sourceRecordId: `FL-5B-57.007/${listClass}/${String(classRowIndex).padStart(3, "0")}`,
      scientificName,
      sourceRowText: sequence,
      listClass,
    });
  }
  assert(
    rows.length === 105 &&
      rows.filter((row) => row.listClass === "noxious").length === 102 &&
      rows.filter((row) => row.listClass === "prohibited-aquatic").length ===
        3 &&
      rows[0]?.scientificName === "Abrus precatorius" &&
      rows.at(-1)?.scientificName === "Pistia stratiotes",
    `Expected 102 noxious and 3 prohibited-aquatic Florida rows, found ${rows.length} total.`,
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
    "Florida rule artifact hash or byte count changed.",
  );
  const rows = sourceRows(artifact);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const acceptedEvents = rows.flatMap((row) => {
    const species = catalogByScientificName.get(row.scientificName.toLowerCase());
    if (!species || row.scientificName.endsWith(" spp.")) return [];
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
        note: `Exact Florida Administrative Code Rule 5B-57.007 ${row.listClass} membership, effective ${EFFECTIVE_DATE} and current on the official rule page as of ${AS_OF}, establishes state regulatory applicability only. The retained row is "${row.sourceRowText}". It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
      },
    ];
  });
  const unmatchedRows = rows
    .filter((row) => {
      const species = catalogByScientificName.get(
        row.scientificName.toLowerCase(),
      );
      return !species || row.scientificName.endsWith(" spp.");
    })
    .map((row) => ({
      sourceRecordId: row.sourceRecordId,
      originalTaxonText: row.sourceRowText,
      reason:
        "No exact current catalog binomial was accepted. Genus scope, synonym, spelling, or unmatched taxonomy requires separate review.",
      reviewStatus: "blocked" as const,
    }));
  const regulatoryContext = [
    ["cuscuta-exception-01", "C. americana"],
    ["cuscuta-exception-02", "C. compacta"],
    ["cuscuta-exception-03", "C. exaltata"],
    ["cuscuta-exception-04", "C. gronovii"],
    ["cuscuta-exception-05", "C. indecora"],
    ["cuscuta-exception-06", "C. obtusiflora"],
    ["cuscuta-exception-07", "C. pentagona"],
    ["cuscuta-exception-08", "C. umbellata"],
    ["orobanche-exception-01", "O. uniflora"],
    ["salvinia-exception-01", "S. minima"],
    ["ligustrum-cultivar-01", "Variegatum"],
    ["ligustrum-cultivar-02", "Sunshine"],
  ] as const;
  const artifactText = artifact.toString("latin1");
  const contextRows = regulatoryContext.map(([recordId, originalTaxonText]) => {
    assert(
      artifactText.includes(originalTaxonText),
      `Florida regulatory context ${originalTaxonText} is absent from the retained artifact.`,
    );
    return {
      sourceRecordId: `FL-5B-57.007/context/${recordId}`,
      originalTaxonText,
      reason:
        "The official text names an exception or cultivar condition. It is retained as regulatory context and does not establish species-level not-applicability.",
      reviewStatus: "blocked" as const,
    };
  });
  const blockedRows = [...unmatchedRows, ...contextRows];
  assert(
    acceptedEvents.length === 54 &&
      unmatchedRows.length === 51 &&
      contextRows.length === 12 &&
      blockedRows.length === 63,
    `Expected 54 accepted, 51 unmatched, and 63 total blocked Florida rows; found ${acceptedEvents.length}, ${unmatchedRows.length}, and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Florida accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "fl-5b-57-007-20260801",
    sourceId: SOURCE_ID,
    stateCode: "FL",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/florida-5b-57.007-2020.doc",
      sha256: ARTIFACT_SHA256,
      bytes: ARTIFACT_BYTES,
      mediaType: "application/msword",
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
        effectiveDate: EFFECTIVE_DATE,
        noxiousRows: rows.filter((row) => row.listClass === "noxious").length,
        prohibitedAquaticRows: rows.filter(
          (row) => row.listClass === "prohibited-aquatic",
        ).length,
        acceptedEvents: acceptedEvents.length,
        unmatchedRows: unmatchedRows.length,
        regulatoryContextRows: contextRows.length,
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
