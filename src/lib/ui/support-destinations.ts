import { cryptoUri, type Wallet } from "@/lib/participation/contracts";

export function validatedStripePaymentLink(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "buy.stripe.com" || url.port || url.username || url.password || !/^\/(?:test_)?[a-zA-Z0-9]+$/.test(url.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
/** A valid format is only a guardrail; ownership and network must be verified before publication. */
export function verifiedPublicWallets(wallets: Wallet[]): Wallet[] {
  return wallets.filter(wallet => wallet.active && Number.isFinite(Date.parse(wallet.verified_at)) && Boolean(cryptoUri(wallet)));
}
