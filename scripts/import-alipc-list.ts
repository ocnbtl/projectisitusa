import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ALIPC_LIST_URL = "https://www.invasiveplantatlas.org/list.html?id=71";
const ALIPC_SOURCE_PDF_URL = "https://www.se-eppc.org/alabama/2012-updatedALIPCinvasiveplantlist.pdf";
const OUTPUT_PATH = path.join(
  process.cwd(),
  "src/data/source/state-denominator-snapshots/alipc-2012.json",
);

type AlipcSnapshotSpecies = {
  subjectId: number;
  commonName: string;
  scientificName: string;
  family: string;
  nativity: string;
};

type AlipcSnapshot = {
  source: string;
  sourceUrl: string;
  sourcePdfUrl: string;
  citation: string;
  snapshotDate: string;
  species: AlipcSnapshotSpecies[];
};

function stripTags(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRows(html: string) {
  const rowMatches = [...html.matchAll(/<tr>\s*([\s\S]*?)\s*<\/tr>/gi)];
  const species: AlipcSnapshotSpecies[] = [];

  for (const rowMatch of rowMatches) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1] ?? "");
    if (cells.length < 4) continue;

    const subjectIdMatch = rowHtml.match(/subject\.cfm\?sub=(\d+)/i);
    const scientificNameMatch = cells[1]?.match(/<em>([\s\S]*?)<\/em>/i);
    if (!subjectIdMatch || !scientificNameMatch) continue;

    species.push({
      subjectId: Number(subjectIdMatch[1]),
      commonName: stripTags(cells[0] ?? ""),
      scientificName: stripTags(scientificNameMatch[1] ?? ""),
      family: stripTags(cells[2] ?? ""),
      nativity: stripTags(cells[3] ?? ""),
    });
  }

  return species;
}

async function main() {
  const response = await fetch(ALIPC_LIST_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 Project-Isitusa/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${ALIPC_LIST_URL}: ${response.status}`);
  }

  const html = await response.text();
  const species = parseRows(html);

  if (species.length !== 91) {
    throw new Error(`Expected 91 ALIPC species rows, found ${species.length}.`);
  }

  const snapshot: AlipcSnapshot = {
    source: "Alabama Invasive Plant Council 2012 invasive plant list",
    sourceUrl: ALIPC_LIST_URL,
    sourcePdfUrl: ALIPC_SOURCE_PDF_URL,
    citation:
      "Alabama Invasive Plant Council. 2012. List of Alabama's invasive plants by land-use and water-use categories, mirrored by Invasive Plant Atlas of the United States.",
    snapshotDate: new Date().toISOString(),
    species,
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Saved ${species.length} ALIPC denominator rows to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
