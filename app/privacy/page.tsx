import type { Metadata } from "next";
import styles from "@/components/participation/participation.module.css";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { activeStripePaymentLink } from "@/lib/ui/support-destinations";

export const metadata: Metadata = { title: "Privacy | isitusa" };
export default function Page() {
  const active = Boolean(activeStripePaymentLink(SUPPORT_DESTINATIONS));
  const { contactEmail, contactVerifiedAt } = SUPPORT_DESTINATIONS.cardSupport;
  return <main id="main-content" className={styles.page}>
    <header className={styles.intro}><h1>A little information. A clear purpose.</h1><p>isitusa is an independent initiative based in the United States. This notice describes contributions and the participation services being prepared for launch.</p></header>
    <div className={styles.prose}>
      <h2>Contributions</h2>
      <p>{active ? "Card contributions use Stripe checkout, embedded on this website where available or on Stripe's payment page." : "Card contributions are not open yet. The planned checkout uses Stripe's hosted payment page."} Stripe processes the information you enter at checkout. Authorized project account users can access payment references, amounts, currencies, payment status, and contact details supplied at checkout in Stripe. The public isitusa website does not collect or store your card number, or automatically copy these hosted payment records into its own database.</p>
      <p>Read <a className="text-link" href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe&apos;s privacy policy</a> for how Stripe handles payment information. Public blockchain transfers may be visible to others; Monero payments require separate verification.</p>
      <h2>Refund requests</h2>
      <p>The refund request form collects your email, contribution date, amount and currency, payment method, optional payment reference, and reason for the request. We use these details to review the request and reply. Resend delivers requests to our support inbox; Cloudflare Turnstile checks submissions for automated abuse. The form does not issue refunds or subscribe you to updates. Access is limited to those handling contribution support. Request correspondence is kept while needed for review, payment disputes, and applicable recordkeeping; contact us to request access or removal.</p>
      <h2>Email updates and observations</h2>
      <p>Email signup and sighting submission services are being prepared separately. Before they open, this notice will describe the information collected, who can access it, retention, and how to change preferences or request removal. Opening card contributions does not open these other services.</p>
      <h2>Service providers</h2>
      <p>Stripe handles checkout and recurring contributions. Cloudflare Turnstile verifies checkout requests. Our server sends the selected amount and frequency to Stripe to open checkout; card details go directly to Stripe. Resend delivers refund requests to our support inbox, and Cloudflare Turnstile helps prevent automated abuse. Supabase is planned for the separate participation services. The hosted Payment Link does not require an isitusa account or enrollment in those services.</p>
      <h2>Your choices</h2>
      <p>Giving support does not sign you up for a mailing list. We do not sell personal information collected through contributions.</p>
      {contactVerifiedAt ? <p>For questions about contribution information or requests to access or remove it, email <a className="text-link" href={`mailto:${contactEmail}`}>{contactEmail}</a>. Financial records may need to be retained separately from mailing preferences.</p> : <p>We will confirm a working contact route before opening contributions. The planned address is {contactEmail}; it is not confirmed to receive messages yet.</p>}
      <p className={styles.hint}>Updated October 8, 2026. Each participation service will open only after its setup and verification are complete.</p>
    </div>
  </main>;
}
