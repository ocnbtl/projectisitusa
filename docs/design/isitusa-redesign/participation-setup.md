# Bringing people into IsItUSA

Updated September 28, 2026. The operator is IsItUSA, an independent initiative based in the United States. The planned public contact is contact@IsItUSA.com; the mailbox is not receiving yet. Ocean is the initial reviewer. Future volunteers receive individual, permission-scoped accounts.

The approved four independent email choices are My counties, Species I follow, Get to know invasive species, and Ways to help. Choices start unchecked and require email confirmation. Supporting IsItUSA or sharing a sighting does not create mailing consent.

Resend is the selected first delivery provider. Supabase is the prepared source architecture for staff Auth, private operational Postgres and photographs. This replaces the earlier Worker/D1 proposal because the requested invite-only team accounts, MFA and database permissions need a managed identity layer. Klaviyo is deferred.

Implementation source now covers signup/preferences, private sightings, submission review, staff permissions, contribution records, hosted one-time Stripe Checkout, public receiving-address configuration, and verified manual crypto receipts. There is no IsItUSA backend/provider setup yet. No wallets, emails, charges, migrations or production activation occurred.

The current sender handles only confirmation and preference links. Automatic county/species digest generation, scheduling, and campaign approval/sending are not yet implemented. The dashboard can save facts/action campaign drafts without sending them.

See [the implementation architecture](../../participation/architecture.md), [setup sequence](../../participation/setup.md), and [completion evidence](../../participation/completion.json) for exact source status and pending verification. These documents do not authorize provider activation.

Bitcoin, Monero and Ethereum wallets must be controlled by Ocean. The site stores only verified public receiving addresses and exact, verified receipt records. No recovery phrase, private key or Monero view key belongs in this system.
