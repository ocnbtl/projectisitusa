import type { Wallet } from "@/lib/participation/contracts";
import type { CardSupportReadiness } from "@/lib/ui/support-destinations";

/** Public values only. Verification receipts belong in ops, never secrets here.
 * A configured link alone must not open checkout. MAIN enables it after review.
 */
export const SUPPORT_DESTINATIONS: {
  stripePaymentLink: string;
  cardSupport: CardSupportReadiness;
  wallets: Wallet[];
} = {
  stripePaymentLink: "https://buy.stripe.com/3cI8wHgLv2520Cc1va43S00",
  cardSupport: {
    enabled: false,
    contactEmail: "contact@isitusa.com",
    contactVerifiedAt: "2026-10-02T00:00:00Z",
    paymentLinkVerifiedAt: "2026-10-01T21:08:34.981639+00:00",
    recipientVerifiedAt: "2026-10-01T21:08:34.981639+00:00",
    refundPolicy: "",
    refundPolicyApprovedAt: "",
    activationApprovedAt: "",
  },
  wallets: [{
    id: "ledger-xmr-mainnet",
    asset: "XMR",
    network: "Monero mainnet",
    address: "42VW9od5h4vj1vsR2oNndT65DiuxUm6wiMb144a288a2KnUpMdaCgYqMMFgdhU418rDq3xpaXJEttWJKbspn7JabK6ssj2Y",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }],
};
