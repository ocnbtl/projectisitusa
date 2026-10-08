import type { Metadata } from "next";
import styles from "@/components/participation/participation.module.css";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";

export const metadata: Metadata = { title: "Privacy | isitusa" };
export default function Page() {
  const { contactEmail, contactVerifiedAt } = SUPPORT_DESTINATIONS.cardSupport;
  return <main id="main-content" className={styles.page}>
    <header className={styles.intro}><h1>Your information, handled with care.</h1><p>We use information to operate isitusa, improve the atlas and respond when you choose to get involved. Here is what that means for you.</p></header>
    <div className={styles.prose}>
      <h2>Using the website</h2>
      <p>You can explore the atlas without an account. Optional analytics helps us understand how people use the website. It stays off unless you allow it, and you can change your choice through Privacy choices on the map or in the footer. We respect browser Do Not Track and Global Privacy Control signals.</p>
      <details><summary className="text-link">More about analytics</summary><p>PostHog receives page views and selected interactions. Random browser and visit identifiers are stored locally to help estimate usage; they are not linked to your email, account or contribution. We exclude search text, form contents, photographs, precise coordinates, payment details and private workspace activity. Query strings and URL fragments are excluded, and species page addresses are grouped.</p><p>Session recording and automatic form capture are disabled. IP-based location enrichment is disabled, although the provider receives the network connection needed to deliver an event. Turning analytics off stops future events and removes the local identifiers; it does not erase events already received. See <a className="text-link" href="https://posthog.com/privacy" target="_blank" rel="noreferrer">PostHog&apos;s privacy policy</a>.</p></details>
      <h2>Contributing and contacting us</h2>
      <p>Stripe handles card contributions and recurring payments. We do not receive or store your card number. Authorized project staff can access the payment and contact information needed to support contributions. Giving does not subscribe you to emails, and we do not sell the personal information collected through contributions.</p>
      <p>If you request a refund, we use the contact and contribution details you provide to review your request and reply. Correspondence is retained as needed for that process, disputes and applicable recordkeeping. Cryptocurrency transfers may be publicly visible on their networks.</p>
      <h2>Community and team services</h2>
      <p>Email updates and direct sighting reports are being prepared. Their forms will explain what you are sharing and your choices before they open. The private team workspace uses invitation-only access, an authenticator and permissions appropriate to each role.</p>
      <h2>The services behind isitusa</h2>
      <p>Vercel and Cloudflare help deliver and protect the website. Stripe processes contributions, PostHog supports optional analytics, Resend delivers support messages, and Supabase supports the private workspace. These services receive the information needed for their role. Additional mailing and reporting services are not yet open.</p>
      <p>Read the privacy information from <a className="text-link" href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe</a>, <a className="text-link" href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">Resend</a>, <a className="text-link" href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase</a>, <a className="text-link" href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Vercel</a> and <a className="text-link" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a>.</p>
      <h2>Your choices and questions</h2>
      {contactVerifiedAt ? <p>Contact <a className="text-link" href={`mailto:${contactEmail}`}>{contactEmail}</a> to ask about information we hold or request access, correction or removal. Some financial and security records may need to be retained separately.</p> : <p>A verified contact route will be provided before additional services open.</p>}
      <p className={styles.hint}>isitusa is an independent initiative based in the United States. Updated October 8, 2026.</p>
    </div>
  </main>;
}
