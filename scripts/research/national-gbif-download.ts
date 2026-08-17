import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

export const GBIF_NATIONAL_DOWNLOAD_ACTOR =
  "gbif-national-download-acquisition@1.0.0" as const;
export const GBIF_SOURCE_ID = "gbif-preserved-specimens" as const;
export const GBIF_API_BASE_URL = "https://api.gbif.org/v1" as const;
export const GBIF_DOWNLOAD_REQUEST_URL =
  `${GBIF_API_BASE_URL}/occurrence/download/request` as const;
export const GBIF_DOWNLOAD_STATUS_URL =
  `${GBIF_API_BASE_URL}/occurrence/download` as const;

const StateCodeSchema = z.string().regex(/^[A-Z]{2}$/u);

export const NationalGbifDownloadPlanSchema = z.object({
  schemaVersion: z.literal(1),
  planId: z.string().regex(/^gbif-national-download-v1-[a-z0-9-]+$/u),
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
  selectionEvidencePath: z.string().regex(/^ops\/national-research\/evaluations\/[a-z0-9.-]+\.json$/u),
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
});

export type NationalGbifDownloadPlan = z.infer<typeof NationalGbifDownloadPlanSchema>;

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
