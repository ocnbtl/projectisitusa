export const NAS_ALABAMA_OCCURRENCE_API_BASE_URL =
  "https://nas.er.usgs.gov/api/v2/occurrence/search";
export const NAS_ALABAMA_OCCURRENCE_SOURCE_NAME = "USGS NAS occurrence API";

export type NasAlabamaApiSupplement = {
  scientificName: string;
  speciesId: number;
  allowedStatuses?: readonly string[];
  excludedLocalityPatterns?: readonly RegExp[];
};

// Each target was manually reviewed against the Alabama ANS denominator and live NAS API.
export const NAS_ALABAMA_API_SUPPLEMENTS: readonly NasAlabamaApiSupplement[] = [
  {
    scientificName: "Oreochromis aureus",
    speciesId: 463,
    allowedStatuses: ["established", "locally established"],
  },
  { scientificName: "Cyprinus rubrofuscus", speciesId: 3294 },
  { scientificName: "Daphnia lumholtzi", speciesId: 164 },
  { scientificName: "Dreissena polymorpha", speciesId: 5 },
  {
    scientificName: "Pomacea maculata",
    speciesId: 2633,
    // NAS assigns this Panama City Beach, Florida locality to Houston County, Alabama.
    excludedLocalityPatterns: [/panama city beach/i],
  },
  { scientificName: "Hypophthalmichthys nobilis", speciesId: 551 },
  { scientificName: "Misgurnus anguillicaudatus", speciesId: 498 },
  { scientificName: "Oreochromis niloticus", speciesId: 468 },
];
