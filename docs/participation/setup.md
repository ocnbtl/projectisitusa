# Setup after source verification

This is an implementation setup guide, not an activated service.

## 1. Verify the source locally

The browser SDK is pinned in package.json and package-lock.json. The Next build uses tsconfig.app.json to check the web application and all transitive imports; the base configuration retains the offline tooling scope. Supabase functions and Deno webhook tests are checked separately with Deno. Create a migration with supabase migration new, then copy the ordered schema source 01, 02, 03 into it. Never apply the schema source to an unrelated existing project.

Run the contract tests, SQL authorization/transaction/quota tests, Deno signature tests, typechecks, production build, and desktop/mobile browser checks. See local-verification-20260928.json for completed checks and exact limitations. Contract, local PostgreSQL fixture, app/Deno type, signature, analytics privacy, and research deep-link checks passed. Lint, the production build, and browser checks remain incomplete because resource safeguards interrupted or blocked them. Verify SDK behavior, auth.sessions schema, CSP, SQL function overload permissions and RLS advisors before considering any activation.

## 2. Select a dedicated backend

Confirm the Supabase organization and actual plan/capacity with Ocean. Verify the cost and get any necessary provisioning approval. Create a separate IsItUSA project in an agreed U.S. region. Configure backups/export and operational retention appropriate to private records.

Seed isitusa_catalog only from the approved published release: county IDs/labels including current Alaska and Connecticut equivalents, and species IDs/names. Rows use kind county/species, id, label, release_id. Do not hand-map retired counties or rewrite the research files. Confirm picker IDs match the public release. Keep the reference catalog separate from occurrence evidence.

## 3. Set up the mailbox and owner

contact@IsItUSA.com is not receiving yet. Set up and test that mailbox. Confirm a receiving email for Ocean's owner login; it can differ from the public contact. Never assume that a planned address is usable.

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
