import type { Wallet } from "@/lib/participation/contracts";

/** Public destinations only. MAIN publishes these after owner verification.
 * Never add secrets, recovery phrases, or unverified receiving addresses.
 */
export const SUPPORT_DESTINATIONS: { stripePaymentLink: string; wallets: Wallet[] } = {
  stripePaymentLink: "",
  wallets: [],
};
