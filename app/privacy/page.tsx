import { IllustratedIntro } from "@/components/editorial-art";
import { PrivacyChoicesButton } from "@/components/site-analytics";
import type { Metadata } from "next";
import styles from "@/components/participation/participation.module.css";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";

export const metadata: Metadata = {
  title: "Privacy | ISITUSA",
  alternates: { canonical: "https://isitusa.com/privacy" },
};
export default function Page() {
  const { contactEmail, contactVerifiedAt } = SUPPORT_DESTINATIONS.cardSupport;
  return <main id="main-content" className={styles.page}>
    <IllustratedIntro subject="custody"><header className={styles.intro}><h1>Your information, handled with care.</h1><p>We use information to operate ISITUSA, improve the atlas and respond when you choose to get involved. Here is what that means for you.</p></header></IllustratedIntro>
    <div className={styles.prose}>
      <h2>Analytics</h2>
      <p>You can explore the atlas without an account. We count visits and a few actions to understand how people use it.</p>
      <p>Google Analytics starts on for U.S. visits. Elsewhere, it starts off. We respect Do Not Track and Global Privacy Control.</p>
      <p><PrivacyChoicesButton className="text-link" /></p>
      <details>
        <summary className="text-link">What we collect</summary>
        <p>Google Analytics uses cookies to count visits, see where readers found us, and measure actions such as opening a source. PostHog site analytics is optional and uses random browser and visit IDs.</p>
        <p>We keep search terms, form details, precise locations, and private workspace activity out of analytics. Masked session replay is optional and covers public information pages only. It masks text and inputs, skips forms, and is kept for 30 days.</p>
        <p>You can change your choices anytime. Turning analytics off stops future collection. Read the privacy policies for <a className="text-link" href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google</a> and <a className="text-link" href="https://posthog.com/privacy" target="_blank" rel="noreferrer">PostHog</a>.</p>
      </details>
      <h2>Contributing and contacting us</h2>
      <p>Stripe handles card contributions and recurring payments. We do not receive or store your card number. Authorized project staff can access the payment and contact information needed to support contributions. Giving does not subscribe you to emails, and we do not sell the personal information collected through contributions.</p>
      <p>If you request a refund, we use the contact and contribution details you provide to review your request and reply. Correspondence is retained as needed for that process, disputes and applicable recordkeeping. Cryptocurrency transfers may be publicly visible on their networks.</p>
      <h2>Community and team services</h2><p>Profile corrections are stored in our private review queue with the species, selected topics, suggested change and any source link you provide. They are visible only to authorized reviewers and are not published automatically. Please leave personal information out of suggestions. Cloudflare Turnstile helps protect the form against spam.</p>
      <p>Sighting reports are stored privately for identification and review. A separately approved public record includes only the identified species, county, date, and a reviewed summary. Precise location, contact information, original notes, and photographs are not automatically published. If you opt into referrals, our team may share your report and follow-up email with the appropriate agency or reporting program. Reports do not subscribe you to emails. The private team workspace uses invitation-only access, an authenticator and permissions appropriate to each role.</p>
      <p>Volunteer applications include the name, email, interests, skills, and availability you choose to share. Only authorized team managers can review them. We use these details to discuss a role, keep review notes, and arrange access if you join. Applications do not subscribe you to updates or create a public profile. Cloudflare Turnstile protects the form against spam. Contact us to withdraw an application or request removal; essential access and security records may be retained separately.</p>
      <h2>The services behind ISITUSA</h2>
      <p>Vercel and Cloudflare help deliver and protect the website. Stripe processes contributions, PostHog and Google support optional analytics, Resend delivers support messages, and Supabase supports the private workspace. These services receive the information needed for their role. Sighting originals are held in private Supabase storage for review and follow-up; contact us to request withdrawal or removal. Audit and research records may need to be retained separately.</p>
      <p>Read the privacy information from <a className="text-link" href="https://stripe.com/privacy" target="_blank" rel="noreferrer">Stripe</a>, <a className="text-link" href="https://resend.com/legal/privacy-policy" target="_blank" rel="noreferrer">Resend</a>, <a className="text-link" href="https://supabase.com/privacy" target="_blank" rel="noreferrer">Supabase</a>, <a className="text-link" href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Vercel</a> and <a className="text-link" href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a>.</p>
      <h2>Your choices and questions</h2>
      {contactVerifiedAt ? <p>Contact <a className="text-link" href={`mailto:${contactEmail}`}>{contactEmail}</a> to ask about information we hold or request access, correction or removal. Some financial and security records may need to be retained separately.</p> : <p>A verified contact route will be provided before additional services open.</p>}
      <p className={styles.hint}>ISITUSA is an independent initiative based in the United States. Updated November 10, 2026.</p>
    </div>
  </main>;
}
