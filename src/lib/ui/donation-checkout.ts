export type DonationFrequency = "once" | "monthly";
export function donationAmount(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,4}(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents >= 500 && cents <= 100000 ? cents : null;
}
export function customerPortal(value: string | undefined): string | null {
  if (!value || !/^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9]+$/.test(value)) return null;
  return value;
}
export function checkoutParameters(amount: number, frequency: DonationFrequency) {
  const params = new URLSearchParams({
    mode: frequency === "monthly" ? "subscription" : "payment", ui_mode: "embedded",
    redirect_on_completion: "never", "payment_method_types[0]": "card",
    "line_items[0][quantity]": "1", "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": frequency === "monthly" ? "Monthly support for isitusa" : "Support for isitusa",
    "metadata[purpose]": "isitusa-contribution", "metadata[frequency]": frequency,
    "custom_text[submit][message]": "Contributions support isitusa's independent research and free tool. We do not claim tax-deductible status.",
  });
  if (frequency === "monthly") {
    params.set("line_items[0][price_data][recurring][interval]", "month");
    params.set("subscription_data[metadata][purpose]", "isitusa-contribution");
  } else params.set("submit_type", "donate");
  return params;
}
