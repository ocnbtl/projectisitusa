import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { speciesSeed } from "@/data/source/species";
import type { EddMapsSnapshotFile } from "@/lib/data/types";

const outputPath = resolve(
  process.cwd(),
  "src/data/source/eddmaps-snapshot.json",
);

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Project-Isitusa/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return (await response.json()) as T;
}

async function main() {
  const species = await Promise.all(
    speciesSeed
      .filter((record): record is (typeof speciesSeed)[number] & { eddMapsSubjectId: number } =>
        typeof record.eddMapsSubjectId === "number",
      )
      .map(async (record) => {
      const data = await fetchJson<Record<string, Record<string, { id: string }>>>(
        `https://maps.eddmaps.org/presence/data.cfm?sub=${record.eddMapsSubjectId}&countries=us`,
      );

      const countyFips = Object.keys(data.us ?? {}).sort();

      return {
        speciesId: record.id,
        subjectId: record.eddMapsSubjectId,
        countyFips,
      };
      }),
  );

  const snapshot: EddMapsSnapshotFile = {
    source: "EDDMaps county presence snapshot",
    citation:
      "EDDMapS. 2026. Early Detection & Distribution Mapping System. The University of Georgia - Center for Invasive Species and Ecosystem Health. Available online at https://www.eddmaps.org/.",
    snapshotDate: new Date().toISOString(),
    species,
  };

  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved EDDMaps snapshot for ${species.length} verified species to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
