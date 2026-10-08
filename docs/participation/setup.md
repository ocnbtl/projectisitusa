# Setup after source verification

This is an implementation setup guide, not an activated service. Current evidence is recorded in `ops/national-research/ui-work/operations-analytics-20261008/progress.json`; the September completion record is historical.

## Latest internal workspace release - October 8, 2026

Application 96e79f3d05f8eb141adc0106e68b7daedf2f5882 is live through Production deployment DQMuen95tcgNjCea8sY7eaY8HmNm. This continuation adds the operational workspace frame, filtered queues, audited editable drafts, configuration status, activity history and refined sign-in/privacy screens. Schema06 and participation-api v5 are applied. See internal-workspace-verification.md and workspace-release.json beside the progress record for current scoped evidence. The earlier production checkpoint below is historical release evidence.

Presentation passed an independent ship review using clearly labeled synthetic records. Real owner access, SMTP/invitation/MFA, private storage, delivery, analytics reporting connection and payment reconciliation remain unfinished. Public signup/reports remain closed. The production fixture route renders not-found without fixture data, but its streamed transport status is200 rather than404.

## Verified checkpoint â€” October 8, 2026

The dedicated `isitusa` backend is `cnbcqzecxydgpeejeegy` in the Unigentamos Free organization. Schema sources 01â€“06 are applied. Public and anonymous Auth signup are disabled, and the production Auth site/redirect are `https://isitusa.com` and `https://isitusa.com/auth/confirm`. No owner account has been provisioned yet.

The reference picker contains 2,504 species and 3,144 county equivalents from published site commit `5701c3db18050083c19a3d892430ce28313d6ac3`, filtered to its 51 configured state/DC jurisdictions. Alaska and Hawaii searches pass. This copies labels and IDs only, not occurrence evidence. Staff identification preserves the observer's description, records the matched catalog species in review history, and requires a lead reviewer for acceptance. No review changes the public map.

`participation-api` version 5 and `participation-resend` version 2 are deployed. Production's public backend URL/key are saved in Vercel and included in the verified deployment. All public intake flags remain false. Hosted checks confirm foreign-origin rejection, unauthenticated private-action rejection, and disabled signup/report/legacy checkout behavior. Local SQL authorization, transaction, quota, identification and capacity tests pass; five edge functions typecheck with cached dependencies, and contract/signature/privacy tests pass. Application commit `5ea39f4` passed the hosted build, corrected dark-theme review and production release. Deployment `GS5VRKAJBNKz2LkMmFY8zXiDp3WT` is Ready and assigned to isitusa.com. Live map, privacy, closed signup/report states, invitation-only staff login and existing contribution availability were verified. See `release-verification.md` beside the progress record for the scoped release evidence. Owner login, SMTP delivery and payment reconciliation remain unverified.

PostHog project 644720 is named `isitusa` and uses the observed Free capped-usage plan, with no credit card and a 1M analytics-event monthly allowance. IP anonymization is enabled; replay, automatic clicks, console capture, network/performance capture and exception capture are disabled. Site events require consent and exclude private routes, input text and token-bearing URLs. Private dashboard 2167947 contains seven Isitusa-specific measures and explains their limits. All 22 synthetic event types were received and read back under `environment=verification`; the production summary correctly excludes them. SQL compares `toFloat(properties.schema_version)=1`, because ingestion stores numeric versions as 1.0. The restricted server query key and end-to-end production-browser capture remain pending. An empty production dashboard does not establish zero site usage.

The existing public embedded Stripe checkout supports one-time and monthly contributions independently of the legacy Supabase checkout flag. The older `participation-stripe` receiver does not yet reconcile that flow and must not be activated as a completed finance integration. The public contact mailbox has previously received a verified message; Resend application sending access, custom Auth SMTP, signed delivery webhooks, scheduling, digest/campaign delivery and retention still need completion before email intake opens.

No local builds, installs, research changes or R2 object writes are authorized in this resource allocation. Use hosted build verification; stop below 90 GB free and limit new source/review files to 20 MB. The already-public R2 bucket received GET/HEAD access for the two exact operations preview addresses. Two exact catalog cache paths were refreshed after adding those origins; neither source object changed. The map bundle checksum matches the published manifest. Bucket storage was 7.98 GB when inspected.

## 1. Verify the source locally

The Supabase browser SDK is pinned in package.json and package-lock.json. Analytics uses the explicit capture adapter without installing an additional SDK. The Next build uses tsconfig.app.json to check the web application and transitive imports; the base configuration retains the offline tooling scope. Supabase functions and webhook tests are checked separately with cached Deno dependencies. Schema sources 01 through 06 are already applied to the dedicated project; inspect the migration history before preparing any future incremental migration. Do not reapply the foundation or target another project.

Use the current progress record for contract, in-memory SQL authorization/transaction/quota, signature, no-emit type and analytics privacy results. Hosted preview and production at 5ea39f4 passed their builds and scoped public browser checks; scoped lint has zero errors. The dark consent correction received a fresh independent ship verdict for the public scope. This does not approve private authenticated workflows. local-verification-20260928.json is historical, not the current release verdict. Run builds only on the hosted provider under this allocation. Authenticated owner/role flows, hosted Storage behavior, email delivery and production capture require separate end-to-end verification before activation.

## 2. Select a dedicated backend

Use the already approved dedicated project cnbcqzecxydgpeejeegy in the Unigentamos Free organization. Do not create a duplicate backend. Confirm remaining free capacity, private photo storage, backup recovery and retention before real intake; public signup remains disabled.

Seed isitusa_catalog only from the approved published release: county IDs/labels including current Alaska and Connecticut equivalents, and species IDs/names. Rows use kind county/species, id, label, release_id. Do not hand-map retired counties or rewrite the research files. Confirm picker IDs match the public release. Keep the reference catalog separate from occurrence evidence.

## 3. Set up the mailbox and owner

The public contact mailbox has received a verified message in the earlier support setup. Ocean separately supplied an owner/test recipient in chat; keep that address out of committed operational logs. Application and Auth email delivery still need their own verification.

Disable public and anonymous Auth signups. Provision exactly the approved owner Auth account, verify email ownership, then insert its actual user ID into isitusa_staff with is_owner=true. Do not infer owner from first login or client metadata. The user enrolls TOTP on first sign-in. Keep recovery procedures outside the public app and exercise them before adding volunteers.

Invite and recovery emails MUST use custom Supabase templates:

Invite link:
{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=invite

Recovery link:
{{ .SiteURL }}/auth/confirm#token_hash={{ .TokenHash }}&type=recovery

In HTML attributes encode & as &amp;. The supplied screen deliberately does not accept the default #access_token fragment. Test both link flows. Tokens are consumed only when the user continues; password setup then signs out and returns to sign-in.

## 4. Configure Resend and abuse protection

Use a project-specific sending setup in Resend. Verify the domain and sending identity, configure SMTP for Auth, and a working reply-to mailbox. Keep CONTACT_READY, EMAIL_ENABLED and STAFF_INVITES_ENABLED false until verification passes. Configure Turnstile for the exact host and verify action/hostname server-side.

Set separate server-only keys for Supabase service access, Resend webhooks, delivery-job authentication, and rate-limit hashing. Do not put them in NEXT_PUBLIC values or chat. Configure one signed Resend webhook endpoint for bounce/complaint handling.

After fixture verification and permission to send to an explicit test recipient, run one confirmation, preference change, unsubscribe, bounce fixture, invite and recovery check. Queue source alone does not schedule deliveries; configure a bounded job invoking participation-delivery only after testing. Initial worker limit is 50 attempted sends per rolling day, independent of provider maximums. Reconcile total project SMTP and application usage.

Before marketing/digests launch, finish approved-release matching, campaign review/approval, scheduling, unsubscribe-link creation, mailing/contact requirements and suppression testing. Current sender deliberately does not send digests or campaign drafts.

## 5. Configure Stripe

The existing public Stripe checkout supports one-time and monthly contributions. This section covers the unfinished private finance reconciliation, not reopening public checkout. Use test-mode keys and signed test webhooks to exercise completed, delayed, rejected, replayed, refunded and disputed events. Never test with a real charge by default.

Keep the existing public contact, refund procedure and support terms in place. The older participation-stripe receiver and legacy PAYMENTS_ENABLED flag do not control the current Next.js checkout. Do not enable that receiver until it correctly reconciles the current checkout metadata, monthly invoices and adjustments. Its eventual STRIPE_LIVE_MODE must match the verified key and webhook environment.

## 6. Create receiving wallets on the owner's device

Ocean creates or chooses wallets under their own control. Store recovery phrases offline with the wallet's own backup process. Do not send them to Codex or place them in the site, database, or dashboard.

Provide only public receiving addresses for Bitcoin mainnet, Monero mainnet and Ethereum mainnet. Verify the complete address and network on the device that controls the wallet. Use the owner dashboard to record how and when ownership/checksum/network were checked. Keep CRYPTO_ENABLED false until an independent display check confirms the correct address. No transfers are needed merely to implement the receiving page.

For Monero, verify receipt inside the receiving wallet. A public explorer cannot prove the destination and received amount. Record receipts manually with the verification note. Later automation requires a separate private view-only design; the current app stores no view key.

## 7. Connect and activate only verified parts

Navigation, the reading-page footer, and IsItUSA capitalization/About details are integrated in the local candidate. Before activation, MAIN adds the exact backend and Turnstile origins to CSP and updates the public prelaunch disclosures to the verified operating contact/retention/refund policy. Only then enable the individual features that passed their tests.

Keep the existing public research release unchanged throughout. Approving a community sighting queues research review; it does not mutate the map.

Retention/deletion operations, private-upload orphan cleanup, accurate financial adjustments, monitoring and backup recovery require explicit verification before collecting real data. None are claimed complete by source generation.


## Activation audit update

See `ops/national-research/ui-work/operations-analytics-20261008/activation-audit.json`. Fresh provider checks confirmed zero Auth accounts and zero active owners. The existing confirmation/preferences delivery worker is now deployed as participation-delivery v1; cached typing passes and anonymous requests are rejected (GET401, POST503 setup unavailable). No outbox rows or sends exist. It is not configured or scheduled, and it still does not deliver newsletters/digests. Restricted service connections and owner provisioning await the specific approval presented with the concrete prepared forms; password/TOTP entry remains user-completed. Public mailbox success does not verify application or Auth mail. The current donor checkout remains independent of the incomplete private receipt integration.
