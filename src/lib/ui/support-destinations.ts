import { cryptoUri, type Wallet } from "@/lib/participation/contracts";

export type CardSupportReadiness = {
  enabled: boolean;
  contactEmail: string;
  contactVerifiedAt: string;
  paymentLinkVerifiedAt: string;
  recipientVerifiedAt: string;
  refundPolicy: string;
  refundPolicyApprovedAt: string;
  activationApprovedAt: string;
};

export function validatedStripePaymentLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (value !== url.href || url.protocol !== "https:" || url.hostname !== "buy.stripe.com" || url.port || url.username || url.password || !/^\/[a-zA-Z0-9]+$/.test(url.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}

/** These fields record human review, not proof supplied by Stripe or a URL. */
export function activeStripePaymentLink(destinations: {
  stripePaymentLink: string;
  cardSupport: CardSupportReadiness;
}): string | null {
  const readiness = destinations.cardSupport;
  const verifiedDates = [readiness.contactVerifiedAt, readiness.paymentLinkVerifiedAt,
    readiness.recipientVerifiedAt, readiness.refundPolicyApprovedAt, readiness.activationApprovedAt];
  if (!readiness.enabled || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(readiness.contactEmail)
    || !readiness.refundPolicy.trim()
    || verifiedDates.some(value => !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value)))) return null;
  return validatedStripePaymentLink(destinations.stripePaymentLink);
}

/** A valid format is only a guardrail; ownership and network must be verified before publication. */
export function verifiedPublicWallets(wallets: Wallet[]): Wallet[] {
  return wallets.filter(wallet => wallet.active && Number.isFinite(Date.parse(wallet.verified_at)) && Boolean(cryptoUri(wallet)));
}
