import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { parse } from "csv-parse/sync";

import type {
  EnvironmentTag,
  SpeciesStatus,
  UsRiisSnapshotFile,
  UsRiisSpeciesSnapshot,
} from "@/lib/data/types";

const ZIP_URL =
  "https://www.sciencebase.gov/catalog/file/get/62d59ae5d34e87fffb2dda99?f=__disk__06%2Ff5%2Fb7%2F06f5b79a08d36e997d3f66a9063eab371e314c9a";
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);

type MasterListRow = {
  locality: string;
  scientificName: string;
  vernacularName: string;
  taxonRank: string;
  establishmentMeans: string;
  degreeOfEstablishment: string;
  habitat: string;
  pathway: string;
  kingdom: string;
  phylum: string;
  class: string;
  order: string;
  family: string;
  IntroDateNumber: string;
  eventRemarks: string;
  Authority: string;
  WebLink: string;
  occurrenceID: string;
};

function toStatus(value: string): SpeciesStatus | null {
  if (value.startsWith("widespread invasive")) return "widespread-invasive";
  if (value.startsWith("invasive")) return "invasive";
  return null;
}

function splitField(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function deriveEnvironmentTags(habitats: string[], category: string): EnvironmentTag[] {
  const tags = new Set<EnvironmentTag>();
  const joined = habitats.join(" | ").toLowerCase();

  if (
    /marine|coastal|intertidal|oceanic|neritic|supratidal/.test(joined)
  ) {
    tags.add("marine-coastal");
  }
  if (/wetlands/.test(joined)) tags.add("wetlands");
  if (/forest/.test(joined)) tags.add("forest");
  if (/grassland|shrubland|rocky|desert|savanna|introduced vegetation/.test(joined)) {
    tags.add("land");
  }
  if (/artificial - terrestrial/.test(joined)) tags.add("urban");
  if (/artificial - aquatic|freshwater|inland|caves & subterranean habitats/.test(joined)) {
    tags.add("freshwater");
  }
  if (/agriculture/.test(joined)) tags.add("agriculture");

  if (tags.size === 0) {
    if (category === "plants") tags.add("land");
    else if (category === "fungi-diseases") tags.add("forest");
    else if (category === "wildlife") tags.add("freshwater");
    else tags.add("land");
  }

  return [...tags];
}

function mapCategory(row: MasterListRow) {
  if (row.kingdom === "Plantae") return "plants" as const;
  if (row.class === "Insecta") return "insects" as const;
  if (
    ["Fungi", "Chromista", "Viruses", "Bacteria", "Protozoa"].includes(row.kingdom)
  ) {
    return "fungi-diseases" as const;
  }
  return "wildlife" as const;
}

function deriveDisplayGroup(row: MasterListRow, environments: EnvironmentTag[]) {
  const lowerClass = row.class.toLowerCase();
  const lowerOrder = row.order.toLowerCase();
  const lowerFamily = row.family.toLowerCase();

  if (row.kingdom === "Plantae") {
    if (environments.includes("freshwater") || environments.includes("wetlands")) {
      return "Aquatic plants";
    }
    if (/poales|liliales|asparagales/.test(lowerOrder)) {
      return "Grasses & herbs";
    }
    if (/fabales|vitales|ranunculales/.test(lowerOrder)) {
      return "Vines & groundcovers";
    }
    if (/fagales|sapindales|malpighiales|pinales/.test(lowerOrder)) {
      return "Trees & shrubs";
    }
    return "Other plants";
  }

  if (row.class === "Insecta") {
    if (/coleoptera/.test(lowerOrder)) return "Beetles";
    if (/hemiptera/.test(lowerOrder)) return "Bugs & sap-feeders";
    if (/hymenoptera/.test(lowerOrder)) return "Wasps, ants & bees";
    if (/lepidoptera/.test(lowerOrder)) return "Moths & butterflies";
    if (/diptera/.test(lowerOrder)) return "Flies";
    return "Other insects";
  }

  if (["Fungi", "Chromista", "Viruses", "Bacteria", "Protozoa"].includes(row.kingdom)) {
    if (/virus/.test(row.kingdom.toLowerCase())) return "Plant viruses";
    if (/bacteria/.test(row.kingdom.toLowerCase())) return "Bacterial diseases";
    return "Fungi & pathogens";
  }

  if (/mammalia/.test(lowerClass)) return "Mammals";
  if (/aves/.test(lowerClass)) return "Birds";
  if (/reptilia|amphibia/.test(lowerClass)) return "Reptiles & amphibians";
  if (/teleostei|actinopterygii|chondrichthyes/.test(lowerClass)) return "Fish";
  if (/gastropoda|bivalvia/.test(lowerClass)) return "Mollusks";
  if (/malacostraca/.test(lowerClass)) return "Crustaceans";
  if (/arachnida|euchelicerata/.test(lowerClass)) return "Arachnids";
  if (/nematoda|chromadorea/.test(lowerClass) || /nematoda/.test(lowerFamily)) {
    return "Worms & nematodes";
  }
  return "Other wildlife";
}

async function downloadZip(targetPath: string) {
  const response = await fetch(ZIP_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 Project-Isitusa/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download US-RIIS zip: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(targetPath, buffer);
}

async function main() {
  const tempDir = await mkdtemp(join(tmpdir(), "project-isitusa-usriis-"));
  const zipPath = join(tempDir, "USRIISv2csvFormat.zip");

  try {
    await downloadZip(zipPath);

    const csvText = execFileSync("unzip", ["-p", zipPath, "USRIISv2_MasterList.csv"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    }).replace(/^\uFEFF/, "");

    const records = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
    }) as MasterListRow[];

    const species = records
      .filter((record) => record.locality === "L48")
      .map((record) => {
        const status = toStatus(record.degreeOfEstablishment);
        if (!status) return null;

        const category = mapCategory(record);
        const habitats = splitField(record.habitat);
        const pathways = splitField(record.pathway);
        const environmentTags = deriveEnvironmentTags(habitats, category);

        return {
          id: record.occurrenceID,
          scientificName: record.scientificName,
          vernacularName: record.vernacularName || record.scientificName,
          taxonRank: record.taxonRank,
          establishmentMeans: record.establishmentMeans,
          status,
          statusLabel:
            status === "widespread-invasive" ? "Widespread invasive" : "Invasive",
          kingdom: record.kingdom,
          phylum: record.phylum,
          className: record.class,
          order: record.order,
          family: record.family,
          habitats,
          pathways,
          environmentTags,
          introDateNumber: record.IntroDateNumber
            ? Number(record.IntroDateNumber)
            : null,
          eventRemarks: record.eventRemarks || undefined,
          authority: record.Authority,
          authorityUrl: record.WebLink || undefined,
          occurrenceId: record.occurrenceID,
        };
      })
      .filter(Boolean) as UsRiisSpeciesSnapshot[];

    const snapshot: UsRiisSnapshotFile = {
      source: "US-RIIS v2 lower-48 invasive species snapshot",
      citation:
        "Simpson, A., Fuller, P., Faccenda, K., Evenhuis, N., Matsunaga, J., and Bowser, M., 2022, United States Register of Introduced and Invasive Species (US-RIIS) (ver. 2.0, November 2022): U.S. Geological Survey data release, https://doi.org/10.5066/P9KFFTOD.",
      snapshotDate: new Date().toISOString(),
      locality: "L48",
      species,
    };

    await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
    console.log(
      `Saved US-RIIS lower-48 invasive snapshot for ${species.length} species to ${OUTPUT_PATH}`,
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
