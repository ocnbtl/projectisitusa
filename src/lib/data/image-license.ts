import type {
  SpeciesImageManifestEntry,
  SpeciesImageProvider,
} from "@/lib/data/types";

function normalizeLicense(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function isSafeINaturalistLicense(license: string) {
  return ["cc0", "pd", "cc-by", "cc-by-sa", "cc-by-nd"].includes(license);
}

function isSafeGbifLicense(license: string) {
  if (!license) return false;
  if (license.includes("creativecommons.org/publicdomain/zero")) return true;
  if (license.includes("public-domain")) return true;
  if (license.includes("public domain")) return true;
  if (license.includes("cc0")) return true;
  if (license.includes("cc-by-sa")) return true;
  if (license.includes("creativecommons.org/licenses/by-sa/")) return true;
  if (license.includes("cc-by-nd")) return true;
  if (license.includes("creativecommons.org/licenses/by-nd/")) return true;
  if (
    (license.includes("cc-by") || license.includes("creativecommons.org/licenses/by/")) &&
    !license.includes("by-nc") &&
    !license.includes("by-nd") &&
    !license.includes("by-nc-sa") &&
    !license.includes("by-nc-nd")
  ) {
    return true;
  }

  return false;
}

export function isCommerciallySafeImageLicense(
  provider: SpeciesImageProvider,
  license: string | null | undefined,
) {
  if (provider === "wikidata-commons") return true;

  const normalized = normalizeLicense(license);

  if (provider === "inaturalist") {
    return isSafeINaturalistLicense(normalized);
  }

  if (provider === "gbif") {
    return isSafeGbifLicense(normalized);
  }

  return false;
}

export function isCommerciallySafeManifestEntry(entry: SpeciesImageManifestEntry) {
  return isCommerciallySafeImageLicense(entry.provider, entry.license);
}
