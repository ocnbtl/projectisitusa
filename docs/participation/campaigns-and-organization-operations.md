# Isitusa communications and organization operations

Prepared October 9, 2026. These are draft concepts, not sent campaigns. Bracketed fields must be replaced with reviewed facts before approval. Never substitute an example sighting for research evidence.

## Campaign streams and first messages

The present subscriber choices are county updates, species updates, facts, and ways to help. Keep donor receipts and account-security messages separate from campaign consent. An email address collected for a report, contribution, or staff invitation is not newsletter consent.

### County updates: weekly only when published evidence changes

Audience: confirmed subscribers who selected an affected county. Deduplicate each recipient within a release. Link to the public evidence and its observation date; never describe an old observation as a new arrival.

1. Subject: Your county, in focus

Thanks for following [county, state]. We will send a summary when the atlas publishes a relevant evidence update. Each update will distinguish when an observation was made from when its source was reviewed or added. You can explore the current county records now at [county link]. A species missing from this list is not necessarily absent from the county. Choose your counties and email preferences at [preferences link].

2. Subject: An evidence update for [county]

The atlas has published [brief, verified change]. The underlying observation dates to [date or explicitly unknown], and the source was reviewed on [review date]. [One sentence explaining what the record supports and what remains uncertain.] Read the evidence and original source at [record link]. You are receiving this because you follow [county]. [Preferences] [Unsubscribe]

### Species updates: weekly only when relevant published records change

Audience: confirmed subscribers following that species. Include county and source distinctions; do not imply eradication or absence from missing records.

1. Subject: Following [species]

You are now following [common and scientific name]. Start with the species profile for identification features, similar species, and the sources behind its mapped records: [profile link]. If you think you have found it, use the reporting guidance for your location. Do not move a suspected invasive organism to get it identified. [Preferences] [Unsubscribe]

2. Subject: What changed in the [species] records

[Source] has provided evidence supporting [precise change and geography]. The observation was recorded on [date]; this atlas update was published on [date]. [State any identification, location, or freshness limitation.] Review the source and county details at [evidence link]. [Preferences] [Unsubscribe]

### Get to know invasive species: monthly education

Audience: confirmed facts subscribers. One useful identification concept per email, reviewed citations, no inflated urgency.

1. Subject: A map record is the beginning of a question

A record can tell us that a species was observed in a place. It cannot always tell us whether the species remains there today, how widespread it is, or whether a control effort succeeded. Isitusa keeps those questions separate. Open a county, choose a species, and look at the source and date behind the record: https://isitusa.com/. [Preferences] [Unsubscribe]

2. Subject: Before you report a possible invasive species

Take clear photographs from more than one angle, note where and when you saw it, and compare the features with a reliable identification guide. Avoid handling or moving an unfamiliar organism. Similar-looking native species matter too. Begin with https://isitusa.com/species and use the reporting guidance for the species and state. Add a reviewed agency guide before sending this message. [Preferences] [Unsubscribe]

### Ways to help: occasional, opportunity-led

Audience: confirmed action subscribers. Only announce real approved opportunities. Never represent a planned partnership as established.

1. Subject: Help improve the atlas

Useful contributions start with careful observation and clear sources. You can help by flagging an outdated link, sharing an authoritative public data source, or expressing interest in a volunteer role. We review proposed changes before publishing them. [Verified contact or opportunity link.] [Preferences] [Unsubscribe]

2. Subject: Join us for [approved opportunity]

We are inviting [audience] to [activity] on [date] at [confirmed location]. [Accessibility, supervision, expected time, equipment, and weather arrangements.] The activity has been approved by [responsible staff role]; [required permissions] are in place. Read the details and register at [approved link]. Do not send until the event and registration mechanism are real. [Preferences] [Unsubscribe]

### Volunteer onboarding: invited participants only

These operational messages do not add a participant to public mailing lists.

1. Subject: Your first steps with Isitusa

Welcome to the team. Your workspace access is limited to the responsibilities assigned to your role. Sign in at https://isitusa.com/admin and complete authenticator setup. Start with an assigned item, record the sources you used, and submit it for staff review. A volunteer review does not publish a sighting or send an email.

2. Subject: A useful review leaves a clear trail

For your next assignment, record what you checked, what you could not verify, and what would resolve the uncertainty. Keep original evidence intact. Use Changes requested when more information is needed. Staff make the final publication or confirmation decision. [Link to actual assigned work, only once deep linking exists.]

### Supporter communications: separate receipt and optional updates

1. Subject: Your Isitusa contribution

A payment receipt must be generated from a verified successful Stripe payment or paid invoice, with actual amount, currency, date and provider reference. Thank the contributor, link the actual receipt, and show monthly-management instructions only for recurring contributions. Do not promise tax deductibility. Do not send a second competing receipt if Stripe already sends the intended one.

2. Subject: What your support helped maintain

This optional update requires the appropriate email consent. Report completed, evidenced work such as [verified release], [documented research milestone], and [specific next priority]. Explain limitations candidly. A contribution does not buy a determination or change the research standard. [Public progress link] [Preferences] [Unsubscribe]

## Roles and approval boundaries

- Owner: sole active owner, all private capabilities; only owner grants staff-level powers.
- Sighting volunteer: preliminary review and identification notes. Staff reviewer makes final confirmation/rejection decisions.
- Content volunteer: own email/article drafts; no subscriber list, finance or publication approval.
- Events volunteer: own/assigned event plans; staff approves the plan before announcements or commitments.
- Outreach volunteer: own/assigned outreach and partnership proposals; a proposal does not send a message or create a partnership.
- Staff communications: content, audience, analytics and publication review.
- Staff operations: work approval and final sighting review, without automatic financial or team-administration access.
- Finance: receipt records; no assumption of access to staff management or campaign sending.
- Team manager: can manage volunteer grants only; cannot promote someone to staff or alter an owner.

Roles represent system permissions, not employee/contractor/volunteer legal classification. Accounts use verified email and MFA. Row-level policies enforce the same boundaries as the navigation. Approval and version-conflict handling apply on the server. Preserve an audit receipt for decisions and access changes.

## Curated reporting portal: next implementation

Start with a versioned authority directory, keyed by jurisdiction, species or taxon coverage, report type and authority priority. Each entry needs an official submission URL, source URL, required fields, supported channel, contact/publication date, last verified date, and review status. Do not invent an agency API or scrape a private reporting endpoint.

User flow: species or unknown identification -> state/county -> official guidance -> observation details and photos -> preview exact recipient and information -> explicit permission -> submit through a supported integration or open the official portal. Explain whether Isitusa retains a copy. A local saved report is not a delivery receipt from the authority. Failed routing must preserve the submission and show its actual state.

Volunteers triage, compare identification evidence and recommend a decision. Staff approve the identification and routing. Externally routed reports remain separate from the authoritative county-species research ledger until the evidence protocol accepts them. Never auto-forward personal contact information or precise coordinates to an unverified destination.

## Sending gates and address clarification

A valid postal address is required for emails whose primary purpose is commercial under CAN-SPAM. A business office is not required: a valid street address, registered USPS PO box, or qualifying registered private mailbox can satisfy that requirement. Purely informational/charitable content is not automatically commercial; assess the real subject and content. Do not classify every nonprofit message as exempt, or every account invitation as a newsletter. The owner has not provided a public address; do not invent one or publish a private home address.

Source: https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business (checked October 9, 2026).

Before enabling campaigns: confirm provider policy and sender details; validate purpose and consent per audience; freeze an approved content version; show eligible recipient count and exclusions; require a deliberate final Send; use atomic idempotent queueing, bounded quotas, unsubscribe recheck at send time, signed bounce/complaint handling, and delivery receipts. Auth SMTP and newsletter jobs share provider usage, so the limits must be reconciled together. No campaign in this document is authorization to send.

## Remaining product work

The October 9 implementation adds organization proposals, staff review and locked email approval. It does not yet provide external article publishing, event registration, a full contact CRM, campaign Send, automated county/species digests, or authority delivery. Build these from verified data contracts and working receipts, then expose the corresponding controls. Existing Stripe checkout must be reconciled by its current purpose/frequency metadata and paid invoice events; do not activate the legacy receiver that expects a different checkout contract.
