import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  sha256Bytes,
  stablePrettyJson,
  type CatalogSpecies,
  type StateApplicabilityReview,
} from "@/lib/research/state-applicability-sources";

const ROOT = process.cwd();
const SOURCE_ID = "usda-aphis-federal-noxious-weeds";
const REVIEW_ID = "usda-aphis-federal-noxious-weeds-20260728";
const REVIEW_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260728__usda-aphis-federal-noxious-weeds__4ab0c640fcf5",
);
const ARTIFACT_PATH = path.join(
  REVIEW_DIRECTORY,
  "artifacts/title-7-part-360-20260724.xml",
);
const REVIEW_PATH = path.join(REVIEW_DIRECTORY, "review.json");
const EXPECTED_ARTIFACT_HASH =
  "4ab0c640fcf597db17442427a2b6ca1f95494033ef4298080ce81b9295cb023c";

type ParsedRow = {
  subsection: "a" | "b" | "c";
  sourceRecordId: string;
  canonicalText: string;
  fullText: string;
  genusOrExceptionScope: boolean;
  infraspecificScope: boolean;
};

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#xA7;", "section")
    .replaceAll(/<[^>]+>/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");
}

function sectionBlock(xml: string, start: string, end: string): string {
  const startIndex = xml.indexOf(start);
  const endIndex = xml.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Cannot locate federal list block ${start} through ${end}.`);
  }
  return xml.slice(startIndex, endIndex);
}

function rowElements(block: string, element: "FP-1"): string[] {
  return [...block.matchAll(new RegExp(`<${element}>(.*?)</${element}>`, "gs"))]
    .map((match) => match[1]);
}

function italicValues(row: string): string[] {
  return [...row.matchAll(/<I>(.*?)<\/I>/gs)]
    .map((match) => decodeXml(match[1]));
}

function catalogCanonicalText(
  italicText: string,
  catalogNames: string[],
): string {
  return catalogNames
    .filter(
      (name) =>
        italicText === name ||
        italicText.startsWith(`${name} `),
    )
    .sort((left, right) => right.length - left.length || left.localeCompare(right))
    .at(0) ?? italicText;
}

function parseRows(xml: string, catalog: CatalogSpecies[]): ParsedRow[] {
  const sectionStart = xml.indexOf('<DIV8 N="360.200"');
  const sectionEnd = xml.indexOf("</DIV8>", sectionStart);
  if (sectionStart < 0 || sectionEnd < 0) {
    throw new Error("Cannot locate the complete 7 CFR 360.200 section.");
  }
  const section = xml.slice(sectionStart, sectionEnd + "</DIV8>".length);
  const catalogNames = catalog.map((entry) => entry.scientificName);
  const rows: ParsedRow[] = [];
  for (const subsection of ["a", "c"] as const) {
    const end = subsection === "a" ? "<P>(b)" : "<CITA";
    const block = sectionBlock(section, `<P>(${subsection})`, end);
    for (const row of rowElements(block, "FP-1")) {
      const italic = italicValues(row);
      if (italic.length === 0) {
        throw new Error(`Federal subsection ${subsection} row lacks italic taxon text.`);
      }
      const fullText = decodeXml(row);
      const canonicalText = catalogCanonicalText(italic[0], catalogNames);
      rows.push({
        subsection,
        sourceRecordId:
          `7-cfr-360.200/${subsection}/${slug(canonicalText)}`,
        canonicalText,
        fullText,
        genusOrExceptionScope: false,
        infraspecificScope: /(?:\bvar\.|\bsubsp\.)/i.test(fullText),
      });
    }
  }
  const parasitic = sectionBlock(section, "<P>(b)", "<P>(c)");
  for (const row of rowElements(parasitic, "FP-1")) {
    const italic = italicValues(row);
    if (italic.length === 0) {
      throw new Error("Federal parasitic row lacks italic taxon text.");
    }
    const canonicalText = italic[0];
    rows.push({
      subsection: "b",
      sourceRecordId: `7-cfr-360.200/b/${slug(canonicalText)}`,
      canonicalText,
      fullText: decodeXml(row),
      genusOrExceptionScope: true,
      infraspecificScope: false,
    });
  }
  const sourceRecordIds = rows.map((row) => row.sourceRecordId);
  if (new Set(sourceRecordIds).size !== sourceRecordIds.length) {
    throw new Error("Federal source row identities are not unique.");
  }
  return rows.sort((left, right) =>
    left.sourceRecordId.localeCompare(right.sourceRecordId)
  );
}

function buildReview(): StateApplicabilityReview {
  const artifact = readFileSync(ARTIFACT_PATH);
  const artifactHash = sha256Bytes(artifact);
  if (artifactHash !== EXPECTED_ARTIFACT_HASH) {
    throw new Error(`Federal artifact hash changed: ${artifactHash}.`);
  }
  const catalog = JSON.parse(
    readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByName = new Map(
    catalog.map((species) => [species.scientificName, species]),
  );
  const rows = parseRows(artifact.toString("utf8"), catalog);
  const acceptedEvents: StateApplicabilityReview["acceptedEvents"] = [];
  const blockedRows: StateApplicabilityReview["blockedRows"] = [];

  for (const row of rows) {
    const species = catalogByName.get(row.canonicalText);
    if (row.genusOrExceptionScope) {
      blockedRows.push({
        sourceRecordId: row.sourceRecordId,
        originalTaxonText: row.fullText,
        reason:
          "Genus-level or exception-bearing federal scope requires a separate descendant-taxon policy.",
        reviewStatus: "blocked",
      });
    } else if (row.infraspecificScope) {
      blockedRows.push({
        sourceRecordId: row.sourceRecordId,
        originalTaxonText: row.fullText,
        reason:
          "Infraspecific federal scope cannot be projected to a catalog species without a reviewed taxonomic policy.",
        reviewStatus: "blocked",
      });
    } else if (!species || species.scientificName.trim().split(/\s+/).length !== 2) {
      blockedRows.push({
        sourceRecordId: row.sourceRecordId,
        originalTaxonText: row.fullText,
        reason: "No exact species-level catalog match.",
        reviewStatus: "blocked",
      });
    } else {
      acceptedEvents.push({
        eventId: `${REVIEW_ID}-${slug(species.id)}`,
        sourceRecordId: row.sourceRecordId,
        originalTaxonText: species.scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note:
          "Exact species-level 7 CFR 360.200 membership establishes federal regulated applicability only.",
      });
    }
  }

  if (
    acceptedEvents.length !== 35 ||
    blockedRows.length !== 76 ||
    rows.length !== 111
  ) {
    throw new Error(
      `Federal row contract changed: ${rows.length} rows, ${acceptedEvents.length} accepted, ${blockedRows.length} blocked.`,
    );
  }

  return {
    schemaVersion: 1,
    reviewId: REVIEW_ID,
    sourceId: SOURCE_ID,
    stateCode: "US",
    sourceUrl:
      "https://www.ecfr.gov/current/title-7/subtitle-B/chapter-III/part-360/section-360.200",
    retrievedAt: "2026-07-28T03:40:00Z",
    reviewedAt: "2026-07-28T03:55:00Z",
    artifact: {
      path: "artifacts/title-7-part-360-20260724.xml",
      sha256: artifactHash,
      bytes: artifact.length,
      mediaType: "application/xml",
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
}

const mode = process.argv[2];
if (!["--check", "--write"].includes(mode ?? "")) {
  throw new Error(
    "Usage: import-federal-noxious-weeds-applicability.ts --check|--write",
  );
}
const expected = stablePrettyJson(buildReview());
if (mode === "--write") {
  writeFileSync(REVIEW_PATH, expected);
} else if (readFileSync(REVIEW_PATH, "utf8") !== expected) {
  throw new Error("Federal noxious weed review is not byte stable.");
}
process.stdout.write(
  `${JSON.stringify({
    mode,
    reviewPath: path.relative(ROOT, REVIEW_PATH),
    artifactSha256: EXPECTED_ARTIFACT_HASH,
    acceptedExactTaxa: 35,
    projectedJurisdictions: 51,
    grossProjectedApplicabilityEvents: 1785,
    blockedRows: 76,
    countyOutcomes: 0,
  }, null, 2)}\n`,
);
