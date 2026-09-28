# Bringing people into Isitusa

Prepared September 28, 2026. Isitusa is an independent initiative. The choices below are a proposed setup, not activated services.

## Start with useful email updates

Give visitors four independent choices, all unchecked until they choose them:

| Choice | What arrives | Proposed timing |
| --- | --- | --- |
| My counties | Newly published species records and meaningful corrections for selected counties | Weekly digest, only when something changes |
| Species I follow | New records or important evidence changes for selected species, nationwide or in selected states | Weekly digest |
| Get to know invasive species | Identification tips, species stories, and practical facts | Monthly |
| Ways to help | Local restoration opportunities, conservation campaigns, and ways to support the work | Occasional, separately selected |

The signup flow is email, interests, places/species, then email confirmation. No account or password is needed. Every message links to preferences and unsubscribe. People can follow several counties and species. The action category stays separate from research alerts.

An alert should say **"Newly added to Isitusa's records"** unless its evidence establishes a genuinely new arrival. An old observation published today is not a species arriving today. Include the observation date, publication date, county, source link, and a short explanation of what changed. Send corrections when a previous alert's evidence changes.

My recommended starting arrangement is Resend for email delivery and preference topics, with a small Cloudflare Worker and D1 database to hold confirmed county/species choices and a record of what was sent. The public research pipeline stays offline. The email service consumes only approved published releases.

Resend supports separate topics and a visitor-facing unsubscribe/preference page. Its topic default called `Opt-out` means nobody receives that topic until they explicitly subscribe. Use that default, then add the visitor's chosen topics after confirmation. [Resend topic documentation](https://resend.com/docs/dashboard/topics/introduction)

Store subscribers, their consent version and confirmation date, county/species selections, unsubscribe status, release IDs already processed, and delivery results. Use one delivery key per subscriber/change so retries do not send duplicates. Apply unsubscribe and bounce suppression before each send. Keep email addresses out of public research files.

D1 has a free tier with hard usage limits, which can suit a small pilot. Email sending also needs a quota-aware queue. Do not promise unlimited free alerts or turn on automatic paid upgrades. Recheck the actual account's plan before activation. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Resend pricing](https://resend.com/pricing)

## Make sightings useful before building a new database

For the first public version, send visitors to an established reporting route, including EDDMapS or the relevant state authority. Ask people to record the location, date, photographs, and identification notes. Explain where the link takes them. [EDDMapS reporting](https://www.eddmaps.org/report/), [USDA reporting directory](https://www.invasivespeciesinfo.gov/subject/reporting)

For an Isitusa submission form, we first need a named reviewer and an agreed review process. Proposed fields are a species or "not sure," observed date, location, photographs, notes, and optional contact email. Keep exact locations and contact details private by default. Strip image location metadata from public copies, obtain permission to use photographs, and publish only the reviewed county-level record with its evidence history.

The status flow is Submitted, In review, More information needed, then Accepted or Not accepted. A submission receipt only confirms receipt. Accepted sightings enter the normal evidence-review pipeline; they do not write directly to the map or trigger a confirmed-species alert.

## Offer a clear way to support the work

Use **"Support Isitusa"** as the main action. Explain that support helps maintain public information, review sources, and improve the site. Publish the actual recipient and support contact before collecting money. Do not claim registered-charity status or tax deductibility.

Stripe Payment Links is a practical first option: one link for a visitor-chosen one-time amount, and separate fixed monthly support amounts if desired. Stripe's choose-your-amount Payment Links do not currently support recurring payments. [Stripe Payment Links](https://docs.stripe.com/payment-links/create)

The payment provider should handle card details, receipts, and subscription cancellation. Configure a cancellation route and support/refund policy before launch. A payment confirmation page should rely on the provider's confirmed payment state. Supporting the project must not automatically subscribe someone to research or advocacy emails. [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal)

## Decisions to make next

1. Choose the public operator name, country, and support email. An independent initiative can still explain clearly who is accountable for it.
2. Confirm whether you already have Resend and Stripe accounts, or prefer different providers. Keep credentials out of chat; use the provider's sign-in and secret configuration.
3. Choose who reviews sightings. Until then, use the established reporting links.
4. Approve the four email choices and weekly/monthly starting rhythm above.
5. Review the signup, confirmation email, preferences page, support page, and one real sample county alert before activation.

Suggested launch order: reporting links and clear About copy first; confirmed email signup and preferences second; a small reviewed alert pilot third; payments after recipient setup; direct sightings after moderation is ready.
