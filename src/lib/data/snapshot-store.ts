import snapshot from "@/data/generated/snapshot.json";

export const datasetSnapshot = snapshot as {
  snapshotDate: string;
  sourceRefs: string[];
  coverageSummary?: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<string, number>>;
  };
};
