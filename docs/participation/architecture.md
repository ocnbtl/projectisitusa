# IsItUSA participation system

Status: IN PROGRESS. Source implementation prepared September 28, 2026. No installation, test execution, SQL application, provider write, email, payment, wallet creation, or deployment occurred in this phase.

## Product decisions

The public operator is IsItUSA, an independent initiative based in the United States. The planned contact is contact@IsItUSA.com. That mailbox is not receiving yet. It is not automatically the owner login. A real receiving owner address must be verified separately.

Use Resend first for delivery and Supabase for Auth, operational Postgres, private photographs, and Edge Functions. Keep one authoritative consent database. Klaviyo is deferred until campaign segmentation or automation justifies a second integration. Its profile creation and list membership must never be treated as consent.

The earlier Worker plus D1 proposal would need a separate managed identity layer or custom staff-account/session/MFA work. Supabase supplies these together. The public research pipeline stays static and offline; no operational query compiles research or changes county determinations.

Account inventory was read only: Unigentamos is on Supabase Free, with one active and two inactive unrelated projects. No IsItUSA project exists. The current free-plan limit suggests possible pilot capacity, not a guarantee. Organization selection, actual project eligibility, cost, backups and inactivity behavior still require verification. Do not reuse an unrelated project.

## Implemented source paths and contracts

| Surface | Source behavior |
| --- | --- |
| /join | Four independent unchecked choices, county/species selection, confirmation request |
| /preferences | Private fragment token, explicit confirmation, preference change, global unsubscribe |
| /report | Observation details, private location/contact, up to three private photos, persisted receipt |
| /support | One-time Stripe Checkout; only verified, activated public BTC/XMR/ETH addresses |
| /admin | Invite-only team sign-in, TOTP, sightings, audience, contributions, team permissions, configuration status |
| /auth/confirm | Explicit invite/recovery token verification and password setup |
| /privacy and /terms | Honest prelaunch disclosures; activation requires final contact/retention/refund copy |

The frontend uses the official Supabase client with in-memory sessions. A page reload requires sign-in again. No browser service key or wallet secret exists. Protected requests use provider JWT validation plus fresh active staff membership and an existing auth.sessions row. Every sensitive permission requires aal2. The whole authorization predicate coalesces to false.

Owner is a specifically provisioned Auth user, never the first signup or user_metadata. The owner can manage all scopes. Team permissions are review, audience, finance, and team. Reviewers cannot enumerate audience, financial records, other staff, or campaign drafts. Direct client writes are denied. Checked RPCs append audit/review events. Owner status and self-access cannot be changed through the team screen.

RLS and explicit grants protect every exposed table. Private SECURITY DEFINER helpers have fixed empty search paths, explicit authentication/permission checks, and revoked PUBLIC execute. Public staff RPCs are SECURITY INVOKER wrappers. Service RPCs are executable only by service_role. The financial view is security_invoker and casts atomic crypto amounts to text before JSON serialization.

## Consent and delivery

Signup does not mutate existing confirmed preferences. A pending token holds the proposed choices and subscriber version. Confirming consumes it, invalidates other tokens, and records the consent version. Unsubscribe increments the version and suppresses queued delivery. Repeated use of an already consumed unsubscribe token is idempotent. Expired, consumed, or superseded consent tokens cannot restore subscriptions. Bounce/complaint suppression cannot be cleared through public signup.

Four categories: weekly county changes, weekly followed-species changes, monthly facts, and occasional ways to help. The last category is independent of research alerts. No payment or sighting creates mailing consent.

The source sender currently processes only confirmation and preference-link messages. It uses a 50-attempt rolling 24-hour budget recorded at attempt time under an advisory lock, plus per-recipient/request abuse limits. Retry uses the same outbox ID as the Resend idempotency key, and never retries a queue item beyond 23 hours. Provider-side quota must still be checked, including Auth SMTP invitations and recovery emails. A crash after provider acceptance but before the DB update can be retried with the same provider key. Payloads are cleared after a successful send.

An RFC8058 POST-only token-scoped unsubscribe endpoint is prepared. GET never changes consent. The current transactional sender does not advertise one-click marketing headers.

Not implemented in this phase: approved-release matching, weekly/monthly scheduling, campaign approval and sending, quota expansion, and a retention/deletion job. Campaign drafting and storage exist; draft saving sends nothing. Do not enable claims of automatic county/species alerts before that additional pipeline is implemented and verified. Every future change digest must retain observed date, published date, county, source URL and correction context. Newly published historical evidence is not a new biological arrival.

## Sightings and private media

Submit -> In review -> More information needed / Accepted for research review / Not accepted. Final decisions can be reopened to In review with a reason. Optimistic version checks reject concurrent stale decisions. Acceptance only records a review; MAIN must admit evidence through the existing research process.

The endpoint bounds the entire body to 16 MB and each image to 5 MB, checks image signatures and MIME, and allows three JPEG/PNG/WebP files. Service-only upload prevents public bucket enumeration. Originals are private. Reviewers can request a 60-second signed image URL after a fresh permission check; already issued URLs can remain usable until they expire. Failed intake attempts try to remove uploaded objects. A private orphan cleanup job and a retention/deletion process must be added before activation. No original is published automatically; public images require separate permission, re-encoding/metadata removal, and review.

## Contributions

Stripe is pinned to the current verified SDK and uses hosted Checkout. The server chooses currency and computes bounded integer cents; the redirect is never proof of payment. Webhooks verify raw bytes and signatures, environment, checkout metadata, expected request ID, amount, currency and payment state. Event insertion and receipt insertion are transactional and idempotent. Refund/dispute events are separate immutable snapshots. Gross receipts are not presented as net income and adjustment snapshots are not summed.

Crypto is noncustodial. Only public receiving addresses are stored. Owner MFA and an explicit verification note are required to replace an address. Syntax checks do not prove ownership or validate every checksum; the owner must verify the complete address, checksum and chain in the actual wallet before publishing. CRYPTO_ENABLED and CONTACT_READY remain false until that check is complete. No seed, private key or Monero view key belongs in this system.

Crypto receipts are recorded only after wallet-level verification, using exact integer atomic units serialized as text. Monero cannot be confirmed from a public transaction identifier alone. No exchange-rate conversion or cross-currency total is invented. Additional assets require a specific chain/token contract and validation, not a generic address field.

## Integration and verification still required

MAIN owns npm/lock changes, tsconfig separation for Deno/tests, exact CSP origins, header/navigation/About integration, migration creation, catalog seed, runtime tests, provider configuration, build and release. The code is not a deployable or verified release yet.

Runtime dependency: @supabase/supabase-js 2.117.2, Node >=22. Edge imports: same Supabase SDK, Stripe 22.6.2, Resend 6.30.0. Versions were checked against the npm registry on September 28, 2026. Generate and review dependency locks during the install phase. Keep Deno function/test files outside the Next typecheck scope and check them separately.

CSP needs only the selected project origin for connect-src and private storage images, plus https://challenges.cloudflare.com for script/frame/connect where documented. Keep frame-ancestors restrictions. Prefer no third-party analytics on /admin, /auth/confirm and /preferences. Tokens use URL fragments and are immediately removed; never put contact data in query strings or telemetry.

Required checks are recorded as NOT RUN in completion.json. Execute SQL tests only against a disposable local/test Supabase instance and roll them back. Browser verification must exercise desktop/mobile, keyboard use, pending configuration, network failure, loading/empty states, owner/reviewer/audience/finance roles, revoked access, private media and real persistence. Financial tests use fixtures/test mode, never real charges.

## Primary references

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa)
- [Supabase custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [Auth email templates](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase pricing](https://supabase.com/pricing)
- [Stripe Checkout](https://docs.stripe.com/payments/checkout)
- [Stripe webhook signatures](https://docs.stripe.com/webhooks)
- [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Resend topics and independent choices](https://resend.com/docs/dashboard/topics/introduction)
- [Resend pricing](https://resend.com/pricing)
- [Turnstile client rendering](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/)
- [Monero receiving guidance](https://www.getmonero.org/get-started/accepting/)
