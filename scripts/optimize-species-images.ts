import { mkdtemp, readdir, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, resolve } from "node:path";

import sharp from "sharp";

const rootDir = resolve(process.cwd(), "public/species");
const AGGRESSIVE_MAX_EDGE = 2048;
const AGGRESSIVE_QUALITY = 76;
const MODERATE_QUALITY = 80;
const MODERATE_MIN_BYTES = 1_000_000;
const AGGRESSIVE_MIN_BYTES = 10_000_000;
const AGGRESSIVE_MIN_EDGE = 3000;
const MIN_SAVINGS_RATIO = 0.08;

type OptimizationTier = "aggressive" | "moderate" | "skipped";

interface OptimizationDecision {
  quality: number;
  resizeMaxEdge?: number;
  tier: Exclude<OptimizationTier, "skipped">;
}

interface OptimizationResult {
  filePath: string;
  tier: OptimizationTier;
  originalBytes: number;
  optimizedBytes: number;
  width: number;
  height: number;
  savedBytes: number;
  skipReason?: string;
}

interface Summary {
  processed: number;
  optimized: number;
  skipped: number;
  originalBytes: number;
  optimizedBytes: number;
  savedBytes: number;
  aggressive: number;
  moderate: number;
  skipReasons: Record<string, number>;
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes("--dry-run"),
  };
}

async function collectJpegFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        return collectJpegFiles(entryPath);
      }

      const extension = extname(entry.name).toLowerCase();
      if (!entry.isFile() || ![".jpg", ".jpeg"].includes(extension)) {
        return [];
      }

      return [entryPath];
    }),
  );

  return files.flat().sort();
}

function formatBytes(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)} GB`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} MB`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)} KB`;
  return `${value} B`;
}

function decideOptimization(bytes: number, width: number, height: number): OptimizationDecision | null {
  const longEdge = Math.max(width, height);

  if (bytes >= AGGRESSIVE_MIN_BYTES || longEdge > AGGRESSIVE_MIN_EDGE) {
    return {
      tier: "aggressive",
      resizeMaxEdge: AGGRESSIVE_MAX_EDGE,
      quality: AGGRESSIVE_QUALITY,
    };
  }

  if (bytes >= MODERATE_MIN_BYTES) {
    return {
      tier: "moderate",
      quality: MODERATE_QUALITY,
    };
  }

  return null;
}

async function optimizeFile(
  filePath: string,
  dryRun: boolean,
): Promise<OptimizationResult> {
  const fileStat = await stat(filePath);
  const originalBytes = fileStat.size;
  let width = 0;
  let height = 0;
  let format = "";

  try {
    const image = sharp(filePath, { failOn: "none" }).rotate();
    const metadata = await image.metadata();
    width = metadata.width ?? 0;
    height = metadata.height ?? 0;
    format = metadata.format ?? "";
  } catch (error) {
    return {
      filePath,
      tier: "skipped",
      originalBytes,
      optimizedBytes: originalBytes,
      width,
      height,
      savedBytes: 0,
      skipReason: "unsupported-format",
    };
  }

  if (format !== "jpeg" || !width || !height) {
    return {
      filePath,
      tier: "skipped",
      originalBytes,
      optimizedBytes: originalBytes,
      width,
      height,
      savedBytes: 0,
      skipReason: format ? `format-${format}` : "missing-metadata",
    };
  }

  const decision = decideOptimization(originalBytes, width, height);
  if (!decision) {
    return {
      filePath,
      tier: "skipped",
      originalBytes,
      optimizedBytes: originalBytes,
      width,
      height,
      savedBytes: 0,
      skipReason: "below-threshold",
    };
  }

  let pipeline = sharp(filePath, { failOn: "none" }).rotate();
  if (decision.resizeMaxEdge) {
    pipeline = pipeline.resize({
      width: decision.resizeMaxEdge,
      height: decision.resizeMaxEdge,
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "project-isitusa-image-opt-"));
  const tempFilePath = join(tmpDir, basename(filePath));

  try {
    await pipeline
      .jpeg({
        quality: decision.quality,
        mozjpeg: true,
      })
      .toFile(tempFilePath);

    const optimizedBytes = (await stat(tempFilePath)).size;
    const savedBytes = originalBytes - optimizedBytes;
    const savingsRatio = savedBytes / originalBytes;

    if (savedBytes <= 0 || savingsRatio < MIN_SAVINGS_RATIO) {
      await rm(tmpDir, { recursive: true, force: true });
      return {
        filePath,
        tier: "skipped",
        originalBytes,
        optimizedBytes: originalBytes,
        width,
        height,
        savedBytes: 0,
        skipReason: "insufficient-savings",
      };
    }

    if (!dryRun) {
      await rename(tempFilePath, filePath);
    }

    await rm(tmpDir, { recursive: true, force: true });

    return {
      filePath,
      tier: decision.tier,
      originalBytes,
      optimizedBytes,
      width,
      height,
      savedBytes,
    };
  } catch (error) {
    await rm(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  const { dryRun } = parseArgs();
  const files = await collectJpegFiles(rootDir);
  const summary: Summary = {
    processed: 0,
    optimized: 0,
    skipped: 0,
    originalBytes: 0,
    optimizedBytes: 0,
    savedBytes: 0,
    aggressive: 0,
    moderate: 0,
    skipReasons: {},
  };
  const topSavings: OptimizationResult[] = [];

  for (const filePath of files) {
    const result = await optimizeFile(filePath, dryRun);
    summary.processed += 1;
    summary.originalBytes += result.originalBytes;
    summary.optimizedBytes += result.optimizedBytes;
    summary.savedBytes += result.savedBytes;

    if (result.tier === "skipped") {
      summary.skipped += 1;
      const skipReason = result.skipReason ?? "unknown";
      summary.skipReasons[skipReason] = (summary.skipReasons[skipReason] ?? 0) + 1;
    } else {
      summary.optimized += 1;
      summary[result.tier] += 1;
      topSavings.push(result);
    }
  }

  topSavings.sort((left, right) => right.savedBytes - left.savedBytes);

  console.log(
    JSON.stringify(
      {
        dryRun,
        rootDir,
        summary: {
          ...summary,
          originalBytesLabel: formatBytes(summary.originalBytes),
          optimizedBytesLabel: formatBytes(summary.optimizedBytes),
          savedBytesLabel: formatBytes(summary.savedBytes),
        },
        topSavings: topSavings.slice(0, 25).map((result) => ({
          filePath: result.filePath.replace(`${process.cwd()}/`, ""),
          tier: result.tier,
          dimensions: `${result.width}x${result.height}`,
          originalBytes: result.originalBytes,
          optimizedBytes: result.optimizedBytes,
          savedBytes: result.savedBytes,
          savedBytesLabel: formatBytes(result.savedBytes),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
