import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { isCommerciallySafeImageLicense, isCommerciallySafeManifestEntry } from "@/lib/data/image-license";
import { speciesSeed } from "@/data/source/species";
import type {
  SpeciesImageChunkRecord,
  SpeciesImageManifestEntry,
  SpeciesImageManifestFile,
  SpeciesImageProvider,
  SpeciesImageUnresolvedEntry,
  UsRiisSnapshotFile,
  UsRiisSpeciesSnapshot,
} from "@/lib/data/types";

const usRiisSnapshotPath = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);
const manifestPath = resolve(
  process.cwd(),
  "src/data/source/species-image-manifest.json",
);
const imageOutputDir = resolve(process.cwd(), "public/species/catalog");
const DEFAULT_LIMIT = 500;
const DEFAULT_CONCURRENCY = 4;
const MANIFEST_SOURCE_LABELS = [
  "Wikidata exact scientific-name match with Wikimedia Commons image property (P18)",
  "iNaturalist exact scientific-name taxon match fallback with commercially reusable license allowlist",
  "GBIF exact or accepted exact scientific-name match with still-image occurrence media fallback and commercially reusable license allowlist",
] as const;

interface CandidateImageResult {
  localPath: string;
  credit: string;
  sourceLabel: string;
  sourceUrl: string;
  license?: string;
  provider: SpeciesImageProvider;
}

interface ImportArgs {
  offset: number;
  limit: number;
  concurrency: number;
  retryUnresolved: boolean;
}

const INAT_ACCEPTED_RANKS = new Set([
  "species",
  "subspecies",
  "variety",
  "form",
  "hybrid",
  "complex",
]);
const GBIF_ACCEPTED_RANKS = new Set(["SPECIES", "SUBSPECIES", "VARIETY", "FORM"]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeScientificName(value: string) {
  const tokens = normalizeName(value.replace(/\([^)]*\)/g, " "))
    .split(" ")
    .filter(Boolean);
  const canonical: string[] = [];

  for (const token of tokens) {
    if (!canonical.length) {
      canonical.push(token);
      continue;
    }

    if (["x", "×", "ssp.", "subsp.", "var.", "f."].includes(token) || /^[a-z-]+$/.test(token)) {
      canonical.push(token);
      continue;
    }

    break;
  }

  return canonical.join(" ").trim();
}

function baseBinomial(value: string) {
  const parts = value
    .replace(/\b[x×]\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(0, 2).join(" ").trim();
}

function buildNameVariants(value: string) {
  const variants = new Set<string>();
  const cleaned = value.replace(/\s+/g, " ").trim();
  const withoutHybridSymbol = cleaned.replace(/\s*[×xX]\s*/g, " ");
  const addVariant = (candidate: string) => {
    const trimmed = candidate.replace(/\s+/g, " ").trim();
    if (trimmed) variants.add(trimmed);
  };

  addVariant(cleaned);
  addVariant(withoutHybridSymbol);

  const rankTokens = [" var. ", " ssp. ", " subsp. ", " f. "];
  for (const token of rankTokens) {
    if (cleaned.includes(token)) {
      addVariant(cleaned.split(token)[0]);
    }
  }

  const binomial = baseBinomial(cleaned);
  addVariant(binomial);

  return [...variants];
}

function buildCanonicalNameVariants(value: string) {
  return new Set(buildNameVariants(value).map((variant) => canonicalizeScientificName(variant)));
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseArgs(): ImportArgs {
  const args = process.argv.slice(2);
  const getNumberArg = (flag: string, fallback: number) => {
    const index = args.indexOf(flag);
    if (index === -1) return fallback;
    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? value : fallback;
  };

  return {
    offset: getNumberArg("--offset", 0),
    limit: getNumberArg("--limit", DEFAULT_LIMIT),
    concurrency: Math.max(1, getNumberArg("--concurrency", DEFAULT_CONCURRENCY)),
    retryUnresolved: args.includes("--retry-unresolved"),
  };
}

function createEmptyManifest(): SpeciesImageManifestFile {
  return {
    source: [...MANIFEST_SOURCE_LABELS],
    updatedAt: null,
    entries: [],
    unresolved: [],
    chunks: [],
    coverageSummary: {
      catalogSpeciesCount: 0,
      curatedImageCount: speciesSeed.filter((species) => species.image).length,
      downloadedImageCount: 0,
      unresolvedCount: 0,
    },
  };
}

function loadManifest() {
  const manifest = readJsonFile<SpeciesImageManifestFile>(manifestPath) ?? createEmptyManifest();
  manifest.source = [...new Set([...manifest.source, ...MANIFEST_SOURCE_LABELS])];
  return manifest;
}

function getRegistrySpecies() {
  const snapshot = readJsonFile<UsRiisSnapshotFile>(usRiisSnapshotPath);
  if (!snapshot) {
    throw new Error("US-RIIS snapshot is missing. Run `npm run import:usriis` first.");
  }

  return [...snapshot.species].sort((left, right) =>
    left.scientificName.localeCompare(right.scientificName),
  );
}

async function fetchJson<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Project Isitusa species image importer",
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        if (TRANSIENT_HTTP_STATUSES.has(response.status) && attempt < 5) {
          await new Promise((resolve) =>
            setTimeout(resolve, 700 * attempt + Math.round(Math.random() * 250)),
          );
          continue;
        }
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      if (attempt === 5) return null;
      await new Promise((resolve) =>
        setTimeout(resolve, 700 * attempt + Math.round(Math.random() * 250)),
      );
    }
  }

  return null;
}

function getFileExtension(
  contentType: string | null,
  finalUrl: string,
  fallback = ".jpg",
) {
  const pathnameExt = extname(new URL(finalUrl).pathname).toLowerCase();
  if (pathnameExt && [".jpg", ".jpeg", ".png", ".webp"].includes(pathnameExt)) {
    return pathnameExt === ".jpeg" ? ".jpg" : pathnameExt;
  }

  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("jpeg") || contentType?.includes("jpg")) return ".jpg";
  return fallback;
}

function normalizeINaturalistPhotoUrl(photoUrl: string) {
  if (photoUrl.includes("/square.")) {
    return photoUrl.replace("/square.", "/medium.");
  }
  return photoUrl;
}

async function downloadImage(
  url: string,
  slug: string,
): Promise<{ localPath: string } | null> {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Project Isitusa species image importer",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      });

      const contentType = response.headers.get("content-type");
      if (!response.ok) {
        if (TRANSIENT_HTTP_STATUSES.has(response.status) && attempt < 5) {
          await new Promise((resolve) =>
            setTimeout(resolve, 700 * attempt + Math.round(Math.random() * 250)),
          );
          continue;
        }
        return null;
      }

      if (!contentType?.startsWith("image/")) {
        return null;
      }

      const extension = getFileExtension(contentType, response.url);
      const fileName = `${slug}${extension}`;
      const filePath = resolve(imageOutputDir, fileName);
      const body = Buffer.from(await response.arrayBuffer());

      await writeFile(filePath, body);
      return {
        localPath: `/species/catalog/${fileName}`,
      };
    } catch (error) {
      if (attempt === 5) return null;
      await new Promise((resolve) =>
        setTimeout(resolve, 700 * attempt + Math.round(Math.random() * 250)),
      );
    }
  }

  return null;
}

function getWikidataStringClaim(entity: Record<string, unknown>, property: string) {
  const claims = (entity.claims as Record<string, Array<Record<string, unknown>>> | undefined)?.[
    property
  ];
  const value = claims?.[0]?.mainsnak as
    | {
        datavalue?: {
          value?: string;
        };
      }
    | undefined;
  return value?.datavalue?.value ?? null;
}

async function findWikidataImage(
  species: UsRiisSpeciesSnapshot,
): Promise<CandidateImageResult | null> {
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("language", "en");
  searchUrl.searchParams.set("type", "item");
  searchUrl.searchParams.set("limit", "5");
  searchUrl.searchParams.set("search", species.scientificName);

  const search = await fetchJson<{
    search?: Array<{
      id: string;
      label?: string;
    }>;
  }>(searchUrl.toString());

  for (const candidate of search?.search ?? []) {
    const entityData = await fetchJson<{
      entities?: Record<
        string,
        {
          labels?: Record<string, { value: string }>;
          claims?: Record<string, Array<Record<string, unknown>>>;
        }
      >;
    }>(`https://www.wikidata.org/wiki/Special:EntityData/${candidate.id}.json`);

    const entity = entityData?.entities?.[candidate.id];
    if (!entity) continue;

    const taxonName = getWikidataStringClaim(entity, "P225");
    const label = entity.labels?.en?.value ?? candidate.label ?? "";
    const normalizedScientificName = normalizeName(species.scientificName);

    if (
      normalizeName(taxonName ?? "") !== normalizedScientificName &&
      normalizeName(label) !== normalizedScientificName
    ) {
      continue;
    }

    const imageFile = getWikidataStringClaim(entity, "P18");
    if (!imageFile) continue;

    const downloaded = await downloadImage(
      `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(
        imageFile,
      )}?width=1400`,
      slugify(species.scientificName),
    );

    if (!downloaded) continue;

    return {
      ...downloaded,
      credit: "Wikimedia Commons",
      sourceLabel: "Wikidata / Wikimedia Commons",
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(
        imageFile.replace(/ /g, "_"),
      )}`,
      provider: "wikidata-commons",
    };
  }

  return null;
}

async function findINaturalistImage(
  species: UsRiisSpeciesSnapshot,
): Promise<CandidateImageResult | null> {
  const requestedName = normalizeName(species.scientificName);
  const requestedBase = normalizeName(baseBinomial(species.scientificName));
  const variants = buildNameVariants(species.scientificName);
  let bestMatch:
    | ({
        id: number;
        name: string;
        matched_term?: string;
        rank?: string;
        default_photo?: {
          attribution?: string;
          license_code?: string;
          large_url?: string;
          medium_url?: string;
          url?: string;
        };
      } & { score: number })
    | null = null;

  for (const variant of variants) {
    const queryUrl = new URL("https://api.inaturalist.org/v1/taxa");
    queryUrl.searchParams.set("q", variant);
    queryUrl.searchParams.set("all_names", "true");
    queryUrl.searchParams.set("per_page", "20");

    const response = await fetchJson<{
      results?: Array<{
        id: number;
        name: string;
        matched_term?: string;
        rank?: string;
        preferred_common_name?: string;
        default_photo?: {
          attribution?: string;
          license_code?: string;
          large_url?: string;
          medium_url?: string;
          url?: string;
        };
      }>;
    }>(queryUrl.toString());

    for (const result of response?.results ?? []) {
      const photoUrl =
        result.default_photo?.large_url ??
        result.default_photo?.medium_url ??
        result.default_photo?.url;
      if (!photoUrl || !INAT_ACCEPTED_RANKS.has(result.rank ?? "")) continue;

      const normalizedResultName = normalizeName(result.name);
      const normalizedMatchedTerm = normalizeName(result.matched_term ?? "");
      const resultBase = normalizeName(baseBinomial(result.name));
      const variantNormalized = normalizeName(variant);
      let score = 0;

      if (normalizedResultName === requestedName) score += 120;
      if (normalizedMatchedTerm === requestedName) score += 110;
      if (normalizedResultName === variantNormalized) score += 100;
      if (normalizedMatchedTerm === variantNormalized) score += 95;
      if (resultBase === requestedBase) score += 85;
      if (
        normalizedMatchedTerm.startsWith(`${requestedBase} `) ||
        normalizedResultName.startsWith(`${requestedBase} `)
      ) {
        score += 35;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          ...result,
          score,
        };
      }
    }
  }

  const photoUrl =
    bestMatch?.default_photo?.large_url ??
    bestMatch?.default_photo?.medium_url ??
    bestMatch?.default_photo?.url;
  const license = bestMatch?.default_photo?.license_code;

  if (
    !bestMatch ||
    !photoUrl ||
    bestMatch.score < 95 ||
    !isCommerciallySafeImageLicense("inaturalist", license)
  ) {
    return null;
  }

  const downloaded = await downloadImage(
    normalizeINaturalistPhotoUrl(photoUrl),
    slugify(species.scientificName),
  );

  if (!downloaded) return null;

  return {
    ...downloaded,
    credit: bestMatch.default_photo?.attribution || "iNaturalist contributor",
    sourceLabel: "iNaturalist",
    sourceUrl: `https://www.inaturalist.org/taxa/${bestMatch.id}`,
    license,
    provider: "inaturalist",
  };
}

async function findGbifImage(
  species: UsRiisSpeciesSnapshot,
): Promise<CandidateImageResult | null> {
  const requestedName = normalizeName(species.scientificName);
  const requestedCanonical = buildCanonicalNameVariants(species.scientificName);
  const matchUrl = new URL("https://api.gbif.org/v1/species/match");
  matchUrl.searchParams.set("name", species.scientificName);

  const match = await fetchJson<{
    usageKey?: number;
    acceptedUsageKey?: number;
    rank?: string;
    status?: string;
    confidence?: number;
    matchType?: string;
    scientificName?: string;
    acceptedScientificName?: string;
    canonicalName?: string;
  }>(matchUrl.toString());

  if (!match) return null;

  const taxonKey = match.acceptedUsageKey ?? match.usageKey;
  const canonicalCandidates = [
    match.scientificName,
    match.acceptedScientificName,
    match.canonicalName,
  ]
    .filter(Boolean)
    .map((candidate) => canonicalizeScientificName(candidate ?? ""));

  const hasExactCanonicalMatch = canonicalCandidates.some(
    (candidate) => candidate === requestedName || requestedCanonical.has(candidate),
  );

  if (
    !taxonKey ||
    !GBIF_ACCEPTED_RANKS.has(match.rank ?? "") ||
    (match.status !== "ACCEPTED" && match.status !== "SYNONYM") ||
    match.matchType !== "EXACT" ||
    (match.confidence ?? 0) < 95 ||
    !hasExactCanonicalMatch
  ) {
    return null;
  }

  const occurrenceUrl = new URL("https://api.gbif.org/v1/occurrence/search");
  occurrenceUrl.searchParams.set("taxon_key", `${taxonKey}`);
  occurrenceUrl.searchParams.set("mediaType", "StillImage");
  occurrenceUrl.searchParams.set("limit", "10");

  const occurrenceResponse = await fetchJson<{
    results?: Array<{
      key: number;
      media?: Array<{
        type?: string;
        format?: string;
        identifier?: string;
        creator?: string;
        rightsHolder?: string;
        publisher?: string;
        license?: string;
      }>;
      license?: string;
    }>;
  }>(occurrenceUrl.toString());

  for (const occurrence of occurrenceResponse?.results ?? []) {
    for (const media of occurrence.media ?? []) {
      const mediaUrl = media.identifier;
      if (!mediaUrl) continue;
      if (media.type && media.type !== "StillImage") continue;
      if (media.format && !media.format.startsWith("image/")) continue;
      if (!isCommerciallySafeImageLicense("gbif", media.license ?? occurrence.license)) {
        continue;
      }

      const downloaded = await downloadImage(mediaUrl, slugify(species.scientificName));
      if (!downloaded) continue;

      return {
        ...downloaded,
        credit:
          media.creator ??
          media.rightsHolder ??
          media.publisher ??
          "GBIF occurrence contributor",
        sourceLabel: "GBIF occurrence media",
        sourceUrl: `https://www.gbif.org/occurrence/${occurrence.key}`,
        license: media.license ?? occurrence.license,
        provider: "gbif",
      };
    }
  }

  return null;
}

async function resolveImageForSpecies(
  species: UsRiisSpeciesSnapshot,
): Promise<
  | {
      entry: SpeciesImageManifestEntry;
      unresolved: null;
    }
  | {
      entry: null;
      unresolved: SpeciesImageUnresolvedEntry;
    }
> {
  const checkedAt = new Date().toISOString();
  const alt =
    species.vernacularName && species.vernacularName !== species.scientificName
      ? `${species.vernacularName} (${species.scientificName})`
      : species.scientificName;

  const wikidataMatch = await findWikidataImage(species);
  if (wikidataMatch) {
    return {
      entry: {
        occurrenceId: species.occurrenceId,
        scientificName: species.scientificName,
        commonName: species.vernacularName,
        slug: slugify(species.scientificName),
        localPath: wikidataMatch.localPath,
        alt,
        credit: wikidataMatch.credit,
        sourceLabel: wikidataMatch.sourceLabel,
        sourceUrl: wikidataMatch.sourceUrl,
        license: wikidataMatch.license,
        provider: wikidataMatch.provider,
        downloadedAt: checkedAt,
      },
      unresolved: null,
    };
  }

  const inatMatch = await findINaturalistImage(species);
  if (inatMatch) {
    return {
      entry: {
        occurrenceId: species.occurrenceId,
        scientificName: species.scientificName,
        commonName: species.vernacularName,
        slug: slugify(species.scientificName),
        localPath: inatMatch.localPath,
        alt,
        credit: inatMatch.credit,
        sourceLabel: inatMatch.sourceLabel,
        sourceUrl: inatMatch.sourceUrl,
        license: inatMatch.license,
        provider: inatMatch.provider,
        downloadedAt: checkedAt,
      },
      unresolved: null,
    };
  }

  const gbifMatch = await findGbifImage(species);
  if (gbifMatch) {
    return {
      entry: {
        occurrenceId: species.occurrenceId,
        scientificName: species.scientificName,
        commonName: species.vernacularName,
        slug: slugify(species.scientificName),
        localPath: gbifMatch.localPath,
        alt,
        credit: gbifMatch.credit,
        sourceLabel: gbifMatch.sourceLabel,
        sourceUrl: gbifMatch.sourceUrl,
        license: gbifMatch.license,
        provider: gbifMatch.provider,
        downloadedAt: checkedAt,
      },
      unresolved: null,
    };
  }

  return {
    entry: null,
    unresolved: {
      occurrenceId: species.occurrenceId,
      scientificName: species.scientificName,
      commonName: species.vernacularName,
      reason:
        "No exact scientific-name image match found from Wikimedia Commons, iNaturalist, or GBIF with a commercially reusable license.",
      attemptedProviders: ["wikidata-commons", "inaturalist", "gbif"],
      checkedAt,
    },
  };
}

async function removeUnreferencedCatalogFiles(entries: SpeciesImageManifestEntry[]) {
  const referenced = new Set(
    entries
      .map((entry) => entry.localPath)
      .filter((localPath) => localPath.startsWith("/species/catalog/"))
      .map((localPath) => localPath.replace("/species/catalog/", "")),
  );

  const files = await readdir(imageOutputDir, { withFileTypes: true });
  await Promise.all(
    files
      .filter((file) => file.isFile() && !referenced.has(file.name))
      .map((file) => unlink(resolve(imageOutputDir, file.name))),
  );
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      await worker(items[current], current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const args = parseArgs();
  const manifest = loadManifest();
  const registrySpecies = getRegistrySpecies();
  const chunk = registrySpecies.slice(args.offset, args.offset + args.limit);
  const unsafeExistingEntries = new Map(
    manifest.entries
      .filter((entry) => !isCommerciallySafeManifestEntry(entry))
      .map((entry) => [entry.occurrenceId, entry]),
  );
  const existingEntries = new Map(
    manifest.entries
      .filter((entry) => isCommerciallySafeManifestEntry(entry))
      .map((entry) => [entry.occurrenceId, entry]),
  );
  const unresolvedEntries = new Map(
    manifest.unresolved.map((entry) => [entry.occurrenceId, entry]),
  );

  for (const entry of unsafeExistingEntries.values()) {
    unresolvedEntries.set(entry.occurrenceId, {
      occurrenceId: entry.occurrenceId,
      scientificName: entry.scientificName,
      commonName: entry.commonName,
      reason:
        "Existing image removed because its source license is not commercially reusable.",
      attemptedProviders: [entry.provider],
      checkedAt: new Date().toISOString(),
    });
  }

  await mkdir(imageOutputDir, { recursive: true });

  let downloaded = 0;
  let unresolved = 0;
  let skippedExisting = 0;

  const targets = chunk.filter((species) => {
    if (existingEntries.has(species.occurrenceId)) {
      skippedExisting += 1;
      return false;
    }

    if (!args.retryUnresolved && unresolvedEntries.has(species.occurrenceId)) {
      skippedExisting += 1;
      return false;
    }

    return true;
  });

  await runPool(targets, args.concurrency, async (species, index) => {
    const result = await resolveImageForSpecies(species);

    if (result.entry) {
      existingEntries.set(species.occurrenceId, result.entry);
      unresolvedEntries.delete(species.occurrenceId);
      downloaded += 1;
      console.log(
        `[${index + 1}/${targets.length}] image: ${species.scientificName} <- ${result.entry.provider}`,
      );
      return;
    }

    unresolvedEntries.set(species.occurrenceId, result.unresolved);
    unresolved += 1;
    console.log(`[${index + 1}/${targets.length}] missing: ${species.scientificName}`);
  });

  manifest.entries = [...existingEntries.values()].sort((left, right) =>
    left.scientificName.localeCompare(right.scientificName),
  );
  manifest.unresolved = [...unresolvedEntries.values()].sort((left, right) =>
    left.scientificName.localeCompare(right.scientificName),
  );

  const chunkRecord: SpeciesImageChunkRecord = {
    offset: args.offset,
    limit: args.limit,
    attempted: targets.length,
    downloaded,
    unresolved,
    skippedExisting,
    processedAt: new Date().toISOString(),
  };

  manifest.chunks = [...manifest.chunks, chunkRecord];
  manifest.updatedAt = chunkRecord.processedAt;
  manifest.coverageSummary = {
    catalogSpeciesCount: new Set([
      ...speciesSeed.map((species) => normalizeName(species.scientificName)),
      ...registrySpecies.map((species) => normalizeName(species.scientificName)),
    ]).size,
    curatedImageCount: speciesSeed.filter((species) => species.image).length,
    downloadedImageCount: manifest.entries.length,
    unresolvedCount: manifest.unresolved.length,
  };

  await writeFile(`${manifestPath}`, `${JSON.stringify(manifest, null, 2)}\n`);
  await removeUnreferencedCatalogFiles(manifest.entries);

  console.log(
    JSON.stringify(
      {
        chunk: chunkRecord,
        coverageSummary: manifest.coverageSummary,
      },
      null,
      2,
    ),
  );
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
