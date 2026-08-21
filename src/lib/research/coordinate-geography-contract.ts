export const USFWS_EDNA_COORDINATE_SOURCE_ID = "usfws-invasive-carp-edna";

export const USFWS_EDNA_COORDINATE_TOPOLOGY_PATH =
  "src/data/source/county-equivalents-topology.json";

export const USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD =
  "Coordinate-derived county assignment: all retained USFWS source coordinates resolved uniquely to the declared active county using the committed canonical Census county-equivalent topology and a matching source state";

export const USFWS_EDNA_COORDINATE_GEOGRAPHY_POLICY =
  `Source-specific coordinate exception: ${USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD}. The assertion must retain the topology path and SHA-256 plus the exact source-coordinate count and coordinate-set SHA-256; ambiguous, offshore, multi-county, invalid, and source-state-mismatch rows are ineligible.`;
