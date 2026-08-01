import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceRow = {
  listClass: "controlled" | "A" | "B" | "C";
  row: number;
  sourceRowText: string;
  scientificNames: string[];
  forceBlockedReason?: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "pa-pda-controlled-plant-noxious-weeds";
const SOURCE_URL =
  "https://www.pa.gov/agencies/pda/plants-land-water/plant-industry/noxious-weeds-and-controlled-plants/controlled-plant-noxious-weed-lists";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__pa-pda-controlled-plant-noxious-weeds__acf00a8c218e",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/pennsylvania-controlled-plant-noxious-weed-lists.html",
);
const ARTIFACT_SHA256 =
  "acf00a8c218ea5a913c92aa2118c1de67b65776684ad4781adde3341c541ed2f";
const ARTIFACT_BYTES = 291810;
const AS_OF = "2026-08-01";
const RETRIEVED_AT = "2026-08-01T08:23:00.000Z";
const REVIEWED_AT = "2026-08-01T08:38:00.000Z";
const EXPECTED_SOURCE_ROWS = 62;
const EXPECTED_TAXON_CANDIDATES = 63;
const EXPECTED_ACCEPTED = 42;
const EXPECTED_BLOCKED = 21;

const SCIENTIFIC_NAMES: Record<string, string[]> = {
  "A-01": ["Heracleum mantegazzianum"],
  "A-02": ["Galega officinalis"],
  "A-03": ["Pueraria lobata"],
  "A-04": ["Amaranthus palmeri"],
  "A-05": ["Amaranthus rudis"],
  "A-06": ["Amaranthus tuberculatus"],
  "A-07": ["Avena sterilis"],
  "A-08": ["Cuscuta spp."],
  "A-09": ["Orobanche spp."],
  "A-10": ["Oplismenus hirtellus"],
  "A-11": ["Hydrocharis morsus-ranae"],
  "A-12": ["Trapa natans"],
  "A-13": ["Ludwigia grandiflora ssp. hexapetala"],
  "A-14": ["Egeria densa"],
  "A-15": ["Nymphoides peltata"],
  "A-16": ["Tripidium ravennae"],
  "A-17": ["Anthriscus sylvestris"],
  "A-18": ["Akebia quinata"],
  "A-19": ["Ligustrum japonicum"],
  "A-20": ["Myriophyllum aquaticum"],
  "A-21": ["Nitellopsis obtusa"],
  "A-22": ["Imperata cylndrica"],
  "B-01": ["Cirsium vulgare"],
  "B-02": ["Cirsium arvense"],
  "B-03": ["Carduus nutans"],
  "B-04": ["Sorghum halepense"],
  "B-05": ["Persicaria perfoliata"],
  "B-06": ["Rosa multiflora"],
  "B-07": ["Lythrum salicaria", "Lythrum virgatum"],
  "B-08": ["Sorghum bicolor"],
  "B-09": ["Conium maculatum"],
  "B-10": ["Ailanthus altissima"],
  "B-11": ["Pastinaca sativa"],
  "B-12": ["Reynoutria japonica"],
  "B-13": ["Reynoutria sachalinensis"],
  "B-14": ["Reynoutria x bohemica"],
  "B-15": ["Aralia elata"],
  "B-16": ["Humulus japonicus"],
  "B-17": ["Celastrus orbiculatus"],
  "B-18": ["Vincetoxicum nigrum"],
  "B-19": ["Vincetoxicum rossicum"],
  "B-20": ["Artemisia vulgaris"],
  "B-21": ["Berberis thunbergii"],
  "B-22": ["Allaria petiolata"],
  "B-23": ["Microstegium vimineum"],
  "B-24": ["Pyrus calleryana"],
  "B-25": ["Myriophyllum spicatum"],
  "B-26": ["Rhamnus cathartica"],
  "B-27": ["Rhamnus frangula"],
  "B-28": ["Ficaria verna"],
  "B-29": ["Euonymus alatus"],
  "B-30": ["Ligustrum sinense"],
  "B-31": ["Ligustrum vulgare"],
  "B-32": ["Ligustrum obtusifolium"],
  "B-33": ["Lonicera maackii"],
  "B-34": ["Lonicera morrowii"],
  "B-35": ["Lonicera x bella"],
  "B-36": ["Lonicera tatarica"],
  "B-37": ["Lonicera standishii"],
  "B-38": ["Hydrilla verticillata"],
  "C-01": ["Stratiotes aloides"],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeHtmlText(value: string) {
  return value
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/gu, " ")
    .replace(/&amp;/gu, "&")
    .replace(/&#39;/gu, "'")
    .replace(/&quot;/gu, '"')
    .replace(/\u00a0/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function sourceRecordId(
  row: SourceRow,
  candidateIndex: number,
  scientificName: string,
) {
  const taxonKey = scientificName
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
  const listClass = row.listClass === "controlled" ? "P" : row.listClass;
  return `PA-PDA/${listClass}/${String(row.row).padStart(2, "0")}/${String(candidateIndex + 1).padStart(2, "0")}/${taxonKey}`;
}

function parseSourceRows(artifact: Buffer): SourceRow[] {
  const html = artifact.toString("utf8");
  const controlledMatch = html.match(
    /<ul><li>Hemp -[\s\S]*?<i>Cannabis sativa<\/i>[\s\S]*?<\/li><\/ul>/u,
  );
  assert(controlledMatch, "Pennsylvania controlled-hemp row was not found.");
  const controlledRow: SourceRow = {
    listClass: "controlled",
    row: 1,
    sourceRowText: normalizeHtmlText(controlledMatch[0]),
    scientificNames: ["Cannabis sativa"],
    forceBlockedReason:
      "The controlled-hemp program row is outside the page's Class A, B, and C noxious-weed lists and requires separate category review. It creates no current invasive-species applicability event.",
  };
  const start = html.indexOf("<p><b>Class A Noxious Weeds</b></p>");
  const end = html.indexOf("</div>", start);
  assert(start >= 0 && end > start, "Pennsylvania noxious-weed list section was not found.");
  const section = html.slice(start, end);
  const rows: SourceRow[] = [controlledRow];
  const classMatches = [...section.matchAll(
    /<p><b>Class ([ABC]) Noxious Weeds<\/b><\/p>\s*<ul>([\s\S]*?)<\/ul>/gu,
  )];
  assert(classMatches.length === 3, "Pennsylvania Class A, B, and C sections were not all found.");
  for (const classMatch of classMatches) {
    const listClass = classMatch[1] as "A" | "B" | "C";
    const items = [...(classMatch[2] ?? "").matchAll(/<li>([\s\S]*?)<\/li>/gu)];
    for (const [index, item] of items.entries()) {
      const key = `${listClass}-${String(index + 1).padStart(2, "0")}`;
      const scientificNames = SCIENTIFIC_NAMES[key];
      assert(scientificNames, `Missing reviewed taxonomy for Pennsylvania row ${key}.`);
      rows.push({
        listClass,
        row: index + 1,
        sourceRowText: normalizeHtmlText(item[1] ?? ""),
        scientificNames,
      });
    }
  }
  assert(
    rows.length === EXPECTED_SOURCE_ROWS &&
      rows.filter((row) => row.listClass === "A").length === 22 &&
      rows.filter((row) => row.listClass === "B").length === 38 &&
      rows.filter((row) => row.listClass === "C").length === 1 &&
      rows.reduce((sum, row) => sum + row.scientificNames.length, 0) ===
        EXPECTED_TAXON_CANDIDATES,
    "Pennsylvania source row or reviewed taxon-candidate count changed.",
  );
  assert(
    rows.find((row) => row.listClass === "A" && row.row === 1)?.sourceRowText.includes(
      "Heracleum mantegazzianum",
    ) &&
      rows.find((row) => row.listClass === "B" && row.row === 38)?.sourceRowText.includes(
        "Hydrilla verticillata",
      ) &&
      rows.find((row) => row.listClass === "C" && row.row === 1)?.sourceRowText.includes(
        "Stratiotes aloides",
      ),
    "Pennsylvania source row anchors changed.",
  );
  return rows;
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)",
    },
  });
  assert(
    response.ok,
    `Pennsylvania source acquisition failed with HTTP ${response.status}.`,
  );
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Pennsylvania source bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

async function main() {
  if (process.argv.includes("--capture")) {
    await captureArtifact();
  }
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Pennsylvania source artifact hash or byte count changed.",
  );
  const sourceRows = parseSourceRows(artifact);
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const isExactBinomial = (value: string) =>
    /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
  const acceptedEvents = sourceRows.flatMap((row) =>
    row.scientificNames.flatMap((scientificName, candidateIndex) => {
      const species = catalogByScientificName.get(scientificName.toLowerCase());
      if (row.forceBlockedReason || !species || !isExactBinomial(scientificName)) {
        return [];
      }
      return [
        {
          eventId: `${SOURCE_ID}-${species.id}`,
          sourceRecordId: sourceRecordId(row, candidateIndex, scientificName),
          originalTaxonText: scientificName,
          scientificName: species.scientificName,
          speciesId: species.id,
          applicability: "applicable",
          priority: "regulated",
          matchMethod: "exact-canonical-binomial",
          reviewStatus: "accepted",
          note: `Exact Pennsylvania Department of Agriculture Class ${row.listClass} noxious-weed membership, current as of ${AS_OF}, establishes state regulatory applicability only. The retained row is "${row.sourceRowText}". Statewide class descriptions create no county occurrence, absence, not-detected, or not-applicable claim.`,
        },
      ];
    }),
  );
  const blockedRows = sourceRows.flatMap((row) =>
    row.scientificNames.flatMap((scientificName, candidateIndex) => {
      const species = catalogByScientificName.get(scientificName.toLowerCase());
      if (!row.forceBlockedReason && species && isExactBinomial(scientificName)) {
        return [];
      }
      return [
        {
          sourceRecordId: sourceRecordId(row, candidateIndex, scientificName),
          originalTaxonText: `${scientificName}; ${row.sourceRowText}`,
          reason:
            row.forceBlockedReason ??
            "No exact current catalog binomial was accepted. Genus, subspecies, hybrid, source spelling, synonym, cultivar, or unmatched taxonomy requires separate review.",
          reviewStatus: "blocked" as const,
        },
      ];
    }),
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size ===
      acceptedEvents.length,
    "Pennsylvania accepted events contain duplicate identities.",
  );
  assert(
    acceptedEvents.length + blockedRows.length === EXPECTED_TAXON_CANDIDATES,
    "Pennsylvania accepted and blocked candidate totals do not cover the reviewed scope.",
  );
  assert(
    acceptedEvents.length === EXPECTED_ACCEPTED &&
      blockedRows.length === EXPECTED_BLOCKED,
    `Expected ${EXPECTED_ACCEPTED} accepted and ${EXPECTED_BLOCKED} blocked Pennsylvania taxa; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  const review = {
    schemaVersion: 1,
    reviewId: "pa-pda-controlled-plant-noxious-weeds-20260801",
    sourceId: SOURCE_ID,
    stateCode: "PA",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/pennsylvania-controlled-plant-noxious-weed-lists.html",
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
        sourceRows: sourceRows.length,
        taxonCandidates: EXPECTED_TAXON_CANDIDATES,
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
