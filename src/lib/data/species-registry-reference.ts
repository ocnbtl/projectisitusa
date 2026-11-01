import corrections from "@/content/species-registry-links.json";

export interface RegistryReference { url: string | null; note?: string }

// Presentation-only repairs: preserve the original register and its attribution.
export function getRegistryReference(value: string): RegistryReference {
  const correction = (corrections as Record<string, RegistryReference>)[value];
  if (correction) return correction;
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol)) return { url: null };
    const symbol = url.searchParams.get("symbol");
    if (["plants.usda.gov", "plants.sc.egov.usda.gov"].includes(url.hostname)
      && url.pathname.toLowerCase() === "/home/plantprofile"
      && symbol && /^[a-z0-9]{4,6}$/i.test(symbol)) {
      return { url: `https://plants.sc.egov.usda.gov/plant-profile/${symbol}` };
    }
    return { url: url.href };
  } catch {
    return { url: null };
  }
}
