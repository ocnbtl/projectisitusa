export const USFWS_EDNA_COORDINATE_SOURCE_ID = "usfws-invasive-carp-edna";

export const USFWS_EDNA_COORDINATE_TOPOLOGY_PATH =
  "src/data/source/county-equivalents-topology.json";

export const USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD =
  "Coordinate-derived county assignment: all retained USFWS source coordinates resolved uniquely to the declared active county using the committed canonical Census county-equivalent topology and a matching source state";

export const USFWS_EDNA_COORDINATE_GEOGRAPHY_POLICY =
  `Source-specific coordinate exception: ${USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD}. The assertion must retain the topology path and SHA-256 plus the exact source-coordinate count and coordinate-set SHA-256; ambiguous, offshore, multi-county, invalid, and source-state-mismatch rows are ineligible.`;

export const USFS_CURRENT_PLANTS_POLYGON_SOURCE_ID =
  "usfs-current-invasive-plants";

export const USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH =
  "src/data/source/county-equivalents-topology.json";

export const USFS_CURRENT_PLANTS_POLYGON_GEOGRAPHY_METHOD =
  "Source-specific positive polygon witness: at least one coordinate from each accepted retained full source polygon lies inside the committed active county topology";

export const USFS_CURRENT_PLANTS_POLYGON_GEOGRAPHY_POLICY =
  `${USFS_CURRENT_PLANTS_POLYGON_GEOGRAPHY_METHOD}. Bbox-center estimates only select candidates and never publish. Missing geometry, no inside-county vertex, retired geography, and ambiguous geography are rejected.`;

export const USGS_BBS_ROUTE_START_SOURCE_ID = "usgs-bbs";

export const USGS_BBS_ROUTE_START_TOPOLOGY_PATH =
  "src/data/source/county-equivalents-topology.json";

export const USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD =
  "Source-specific positive route-start witness: every retained BBS route-start coordinate resolved inside exactly one committed active county polygon and matched the requested state";

export const USGS_BBS_ROUTE_START_GEOGRAPHY_POLICY =
  `${USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD}. The assertion must retain the topology path and SHA-256 plus the exact source-coordinate count and coordinate-set SHA-256. Only positive standard-run Stop 1 detections are eligible; later stops, route totals, unresolved or ambiguous coordinates, retired geography, and state mismatches are prohibited.`;
