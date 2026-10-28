import { ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { EnvironmentTag } from "@/lib/data/types";

/** Accept old single-environment links as well as comma-separated or repeated values. */
export function readEnvironments(params: Pick<URLSearchParams, "getAll">): EnvironmentTag[] {
  const requested = new Set(params.getAll("environment").flatMap(value => value.split(",")));
  return ENVIRONMENT_OPTIONS.flatMap(({ value }) => value && requested.has(value) ? [value] : []);
}

export function toggleEnvironment(selected: EnvironmentTag[], value: EnvironmentTag): EnvironmentTag[] {
  return selected.includes(value) ? selected.filter(item => item !== value) : [...selected, value];
}

/** Environments are alternatives (OR); an empty selection leaves the catalog unrestricted. */
export function matchesEnvironment(
  species: { registry?: { environmentTags?: EnvironmentTag[] } },
  environment?: EnvironmentTag | EnvironmentTag[] | null,
) {
  const selected = typeof environment === "string" ? [environment] : environment ?? [];
  return !selected.length || selected.some(value => species.registry?.environmentTags?.includes(value));
}
