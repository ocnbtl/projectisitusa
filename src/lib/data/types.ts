export type SpeciesCategory =
  | "plants"
  | "insects"
  | "fungi-diseases"
  | "wildlife";

export type ActionMode = "diy" | "report" | "both";
export type SpeciesProfileType = "curated" | "registry";
export type SpeciesStatus = "invasive" | "widespread-invasive";
export type SpeciesAvailability = "all" | "mapped" | "catalog";
export type CountyDataSourceName = "EDDMaps" | "USGS NAS";
export type CountyMatchType = "manual-curated" | "scientific-exact";
export type SpeciesImageProvider = "wikidata-commons" | "inaturalist" | "gbif";
export type CountyEvidenceLevel =
  | "not-reviewed"
  | "statewide-only"
  | "county-specific";
export type CountyResourceKind =
  | "county-extension"
  | "county-program"
  | "county-detection"
  | "regulatory-notice"
  | "statewide-program";
export type EnvironmentTag =
  | "land"
  | "freshwater"
  | "marine-coastal"
  | "wetlands"
  | "forest"
  | "agriculture"
  | "urban";

export interface SourceLink {
  label: string;
  url: string;
}

export interface SpeciesAction {
  mode: ActionMode;
  summary: string;
  steps: string[];
  contactName?: string;
  contactUrl?: string;
  contactInstructions?: string;
  safetyNotes?: string;
}

export interface CountyDataSourceRef {
  source: CountyDataSourceName;
  matchType: CountyMatchType;
  externalId: string;
  url: string;
}

export interface Species {
  id: string;
  slug: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
  profileType: SpeciesProfileType;
  displayGroup: string;
  summary: string;
  eddMapsSubjectId?: number;
  image?: {
    src: string;
    alt: string;
    credit: string;
  };
  origin?: string;
  whatToLookFor?: string[];
  whyItMatters?: string;
  action?: SpeciesAction;
  registry?: SpeciesRegistry;
  source: SourceLink[];
}

export interface SpeciesRegistry {
  locality: "L48";
  status: SpeciesStatus;
  statusLabel: string;
  establishmentMeans: string;
  taxonRank: string;
  kingdom: string;
  phylum: string;
  className: string;
  order: string;
  family: string;
  habitats: string[];
  pathways: string[];
  environmentTags: EnvironmentTag[];
  introDateNumber?: number | null;
  eventRemarks?: string;
  authority: string;
  authorityUrl?: string;
  occurrenceId: string;
  hasCountyData: boolean;
  mappedCountyCount?: number;
  countyDataSources?: CountyDataSourceRef[];
}

export interface ExplorerSpecies {
  id: string;
  slug: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
  displayGroup: string;
  summary: string;
  image?: {
    src: string;
    alt: string;
    credit: string;
  };
  registry?: Pick<
    SpeciesRegistry,
    "environmentTags" | "hasCountyData" | "introDateNumber" | "mappedCountyCount" | "status"
  >;
}

export interface CountyPresence {
  countyFips: string;
  speciesIds: string[];
  sourceRefs: string[];
}

export type ExplorerPresenceIndex = Record<string, number[]>;

export interface EddMapsSpeciesSnapshot {
  speciesId: string;
  subjectId: number;
  countyFips: string[];
}

export interface EddMapsSnapshotFile {
  source: string;
  citation: string;
  snapshotDate: string;
  species: EddMapsSpeciesSnapshot[];
}

export interface CountyCoverageSpeciesSnapshot {
  speciesId: string;
  countyFips: string[];
  countyDataSources: CountyDataSourceRef[];
}

export interface CountyCoverageSnapshotFile {
  source: string;
  citation: string[];
  snapshotDate: string;
  species: CountyCoverageSpeciesSnapshot[];
  unmatchedSpeciesIds: string[];
  coverageSummary: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<CountyDataSourceName, number>>;
  };
}

export interface UsRiisSpeciesSnapshot {
  id: string;
  scientificName: string;
  vernacularName: string;
  taxonRank: string;
  establishmentMeans: string;
  status: SpeciesStatus;
  statusLabel: string;
  kingdom: string;
  phylum: string;
  className: string;
  order: string;
  family: string;
  habitats: string[];
  pathways: string[];
  environmentTags: EnvironmentTag[];
  introDateNumber?: number | null;
  eventRemarks?: string;
  authority: string;
  authorityUrl?: string;
  occurrenceId: string;
}

export interface UsRiisSnapshotFile {
  source: string;
  citation: string;
  snapshotDate: string;
  locality: "L48";
  species: UsRiisSpeciesSnapshot[];
}

export interface SpeciesImageManifestEntry {
  occurrenceId: string;
  scientificName: string;
  commonName: string;
  slug: string;
  localPath: string;
  alt: string;
  credit: string;
  sourceLabel: string;
  sourceUrl: string;
  license?: string;
  provider: SpeciesImageProvider;
  downloadedAt: string;
}

export interface SpeciesImageUnresolvedEntry {
  occurrenceId: string;
  scientificName: string;
  commonName: string;
  reason: string;
  attemptedProviders: SpeciesImageProvider[];
  checkedAt: string;
}

export interface SpeciesImageChunkRecord {
  offset: number;
  limit: number;
  attempted: number;
  downloaded: number;
  unresolved: number;
  skippedExisting: number;
  processedAt: string;
}

export interface SpeciesImageManifestFile {
  source: string[];
  updatedAt: string | null;
  entries: SpeciesImageManifestEntry[];
  unresolved: SpeciesImageUnresolvedEntry[];
  chunks: SpeciesImageChunkRecord[];
  coverageSummary: {
    catalogSpeciesCount: number;
    curatedImageCount: number;
    downloadedImageCount: number;
    unresolvedCount: number;
  };
}

export interface CountyRecord {
  countyFips: string;
  name: string;
  stateCode: string;
  stateName: string;
  neighborFips: string[];
  center: [number, number];
}

export interface CountyResourceLink {
  label: string;
  url: string;
  kind: CountyResourceKind;
}

export interface CountyDetail {
  countyFips: string;
  evidenceLevel: CountyEvidenceLevel;
  auditSummary: string;
  headline?: string;
  countySummary?: string;
  summaryParagraphs?: string[];
  lastReviewedOn: string;
  resources: CountyResourceLink[];
}

export interface ZipLookupResult {
  zip: string;
  city: string;
  state: string;
  countyFips: string;
  countyName: string;
  neighborFips: string[];
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

export interface SpeciesFilters {
  categories?: SpeciesCategory[] | null;
  speciesId?: string | null;
  status?: SpeciesStatus | null;
  environment?: EnvironmentTag | null;
  availability?: SpeciesAvailability | null;
  query?: string | null;
}
