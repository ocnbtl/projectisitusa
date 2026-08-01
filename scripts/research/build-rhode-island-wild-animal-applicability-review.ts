import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type SourceTaxon = {
  section: string;
  originalTaxonText: string;
  scientificName: string | null;
  blockReason: string | null;
  condition: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "ri-250-ricr-40-05-3";
const HOMEPAGE =
  "https://rules.sos.ri.gov/regulations/part/250-40-05-3";
const SOURCE_URL =
  "https://risos-apa-production-public.s3.amazonaws.com/DEM/REG_13475_20260708093853560.pdf";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260801__ri-250-ricr-40-05-3__45ff33f76347",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/rhode-island-250-ricr-40-05-3-current.pdf",
);
const ARTIFACT_SHA256 =
  "45ff33f76347aa8de54690a490c31b09682f378e01d3142b655f2c3aba318303";
const ARTIFACT_BYTES = 482778;
const AS_OF = "2026-08-01";
const EFFECTIVE_DATE = "2026-07-28";
const RETRIEVED_AT = "2026-08-01T11:26:20.045Z";
const REVIEWED_AT = "2026-08-01T11:34:00.000Z";

const SOURCE_TAXA: SourceTaxon[] = [
  {
    section: "3.7(D)",
    originalTaxonText: "Red Eared Slider turtles (Trachemys scripta elegans)",
    scientificName: "Trachemys scripta elegans",
    blockReason: "No exact current catalog scientific-name row was found. The rule is also conditional: ordinary possession is limited to indoor confinement that prevents escape, and outdoor enclosure is prohibited.",
    condition: "Conditional import and possession restrictions apply, with specified researcher, licensed pet-shop, carrier, and indoor-confinement exceptions.",
  },
  {
    section: "3.7(E)",
    originalTaxonText: "Mute Swans (Cyngus olor)",
    scientificName: "Cyngus olor",
    blockReason: "The source spelling has no exact current catalog match. The catalog spelling Cygnus olor requires explicit taxonomy review.",
    condition: "Importation or possession of the birds or their eggs is expressly prohibited.",
  },
  {
    section: "3.7(F)",
    originalTaxonText: "Mudpuppies (Necturus spp.)",
    scientificName: null,
    blockReason: "The source is genus-level and cannot be expanded to catalog species without an approved genus-scope policy.",
    condition: "Importation or possession is expressly prohibited.",
  },
  {
    section: "3.7(G)",
    originalTaxonText: "bullfrogs (Lithobates catesbeianus)",
    scientificName: "Lithobates catesbeianus",
    blockReason: "No exact current catalog scientific-name row was found.",
    condition: "Importation or possession is expressly prohibited, except for cooked or frozen flesh intended for human consumption.",
  },
  {
    section: "3.17(A)(1)(c)(1)-a",
    originalTaxonText: "Zebra Mussels (Dreissena polymorpha, D. bugensis): Dreissena polymorpha",
    scientificName: "Dreissena polymorpha",
    blockReason: null,
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(1)(c)(1)-b",
    originalTaxonText: "Zebra Mussels (Dreissena polymorpha, D. bugensis): D. bugensis",
    scientificName: "D. bugensis",
    blockReason: "The source abbreviates the genus. The abbreviation cannot be expanded to the catalog binomial without explicit taxonomy review.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(1)(c)(2)",
    originalTaxonText: "Spiny Waterflea (Bythotrephes cederstroemi)",
    scientificName: "Bythotrephes cederstroemi",
    blockReason: "No exact current catalog scientific-name row was found. A catalog common-name hit is a different taxon and was not used.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(1)(c)(3)",
    originalTaxonText: "Fishhook Waterflea (Cercopagis pengoi)",
    scientificName: "Cercopagis pengoi",
    blockReason: null,
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(1)(c)(4)",
    originalTaxonText: "All non-indigenous crayfish",
    scientificName: null,
    blockReason: "The source is a category-level row with no exact scientific taxon and cannot be expanded to descendants.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(1)(c)(5)",
    originalTaxonText: "Asiatic Clam (Corbicula sp.)",
    scientificName: null,
    blockReason: "The source is genus-level and cannot be expanded to Corbicula fluminea without an approved genus-scope policy.",
    condition: "Live specimens are prohibited; frozen, cooked, or otherwise prepared human-food specimens are exempt.",
  },
  {
    section: "3.17(A)(1)(c)(6)",
    originalTaxonText: "Giant African (land) snail (Lissachatina fulica)",
    scientificName: "Lissachatina fulica",
    blockReason: "No exact current catalog scientific-name row was found.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(1)",
    originalTaxonText: "Grass Carp or White Amur (Ctenopharyngdon idella)",
    scientificName: "Ctenopharyngdon idella",
    blockReason: "The source spelling has no exact current catalog match. The catalog spelling Ctenopharyngodon idella requires explicit taxonomy review.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(2)",
    originalTaxonText: "Rudd (Scardinius erythrophthalmus)",
    scientificName: "Scardinius erythrophthalmus",
    blockReason: "No exact current catalog scientific-name row was found.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(3)",
    originalTaxonText: "Walking Catfish (Clarias spp. and all members of the family Clariidae)",
    scientificName: null,
    blockReason: "The source uses genus and family scope and cannot be expanded to catalog descendants.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(4)",
    originalTaxonText: "Snakeheads (Channidae and Parachannidae)",
    scientificName: null,
    blockReason: "The source uses family-level scope and cannot be expanded to catalog descendants.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(5)",
    originalTaxonText: "Black Carp (Mylopharyngodaon piceus)",
    scientificName: "Mylopharyngodaon piceus",
    blockReason: "The source spelling has no exact current catalog match. The catalog spelling Mylopharyngodon piceus requires explicit taxonomy review.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(6)",
    originalTaxonText: "Round Goby (Neogobius melanostomus)",
    scientificName: "Neogobius melanostomus",
    blockReason: null,
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(7)",
    originalTaxonText: "Tubenose Goby (Proterhinus marmoratus)",
    scientificName: "Proterhinus marmoratus",
    blockReason: "No exact current catalog scientific-name row was found; the source nomenclature requires explicit taxonomy review.",
    condition: "Possession is prohibited.",
  },
  {
    section: "3.17(A)(2)(b)(8)",
    originalTaxonText: "Ruffe (Gymnocephalus cernuus)",
    scientificName: "Gymnocephalus cernuus",
    blockReason: "No exact current catalog match was found. The catalog spelling Gymnocephalus cernua requires explicit taxonomy review.",
    condition: "Possession is prohibited.",
  },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function sourceRecordId(taxon: SourceTaxon) {
  const section = taxon.section.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  const taxonKey = taxon.originalTaxonText.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return `RI-250-RICR-40-05-3/${section}/${taxonKey}`;
}

async function captureArtifact() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "Project-Isitusa/1.0 (+https://isitusa.com)" },
  });
  assert(response.ok, `Rhode Island rule acquisition failed with HTTP ${response.status}.`);
  const artifact = Buffer.from(await response.arrayBuffer());
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Rhode Island rule bytes changed after acquisition preflight; review the new artifact before capture.",
  );
  fs.mkdirSync(path.dirname(ARTIFACT_PATH), { recursive: true });
  fs.writeFileSync(ARTIFACT_PATH, artifact);
}

async function main() {
  if (process.argv.includes("--capture")) await captureArtifact();
  const artifact = fs.readFileSync(ARTIFACT_PATH);
  assert(
    artifact.length === ARTIFACT_BYTES && sha256(artifact) === ARTIFACT_SHA256,
    "Rhode Island rule artifact hash or byte count changed.",
  );
  assert(
    SOURCE_TAXA.length === 19 &&
      new Set(SOURCE_TAXA.map((taxon) => `${taxon.section}:${taxon.originalTaxonText}`)).size === 19,
    "Rhode Island reviewed source boundary changed.",
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
  ) as CatalogSpecies[];
  const catalogByScientificName = new Map(
    catalog.map((species) => [species.scientificName.toLowerCase(), species]),
  );
  const acceptedEvents = SOURCE_TAXA.flatMap((taxon) => {
    if (taxon.blockReason || !taxon.scientificName) return [];
    const species = catalogByScientificName.get(taxon.scientificName.toLowerCase());
    assert(species, `Accepted Rhode Island taxon ${taxon.scientificName} no longer matches the catalog.`);
    return [{
      eventId: `${SOURCE_ID}-${species.id}`,
      sourceRecordId: sourceRecordId(taxon),
      originalTaxonText: taxon.scientificName,
      scientificName: species.scientificName,
      speciesId: species.id,
      applicability: "applicable",
      priority: "regulated",
      matchMethod: "exact-canonical-binomial",
      reviewStatus: "accepted",
      note: `Exact 250-RICR-40-05-3 ${taxon.section} membership, effective ${EFFECTIVE_DATE} and current as of ${AS_OF}, establishes Rhode Island regulatory applicability only. The retained source row is "${taxon.originalTaxonText}". ${taxon.condition} It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
    }];
  });
  const blockedRows = SOURCE_TAXA.flatMap((taxon) => {
    if (!taxon.blockReason) return [];
    return [{
      sourceRecordId: sourceRecordId(taxon),
      originalTaxonText: `${taxon.section}: ${taxon.originalTaxonText}`,
      reason: `${taxon.blockReason} ${taxon.condition}`,
      reviewStatus: "blocked" as const,
    }];
  });
  assert(
    acceptedEvents.length === 3 && blockedRows.length === 16,
    `Expected 3 accepted and 16 blocked Rhode Island rows; found ${acceptedEvents.length} and ${blockedRows.length}.`,
  );
  assert(
    new Set(acceptedEvents.map((event) => event.eventId)).size === acceptedEvents.length,
    "Rhode Island accepted events contain duplicate identities.",
  );
  const review = {
    schemaVersion: 1,
    reviewId: "ri-250-ricr-40-05-3-20260801",
    sourceId: SOURCE_ID,
    stateCode: "RI",
    sourceUrl: SOURCE_URL,
    retrievedAt: RETRIEVED_AT,
    reviewedAt: REVIEWED_AT,
    artifact: {
      path: "artifacts/rhode-island-250-ricr-40-05-3-current.pdf",
      sha256: ARTIFACT_SHA256,
      bytes: ARTIFACT_BYTES,
      mediaType: "application/pdf",
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
  process.stdout.write(`${JSON.stringify({
    sourceId: SOURCE_ID,
    homepage: HOMEPAGE,
    sourceRows: SOURCE_TAXA.length,
    acceptedEvents: acceptedEvents.length,
    blockedRows: blockedRows.length,
    artifactSha256: ARTIFACT_SHA256,
    artifactBytes: ARTIFACT_BYTES,
  }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
