export type ResearchDeepLink = {
  stateCode?: string | null;
  countyFips?: string | null;
  speciesQuery?: string | null;
};

const STATE_CODE_PATTERN = /^[A-Z]{2}$/u;
const COUNTY_FIPS_PATTERN = /^[0-9]{5}$/u;
const MAX_SPECIES_QUERY_LENGTH = 200;

function normalizedStateCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase() ?? "";
  return STATE_CODE_PATTERN.test(normalized) ? normalized : null;
}

function normalizedCountyFips(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return COUNTY_FIPS_PATTERN.test(normalized) ? normalized : null;
}

function normalizedSpeciesQuery(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 && normalized.length <= MAX_SPECIES_QUERY_LENGTH
    ? normalized
    : null;
}

export function parseResearchDeepLink(search: string): Required<ResearchDeepLink> {
  const parameters = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return {
    stateCode: normalizedStateCode(parameters.get("state")),
    countyFips: normalizedCountyFips(parameters.get("county")),
    speciesQuery: normalizedSpeciesQuery(parameters.get("species")),
  };
}

export function buildResearchHref(link: ResearchDeepLink) {
  const parameters = new URLSearchParams();
  const stateCode = normalizedStateCode(link.stateCode);
  const countyFips = normalizedCountyFips(link.countyFips);
  const speciesQuery = normalizedSpeciesQuery(link.speciesQuery);
  if (stateCode) parameters.set("state", stateCode);
  if (countyFips) parameters.set("county", countyFips);
  if (speciesQuery) parameters.set("species", speciesQuery);
  const search = parameters.toString();
  return search ? `/research?${search}` : "/research";
}
