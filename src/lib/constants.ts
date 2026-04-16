import type {
  EnvironmentTag,
  SpeciesAvailability,
  SpeciesCategory,
  SpeciesStatus,
} from "@/lib/data/types";

export const CATEGORY_OPTIONS: Array<{
  value: SpeciesCategory;
  label: string;
  description: string;
}> = [
  {
    value: "plants",
    label: "Plants",
    description: "Aggressive invasive plants that crowd out native habitat.",
  },
  {
    value: "insects",
    label: "Insects",
    description: "Wood-borers, sap-feeders, and other destructive invasive insects.",
  },
  {
    value: "fungi-diseases",
    label: "Fungi & Diseases",
    description: "Pathogens and disease complexes threatening forests and waterways.",
  },
  {
    value: "wildlife",
    label: "Wildlife",
    description: "Invasive vertebrates and aquatic wildlife altering ecosystems.",
  },
];

export const DEFAULT_MAP_CENTER: [number, number] = [-96, 38];
export const DEFAULT_MAP_ZOOM = 1.18;

export const STATUS_OPTIONS: Array<{
  value: SpeciesStatus | null;
  label: string;
}> = [
  { value: null, label: "All listed species" },
  { value: "invasive", label: "Invasive" },
  { value: "widespread-invasive", label: "Widespread invasive" },
];

export const ENVIRONMENT_OPTIONS: Array<{
  value: EnvironmentTag | null;
  label: string;
}> = [
  { value: null, label: "Any environment" },
  { value: "land", label: "Land" },
  { value: "freshwater", label: "Freshwater" },
  { value: "marine-coastal", label: "Marine / coastal" },
  { value: "wetlands", label: "Wetlands" },
  { value: "forest", label: "Forest" },
  { value: "agriculture", label: "Agriculture" },
  { value: "urban", label: "Urban" },
];

export const AVAILABILITY_OPTIONS: Array<{
  value: SpeciesAvailability;
  label: string;
}> = [
  { value: "all", label: "Any county data state" },
  { value: "mapped", label: "County data available" },
  { value: "catalog", label: "Still filling county data" },
];
