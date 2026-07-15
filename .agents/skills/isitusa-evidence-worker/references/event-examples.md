# Worker Event Examples

Use these complete shapes for positive presence work. Replace every example value deterministically from the lease, retained source record, and worker run. Keep the identity links exact.

## Positive assertion

```json
{"schemaVersion":1,"eventId":"example-assertion-001","event_type":"evidence.asserted","created_at":"2026-07-15T12:00:00.000Z","actor_type":"agent","actor_id":"lease-worker-id","run_id":"example-run-001","source_id":"registered-source-id","state_code":"AL","county_fips":"01001","species_id":"species-id","claim_type":"recorded-present","evidence_kind":"preserved-specimen","scope":"point","source_record_id":"stable-source-record-id","source_url":"https://source.example/records/stable-source-record-id","source_record_date":"2025-06-01","retrieved_at":"2026-07-15T12:00:00.000Z","taxon_match":{"method":"Exact registered scientific-name match","target_scientific_name":"Target species","source_scientific_name":"Target species","source_taxon_key":"source-taxon-id"},"geography_match":{"method":"Exact registered county-equivalent name or FIPS match","source_state":"Alabama","source_county":"Autauga County","county_fips":"01001"},"temporal_scope":"The source record reports an event on 2025-06-01.","spatial_scope":"The source record explicitly identifies Autauga County, Alabama. It does not imply countywide abundance.","survey_scope":null,"normalized_payload_hash":"64-lowercase-hex-characters-from-normalized-source-record","caveats":["This positive record supports presence only."],"notes":["Stable retained source record reviewed under the registered publication gate."]}
```

The exact geography requirements are:

- top-level `county_fips` is a five-digit registered active county-equivalent FIPS
- `geography_match.source_county` is nonempty source text
- `geography_match.county_fips` exactly equals top-level `county_fips`
- `geography_match.method` names the approved non-coordinate resolution method
- coordinate routing is forbidden unless `sourceParameters.geographyPolicyApproved` is exactly `true` and the lease pins that policy

## Accepted review

```json
{"schemaVersion":1,"eventId":"example-review-001","event_type":"evidence.reviewed","created_at":"2026-07-15T12:00:00.000Z","actor_type":"agent","actor_id":"lease-worker-id","run_id":"example-run-001","source_id":"registered-source-id","state_code":"AL","county_fips":"01001","species_id":"species-id","references":{"assertion_event_id":"example-assertion-001"},"review_level":"agent-reviewed","decision":"accepted","publication_eligible":true,"reason_codes":["exact-taxon-match","exact-county-match","registered-publication-gate"],"notes":["The assertion passed the registered source, taxon, geography, and evidence checks."]}
```

`references.assertion_event_id` must exactly equal the assertion `eventId`.

## Rejection

```json
{"schemaVersion":1,"rejection_id":"example-rejection-001","created_at":"2026-07-15T12:00:00.000Z","actor_type":"agent","actor_id":"lease-worker-id","run_id":"example-run-001","source_id":"registered-source-id","candidate_locator":"https://source.example/records/rejected-record-id","candidate_taxon":"Target species","candidate_geography":"Alabama, United States","normalized_target":{"state_code":"AL","species_id":"species-id","county_fips":"01001"},"reason_code":"geography-missing","supporting_notes":["The materially considered record does not contain exact county-equivalent text or FIPS."]}
```

A duplicate source record should be rejected or deterministically suppressed according to the declared duplicate strategy. It must never create a second assertion identity.

## Completed positive outcome

```json
{"schemaVersion":1,"outcome_id":"example-outcome-001","run_id":"example-run-001","source_id":"registered-source-id","state_code":"AL","county_fips":"01001","species_id":"species-id","status":"evidence-found","scope_complete":true,"recorded_at":"2026-07-15T12:00:00.000Z","assertion_event_ids":["example-assertion-001"],"rejection_ids":["example-rejection-001"],"query_urls":["https://source.example/search?state=AL&species=species-id"],"notes":["The declared applicable source screen completed and produced one publishable positive assertion."]}
```

## Completed no-evidence outcome

Use this only after the declared applicable source scope actually completed.

```json
{"schemaVersion":1,"outcome_id":"example-outcome-002","run_id":"example-run-002","source_id":"registered-source-id","state_code":"AL","county_fips":"01001","species_id":"species-id","status":"no-qualifying-evidence","scope_complete":true,"recorded_at":"2026-07-15T12:00:00.000Z","assertion_event_ids":[],"rejection_ids":["example-rejection-002"],"query_urls":["https://source.example/search?state=AL&species=species-id"],"notes":["The applicable source screen and declared pagination completed, but no qualifying determination evidence remained after review. This is researched unresolved only."]}
```

## Interrupted outcome

```json
{"schemaVersion":1,"outcome_id":"example-outcome-003","run_id":"example-run-003","source_id":"registered-source-id","state_code":"AL","county_fips":"01001","species_id":"species-id","status":"needs-followup","scope_complete":false,"recorded_at":"2026-07-15T12:00:00.000Z","assertion_event_ids":[],"rejection_ids":[],"query_urls":["https://source.example/search?state=AL&species=species-id&page=1"],"notes":["Acquisition stopped before all declared pages completed. Resume from the recorded checkpoint."]}
```

Never substitute a no-evidence outcome for an interrupted outcome.
