export type ResearchCandidatePair = {
  countyFips: string;
  speciesId: string;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalCandidatePairKeys(
  pairs: ResearchCandidatePair[],
): string[] {
  return pairs
    .map((pair) => `${pair.countyFips}:${pair.speciesId}`)
    .sort(compareText);
}
