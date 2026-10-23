import assert from "node:assert/strict";
import { POST } from "../app/api/contributions/checkout/route";

// All requests stay in memory. No Stripe session, challenge or payment is made.
const originalFetch = globalThis.fetch, originalError = console.error;
const names = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY", "STRIPE_CUSTOMER_PORTAL_URL"];
const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
const logs: unknown[][] = [];
let calls: string[] = [], form: URLSearchParams | null = null;
const request = (extra: object = {}, origin = "https://isitusa.com") => new Request("https://isitusa.com/api/contributions/checkout", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ amount: "25", frequency: "monthly", token: "private-challenge", attempt: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", consent: true, ...extra }) });
function mock(account: object = { id: "acct_1ULqjk0sMVuUFG7H", charges_enabled: true }, status = 200, sessionStatus = 200) {
  calls = []; logs.length = 0; form = null;
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    if (url.includes("siteverify")) return Response.json({ success: true, action: "donation_checkout", hostname: "isitusa.com" });
    assert.equal(new Headers(init?.headers).get("Stripe-Version"), "2026-08-26.dahlia");
    if (url.endsWith("/account")) return Response.json(account, { status, headers: { "request-id": "req_account" } });
    assert.equal(url, "https://api.stripe.com/v1/checkout/sessions");
    form = init?.body as URLSearchParams;
    assert.equal(form.get("ui_mode"), "embedded_page", "Dahlia rejects the retired embedded enum");
    assert.equal(form.get("redirect_on_completion"), "never");
    return Response.json(sessionStatus === 200 ? { livemode: true, client_secret: "cs_live_mock_secret" } : { error: { type: "invalid_request_error", message: "private-provider-message" } }, { status: sessionStatus, headers: { "request-id": "req_session" } });
  };
}
async function main() { try {
  Object.assign(process.env, { STRIPE_SECRET_KEY: "rk_live_mock", NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_mock", TURNSTILE_SECRET_KEY: "private-server-secret", NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY: "mock", STRIPE_CUSTOMER_PORTAL_URL: "https://billing.stripe.com/p/login/mock" });
  console.error = (...args) => { logs.push(args); };
  mock(); assert.equal((await POST(request({}, "https://other.example"))).status, 403); assert.equal(calls.length, 0);
  mock(); assert.equal((await POST(request({ consent: false }))).status, 400); assert.equal(calls.length, 0);
  mock(); assert.equal((await POST(request({ amount: "1" }))).status, 400); assert.equal(calls.length, 0);
  mock({ id: "acct_wrong", charges_enabled: true }); assert.equal((await POST(request())).status, 502); assert.equal(calls.length, 2);
  mock({ id: "acct_1ULqjk0sMVuUFG7H", charges_enabled: false }); assert.equal((await POST(request())).status, 502); assert.equal(calls.length, 2);
  mock({ error: { type: "permission_error", message: "private-provider-message" } }, 403);
  const failed = await POST(request()); assert.equal(failed.status, 502);
  const failure = await failed.json(); assert.match(failure.error, /reference [a-f0-9-]{36}/);
  assert.match(JSON.stringify(logs), /recipient_check/); assert.match(JSON.stringify(logs), /permission_error/);
  assert.doesNotMatch(JSON.stringify(logs), /private-|rk_live|pk_live/);
  mock(undefined, 200, 400); assert.equal((await POST(request())).status, 502); assert.match(JSON.stringify(logs), /session_create/);
  mock(); assert.equal((await POST(request())).status, 200); assert.equal((form as unknown as URLSearchParams).get("mode"), "subscription"); assert.equal((form as unknown as URLSearchParams).get("line_items[0][price_data][unit_amount]"), "2500");
  mock(); assert.equal((await POST(request({ frequency: "once" }))).status, 200); assert.equal((form as unknown as URLSearchParams).get("mode"), "payment");
  console.log("Checkout regression checks passed: origin, consent, amount, recipient, activation, permissions, sanitized diagnostics, once and monthly.");
} finally {
  globalThis.fetch = originalFetch; console.error = originalError;
  for (const name of names) { if (originalEnv[name] === undefined) delete process.env[name]; else process.env[name] = originalEnv[name]; }
} }
main().catch(error => { console.error(error); process.exitCode = 1; });
