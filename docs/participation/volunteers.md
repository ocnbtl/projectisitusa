# Volunteer intake and onboarding

The public `/volunteer` page collects a name, email, interests, skills, motivation, estimated availability, optional schedule, and explicit permission to review and contact. It does not create an Auth account or mailing subscription. No attachments, sensitive identity fields, or public applicant profiles are collected. Analytics and replay exclude this route.

`participation-api/volunteer` validates bounded fields, checks Turnstile's volunteer action and production hostname, applies per-address and global rate limits, and records an idempotent submission. The existing first-party verifier holds the Turnstile secret when it is not present in Supabase. Only team managers with a valid AAL2 session can read applications; direct browser writes are denied.

## Review

Team workspace → Volunteer applications → select an application. Review the stated skills and availability, discuss a fit by email, choose a role, and save a private review note. Suggestions are deterministic matches to selected interests, not a hiring score or automatic decision. Saving an approval grants nothing and sends nothing. A separate explicit confirmation sends an invitation and grants the approved role.

| Starting role | Access |
| --- | --- |
| Sighting volunteer | Preliminary sighting review and profile feedback; no final decisions |
| Content volunteer | Profile feedback, own/assigned content proposals and email drafts; no audience list or sending |
| Events volunteer | Own/assigned event proposals |
| Outreach volunteer | Own/assigned outreach and partnership proposals |
| General volunteer | Team room and overview; discuss design, technology or other tasks before requesting more access |

All other staff presets remain available in Team access. Only the owner can grant elevated permissions. Volunteer approval never grants finance, audience, publication, final review, approval or team-management privileges. The owner cannot be changed through this flow. Public research admission remains separate.

## Invitations and recovery

A locked, version-checked claim prevents simultaneous invitations. The server obtains the account matching the reviewed email, then atomically grants the server-defined role and links the application. Existing staff records are never overwritten. After an interrupted request, refresh; a stale claim can be resumed after two minutes. An existing non-staff Auth account can be linked to the approved role without a duplicate email; the response tells the reviewer to direct the person to sign-in/password recovery. Unknown completion must be resolved by refreshing, not granting broader access.

Applicants set their own password and authenticator. Each workspace overview explains the tools available to that role and the next step. Existing Projects & proposals supports assignments and staff review; the team room supports introductions and work that does not need extra private data. Access changes and revocation remain in Team access and take effect through fresh database authorization.

## Operations

Review applications regularly. Notes remain private and are not automatically emailed. Respond personally when more information is needed or an application is declined. There is no promise of automated applicant-status email or a fixed response time. Handle withdrawal/removal requests through the published contact address. Do not retain unnecessary personal detail in review notes or the audit log.

Schema source: `supabase/schema/14-volunteers.sql`. Release sequence: apply the additive migration, deploy the backward-compatible participation function, publish the website verifier and UI, verify production intake/review/access checks. No real invitation is sent during automated verification.
