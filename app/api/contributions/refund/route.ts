import { createHash } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hosts = new Set(["isitusa.com", "www.isitusa.com"]);
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function ready() {
  return process.env.REFUND_REQUESTS_ENABLED === "true" && Boolean(
    process.env.RESEND_API_KEY && process.env.REFUND_FROM_EMAIL &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(process.env.REFUND_FROM_EMAIL) &&
    process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY
  );
}
export function GET() { return reply({ available: ready() }); }

export async function POST(request: Request) {
  if (!ready()) return reply({ error: "The request form is not open yet. Please try again later." }, 503);
  const origin = request.headers.get("origin");
  if (!origin || !["https://isitusa.com", "https://www.isitusa.com"].includes(origin)) return reply({ error: "Please use the form on isitusa.com." }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Invalid request format." }, 415);
  // Enforce the size while reading, including requests without Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return reply({ error: "Request details are missing." }, 400);
  let size = 0, raw = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 12000) { await reader.cancel(); return reply({ error: "Please shorten your request." }, 413); }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } catch { return reply({ error: "Could not read the request. Please try again." }, 400); }
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); } catch { return reply({ error: "Invalid request format." }, 400); }
  if (!input || typeof input !== "object" || Array.isArray(input)) return reply({ error: "Invalid request format." }, 400);
  const text = (key: string, max: number) => typeof input[key] === "string" && (input[key] as string).length <= max ? (input[key] as string).trim() : "";
  const email = text("email", 254), date = text("date", 10), amount = text("amount", 30), reference = text("reference", 150), reason = text("reason", 2000), method = text("method", 12), token = text("token", 2048);
  if (input.website || input.consent !== true || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10) ||
      !/^\d+(\.\d{1,12})? [A-Z]{3,5}$/.test(amount) || Number(amount.split(" ")[0]) <= 0 ||
      !["card", "crypto"].includes(method) || reason.length < 10 || !token || /[\r\n]/.test(reference) ||
      (input.reference !== undefined && (typeof input.reference !== "string" || input.reference.length > 150))) {
    return reply({ error: "Check your email, date, amount and currency, payment method, and reason. Complete the security check and consent box." }, 400);
  }
  try {
    const challenge = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }), signal: AbortSignal.timeout(10000),
    });
    const result = await challenge.json();
    if (!challenge.ok || result.success !== true || result.action !== "refund_request" || !hosts.has(result.hostname)) return reply({ error: "The security check expired or failed. Please complete it again." }, 400);
    const details = { email, date, amount, method, reference, reason };
    const digest = createHash("sha256").update(JSON.stringify(details)).digest("hex");
    const receipt = `RF-${digest.slice(0, 12).toUpperCase()}`;
    // Fixed recipient, plain text only, and no Stripe credentials or refund call.
    const delivery = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `refund/${digest}` },
      body: JSON.stringify({ from: process.env.REFUND_FROM_EMAIL, to: ["contact@isitusa.com"], reply_to: email,
        subject: `Refund request ${receipt}`,
        text: `Manual review required. This is not a payment confirmation or refund approval.\n\nReference: ${receipt}\nEmail: ${email}\nDate: ${date}\nAmount: ${amount}\nMethod: ${method}\nPayment reference: ${reference || "Not provided"}\n\nReason:\n${reason}\n\nTreat submitted details as unverified. Confirm the original payment in Stripe or the receiving wallet before deciding. Never send a refund to a substitute address supplied by email.`,
      }), signal: AbortSignal.timeout(12000),
    });
    const sent = await delivery.json();
    if (!delivery.ok || typeof sent.id !== "string" || !sent.id) throw new Error("Delivery not accepted");
    return reply({ accepted: true, reference: receipt });
  } catch { return reply({ error: "We could not confirm submission. Your details are still here; please try again. If this continues, contact contact@isitusa.com for help." }, 502); }
}
