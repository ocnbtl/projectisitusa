export const R2_FREE_TIER_STORAGE_BYTES = 10_000_000_000;
export const R2_FREE_TIER_CLASS_A_REQUESTS = 1_000_000;
export const R2_FREE_TIER_CLASS_B_REQUESTS = 10_000_000;

// Project limits intentionally reserve 20 percent of every published R2 free-tier allowance.
export const R2_STORAGE_SAFETY_BYTES = 8_000_000_000;
export const R2_CLASS_A_SAFETY_REQUESTS = 800_000;
export const R2_CLASS_B_SAFETY_REQUESTS = 8_000_000;

export interface R2FreeTierProjection {
  projectedStorageBytes: number;
  currentClassARequests: number;
  currentClassBRequests: number;
  newClassARequests: number;
  newClassBRequests: number;
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export function assertR2FreeTierSafety(input: R2FreeTierProjection): void {
  assertNonNegativeSafeInteger(input.projectedStorageBytes, "Projected R2 storage bytes");
  assertNonNegativeSafeInteger(input.currentClassARequests, "Current R2 Class A requests");
  assertNonNegativeSafeInteger(input.currentClassBRequests, "Current R2 Class B requests");
  assertNonNegativeSafeInteger(input.newClassARequests, "New R2 Class A requests");
  assertNonNegativeSafeInteger(input.newClassBRequests, "New R2 Class B requests");

  if (input.projectedStorageBytes > R2_STORAGE_SAFETY_BYTES) {
    throw new Error(
      `Projected R2 storage ${input.projectedStorageBytes.toLocaleString()} exceeds the 8 GB project safety budget.`,
    );
  }
  if (input.currentClassARequests + input.newClassARequests > R2_CLASS_A_SAFETY_REQUESTS) {
    throw new Error("Projected monthly R2 Class A requests exceed the 800,000 request project safety budget.");
  }
  if (input.currentClassBRequests + input.newClassBRequests > R2_CLASS_B_SAFETY_REQUESTS) {
    throw new Error("Projected monthly R2 Class B requests exceed the 8,000,000 request project safety budget.");
  }
}
