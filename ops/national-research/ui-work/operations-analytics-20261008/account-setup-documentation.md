# Account setup documentation review — 2026-10-09

Status: source and final light-mode capture inspection complete. This records an ordinary Operate extension, not a new visual system or a production release. Production release and real recovery-email verification remain pending.

Final source: `c93fb0b382edbf16b9566190d7e8569d73abe862`, following initial inspection at `8d0399f3c2411526c10cb1cebc77c31a74ff919b`, compared with `9d2b1ccf25`. Inspected `PRODUCT.md`, `DESIGN.md`, `.impeccable/surfaces/src-components-admin-workspace-tsx.md`, account frame/confirmation/authentication/preview components, workspace integration, account role-copy helper, admin styles, global token definitions and the local account-check harness. The parent supplied the final capture set after reporting hosted preview deployment `9LRbVzhA5` Ready. This documenter inspected the source and image files; Ready is parent-reported hosting evidence, not proof of provider authentication or a production release.

## Incumbent system preserved

- Palette: mineral background, pine text and muted text, paper surfaces and teal actions continue through existing CSS variables. No new brand color scale is introduced. The white QR backing is functional contrast for the authenticator image.
- Type: inherited Avenir Next / Segoe UI family remains. Account headings use a 26–34px responsive size, weight 550 and 1.2 line height; explanatory text is 15px with 1.75 line height. Controls use 16px input text.
- Reading surface: a single opaque, finely bordered 16px-radius panel contains the task. The account column caps at 650px; its header offset uses existing site-header variables.
- Interaction: labeled progress, sentence-case instructions, visible focus, 44px minimum account buttons and 48px primary controls support the next action. A short 180ms panel entrance is disabled under reduced motion.
- Responsive form: at 600px and below, gutters narrow and the authenticator changes from a 200px QR/instructions grid to one column. Long setup keys wrap. No replacement identity, decorative raster or nested glass surface was added.

These are observed surface rules, not newly declared global tokens. `DESIGN.md` is preserved and no sidecar is generated during this bounded extension.

## Behavior represented in source

The confirmation page distinguishes invite and recovery links, waits for an explicit verification action, validates matching passwords, and renders the onboarding workspace after a successful password save. It preserves the session instead of ending it before the authenticator step. Missing or consumed links lead to sign-in/recovery guidance. The URL fragment is cleared after reading it, and effect initialization is guarded.

Authenticator setup explains the second security check, supports both QR scanning and a same-phone setup-key disclosure, accepts a six-digit code and offers sign-out to finish later. The saved-password receipt and three-step progress appear during onboarding. Account headings receive focus when the step/title changes; their scroll margin clears the fixed header.

The welcome copy derives from the active staff record: owner access or assigned permission areas. This is presentation only; it does not establish authorization by itself. Existing session, staff access, MFA and backend enforcement remain the relevant access mechanisms.

The sign-in form includes a password-reset email request and an account-neutral receipt. Code inspection establishes that the UI calls the provider method; it does not establish delivery, successful link redemption, or a changed password on a real account.

## Evidence limits

The preview is explicitly fictional. Its local client substitutes email verification, password saving, staff data and MFA. Its QR image is labeled non-scannable and its setup key is fake. The preview route is guarded by `VERCEL_ENV === "preview"`; this review has not tested a deployed production 404.

The preview client does not implement real sign-in or password-reset email delivery. Its success receipt proves only that the local fixture reached its completion state. The local check harness tests mock link retention, password confirmation, session continuity, MFA transition and role-copy behavior. This documenter inspected that harness but did not execute it.

No provider action, real email, account mutation, build, installation or production release was performed by this documentation pass. No shipping raster was added; the authenticator SVG is runtime provider content in production and a labeled local placeholder in the preview.

## Drift and review items not canonized

- Pre-existing documentation drift: `DESIGN.md` has no normative YAML token frontmatter and `.impeccable/design.json` is absent. The supplied scope explicitly preserves the incumbent document/sidecar state; no format migration is attempted.
- Incumbent system typography is retained under the ordinary-extension direction. This review does not promote system display typography into a new Impeccable world rule.
- The duplicate workspace/sign-in header offset found during the initial inspection was removed in the final source. Existing header-aware top padding remains. The account frame retains its own required offset. The final source also removes only the programmatically focused heading outline and adds an 18px gap after direct notices; interactive focus rules remain.
- The fixed fixture disclosure at the viewport bottom is test-only. The desktop and phone bottom captures show the complete authenticator action and sign-out link above it. The strip must not be mistaken for shipping interface content.
- The imported participation stylesheet was not materialized in the inspected worktree. This limits direct local inspection of shared button/input declarations and is not, by itself, evidence of a repository regression.

## Rendered review

Opened the following supplied final light-mode files in `.impeccable/review/account-setup-oct09/`: `email-desktop.png`, `password-desktop.png`, `authenticator-desktop.png`, `authenticator-desktop-bottom.png`, `email-mobile.png`, `password-mobile.png`, `password-mobile-bottom.png`, `authenticator-mobile-top.png`, and `authenticator-mobile.png`. Reopened the desktop email image after its settled-state replacement. The parent identifies these as 1440×1000 desktop and 390×844 phone viewport captures from the final preview. Older dark captures were excluded from final-style claims.

The baseline `before-desktop.png` visibly places the old setup content under the fixed header, leaving its Continue button exposed. Final account captures place the progress and task heading below the header. The paper panel, pine text, teal actions and restrained input/error surfaces remain consistent with the incumbent world.

The phone email capture includes its complete verification action. The password top/bottom pair shows readable mismatch feedback, both password fields, visibility control and reachable save action. The authenticator top/bottom pair shows the saved-password receipt, role description, incorrect-code feedback, stacked placeholder QR and manual key, six-digit input, complete verify action and sign-out link. These captures support readable responsive presentation and scroll access to the forms; they do not establish physical-device keyboard behavior, every viewport or screen-reader interaction.

The settled desktop email image includes the loaded verification action. The desktop authenticator bottom capture confirms that its complete verify action and sign-out link remain reachable above the fixture disclosure strip. Final captures show the added error spacing and no heading focus rectangle. No claim about final dark-mode appearance is made.

The parent reports that fixture code `000000` produced the error and `123456` completed the preview. The captured incorrect-code state corroborates its displayed error, but neither fixture result proves real MFA, staff authorization, email delivery or a completed owner account. Real password reset and production release remain pending at this report's completion.
