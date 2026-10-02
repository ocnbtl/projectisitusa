import type { Metadata } from "next";
import styles from "@/components/participation/participation.module.css";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { activeStripePaymentLink } from "@/lib/ui/support-destinations";

export const metadata: Metadata = { title: "Supporting isitusa | isitusa" };
export default function Page() {
  const active = Boolean(activeStripePaymentLink(SUPPORT_DESTINATIONS));
  const { contactEmail, contactVerifiedAt, refundPolicy } = SUPPORT_DESTINATIONS.cardSupport;
  return <main id="main-content" className={styles.page}>
    <header className={styles.intro}><h1>Supporting isitusa.</h1><p>Clear expectations before you contribute.</p></header>
    <div className={styles.prose}>
      <h2>Who receives your support</h2>
      <p>isitusa is an independent initiative based in the United States. Contributions support research review, maintenance, and improvements to the public website. isitusa is not currently a registered nonprofit. We do not claim that contributions are tax deductible.</p>
      <h2>Card payments</h2>
      <p>{active ? "One-time contributions are available through Stripe's hosted payment page." : "Card contributions are not open yet. We are preparing a one-time contribution option through Stripe's hosted payment page."} Choose your amount and review the final currency, total, and payment details on Stripe before paying. Support does not purchase a particular research outcome or change a species determination.</p>
      <p>A return to this website is not a payment confirmation. Check the status shown by Stripe; some payment methods can take longer to complete. This website does not confirm payment from a return URL.</p>
      <h2>Questions and refunds</h2>
      {contactVerifiedAt ? <p>For contribution questions or refund requests, email <a className="text-link" href={`mailto:${contactEmail}`}>{contactEmail}</a>. Include the date, amount, and payment reference if available. Do not send card numbers, passwords, or recovery words.</p> : <p>A support contact will be published before contributions open.</p>}
      {active ? <p>{refundPolicy}</p> : <p>Card contributions remain closed while we finalize the refund policy. It will be published before checkout opens.</p>}
      <h2>Crypto</h2>
      <p>Only use a receiving address published here with its exact asset and network. Transfers cannot be reversed by isitusa. We do not manage your wallet, hold your recovery phrase, or ask for private keys. Monero receipts require private verification; a public transaction identifier alone does not establish receipt.</p>
      <h2>Email is your choice</h2>
      <p>Contributing does not subscribe you to updates or advocacy messages. Email signups have their own availability and consent process.</p>
    </div>
  </main>;
}
