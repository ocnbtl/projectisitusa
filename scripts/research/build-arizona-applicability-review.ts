import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

type CatalogSpecies = {
  id: string;
  scientificName: string;
};

type ListClass = "A" | "B" | "C";

type SourceTaxon = {
  listClass: ListClass;
  row: number;
  commonName: string;
  scientificName: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "az-r3-4-245";
const SOURCE_URL =
  "https://apps.azsos.gov/public_services/Title_03/3-04.pdf";
const SOURCE_DIRECTORY = path.join(
  ROOT,
  "src/data/research/state-list-sources",
  "20260804__az-r3-4-245__b49c4428f118",
);
const ARTIFACT_PATH = path.join(
  SOURCE_DIRECTORY,
  "artifacts/arizona-title-3-chapter-4-supp-25-1.pdf",
);
const ARTIFACT_SHA256 =
  "b49c4428f1182fbe458de2d6219c4694aa556de617d212db2fec18c1a4347308";
const ARTIFACT_BYTES = 2738828;
const SUPPLEMENT_DATE = "2025-03-31";
const RULE_EFFECTIVE_DATE = "2024-02-04";
const RETRIEVED_AT = "2026-08-04T19:55:58.602Z";
const REVIEWED_AT = "2026-08-04T20:15:00.000Z";

const SOURCE_TAXA: SourceTaxon[] = [
  { listClass: "A", row: 1, commonName: "African rue", scientificName: "Peganum harmala" },
  { listClass: "A", row: 2, commonName: "Canada thistle", scientificName: "Cirsium arvense" },
  { listClass: "A", row: 3, commonName: "Dudaim melon", scientificName: "Cucumis melo v. Dudaim Naudin" },
  { listClass: "A", row: 4, commonName: "Dyer's woad", scientificName: "Isatis tinctoria" },
  { listClass: "A", row: 5, commonName: "Floating water hyacinth", scientificName: "Eichhornia crassipes" },
  { listClass: "A", row: 6, commonName: "Giant salvinia", scientificName: "Salvinia molesta" },
  { listClass: "A", row: 7, commonName: "Globe-podded hoary cress", scientificName: "Lepidium (Cardaria) draba" },
  { listClass: "A", row: 8, commonName: "Hydrilla", scientificName: "Hydrilla verticillata" },
  { listClass: "A", row: 9, commonName: "Leafy spurge", scientificName: "Euphorbia esula" },
  { listClass: "A", row: 10, commonName: "Plumeless thistle", scientificName: "Carduus acanthoides" },
  { listClass: "A", row: 11, commonName: "Purple loosestrife", scientificName: "Lythrum salicaria" },
  { listClass: "A", row: 12, commonName: "Purple starthistle", scientificName: "Centaurea calcitrapa" },
  { listClass: "A", row: 13, commonName: "Quackgrass", scientificName: "Elymus repens (Elytrigia repens)" },
  { listClass: "A", row: 14, commonName: "Rush skeletonweed", scientificName: "Chondrilla juncea" },
  { listClass: "A", row: 15, commonName: "Southern sandbur", scientificName: "Cenchrus echinatus" },
  { listClass: "A", row: 16, commonName: "Spotted knapweed", scientificName: "Centaurea stoebe ssp. micranthos" },
  { listClass: "A", row: 17, commonName: "Sweet resinbush", scientificName: "Euryops subcarnosus" },
  { listClass: "A", row: 18, commonName: "Ward's weed", scientificName: "Carrichtera annua" },
  { listClass: "A", row: 19, commonName: "Wild mustard", scientificName: "Sinapis arvensis" },
  { listClass: "B", row: 1, commonName: "African sumac", scientificName: "Searsia lancea" },
  { listClass: "B", row: 2, commonName: "Black mustard", scientificName: "Brassica nigra" },
  { listClass: "B", row: 3, commonName: "Branched broomrape", scientificName: "Orobanche ramosa" },
  { listClass: "B", row: 4, commonName: "Bull thistle", scientificName: "Cirsium vulgare" },
  { listClass: "B", row: 5, commonName: "Camelthorn", scientificName: "Alhagi maurorum (A. pseudalhagi)" },
  { listClass: "B", row: 6, commonName: "Dalmatian toadflax", scientificName: "Linaria dalmatica (L genistifolia v. dalmatica)" },
  { listClass: "B", row: 7, commonName: "Diffuse knapweed", scientificName: "Centaurea diffusa" },
  { listClass: "B", row: 8, commonName: "Field sandbur", scientificName: "Cenchrus spinifex (synonym: C. incertus)" },
  { listClass: "B", row: 9, commonName: "Giant reed", scientificName: "Arundo donax" },
  { listClass: "B", row: 10, commonName: "Halogeton", scientificName: "Halogeton glomeratus" },
  { listClass: "B", row: 11, commonName: "Jointed goatgrass", scientificName: "Aegilops cylindrica" },
  { listClass: "B", row: 12, commonName: "Malta starthistle", scientificName: "Centaurea melitensis" },
  { listClass: "B", row: 13, commonName: "Musk thistle", scientificName: "Carduus nutans" },
  { listClass: "B", row: 14, commonName: "Natal grass", scientificName: "Melinis repens" },
  { listClass: "B", row: 15, commonName: "Onionweed", scientificName: "Asphodelus fistulosus" },
  { listClass: "B", row: 16, commonName: "Ripgut brome", scientificName: "Bromus diandrus" },
  { listClass: "B", row: 17, commonName: "Russian knapweed", scientificName: "Acroptilon repens" },
  { listClass: "B", row: 18, commonName: "Russian olive", scientificName: "Elaeagnus angustifolia" },
  { listClass: "B", row: 19, commonName: "Saharan mustard", scientificName: "Brassica tournefortii" },
  { listClass: "B", row: 20, commonName: "Siberian elm", scientificName: "Ulmus pumila" },
  { listClass: "B", row: 21, commonName: "Stinknet (Globe chamomile)", scientificName: "Oncosiphon pilulifer (O. piluliferum)" },
  { listClass: "B", row: 22, commonName: "Scotch thistle", scientificName: "Onopordum acanthium" },
  { listClass: "B", row: 23, commonName: "Yellow bluestem", scientificName: "Bothriochloa ischaemum" },
  { listClass: "B", row: 24, commonName: "Yellow starthistle", scientificName: "Centaurea solstitialis" },
  { listClass: "C", row: 1, commonName: "Buffelgrass", scientificName: "Cenchrus ciliaris (Pennisetum ciliare)" },
  { listClass: "C", row: 2, commonName: "Cheatgrass", scientificName: "Bromus tectorum" },
  { listClass: "C", row: 3, commonName: "Field bindweed", scientificName: "Convolvulus arvensis" },
  { listClass: "C", row: 4, commonName: "Fountain grass", scientificName: "Pennisetum setaceum" },
  { listClass: "C", row: 5, commonName: "Garden or common morning glory", scientificName: "Ipomoea purpurea" },
  { listClass: "C", row: 6, commonName: "Grannyvine", scientificName: "Ipomoea tricolor" },
  { listClass: "C", row: 7, commonName: "Ivy-leaf morning glory", scientificName: "Ipomoea hederacea" },
  { listClass: "C", row: 8, commonName: "Johnsongrass", scientificName: "Sorghum halepense" },
  { listClass: "C", row: 9, commonName: "Kochia", scientificName: "Kochia scoparia" },
  { listClass: "C", row: 10, commonName: "Lehman's lovegrass", scientificName: "Eragrostis lehmanniana" },
  { listClass: "C", row: 11, commonName: "Morning glory", scientificName: "Ipomoea triloba" },
  { listClass: "C", row: 12, commonName: "Morning glory", scientificName: "Ipomoea x leucantha" },
  { listClass: "C", row: 13, commonName: "Puncturevine", scientificName: "Tribulus terrestris" },
  { listClass: "C", row: 14, commonName: "Red brome", scientificName: "Bromus rubens" },
  { listClass: "C", row: 15, commonName: "Salt cedar", scientificName: "Tamarix spp." },
  { listClass: "C", row: 16, commonName: "Siberian elm", scientificName: "Ulmus pumila" },
  { listClass: "C", row: 17, commonName: "Tree of heaven", scientificName: "Ailanthus altissima" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sourceRecordId(taxon: SourceTaxon) {
  return `AZ-R3-4-245/table-${taxon.listClass}/${String(taxon.row).padStart(2, "0")}`;
}

const artifact = fs.readFileSync(ARTIFACT_PATH);
assert(
  artifact.length === ARTIFACT_BYTES &&
    createHash("sha256").update(artifact).digest("hex") === ARTIFACT_SHA256,
  "Arizona rule artifact hash or byte count changed.",
);
assert(
  SOURCE_TAXA.length === 60 &&
    SOURCE_TAXA.filter((taxon) => taxon.listClass === "A").length === 19 &&
    SOURCE_TAXA.filter((taxon) => taxon.listClass === "B").length === 24 &&
    SOURCE_TAXA.filter((taxon) => taxon.listClass === "C").length === 17 &&
    new Set(SOURCE_TAXA.map(sourceRecordId)).size === SOURCE_TAXA.length,
  "Arizona R3-4-245 reviewed-table transcription denominator changed.",
);

const catalog = JSON.parse(
  fs.readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8"),
) as CatalogSpecies[];
const catalogByScientificName = new Map(
  catalog.map((species) => [species.scientificName.toLowerCase(), species]),
);
const isExactBinomial = (value: string) =>
  /^[A-Z][a-z-]+ [a-z][a-z-]+$/u.test(value);
const acceptedEvents = SOURCE_TAXA.flatMap((taxon) => {
  const species = catalogByScientificName.get(
    taxon.scientificName.toLowerCase(),
  );
  if (!species || !isExactBinomial(taxon.scientificName)) return [];
  return [
    {
      eventId: `${SOURCE_ID}-table-${taxon.listClass.toLowerCase()}-${species.id}`,
      sourceRecordId: sourceRecordId(taxon),
      originalTaxonText: taxon.scientificName,
      scientificName: species.scientificName,
      speciesId: species.id,
      applicability: "applicable",
      priority: "regulated",
      matchMethod: "exact-canonical-binomial",
      reviewStatus: "accepted",
      note: `Exact Arizona Administrative Code R3-4-245 Table ${taxon.listClass} membership, effective ${RULE_EFFECTIVE_DATE} in the official supplement dated ${SUPPLEMENT_DATE}, establishes state regulatory applicability only. It creates no county occurrence, absence, not-detected, or not-applicable claim.`,
    },
  ];
});
const blockedRows = SOURCE_TAXA.flatMap((taxon) => {
  const species = catalogByScientificName.get(
    taxon.scientificName.toLowerCase(),
  );
  if (species && isExactBinomial(taxon.scientificName)) return [];
  return [
    {
      sourceRecordId: sourceRecordId(taxon),
      originalTaxonText: `${taxon.commonName} (${taxon.scientificName})`,
      reason:
        "No exact current catalog binomial was accepted. Synonym, variety, subspecies, hybrid, genus, source spelling, or unmatched taxonomy requires separate review.",
      reviewStatus: "blocked" as const,
    },
  ];
});
assert(
  acceptedEvents.length + blockedRows.length === SOURCE_TAXA.length,
  "Arizona accepted and blocked rows do not reconcile to the reviewed source denominator.",
);
assert(
  acceptedEvents.length === 40 &&
    new Set(acceptedEvents.map((event) => event.speciesId)).size === 39 &&
    blockedRows.length === 20,
  `Expected 40 accepted events across 39 species and 20 blocked Arizona rows; found ${acceptedEvents.length}, ${new Set(acceptedEvents.map((event) => event.speciesId)).size}, and ${blockedRows.length}.`,
);
assert(
  new Set(acceptedEvents.map((event) => event.eventId)).size ===
    acceptedEvents.length,
  "Arizona accepted events contain duplicate identities.",
);

const review = {
  schemaVersion: 1,
  reviewId: "az-r3-4-245-20260804",
  sourceId: SOURCE_ID,
  stateCode: "AZ",
  sourceUrl: SOURCE_URL,
  retrievedAt: RETRIEVED_AT,
  reviewedAt: REVIEWED_AT,
  artifact: {
    path: "artifacts/arizona-title-3-chapter-4-supp-25-1.pdf",
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
process.stdout.write(
  `${JSON.stringify(
    {
      sourceId: SOURCE_ID,
      supplementDate: SUPPLEMENT_DATE,
      ruleEffectiveDate: RULE_EFFECTIVE_DATE,
      rowsByClass: Object.fromEntries(
        (["A", "B", "C"] as const).map((listClass) => [
          listClass,
          SOURCE_TAXA.filter((taxon) => taxon.listClass === listClass).length,
        ]),
      ),
      sourceRows: SOURCE_TAXA.length,
      acceptedEvents: acceptedEvents.length,
      acceptedSpecies: new Set(
        acceptedEvents.map((event) => event.speciesId),
      ).size,
      blockedRows: blockedRows.length,
      artifactSha256: ARTIFACT_SHA256,
      artifactBytes: ARTIFACT_BYTES,
      acquisitionMethod: "official-pdf-browser-download",
      reviewMethod:
        "complete-tables-4-6-transcription-cross-checked-with-pypdf-and-rendered-pages",
    },
    null,
    2,
  )}\n`,
);
