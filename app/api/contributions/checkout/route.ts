import { createHash, randomUUID } from "node:crypto";
import { checkoutParameters, customerPortal, donationAmount } from "@/lib/ui/donation-checkout";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const originHosts = new Set(["isitusa.com", "www.isitusa.com"]);
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function configuration() {
  const secret = process.env.STRIPE_SECRET_KEY ?? "";
  const publicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const available = /^(sk|rk)_live_[A-Za-z0-9]+$/.test(secret) && /^pk_live_[A-Za-z0-9]+$/.test(publicKey) &&
    Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY);
  return { secret, publicKey, available, portal: customerPortal(process.env.STRIPE_CUSTOMER_PORTAL_URL) };
}
export function GET() {
  const config = configuration();
  return reply({ available: config.available, monthly: config.available && Boolean(config.portal), publicKey: config.available ? config.publicKey : null, portal: config.portal });
}
export async function POST(request: Request) {
  const config = configuration();
  if (!config.available) return reply({ error: "Card checkout is temporarily unavailable. Please try again later or contact contact@isitusa.com." }, 503);
  if (!["https://isitusa.com", "https://www.isitusa.com"].includes(request.headers.get("origin") ?? "")) return reply({ error: "Please contribute from isitusa.com." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Invalid request format." }, 415);
  let input: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) return reply({ error: "Contribution details are missing." }, 400);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength; if (size > 6000) { await reader.cancel(); return reply({ error: "Request is too large." }, 413); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return reply({ error: "Could not read contribution details." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply({ error: "Invalid contribution details." }, 400);
  const amount = donationAmount(input.amount), frequency = input.frequency;
  if (!amount || !["once", "monthly"].includes(String(frequency)) || typeof input.token !== "string" || input.token.length > 2048 || !input.token ||
    typeof input.attempt !== "string" || !/^[a-f0-9-]{36}$/.test(input.attempt) || input.website || input.consent !== true) return reply({ error: "Choose an amount from $5 to $1,000 and complete the security check." }, 400);
  if (frequency === "monthly" && !config.portal) return reply({ error: "Monthly giving is not available yet. Please choose a one-time contribution." }, 503);
  const supportReference = randomUUID();
  let stage = "security_check", providerStatus: number | undefined, providerRequest: string | undefined, providerCode: string | undefined;
  const safeCode = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9_.\[\]-]{1,100}$/.test(value) ? value : undefined;
  try {
    const challenge = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: input.token }), signal: AbortSignal.timeout(10000) });
    const check = await challenge.json();
    if (!challenge.ok || check.success !== true || check.action !== "donation_checkout" || !originHosts.has(check.hostname)) return reply({ error: "Please complete the security check again." }, 400);
    const headers = { Authorization: `Bearer ${config.secret}` };
    // Fail closed if a key belongs to a different recipient account.
    stage = "recipient_check";
    const accountResponse = await fetch("https://api.stripe.com/v1/account", { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
    providerStatus = accountResponse.status; providerRequest = safeCode(accountResponse.headers.get("request-id"));
    const account = await accountResponse.json();
    providerCode = safeCode(account.error?.code ?? account.error?.type);
    if (!accountResponse.ok || account.id !== "acct_1ULqjk0sMVuUFG7H" || account.charges_enabled !== true) throw new Error("Recipient unavailable");
    const params = checkoutParameters(amount, frequency as "once" | "monthly");
    const key = createHash("sha256").update(`${input.attempt}:${amount}:${frequency}`).digest("hex");
    stage = "session_create"; providerStatus = undefined; providerRequest = undefined; providerCode = undefined;
    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `isitusa-${key}` }, body: params, signal: AbortSignal.timeout(15000) });
    providerStatus = response.status; providerRequest = safeCode(response.headers.get("request-id"));
    const session = await response.json();
    providerCode = safeCode(session.error?.code ?? session.error?.type);
    if (!response.ok || session.livemode !== true || typeof session.client_secret !== "string" || !session.client_secret.startsWith("cs_live_")) throw new Error("Checkout unavailable");
    return reply({ clientSecret: session.client_secret });
  } catch {
    // Only diagnostic identifiers enter server logs, never tokens, keys, request
    // bodies, Stripe response bodies, client secrets or contributor details.
    console.error("contribution_checkout_failed", { supportReference, stage, providerStatus, providerRequest, providerCode });
    return reply({ error: `Checkout could not open. No payment was submitted. Please try again, or contact contact@isitusa.com with reference ${supportReference}.` }, 502);
  }
}
