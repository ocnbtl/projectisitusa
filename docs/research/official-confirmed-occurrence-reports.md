# Confirmed agency occurrence reports

The `official-confirmed-occurrence-report-v1` method admits exact county occurrences explicitly confirmed by the responsible public agency. A public narrative report can qualify without individual trap rows when its species identification, actual detection, county and observation period are explicit. It creates historical `recorded-present` evidence only.

The first registered source is `cdfa-confirmed-pest-occurrences`. The reusable adapter reads MAIN-admitted, independently reviewed records under `src/data/research/official-occurrence-records/`; it makes no provider requests. Add later report records through source review and pinned parameters, not new per-document code. Current v1 allows one aggregate report record per pair in each bounded run.

Each record pins the original compressed PDF, decoded PDF hash, full per-page text extraction, exact page passages, original URL and retrieval, document date, biological date precision, named county, exact taxon and the actual independent interpretation receipt. MAIN admission and a distinct lease-bound evidence review are separate. These are agent reviews, never fabricated human approval. Canonical immutable-run validation reconstructs the assertions, reviews, outcomes and witness artifact from the receipt's committed inputs.

Reported years remain years. Reported date intervals remain intervals. Publication dates, retrieval dates, program endpoints and projected eradication timing do not become occurrence dates. The shared date reader compares the full possible interval against a negative declaration; a partial or unknown date cannot clear a conflict merely because its earliest possible day is earlier. Public evidence dates preserve source precision.

Reject group/complex identifications until the actual incident is resolved to the catalog species. Host lists, treatment boundaries, expected detections, sterile releases, generic range prose and missing records cannot create occurrences or negatives. A report of historical eradication in general terms cannot supply a dated countywide current absence. Explicit detections can contradict generic distribution summaries in the same source; retain the qualified factual detection.

## First reviewed source

CDFA's March 18, 2026 Caribbean fruit fly report supports one Los Angeles County aggregate detection during `2026-01-20/2026-02-09` and one San Diego County historical detection in `1983`. The two independent source reviews are retained under `ops/national-research/evaluations/`. The August 18 Oriental fruit fly amendment is held because the incident identifies the *Bactrocera dorsalis* group. None of these proposal reviews themselves creates a projected determination.

Run `node --import tsx scripts/test-official-occurrence-report.ts` and `node --import tsx scripts/test-occurrence-date.ts` for the source and temporal adversarial contracts. The normal research runner, frozen worker validation, MAIN integration, offline compilation and publication gates remain mandatory. A completed selected-report outcome does not mean the agency's entire source corpus or the county-species research protocol is complete.

R2 publication remains a separate meaningful batch with fresh capacity checks and the existing promotion interval. Source originals, review records and offline research tooling are not production request dependencies.
