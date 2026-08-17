import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import { resolveCountyEquivalent } from "@/lib/research/geography-registry";

export const GBIF_NATIONAL_DOWNLOAD_ACTOR =
  "gbif-national-download-acquisition@2.0.0" as const;
export const GBIF_SOURCE_ID = "gbif-preserved-specimens" as const;
export const GBIF_API_BASE_URL = "https://api.gbif.org/v1" as const;
export const GBIF_DOWNLOAD_REQUEST_URL =
  `${GBIF_API_BASE_URL}/occurrence/download/request` as const;
export const GBIF_DOWNLOAD_STATUS_URL =
  `${GBIF_API_BASE_URL}/occurrence/download` as const;

const StateCodeSchema = z.string().regex(/^[A-Z]{2}$/u);

export const NationalGbifDownloadPlanSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  planId: z.string().regex(/^gbif-national-download-v[12]-[a-z0-9-]+$/u),
  sourceId: z.literal(GBIF_SOURCE_ID),
  snapshotDate: z.string().date(),
  apiBaseUrl: z.literal(GBIF_API_BASE_URL),
  requestUrl: z.literal(GBIF_DOWNLOAD_REQUEST_URL),
  statusUrl: z.literal(GBIF_DOWNLOAD_STATUS_URL),
  documentationUrl: z.literal("https://techdocs.gbif.org/en/data-use/api-downloads"),
  taxonomyDocumentationUrl: z.literal("https://techdocs.gbif.org/en/data-processing/taxonomy-interpretation"),
  termsUrl: z.literal("https://www.gbif.org/terms"),
  format: z.literal("DWCA"),
  countryCode: z.literal("US"),
  basisOfRecord: z.literal("PRESERVED_SPECIMEN"),
  occurrenceStatus: z.literal("PRESENT"),
  taxonomyMode: z.literal("legacy-gbif-backbone-retained-identifiers"),
  checklistKey: z.null(),
  taxonomyCachePath: z.string().regex(/^src\/data\/research\/caches\/gbif-taxonomy-[a-z0-9-]+\.json$/u),
  taxonomyCacheSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  speciesIds: z.array(z.string().regex(/^[a-z0-9-]+$/u)).min(1).max(500),
  nationalV1StateCodes: z.array(StateCodeSchema).length(51),
  artifactBudgetBytes: z.number().int().min(1_048_576).max(53_687_091_200),
  pollIntervalSeconds: z.number().int().min(15).max(300),
  maxPollMinutes: z.number().int().min(15).max(1_440),
  baselineGeneratedAsOf: z.string().date(),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  selectionId: z.string().regex(/^round-[0-9]+-gbif-national-selection-[0-9]{8}-r[0-9]+$/u).optional(),
  selectionTimestamp: z.string().datetime().optional(),
  selectionPolicy: z.string().min(1).optional(),
  selectionUniversePlanPath: z.string().regex(/^src\/data\/research\/national-acquisition-plans\/gbif-national-download-v1-[a-z0-9-]+\.json$/u).optional(),
  selectionUniversePlanSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  selectionNetThreshold: z.number().int().min(1).max(30_000).optional(),
  selectionEvidencePath: z.string().regex(/^ops\/national-research\/evaluations\/[a-z0-9.-]+\.json$/u),
  selectionEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/u).optional(),
  expectedGrossPairs: z.number().int().positive().optional(),
  expectedNotResearchedPairsAtBaseline: z.number().int().positive().optional(),
  expectedBlockedPairsAtBaseline: z.number().int().nonnegative().optional(),
  expectedAlreadyResearchedPairsAtBaseline: z.number().int().nonnegative().optional(),
  maxOccurrenceRows: z.number().int().min(1).max(2_000_000).optional(),
  maxSelectedEvidenceRecords: z.number().int().min(1).max(250_000).optional(),
  requiredCredentialEnvironment: z.tuple([
    z.literal("GBIF_USERNAME"),
    z.literal("GBIF_PASSWORD"),
    z.literal("GBIF_EMAIL"),
  ]),
}).strict().superRefine((value, context) => {
  if (new Set(value.speciesIds).size !== value.speciesIds.length) {
    context.addIssue({ code: "custom", message: "GBIF plan species IDs must be unique." });
  }
  if ([...value.speciesIds].sort(compareText).join("\n") !== value.speciesIds.join("\n")) {
    context.addIssue({ code: "custom", message: "GBIF plan species IDs must be sorted." });
  }
  if (new Set(value.nationalV1StateCodes).size !== value.nationalV1StateCodes.length) {
    context.addIssue({ code: "custom", message: "GBIF plan state codes must be unique." });
  }
  if (value.schemaVersion === 2) {
    if (value.artifactBudgetBytes > 268_435_456) {
      context.addIssue({ code: "custom", message: "GBIF v2 archive budget cannot exceed 256 MiB." });
    }
    for (const name of [
      "selectionEvidenceSha256",
      "selectionId",
      "selectionTimestamp",
      "selectionPolicy",
      "selectionUniversePlanPath",
      "selectionUniversePlanSha256",
      "selectionNetThreshold",
      "expectedGrossPairs",
      "expectedNotResearchedPairsAtBaseline",
      "expectedBlockedPairsAtBaseline",
      "expectedAlreadyResearchedPairsAtBaseline",
      "maxOccurrenceRows",
      "maxSelectedEvidenceRecords",
    ] as const) {
      if (value[name] === undefined) context.addIssue({ code: "custom", message: `GBIF v2 plan requires ${name}.` });
    }
    if (
      value.expectedGrossPairs !== undefined &&
      value.expectedNotResearchedPairsAtBaseline !== undefined &&
      value.expectedBlockedPairsAtBaseline !== undefined &&
      value.expectedAlreadyResearchedPairsAtBaseline !== undefined &&
      value.expectedGrossPairs !== value.expectedNotResearchedPairsAtBaseline + value.expectedBlockedPairsAtBaseline + value.expectedAlreadyResearchedPairsAtBaseline
    ) {
      context.addIssue({ code: "custom", message: "GBIF v2 baseline pair classes do not reconcile to gross scope." });
    }
  }
});

export type NationalGbifDownloadPlan = z.infer<typeof NationalGbifDownloadPlanSchema>;

export function nationalGbifAcquisitionInputPaths(
  plan: NationalGbifDownloadPlan,
  planPath: string,
) {
  if (plan.schemaVersion !== 2 || !plan.selectionUniversePlanPath) {
    throw new Error("GBIF acquisition inputs require a v2 plan with a selection universe.");
  }
  return [
    planPath,
    plan.selectionEvidencePath,
    plan.taxonomyCachePath,
    plan.selectionUniversePlanPath,
    "scripts/research/national-gbif-download.ts",
    "scripts/research/national-gbif-download-replay.ts",
    "scripts/research/run-national-gbif-download.ts",
    "scripts/research/partition-national-gbif-download.ts",
    "scripts/research/verify-national-gbif-download.ts",
    "scripts/research/zip-tools.ts",
    "src/data/research/source-registry.json",
    "src/data/research/state-registry.json",
    "src/data/research/county-equivalent-registry.json",
    "src/data/research/schemas/national-gbif-download-plan.schema.json",
    "src/data/research/schemas/national-gbif-download-selection.schema.json",
    "src/data/research/schemas/national-gbif-download-acquisition-receipt.schema.json",
  ].sort(compareText);
}

export const NationalGbifSelectionSchema = z.object({
  schemaVersion: z.literal(1),
  selectionId: z.string().regex(/^round-[0-9]+-gbif-national-selection-[0-9]{8}-r[0-9]+$/u),
  sourceId: z.literal(GBIF_SOURCE_ID),
  planId: z.string().regex(/^gbif-national-download-v2-[a-z0-9-]+$/u),
  baselineCommit: z.string().regex(/^[a-f0-9]{40}$/u),
  baselineGeneratedAsOf: z.string().date(),
  selectedAt: z.string().datetime(),
  selectionPolicy: z.string().min(1),
  acquisitionShape: z.string().min(1),
  selectionThreshold: z.number().int().min(1).max(30_000),
  counts: z.object({
    stateCount: z.literal(51),
    activeCountyCount: z.literal(3144),
    taxonCount: z.number().int().positive(),
    grossPairs: z.number().int().positive(),
    notResearchedPairs: z.number().int().min(1).max(30_000),
    blockedPairs: z.number().int().nonnegative(),
    alreadyResearchedPairs: z.number().int().nonnegative(),
    expectedNetMovement: z.number().int().min(1).max(30_000),
  }).strict(),
  credentialReadiness: z.object({
    status: z.literal("blocked-external-credentials-before-network"),
    requiredEnvironmentNames: z.tuple([
      z.literal("GBIF_USERNAME"),
      z.literal("GBIF_PASSWORD"),
      z.literal("GBIF_EMAIL"),
    ]),
    valuesPersisted: z.literal(false),
  }).strict(),
  semantics: z.object({
    completeZeroEvidenceBecomesResearchedUnresolved: z.literal(true),
    completeAcceptedEvidenceBecomesVerifiedPresent: z.literal(true),
    createsAbsence: z.literal(false),
    createsNotDetected: z.literal(false),
    failureOrIncompleteCreatesNegative: z.literal(false),
    coordinateCountyAssignmentAllowed: z.literal(false),
  }).strict(),
  taxa: z.array(z.object({
    speciesId: z.string().regex(/^[a-z0-9-]+$/u),
    scientificName: z.string().min(3),
    taxonKey: z.number().int().positive(),
    grossPairs: z.number().int().positive(),
    notResearchedPairs: z.number().int().nonnegative(),
    blockedPairs: z.number().int().nonnegative(),
    alreadyResearchedPairs: z.number().int().nonnegative(),
  }).strict()).min(1).max(500),
  rankedEligibleTaxa: z.array(z.object({
    speciesId: z.string().regex(/^[a-z0-9-]+$/u),
    scientificName: z.string().min(3),
    taxonKey: z.number().int().positive(),
    grossPairs: z.number().int().positive(),
    notResearchedPairs: z.number().int().nonnegative(),
    blockedPairs: z.number().int().nonnegative(),
    alreadyResearchedPairs: z.number().int().nonnegative(),
  }).strict()).min(1).max(500),
  candidatePairSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  stateScopes: z.array(z.object({
    stateCode: StateCodeSchema,
    grossPairs: z.number().int().positive(),
    notResearchedPairs: z.number().int().nonnegative(),
    blockedPairs: z.number().int().nonnegative(),
    alreadyResearchedPairs: z.number().int().nonnegative(),
    candidatePairSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    candidatePairs: z.array(z.string().regex(/^[0-9]{5}:[a-z0-9-]+$/u)).max(30_000),
  }).strict()).length(51),
}).strict();

export type NationalGbifSelection = z.infer<typeof NationalGbifSelectionSchema>;

const TaxonomyCacheSchema = z.object({
  schemaVersion: z.literal(1),
  cacheId: z.string().min(1),
  sourceId: z.literal(GBIF_SOURCE_ID),
  entries: z.array(z.object({
    speciesId: z.string(),
    scientificName: z.string(),
    status: z.number().int(),
    responseBodyBase64: z.string().min(1),
    responseBodySha256: z.string().regex(/^[a-f0-9]{64}$/u),
  }).passthrough()),
}).passthrough();

const MatchBodySchema = z.object({
  usageKey: z.number().int().positive(),
  canonicalName: z.string().min(3),
  rank: z.literal("SPECIES"),
  confidence: z.number().min(95),
  matchType: z.literal("EXACT"),
}).passthrough();

export type GbifNationalTaxon = {
  speciesId: string;
  scientificName: string;
  taxonKey: number;
  confidence: number;
  taxonomyResponseSha256: string;
};

export type GbifDownloadRequest = {
  notificationAddresses: string[];
  sendNotification: true;
  format: "DWCA";
  description: string;
  predicate: {
    type: "and";
    predicates: Array<
      | { type: "equals"; key: "COUNTRY" | "BASIS_OF_RECORD" | "OCCURRENCE_STATUS"; value: string }
      | { type: "in"; key: "TAXON_KEY"; values: string[] }
    >;
  };
};

export function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function stableJson(value: unknown) {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return input;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export function loadNationalGbifDownloadPlan(filepath: string) {
  return NationalGbifDownloadPlanSchema.parse(JSON.parse(readFileSync(filepath, "utf8")));
}

export function loadNationalGbifSelection(root: string, plan: NationalGbifDownloadPlan) {
  if (plan.schemaVersion !== 2 || !plan.selectionEvidenceSha256) {
    throw new Error("GBIF national replay requires a v2 plan with a selection hash.");
  }
  const selectionPath = path.resolve(root, plan.selectionEvidencePath);
  const bytes = readFileSync(selectionPath);
  if (sha256(bytes) !== plan.selectionEvidenceSha256) {
    throw new Error("GBIF national selection hash differs from the committed plan.");
  }
  const selection = NationalGbifSelectionSchema.parse(JSON.parse(bytes.toString("utf8")));
  if (
    selection.planId !== plan.planId ||
    selection.baselineCommit !== plan.baselineCommit ||
    selection.baselineGeneratedAsOf !== plan.baselineGeneratedAsOf ||
    selection.selectionId !== plan.selectionId ||
    selection.selectedAt !== plan.selectionTimestamp ||
    selection.selectionPolicy !== plan.selectionPolicy ||
    selection.selectionThreshold !== plan.selectionNetThreshold
  ) {
    throw new Error("GBIF national selection identity differs from the plan.");
  }
  if (selection.counts.expectedNetMovement !== selection.counts.notResearchedPairs) {
    throw new Error("GBIF national selection expected movement differs from its not-researched scope.");
  }
  const stateCodes = selection.stateScopes.map((scope) => scope.stateCode);
  if (
    new Set(stateCodes).size !== stateCodes.length ||
    stateCodes.join("\n") !== plan.nationalV1StateCodes.join("\n")
  ) {
    throw new Error("GBIF national selection state scope order differs from the plan.");
  }
  const selectedSpeciesIds = selection.taxa.map((taxon) => taxon.speciesId);
  if (
    new Set(selectedSpeciesIds).size !== selectedSpeciesIds.length ||
    [...selectedSpeciesIds].sort(compareText).join("\n") !== plan.speciesIds.join("\n") ||
    selection.counts.taxonCount !== selectedSpeciesIds.length
  ) {
    throw new Error("GBIF national selection taxa differ from the plan.");
  }
  const universePlanPath = path.resolve(root, plan.selectionUniversePlanPath!);
  const universePlanBytes = readFileSync(universePlanPath);
  if (sha256(universePlanBytes) !== plan.selectionUniversePlanSha256) {
    throw new Error("GBIF national selection universe plan hash changed.");
  }
  const universePlan = loadNationalGbifDownloadPlan(universePlanPath);
  const universeTaxa = resolveNationalGbifTaxa(root, universePlan);
  const rankedSpeciesIds = selection.rankedEligibleTaxa.map((taxon) => taxon.speciesId);
  if (
    new Set(rankedSpeciesIds).size !== rankedSpeciesIds.length ||
    [...rankedSpeciesIds].sort(compareText).join("\n") !== universePlan.speciesIds.join("\n") ||
    selection.rankedEligibleTaxa.some((taxon, index, values) =>
      index > 0 && (
        values[index - 1]!.notResearchedPairs < taxon.notResearchedPairs ||
        (values[index - 1]!.notResearchedPairs === taxon.notResearchedPairs &&
          compareText(values[index - 1]!.speciesId, taxon.speciesId) > 0)
      )
    )
  ) {
    throw new Error("GBIF national selection ranked universe is incomplete or out of order.");
  }
  const universeTaxonBySpecies = new Map(universeTaxa.map((taxon) => [taxon.speciesId, taxon]));
  for (const taxon of selection.rankedEligibleTaxa) {
    const retained = universeTaxonBySpecies.get(taxon.speciesId);
    if (
      !retained || retained.scientificName !== taxon.scientificName || retained.taxonKey !== taxon.taxonKey ||
      taxon.grossPairs !== taxon.notResearchedPairs + taxon.blockedPairs + taxon.alreadyResearchedPairs
    ) {
      throw new Error(`GBIF ranked selection taxon ${taxon.speciesId} differs from the retained universe.`);
    }
  }
  let rankedNet = 0;
  const minimalPrefix: string[] = [];
  for (const taxon of selection.rankedEligibleTaxa) {
    if (rankedNet >= selection.selectionThreshold) break;
    minimalPrefix.push(taxon.speciesId);
    rankedNet += taxon.notResearchedPairs;
  }
  if (
    rankedNet < selection.selectionThreshold ||
    [...minimalPrefix].sort(compareText).join("\n") !== plan.speciesIds.join("\n")
  ) {
    throw new Error("GBIF national selection is not the smallest ranked prefix clearing its threshold.");
  }
  const pairs = selection.stateScopes.flatMap((scope) => scope.candidatePairs);
  if (new Set(pairs).size !== pairs.length) throw new Error("GBIF national selection repeats pair keys.");
  if (sha256(`${pairs.join("\n")}\n`) !== selection.candidatePairSha256) {
    throw new Error("GBIF national selection pair hash differs.");
  }
  for (const scope of selection.stateScopes) {
    if (scope.grossPairs !== scope.notResearchedPairs + scope.blockedPairs + scope.alreadyResearchedPairs) {
      throw new Error(`GBIF ${scope.stateCode} pair classes do not reconcile.`);
    }
    if (scope.candidatePairs.length !== scope.notResearchedPairs) {
      throw new Error(`GBIF ${scope.stateCode} selected pair count differs.`);
    }
    if (sha256(`${scope.candidatePairs.join("\n")}\n`) !== scope.candidatePairSha256) {
      throw new Error(`GBIF ${scope.stateCode} selected pair hash differs.`);
    }
    if ([...scope.candidatePairs].sort(compareText).join("\n") !== scope.candidatePairs.join("\n")) {
      throw new Error(`GBIF ${scope.stateCode} candidate pairs are not sorted.`);
    }
    for (const pair of scope.candidatePairs) {
      const [countyFips, speciesId] = pair.split(":");
      if (
        !plan.speciesIds.includes(speciesId!) ||
        resolveCountyEquivalent({ stateCode: scope.stateCode, countyFips }).status !== "resolved"
      ) {
        throw new Error(`GBIF ${scope.stateCode} candidate pair ${pair} is outside its state or taxon scope.`);
      }
    }
  }
  const stateSums = selection.stateScopes.reduce(
    (totals, scope) => ({
      grossPairs: totals.grossPairs + scope.grossPairs,
      notResearchedPairs: totals.notResearchedPairs + scope.notResearchedPairs,
      blockedPairs: totals.blockedPairs + scope.blockedPairs,
      alreadyResearchedPairs: totals.alreadyResearchedPairs + scope.alreadyResearchedPairs,
    }),
    { grossPairs: 0, notResearchedPairs: 0, blockedPairs: 0, alreadyResearchedPairs: 0 },
  );
  const taxonSums = selection.taxa.reduce(
    (totals, taxon) => ({
      grossPairs: totals.grossPairs + taxon.grossPairs,
      notResearchedPairs: totals.notResearchedPairs + taxon.notResearchedPairs,
      blockedPairs: totals.blockedPairs + taxon.blockedPairs,
      alreadyResearchedPairs: totals.alreadyResearchedPairs + taxon.alreadyResearchedPairs,
    }),
    { grossPairs: 0, notResearchedPairs: 0, blockedPairs: 0, alreadyResearchedPairs: 0 },
  );
  if (
    stableJson(stateSums) !== stableJson(taxonSums) ||
    stateSums.grossPairs !== selection.counts.grossPairs ||
    stateSums.notResearchedPairs !== selection.counts.notResearchedPairs ||
    stateSums.blockedPairs !== selection.counts.blockedPairs ||
    stateSums.alreadyResearchedPairs !== selection.counts.alreadyResearchedPairs
  ) {
    throw new Error("GBIF national selection state, taxon, and global counts do not reconcile.");
  }
  if (
    selection.counts.grossPairs !== plan.expectedGrossPairs ||
    selection.counts.notResearchedPairs !== plan.expectedNotResearchedPairsAtBaseline ||
    selection.counts.blockedPairs !== plan.expectedBlockedPairsAtBaseline ||
    selection.counts.alreadyResearchedPairs !== plan.expectedAlreadyResearchedPairsAtBaseline
  ) {
    throw new Error("GBIF national selection counts differ from the plan.");
  }
  return { selectionPath, selection, bytes };
}

export function resolveNationalGbifTaxa(root: string, plan: NationalGbifDownloadPlan) {
  const cachePath = path.resolve(root, plan.taxonomyCachePath);
  const cacheBytes = readFileSync(cachePath);
  if (sha256(cacheBytes) !== plan.taxonomyCacheSha256) {
    throw new Error("GBIF taxonomy cache hash differs from the committed plan.");
  }
  const cache = TaxonomyCacheSchema.parse(JSON.parse(cacheBytes.toString("utf8")));
  const bySpecies = new Map(cache.entries.map((entry) => [entry.speciesId, entry]));
  const taxa = plan.speciesIds.map((speciesId) => {
    const entry = bySpecies.get(speciesId);
    if (!entry) throw new Error(`GBIF taxonomy cache lacks planned species ${speciesId}.`);
    if (entry.status !== 200) throw new Error(`GBIF taxonomy cache response for ${speciesId} was not successful.`);
    const bodyBytes = Buffer.from(entry.responseBodyBase64, "base64");
    if (sha256(bodyBytes) !== entry.responseBodySha256) {
      throw new Error(`GBIF taxonomy response hash differs for ${speciesId}.`);
    }
    const match = MatchBodySchema.parse(JSON.parse(bodyBytes.toString("utf8")));
    if (match.canonicalName.toLocaleLowerCase("en-US") !== entry.scientificName.toLocaleLowerCase("en-US")) {
      throw new Error(`GBIF exact canonical name differs for ${speciesId}.`);
    }
    return {
      speciesId,
      scientificName: entry.scientificName,
      taxonKey: match.usageKey,
      confidence: match.confidence,
      taxonomyResponseSha256: entry.responseBodySha256,
    } satisfies GbifNationalTaxon;
  });
  if (new Set(taxa.map((entry) => entry.taxonKey)).size !== taxa.length) {
    throw new Error("GBIF national taxa contain duplicate retained taxon keys.");
  }
  return taxa;
}

export function buildGbifDownloadRequest(
  plan: NationalGbifDownloadPlan,
  taxa: GbifNationalTaxon[],
  notificationEmail: string,
): GbifDownloadRequest {
  if (!/^\S+@\S+\.\S+$/u.test(notificationEmail)) {
    throw new Error("GBIF_EMAIL must be a valid notification address.");
  }
  return {
    notificationAddresses: [notificationEmail],
    sendNotification: true,
    format: plan.format,
    description: `Project Isitusa ${plan.planId}: taxon-bounded US preserved specimens`,
    predicate: {
      type: "and",
      predicates: [
        { type: "equals", key: "COUNTRY", value: plan.countryCode },
        { type: "equals", key: "BASIS_OF_RECORD", value: plan.basisOfRecord },
        { type: "equals", key: "OCCURRENCE_STATUS", value: plan.occurrenceStatus },
        {
          type: "in",
          key: "TAXON_KEY",
          values: taxa.map((entry) => String(entry.taxonKey)).sort(compareText),
        },
      ],
    },
  };
}

export function redactGbifDownloadRequest(request: GbifDownloadRequest) {
  return { ...request, notificationAddresses: ["[redacted]"] };
}

export function gbifCredentialReadiness(environment: Readonly<Record<string, string | undefined>>) {
  const presence = {
    GBIF_USERNAME: Boolean(environment.GBIF_USERNAME?.trim()),
    GBIF_PASSWORD: Boolean(environment.GBIF_PASSWORD),
    GBIF_EMAIL: Boolean(environment.GBIF_EMAIL?.trim()),
  };
  return {
    ready: Object.values(presence).every(Boolean),
    presence,
    missing: Object.entries(presence).filter(([, present]) => !present).map(([name]) => name).sort(compareText),
  };
}

export const GbifDownloadMetadataSchema = z.object({
  key: z.string().min(1),
  status: z.string().min(1),
  downloadLink: z.string().url().nullish(),
  doi: z.string().nullish(),
  license: z.string().nullish(),
  size: z.number().int().nonnegative().nullish(),
  totalRecords: z.number().int().nonnegative().nullish(),
  created: z.string().nullish(),
  modified: z.string().nullish(),
}).passthrough();

export function publicDownloadMetadata(value: unknown) {
  const metadata = GbifDownloadMetadataSchema.parse(value);
  return {
    key: metadata.key,
    status: metadata.status,
    downloadLink: metadata.downloadLink ?? null,
    doi: metadata.doi ?? null,
    license: metadata.license ?? null,
    size: metadata.size ?? null,
    totalRecords: metadata.totalRecords ?? null,
    created: metadata.created ?? null,
    modified: metadata.modified ?? null,
  };
}

export function downloadStatusDisposition(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCEEDED") return "succeeded" as const;
  if (["CANCELLED", "FAILED", "KILLED"].includes(normalized)) return "failed" as const;
  return "pending" as const;
}
