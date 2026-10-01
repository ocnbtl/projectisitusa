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
    contactVerifiedAt: "",
    paymentLinkVerifiedAt: "2026-10-01T21:08:34.981639+00:00",
    recipientVerifiedAt: "2026-10-01T21:08:34.981639+00:00",
    refundPolicy: "",
    refundPolicyApprovedAt: "",
    activationApprovedAt: "",
  },
  wallets: [],
};
