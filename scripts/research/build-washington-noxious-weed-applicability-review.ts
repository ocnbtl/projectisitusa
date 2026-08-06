import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = { id: string; scientificName: string };

const root = process.cwd();
const sourceId = "wa-wac-16-750";
const reviewId = `${sourceId}-20260805`;
const reviewDirectory = path.join(
  root,
  "src/data/research/state-list-sources/20260805__wa-wac-16-750__8606d4cab472",
);
const artifactRelativePath = "artifacts/washington-wac-16-750-current.html";
const artifactPath = path.join(reviewDirectory, artifactRelativePath);
const artifact = fs.readFileSync(artifactPath);
const artifactSha256 = crypto.createHash("sha256").update(artifact).digest("hex");
if (artifactSha256 !== "8606d4cab4729cb7d760dd28a78b781414b9f05c8673cb16803fb52f3455d435") {
  throw new Error(`Unexpected Washington artifact hash: ${artifactSha256}`);
}

const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.normalize("NFKC"), species]),
);

function decodeHtml(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const html = artifact.toString("utf8");
const acceptedEvents: Array<Record<string, unknown>> = [];
const blockedRows: Array<Record<string, unknown>> = [];
const exactBinomial = /^[A-Z][a-z]+ [a-z][a-z-]+$/;
let reviewedTaxonRows = 0;

for (const sectionMatch of html.matchAll(/<section data-cite="([^"]+)">([\s\S]*?)<\/section>/g)) {
  const cite = decodeHtml(sectionMatch[1]);
  const section = sectionMatch[2];
  const sectionNumber = cite.replace(/^WAC\s+/, "");
  const className = sectionNumber.endsWith("005")
    ? "Class A"
    : sectionNumber.endsWith("011")
      ? "Class B"
      : "Class C";
  let rowIndex = 0;
  for (const rowMatch of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    rowIndex += 1;
    const cells = [...rowMatch[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((match) =>
      decodeHtml(match[1]),
    );
    if (rowIndex === 1) continue;
    let recordNumber: string;
    let originalTaxonText: string;
    let scientificName: string;
    let taxonConditioned = false;
    if (className === "Class B") {
      if (!/^\(\d+\)$/.test(cells[0] ?? "") || !(cells[1] ?? "")) continue;
      recordNumber = (cells[0] ?? "").replace(/[()]/g, "").padStart(3, "0");
      originalTaxonText = cells[1];
      const lastComma = originalTaxonText.lastIndexOf(",");
      scientificName = lastComma >= 0 ? originalTaxonText.slice(lastComma + 1).trim() : "";
    } else {
      if (cells.length < 2 || !(cells[1] ?? "")) continue;
      recordNumber = String(rowIndex - 1).padStart(3, "0");
      originalTaxonText = cells[1];
      scientificName = originalTaxonText;
      taxonConditioned = /\bexcept\b|\bonly\b/i.test(cells[0] ?? "");
      if (taxonConditioned) originalTaxonText = `${cells[0]} | ${cells[1]}`;
    }
    reviewedTaxonRows += 1;
    const sourceRecordId = `WA-WAC-${sectionNumber}/${recordNumber}`;
    const catalogSpecies = exactBinomial.test(scientificName) && !taxonConditioned
      ? catalogByScientificName.get(scientificName.normalize("NFKC"))
      : undefined;
    if (!catalogSpecies) {
      blockedRows.push({
        sourceRecordId,
        originalTaxonText,
        reason: taxonConditioned
          ? "The row contains an explicit exception or cultivar-only condition and was not expanded into unconditional species-level applicability."
          : exactBinomial.test(scientificName)
          ? "The exact source binomial has no exact current catalog match. No synonym or source spelling was expanded."
          : "The row is not a single exact canonical binomial. Genus, abbreviation, subspecies, variety, hybrid, multiple-taxon, exception, or conditioned rows are not expanded.",
        reviewStatus: "blocked",
      });
      continue;
    }
    const geographicCaveat = className === "Class B"
      ? " The Class B row has explicit regional or county designation text; list membership establishes state research applicability only and the designation text was not converted into county occurrence or county applicability."
      : "";
    acceptedEvents.push({
      eventId: `${sourceId}-${sectionNumber.replace(/[^0-9]+/g, "-")}-${recordNumber}-${slug(catalogSpecies.id)}`,
      sourceRecordId,
      originalTaxonText: scientificName,
      scientificName,
      speciesId: catalogSpecies.id,
      applicability: "applicable",
      priority: "regulated",
      matchMethod: "exact-canonical-binomial",
      reviewStatus: "accepted",
      note: `Exact currently effective Washington ${className} WAC 16-750 membership as of 2026-08-05 establishes state regulatory applicability only. The retained source row is "${originalTaxonText}".${geographicCaveat} It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
    });
  }
}

if (reviewedTaxonRows !== 172) throw new Error(`Expected 172 Washington taxon rows, found ${reviewedTaxonRows}.`);
if (acceptedEvents.length + blockedRows.length !== reviewedTaxonRows) {
  throw new Error("Washington review row accounting is incomplete.");
}

const review = {
  schemaVersion: 1,
  reviewId,
  sourceId,
  stateCode: "WA",
  sourceUrl: "https://app.leg.wa.gov/WAC/default.aspx?cite=16-750&full=true",
  retrievedAt: "2026-08-06T02:17:00.840Z",
  reviewedAt: "2026-08-06T02:32:34.258Z",
  applicabilityAsOf: "2026-08-05",
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

fs.writeFileSync(path.join(reviewDirectory, "review.json"), `${JSON.stringify(review, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  reviewId,
  artifactSha256,
  artifactBytes: artifact.length,
  reviewedTaxonRows,
  acceptedEvents: acceptedEvents.length,
  blockedRows: blockedRows.length,
  distinctAcceptedSpecies: new Set(acceptedEvents.map((event) => event.speciesId)).size,
}, null, 2)}\n`);
