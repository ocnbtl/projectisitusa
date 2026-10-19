# Direct sightings and reviewed observations

## What is live in this release

Intake at /report saves original details and up to three private photographs. Turnstile is verified through the existing production secret at /api/sightings/verify. A global rate limit, optional contact-based limit, 16 MB request limit, 5 MB image limit, MIME/signature checks, 5,000-report ceiling and 700 MB serialized storage budget bound intake. Failed uploads are removed only when the database confirms that no report committed; uncertain commits retain private evidence and their storage reservation for reconciliation. Repeated successful requests use a stable client receipt ID and cannot replace an existing report.

The team Sightings queue has identification, an append-only review history, publication and referral controls. Reviewer volunteers can inspect and request more information. Lead reviewers can accept, publish a separate county-level record, or prepare a referral. Acceptance alone does not publish. Reopening an identification withdraws its public projection automatically until that new version is explicitly republished.

## Public map boundary

/observations shows a map and individual record profiles from the explicit public projection: catalog species name, county, observation date, reviewer-written summary and publication date. No observer name, original label, notes, private coordinates, email, originals or internal reviewer IDs are returned. The main map links to this collection and shows published observations in a selected county's details. The observations map displays the currently paginated records, not an exhaustive national count.

These operational observations do not rewrite the versioned research atlas or its county totals. Admission into compiled research remains an independent evidence-ledger and release process owned by MAIN. This release does not claim that a report automatically becomes a canonical county-species determination.

## Referrals

External sharing is optional and separately recorded at intake. Existing reports default to no external sharing. Lead reviewers curate a destination for the actual species and county and retain an official verification URL and rationale. Species-specific suggestions are deliberately limited; unknown pairs require manual verification. The copied packet is available only for a consented accepted report and the current review version. Staff review the packet, submit through the chosen official program and record a confirmation/reference. Opening a form or copying a packet never marks it sent. No external emails or agency submissions are automated in this release.

Official starting points checked October 19, 2026:
- USGS NAS aquatic reporting: https://nas.er.usgs.gov/SightingReport.aspx
- USDA APHIS Asian longhorned beetle: https://www.aphis.usda.gov/plant-pests-diseases/alb and https://www.aphis.usda.gov/form/report-it
- Ohio spotted lanternfly guidance: https://agri.ohio.gov/divisions/plant-health/invasive-pests/invasive-insects/slf
- USDA directory for other programs: https://www.invasivespeciesinfo.gov/subject/reporting

The receiving program may require attribution, an observer identity, specific photo permissions or a separate agreement. Staff must obtain anything missing; no automatic acceptance of third-party terms is built in. Directory coverage is not complete for every state-species pair.

## Privacy and operations

RLS keeps intake, photos, referral records and publication-management rows private. The public RPC returns only fixed public fields joined to the exact currently accepted review version. Publication summaries are written and explicitly checked by the lead reviewer for personal details. Original uploads are never published. Observer withdrawal requests use contact@isitusa.com; essential audit/research evidence may be retained separately. Failed upload reservations remain capacity-counted pending reconciliation rather than silently expiring. This is a bounded pilot, not an unlimited media-hosting service.

## Verification

- tests/participation/sightings-security.sql: transactional synthetic fixtures, rolled back; MFA, role isolation, unpublished intake, exact review versions, public field projection, sharing consent, referral receipt, withdrawal and revoked access.
- tests/participation/report-routing.test.ts: exact taxon/state suggestions and unknown fallback.
- No production payment, staff grant, real agency submission or external referral is part of testing.
