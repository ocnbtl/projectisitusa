import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = { id: string; scientificName: string };

const root = process.cwd();
const sourceId = "md-mda-prohibited-invasive-plants";
const reviewId = sourceId + "-20260805";
const reviewDirectory = path.join(
  root,
  "src/data/research/state-list-sources/20260805__md-mda-prohibited-invasive-plants__edd4acd8dcc4",
);
const artifactRelativePath = "artifacts/maryland-prohibited-invasive-plant-list-current.html";
const artifactPath = path.join(reviewDirectory, artifactRelativePath);
const artifact = fs.readFileSync(artifactPath);
const artifactSha256 = crypto.createHash("sha256").update(artifact).digest("hex");
if (artifactSha256 !== "edd4acd8dcc4a290f88f1f3c2ce9f20ae24ce7f1b1e54c7f4780ca5b2fd39180") {
  throw new Error("Unexpected Maryland artifact hash: " + artifactSha256);
}

const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.normalize("NFKC"), species]),
);

function decodeHtml(value: string): string {
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&quot;/g, "\"")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const html = artifact.toString("utf8");
const tables = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((match) => match[0]);
const listTable = tables.find((table) =>
  table.includes("Maryland Prohibited Invasive Plant List") && table.includes("Phase-out Period (in-ground)"),
);
if (!listTable) throw new Error("Maryland prohibited invasive plant table was not found.");

const acceptedEvents: Array<Record<string, unknown>> = [];
const blockedRows: Array<Record<string, unknown>> = [];
const exactBinomial = /^[A-Z][a-z]+ [a-z][a-z-]+$/;
let reviewedTaxonRows = 0;

for (const rowMatch of listTable.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
  const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
    decodeHtml(match[1]),
  );
  if (cells.length !== 5 || cells[0] === "Species Name" || cells[0].includes("Maryland Prohibited")) continue;
  reviewedTaxonRows += 1;
  const recordNumber = String(reviewedTaxonRows).padStart(3, "0");
  const sourceRecordId = "MD-MDA-PIPL-" + recordNumber;
  const originalTaxonText = cells[0];
  const effectiveMatch = cells[2].match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!effectiveMatch) throw new Error("Unexpected effective date in " + sourceRecordId + ": " + cells[2]);
  const effectiveDate =
    effectiveMatch[3] + "-" + effectiveMatch[1].padStart(2, "0") + "-" + effectiveMatch[2].padStart(2, "0");
  const catalogSpecies = exactBinomial.test(originalTaxonText)
    ? catalogByScientificName.get(originalTaxonText.normalize("NFKC"))
    : undefined;
  if (!catalogSpecies || effectiveDate > "2026-08-05") {
    blockedRows.push({
      sourceRecordId,
      originalTaxonText,
      reason: effectiveDate > "2026-08-05"
        ? "The row is not yet effective as of 2026-08-05; its effective date is " + effectiveDate + "."
        : exactBinomial.test(originalTaxonText)
          ? "The exact source binomial has no exact current catalog match. No synonym or source spelling was expanded."
          : "The row is not a single exact canonical binomial. Multiple-taxon, hybrid, synonym, and conditioned rows are not expanded.",
      reviewStatus: "blocked",
    });
    continue;
  }
  const cultivarCaveat = new Set(["berberis-thunbergii", "nandina-domestica"]).has(catalogSpecies.id)
    ? " The official page separately identifies cultivar exemptions; list membership is retained only as species-level research applicability and does not override those cultivar exemptions."
    : "";
  acceptedEvents.push({
    eventId: sourceId + "-" + recordNumber + "-" + slug(catalogSpecies.id),
    sourceRecordId,
    originalTaxonText,
    scientificName: catalogSpecies.scientificName,
    speciesId: catalogSpecies.id,
    applicability: "applicable",
    priority: "regulated",
    matchMethod: "exact-canonical-binomial",
    reviewStatus: "accepted",
    note: "Exact Maryland Prohibited Invasive Plant List membership, effective " + effectiveDate +
      " and current as of 2026-08-05, establishes state regulatory applicability only." + cultivarCaveat +
      " It creates no county occurrence, absence, not-detected, or not-applicable claim.",
  });
}

if (reviewedTaxonRows !== 26) throw new Error("Expected 26 Maryland taxon rows, found " + reviewedTaxonRows + ".");
if (acceptedEvents.length + blockedRows.length !== reviewedTaxonRows) {
  throw new Error("Maryland review row accounting is incomplete.");
}

const review = {
  schemaVersion: 1,
  reviewId,
  sourceId,
  stateCode: "MD",
  sourceUrl: "https://mda.maryland.gov/plants-pests/Pages/maryland_invasive_plant_law_and_regulations.aspx",
  retrievedAt: "2026-08-06T02:41:04.356Z",
  reviewedAt: "2026-08-06T02:53:00.000Z",
  artifact: {
    path: artifactRelativePath,
    sha256: artifactSha256,
    bytes: artifact.length,
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

fs.writeFileSync(path.join(reviewDirectory, "review.json"), JSON.stringify(review, null, 2) + "\n");
process.stdout.write(JSON.stringify({
  reviewId,
  artifactSha256,
  artifactBytes: artifact.length,
  reviewedTaxonRows,
  acceptedEvents: acceptedEvents.length,
  blockedRows: blockedRows.length,
  distinctAcceptedSpecies: new Set(acceptedEvents.map((event) => event.speciesId)).size,
}, null, 2) + "\n");
