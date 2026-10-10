# Email and botanical identity checkpoint — 2026-10-10

## Email

Approved service connections saved server-side: sender, support mailbox, delivery authorization, signed webhook, existing Turnstile secret and activation flags. No paid service, campaign or new broad API key enabled.

- Preferences test: Resend `01a127ca-3576-77a6-bed9-5ba581b65767`, delivered.
- Public signup test: Resend `01a127cf-0456-7dd6-9ef4-e66318feab34`, delivered. Turnstile accepted; scheduled worker processed at 21:54 UTC, HTTP 200. Outbox sent on first attempt with no error.
- Recipient: project contact mailbox; subscription left unconfirmed.
- Job `isitusa-email-delivery` active, every minute, skips empty queue. Database enforces 50 attempted sends per rolling day and three attempts per item.
- Synthetic webhook authentication probe: signed delivered event 200; unsigned 400. It used no recipient and changed no suppression records. Actual provider bounce/complaint delivery was not induced.
- Worker failure handling now releases failed leases; idempotency retained.
- Resend provider screenshot: `resend-delivered.png` (local review artifact).

## Code and brand

- Application lint: 173 files, zero warnings/errors.
- App TypeScript check: passed with no emitted files.
- Font: self-hosted WOFF2, 22,432 bytes; OFL Fraunces derivative with original I/T outlines. Original project emblem retained; no NYBG font/artwork reused.
- Wordmark and full name use matching outlines; editorial headings use the matching downloadable font. UI/body text remains system sans.
- Hosted preview 359ab82 passed (D3e3gpdTkLKKpwgWZTWNwQEbF1jC). Simulated viewports 390, 1440, and 2452 pixels; light/dark About plus brand and support checked without horizontal overflow. Display font loaded.
- Nine network-free worker behavior cases passed, covering authorization, retries, failed sends, suppression and delivery.
- Final source removes obsolete signup-closed copy and updates email artwork to v7. The live copy and assets were confirmed before deploying email worker v15.
- Production READY: 5DmUsTDAz2iCqYg3NGtQKJwzcDAj, source 7456ee9ec39aff557bcbf0dd5fb37a3fa5931127. isitusa.com/About renders v7 images and the new font, with the corrected signup copy; no horizontal overflow at simulated 390px and normal 2452px. Production screenshot also captured at 1440px. Font downloads, PNG and manifest return 200 with correct content types.
- Independent finish review: ship, within identity and typography scope; see finish-review.md.
- Email worker v15 ACTIVE, bundle hash 6779bfa531ee08e1603d67690b920b0e91f0c162e9620a07fe348fa4a0e4d66f. Only image URL changed after delivery tests. Scheduled job remains active.
- Build contains one pre-existing transitive text-encoding deprecation warning; application lint remains warning-free.
- No campaign/digest delivery or paid service enabled.
