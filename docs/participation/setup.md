# Setup after source verification

This is an implementation setup guide, not an activated service. Current evidence is recorded in `ops/national-research/ui-work/operations-analytics-20261008/progress.json`; the September completion record is historical.

## Verified checkpoint — October 8, 2026

The dedicated `isitusa` backend is `cnbcqzecxydgpeejeegy` in the Unigentamos Free organization. Schema sources 01–05 are applied. Public and anonymous Auth signup are disabled, and the production Auth site/redirect are `https://isitusa.com` and `https://isitusa.com/auth/confirm`. No owner account has been provisioned yet.

The reference picker contains 2,504 species and 3,144 county equivalents from published site commit `5701c3db18050083c19a3d892430ce28313d6ac3`, filtered to its 51 configured state/DC jurisdictions. Alaska and Hawaii searches pass. This copies labels and IDs only, not occurrence evidence. Staff identification preserves the observer's description, records the matched catalog species in review history, and requires a lead reviewer for acceptance. No review changes the public map.

`participation-api` version 4 and `participation-resend` version 1 are deployed. Production's public backend URL/key are saved in Vercel for the next deployment. All public intake flags remain false. Hosted checks confirm foreign-origin rejection, unauthenticated private-action rejection, and disabled signup/report/legacy checkout behavior. Local SQL authorization, transaction, quota, identification and capacity tests pass; five edge functions typecheck with cached dependencies, and contract/signature/privacy tests pass. Preview `a817714` built successfully and its map, species search, privacy controls and closed signup/report states were inspected. Owner login, SMTP delivery and payment reconciliation remain unverified.

PostHog project 644720 is named `isitusa` and uses the observed Free capped-usage plan, with no credit card and a 1M analytics-event monthly allowance. IP anonymization is enabled; replay, automatic clicks, console capture, network/performance capture and exception capture are disabled. Site events require consent and exclude private routes, input text and token-bearing URLs. Private dashboard 2167947 contains seven Isitusa-specific measures and explains their limits. All 22 synthetic event types were received and read back under `environment=verification`; the production summary correctly excludes them. SQL compares `toFloat(properties.schema_version)=1`, because ingestion stores numeric versions as 1.0. The restricted server query key and end-to-end production-browser capture remain pending. An empty production dashboard does not establish zero site usage.

The existing public embedded Stripe checkout supports one-time and monthly contributions independently of the legacy Supabase checkout flag. The older `participation-stripe` receiver does not yet reconcile that flow and must not be activated as a completed finance integration. The public contact mailbox has previously received a verified message; Resend application sending access, custom Auth SMTP, signed delivery webhooks, scheduling, digest/campaign delivery and retention still need completion before email intake opens.

No local builds, installs, research changes or R2 object writes are authorized in this resource allocation. Use hosted build verification; stop below 90 GB free and limit new source/review files to 20 MB. The already-public R2 bucket received GET/HEAD access for the two exact operations preview addresses. Two exact catalog cache paths were refreshed after adding those origins; neither source object changed. The map bundle checksum matches the published manifest. Bucket storage was 7.98 GB when inspected.

## 1. Verify the source locally

The browser SDK is pinned in package.json and package-lock.json. The Next build uses tsconfig.app.json to check the web application and all transitive imports; the base configuration retains the offline tooling scope. Supabase functions and Deno webhook tests are checked separately with Deno. Create a migration with supabase migration new, then copy the ordered schema source 01, 02, 03 into it. Never apply the schema source to an unrelated existing project.

Run the contract tests, SQL authorization/transaction/quota tests, Deno signature tests, typechecks, production build, and desktop/mobile browser checks. See local-verification-20260928.json for completed checks and exact limitations. Contract, local PostgreSQL fixture, app/Deno type, signature, analytics privacy, and research deep-link checks passed. Lint, the production build, and browser checks remain incomplete because resource safeguards interrupted or blocked them. Verify SDK behavior, auth.sessions schema, CSP, SQL function overload permissions and RLS advisors before considering any activation.

## 2. Select a dedicated backend

Confirm the Supabase organization and actual plan/capacity with Ocean. Verify the cost and get any necessary provisioning approval. Create a separate IsItUSA project in an agreed U.S. region. Configure backups/export and operational retention appropriate to private records.

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

Ocean creates and verifies the Stripe account and recipient details. Use test-mode keys and signed test webhooks first. Exercise completed, delayed, rejected, replayed, refunded and disputed events. Never test with a real charge by default. The first checkout supports one-time USD contributions.

Publish the working contact, clear refund procedure and final support terms before enabling live payments. Set STRIPE_LIVE_MODE to match the verified key/webhook environment. Payment pages remain disabled until PAYMENTS_ENABLED and CONTACT_READY are true.

## 6. Create receiving wallets on the owner's device

Ocean creates or chooses wallets under their own control. Store recovery phrases offline with the wallet's own backup process. Do not send them to Codex or place them in the site, database, or dashboard.

Provide only public receiving addresses for Bitcoin mainnet, Monero mainnet and Ethereum mainnet. Verify the complete address and network on the device that controls the wallet. Use the owner dashboard to record how and when ownership/checksum/network were checked. Keep CRYPTO_ENABLED false until an independent display check confirms the correct address. No transfers are needed merely to implement the receiving page.

For Monero, verify receipt inside the receiving wallet. A public explorer cannot prove the destination and received amount. Record receipts manually with the verification note. Later automation requires a separate private view-only design; the current app stores no view key.

## 7. Connect and activate only verified parts

Navigation, the reading-page footer, and IsItUSA capitalization/About details are integrated in the local candidate. Before activation, MAIN adds the exact backend and Turnstile origins to CSP and updates the public prelaunch disclosures to the verified operating contact/retention/refund policy. Only then enable the individual features that passed their tests.

Keep the existing public research release unchanged throughout. Approving a community sighting queues research review; it does not mutate the map.

Retention/deletion operations, private-upload orphan cleanup, accurate financial adjustments, monitoring and backup recovery require explicit verification before collecting real data. None are claimed complete by source generation.
