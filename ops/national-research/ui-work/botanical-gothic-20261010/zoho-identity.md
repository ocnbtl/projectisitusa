# Zoho sender identity investigation — 2026-10-10

## Confirmed
- Zoho received the ISITUSA confirmation email. The displayed sender is updates@alerts.isitusa.com and the avatar is the initials IS.
- The signed-in Zoho identity is a different personal address. Changing its account photo would not establish the Resend sender's brand identity.
- Zoho separately blocks remote images in the message body until the recipient permits them. This is not a delivery failure and is not the sender-avatar mechanism.
- Read-only DNS checks found no DMARC or default BIMI TXT records on isitusa.com or alerts.isitusa.com at investigation time.

## Available implementation
The public /brand/v8/email-avatar.svg is a prepared square, solid-background SVG Tiny P/S candidate (9,243 bytes). It is not a certified BIMI deployment. The ordinary SVG and PNG brand downloads are available independently of certification.

## Remaining requirements for verified Zoho sender picture
Zoho's current documentation requires aligned SPF/DKIM, DMARC enforcement (quarantine or reject, pct=100), a compliant logo and a Verified Mark Certificate (VMC). The VMC route requires an eligible registered trademark and a paid certificate. Inbox rendering remains the receiver's decision.

Audit every legitimate sender for the root domain and alerts subdomain before enforcing DMARC; do not introduce enforcement blindly because it can reject legitimate mail. Then obtain the owner-approved trademark/certificate, publish the certificate and logo, add the BIMI record and verify a newly delivered message in Zoho.

No DNS authentication policy, paid service, personal avatar, or recipient image-display preference was changed for this investigation. The website logo and email-body artwork cannot force a mailbox avatar.

## Sources
- https://www.zoho.com/mail/help/adminconsole/bimi-configuration-zoho-mail.html
- https://www.zoho.com/mail/help/accessing-control-panel.html
- https://www.resend.com/legal/terms-of-service
