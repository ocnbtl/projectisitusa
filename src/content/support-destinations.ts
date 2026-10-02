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
    refundPolicy: "Refunds require a request through our refund form and an individual review. Submitting a request does not automatically approve or issue a refund. We review the payment details and reason for each request and reply by email. Any approved card refund is returned through the original payment method. This policy does not limit rights required by applicable law.",
    refundPolicyApprovedAt: "2026-10-02T00:00:00Z",
    activationApprovedAt: "",
  },
  wallets: [{
    id: "ledger-btc-mainnet",
    asset: "BTC",
    network: "Bitcoin mainnet",
    address: "bc1q5zy8p32yuufe07wq0k25nuev86faj6zcyeyrk9",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }, {
    id: "ledger-eth-mainnet",
    asset: "ETH",
    network: "Ethereum mainnet",
    address: "0x5787c0a1A1b1F7749ca6C67511aCc8187C45820b",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }, {
    id: "ledger-sol-mainnet",
    asset: "SOL",
    network: "Solana mainnet",
    address: "JBCXndw72ZGJj3DGmDCAC6yBCWT4Qe5pLwJPX4Bw3fSk",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }, {
    id: "ledger-xrp-mainnet",
    asset: "XRP",
    network: "XRP Ledger mainnet",
    address: "r41L9u6TZPs47pxSScZUG8p5MCoNvaPPnL",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }, {
    id: "ledger-xmr-mainnet",
    asset: "XMR",
    network: "Monero mainnet",
    address: "42VW9od5h4vj1vsR2oNndT65DiuxUm6wiMb144a288a2KnUpMdaCgYqMMFgdhU418rDq3xpaXJEttWJKbspn7JabK6ssj2Y",
    verified_at: "2026-10-02T00:00:00Z",
    active: true,
  }],
};
