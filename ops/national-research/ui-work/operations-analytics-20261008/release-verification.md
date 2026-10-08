# Operations and public analytics verification — 2026-10-08

## Release scope

Public consent-based analytics, privacy choices, semantic event hooks and privacy documentation are the reviewed release subset. The private operations foundation is deployed separately but is not an activated staff, mailing, reporting or finance service. No acquired research, occurrence evidence or public research projection changed.

Application candidate: `5ea39f4365c81a2614b0f1e0782c6f379aecf8ab`, branch `codex/operations-analytics-20261008`. Preview `7u6Hdp7vV1mUa45zTBF5x5MyyjrH` was Ready after a 4m24s hosted build. Production rebuild `GS5VRKAJBNKz2LkMmFY8zXiDp3WT` was requested using Production environment variables; final outcome is recorded below after readback.

## Verified checks

- No-emit frontend typecheck and 16 analytics privacy assertions pass, with zero external calls or local builds.
- In-memory SQL authorization, transactions, quotas, roles/capacity and species identification tests pass. These are not hosted Auth/Storage end-to-end tests.
- Six participation contract tests and one signature integrity test pass. All five edge functions typecheck using existing cached dependencies. Scoped lint reports zero errors and three raw-image advisories.
- Supabase schema sources 01–05 are applied to the dedicated Free project. Nineteen public application tables have row-level security. Security advisor reported no errors or warnings; seven intentionally service-only tables have informational policy notices.
- `participation-api` v4 is Active with custom authentication. Its public config returns HTTP 200 with email/reports/legacy payments false. Unauthenticated analytics returns 401; previous hosted foreign-origin, photo and invitation checks rejected access. No hosted mutation fixtures were run after approval review rejected that test approach.
- The private catalog contains 2,504 species and 3,144 county equivalents, copied as public labels/IDs from the published baseline. Alaska and Hawaii searches pass. Community acceptance requires a valid catalog identification and lead-review permission, preserves the observer's original label and records an audit history. It does not change public determinations.
- PostHog received and returned all 22 synthetic event types under `environment=verification`. Existing production queries exclude those events. Numeric schema versions require `toFloat(properties.schema_version)=1`. Seven curated dashboard measures are saved privately. This proves the synthetic ingestion contract, not a real visitor's complete production browser journey.
- PostHog Free capped usage was selected without a credit card. Replay, autocapture, heatmaps, exception, console and network/performance capture are off. Capture is opt-in, excludes private routes/input text/query strings, respects DNT/GPC and has local event limits.
- Hosted map and species catalog load; a lanternfly search returns the expected species. Signup/report pages disclose that intake is not open. Preview contribution fallback remains usable; preview lacks Production checkout credentials.
- Desktop at the actual 2560x1255 viewport and mobile at 390x844 were inspected. The fresh finish reviewer found an undefined consent surface token in dark mode. The corrected candidate uses the existing surface/foreground tokens; dark open and closed controls compute to `rgb(27,49,44)` and `rgb(239,246,240)`. Three corrected captures were opened and independently reviewed. Reviewer verdict: `ship` for that scored fix and public analytics/consent scope only.
- Design documentation preserves the incumbent system. Six operational-documentation ambiguities were corrected and independently rechecked. Private UI has not received rendered approval.
- Before release, live checkout configuration returned HTTP 200, one-time and monthly available, portal configured, `Cache-Control: no-store`. No checkout session, charge, subscription, refund or email was created by this check.

## Catalog access repair and resources

The public R2 bucket remained 7.98 GB. Two exact preview origins were added for GET/HEAD only. Cached variants at the two exact current bundle paths were refreshed; source objects were not modified or deleted. The map bundle was checked in memory: 3,854,452 bytes and SHA-256 `1e6bd2cd3c8ac9051225326c4b9b1db87b7abece8b4ff24e56704054915a9c87`, matching the published declaration. Readback then confirmed the preview access header and the browser loaded the map.

No local build, install, bulk acquisition, paid upgrade or research-data write occurred. The source/review allocation remains capped at 20 MB and the 90 GB free-disk floor remains in force. The last measured free disk before publication was above 109 GB. Review screenshots are local, outside the public application; provider screenshots are not committed.

## Still required before full operations launch

1. Action-time confirmation for the prepared Resend sending key (alerts.isitusa.com) and PostHog project-644720 query-read key, saved only to Supabase. This is a persistent-credential browser policy requirement, not another general deployment approval.
2. Owner provisioning, invitation/recovery templates, Auth SMTP, user-completed password/TOTP enrollment, and real hosted permission-isolation checks.
3. Signed email webhooks, controlled confirmation/preferences/unsubscribe delivery to the approved owner test recipient, scheduled digests/campaigns, suppression, retention and recovery verification.
4. Correct reconciliation of the current one-time/monthly Stripe checkout, invoice/refund/dispute/idempotency tests, and private finance UI verification. The legacy receiver is not compatible and remains inactive.
5. Hosted private-photo intake/review verification and retention/orphan reconciliation before report intake opens.
6. Production browser opt-in event readback and the authenticated internal analytics connection. The test browser has DNT/GPC enabled; it was not weakened to generate tracking traffic.

Public signup, reports and staff invitations must remain closed until the corresponding checks pass. The overall requested operations system is not complete.

## Production outcome

Deployment `GS5VRKAJBNKz2LkMmFY8zXiDp3WT` completed Ready after 4m24s using Production environment variables and was assigned to `https://isitusa.com`. Provider readback identifies source `5ea39f4365c81a2614b0f1e0782c6f379aecf8ab`. The hosted research coherence check passed with no mismatches. Previous production `ABn76EiyuVYBner36JK5Px4Vzuid` at `5701c3db18050083c19a3d892430ce28313d6ac3` is retained as the rollback reference.

After publication, direct HTTPS GET checks returned 200 for /, /species, /privacy, /join, /report and /admin. The live privacy response includes PostHog documentation and the intended backend CSP. Browser verification showed the complete county map including Alaska/Hawaii, working privacy controls honoring the browser's do-not-track preference, closed signup/report states and the invitation-only admin login without private data. An anonymous REST staff-table read returned 401 and no staff rows. The live contribution configuration remained 200/no-store with one-time and monthly availability and portal configuration; the browser rendered the amount/frequency/cancellation controls. No transaction or email was created.

The live screenshot is saved locally as `production-map-verified.png`. Final disk read was 109,655,474,176 bytes free, above the 90 GB floor. This is a verified public release, not completion of the unfinished operations services listed above. Documentation-only follow-up commits do not change this application deployment.
