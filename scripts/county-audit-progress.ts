import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const COUNTY_AUDIT_DIR = path.join(process.cwd(), "docs", "county-audit", "states");
const CHUNK_SIZE = 5;

const completedCountyStatuses = new Set([
  "complete-state-source-only",
  "complete-county-source-found",
]);

type StateProgress = {
  stateCode: string;
  stateName: string;
  countiesTotal: number;
  countiesCompleted: number;
  countiesPercent: number;
  chunksTotal: number;
  chunksCompleted: number;
  chunksPercent: number;
};

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function parseStateFile(filepath: string): StateProgress {
  const content = readFileSync(filepath, "utf8");
  const lines = content.split("\n");
  const stateName = lines[0]?.replace(/^# /, "").replace(/ County Audit$/, "").trim() ?? path.basename(filepath, ".md");

  let inCountyTable = false;
  const countyStatuses: string[] = [];

  for (const line of lines) {
    if (line.startsWith("| County FIPS | County | Audit status |")) {
      inCountyTable = true;
      continue;
    }

    if (!inCountyTable) {
      continue;
    }

    if (!line.startsWith("|")) {
      break;
    }

    if (line.startsWith("| --- ")) {
      continue;
    }

    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length < 3) {
      continue;
    }

    countyStatuses.push(cells[2]);
  }

  const countiesTotal = countyStatuses.length;
  const countiesCompleted = countyStatuses.filter((status) => completedCountyStatuses.has(status)).length;
  const chunksTotal = Math.ceil(countiesTotal / CHUNK_SIZE);
  let chunksCompleted = 0;

  for (let index = 0; index < countyStatuses.length; index += CHUNK_SIZE) {
    const chunkStatuses = countyStatuses.slice(index, index + CHUNK_SIZE);
    if (chunkStatuses.length > 0 && chunkStatuses.every((status) => completedCountyStatuses.has(status))) {
      chunksCompleted += 1;
    }
  }

  return {
    stateCode: path.basename(filepath, ".md"),
    stateName,
    countiesTotal,
    countiesCompleted,
    countiesPercent: countiesTotal === 0 ? 0 : roundPercent((countiesCompleted / countiesTotal) * 100),
    chunksTotal,
    chunksCompleted,
    chunksPercent: chunksTotal === 0 ? 0 : roundPercent((chunksCompleted / chunksTotal) * 100),
  };
}

const stateFiles = readdirSync(COUNTY_AUDIT_DIR)
  .filter((filename) => filename.endsWith(".md") && filename !== "index.md")
  .sort();

const states = stateFiles.map((filename) => parseStateFile(path.join(COUNTY_AUDIT_DIR, filename)));

const nationwideCountiesTotal = states.reduce((sum, state) => sum + state.countiesTotal, 0);
const nationwideCountiesCompleted = states.reduce((sum, state) => sum + state.countiesCompleted, 0);
const nationwideChunksTotal = Math.ceil(nationwideCountiesTotal / CHUNK_SIZE);
const nationwideChunksCompleted = states.reduce((sum, state) => sum + state.chunksCompleted, 0);

const output = {
  chunkSize: CHUNK_SIZE,
  nationwide: {
    countiesTotal: nationwideCountiesTotal,
    countiesCompleted: nationwideCountiesCompleted,
    countiesPercent:
      nationwideCountiesTotal === 0 ? 0 : roundPercent((nationwideCountiesCompleted / nationwideCountiesTotal) * 100),
    chunksTotal: nationwideChunksTotal,
    chunksCompleted: nationwideChunksCompleted,
    chunksPercent:
      nationwideChunksTotal === 0 ? 0 : roundPercent((nationwideChunksCompleted / nationwideChunksTotal) * 100),
  },
  states,
};

const requestedStateCode = process.argv[2]?.toUpperCase();

if (requestedStateCode) {
  const state = states.find((entry) => entry.stateCode === requestedStateCode);

  if (!state) {
    console.error(`Unknown state code: ${requestedStateCode}`);
    process.exit(1);
  }

  console.log(
    JSON.stringify(
      {
        chunkSize: CHUNK_SIZE,
        state,
        nationwide: output.nationwide,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log(JSON.stringify(output, null, 2));
