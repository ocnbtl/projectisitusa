# Contribution amount UI refinement — 2026-10-09

Prepared changes:
- $5, $10, $25, $50, Other for both one-time and monthly contributions; $25 remains default.
- Persistent custom amount disclosure animates grid height and opacity for 280/180 ms, focuses without scrolling, disables hidden input, labels its $5–$1,000 guidance, and inherits reduced-motion override.
- One shared configuration GET supplies both checkout panels and an unboxed utility navigation after payment options. Removed duplicate management links inside panels. Existing server-validated portal and release-reviewed hosted payment link are retained.
- Payment API, transaction submission, safeguards, wallet destinations, and donation limits unchanged.

Verification:
- git diff --check passed.
- Reviewed both component call sites after shared config extraction.
- Lightweight HTML/CSS fixture used actual support stylesheet and current production styles; desktop 1280 px and phone 390 px had no horizontal overflow. Five choices rendered in one row. Open custom input received focus; closed counterpart was disabled; links were outside payment panels. Focus outline refined after batched inspection.
- Saved desktop.png and mobile.png locally. Fixture intentionally omits unrelated sections and disables checkout; this is NOT a compiled React/app test, not a live checkout test, and not production evidence.
- Full typecheck/build and production smoke testing deferred. C: free 82,174,619,648 / 1,999,284,203,520 bytes, below repository red-tier threshold. Awaiting current release exception; no deployment made.

No payment session was opened, no payment made, and no external form submitted.
