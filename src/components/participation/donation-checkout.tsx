"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import { ArrowRight } from "lucide-react";
import { Challenge, Honeypot } from "./shared";
import { donationAmount, type DonationFrequency } from "@/lib/ui/donation-checkout";
import s from "./support.module.css";
type Embedded = { mount: (element: HTMLElement) => void; destroy: () => void };
declare global { interface Window { Stripe?: (key: string) => { initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<Embedded> } } }
type Config = { available: boolean; monthly: boolean; publicKey: string | null; portal: string | null };
export function useDonationConfig() {
  const [config, setConfig] = useState<Config | null>(null), [checked, setChecked] = useState(false);
  useEffect(() => {
    let active = true; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    fetch("/api/contributions/checkout", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); const value = await response.json(); if (active) setConfig(value); }).catch(() => {}).finally(() => { clearTimeout(timer); if (active) setChecked(true); });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, []);
  return { config, checked };
}
export function DonationCheckout({ frequency = "once", config, checked, onCheckoutActiveChange }: { frequency?: DonationFrequency; config: Config | null; checked: boolean; onCheckoutActiveChange: (active: boolean) => void }) {
  const [amount, setAmount] = useState("25");
  const [custom, setCustom] = useState(false), [confirming, setConfirming] = useState(false), [token, setToken] = useState("");
  const [reset, setReset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false), [clientSecret, setClientSecret] = useState("");
  const mount = useRef<HTMLDivElement>(null), embedded = useRef<Embedded | null>(null), lock = useRef(false), attempt = useRef("");
  const customId = useId(), customInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onCheckoutActiveChange(Boolean(confirming || clientSecret));
    return () => onCheckoutActiveChange(false);
  }, [confirming, clientSecret, onCheckoutActiveChange]);
  useEffect(() => {
    if (custom) customInput.current?.focus({ preventScroll: true });
  }, [custom]);
  useEffect(() => {
    if (!clientSecret || !scriptReady || !config?.publicKey || !mount.current || !window.Stripe) return;
    let active = true;
    window.Stripe(config.publicKey).initEmbeddedCheckout({ clientSecret }).then(checkout => {
      if (!active || !mount.current) { checkout.destroy(); return; }
      embedded.current = checkout; checkout.mount(mount.current); track("checkout_opened", {surface:"support", frequency});
    }).catch(() => { if (active) { setError("The secure form could not load. Check your connection and try again."); setClientSecret(""); } });
    return () => { active = false; embedded.current?.destroy(); embedded.current = null; };
  }, [clientSecret, scriptReady, config?.publicKey, frequency]);
  function change() { setConfirming(false); setError(""); setToken(""); setClientSecret(""); attempt.current = ""; }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || !token || !donationAmount(amount)) return;
    track("checkout_started", {surface:"support", frequency}); lock.current = true; setBusy(true); setError("");
    if (!attempt.current) attempt.current = crypto.randomUUID();
    try {
      const fields = new FormData(event.currentTarget);
      const response = await fetch("/api/contributions/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, frequency, token, attempt: attempt.current, consent: fields.get("consent") === "on", website: fields.get("website") ?? "" }), signal: AbortSignal.timeout(40000) });
      const result = await response.json();
      if (!response.ok || typeof result.clientSecret !== "string") throw new Error(result.error || "Checkout could not open. Please try again.");
      setClientSecret(result.clientSecret);
    } catch (failure) { track("checkout_failed", {surface:"support", frequency}); setError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Checkout took too long. Please try again."); }
    finally { lock.current = false; setBusy(false); setToken(""); setReset(value => value + 1); }
  }
  return <>
    {config?.available && <Script src="https://js.stripe.com/v3/" onReady={() => setScriptReady(true)} onError={() => setError("Stripe could not load. Please check your connection and reload this page.")} />}
    {clientSecret ? <><div className={s.checkoutHeader}><strong>{frequency === "monthly" ? "Monthly contribution" : "One-time contribution"}</strong><button type="button" onClick={change}>Change amount</button></div><div ref={mount} className={s.checkoutForm} /></> : <>
      {config?.available && (frequency === "once" || config.monthly) ? <>
        <p className={s.amountLabel}>Choose an amount in USD</p><div className={s.amounts} role="group" aria-label={frequency === "monthly" ? "Monthly contribution amount" : "One-time contribution amount"}>{["5", "10", "25", "50"].map(value => <button type="button" key={value} disabled={busy} aria-pressed={!custom && amount === value} onClick={() => { change(); setCustom(false); setAmount(value); }}>${value}</button>)}<button type="button" disabled={busy} aria-pressed={custom} aria-expanded={custom} aria-controls={customId} onClick={() => { change(); setCustom(true); }}>Other</button></div>
        <div id={customId} className={s.customDisclosure} data-open={custom} aria-hidden={!custom}>
          <div className={s.customDisclosureInner}>
            <label className={s.customAmount}><span>USD</span><input ref={customInput} aria-label={frequency === "monthly" ? "Custom monthly amount in US dollars" : "Custom one-time amount in US dollars"} aria-describedby={`${customId}-help`} inputMode="decimal" maxLength={7} value={amount} disabled={!custom || busy} onChange={e => { change(); setAmount(e.target.value); }} /></label>
            <p id={`${customId}-help`} className={s.customHelp}>Enter $5 to $1,000.</p>
          </div>
        </div>
        <p className={s.small}>{frequency === "monthly" ? `$${amount || "0"} each month until canceled.` : "One contribution, with no recurring charge."}</p>
        {!confirming ? <button type="button" className={`${s.primary} ${s.checkoutAction}`} disabled={!donationAmount(amount)} onClick={() => setConfirming(true)}>{frequency === "monthly" ? "Give" : "Continue with"} ${amount}{frequency === "monthly" ? " monthly" : ""}<ArrowRight size={17} aria-hidden="true" /></button> : <form className={s.checkoutForm} onSubmit={submit}><label className={s.small}><input name="consent" type="checkbox" required disabled={busy} /> I agree to the <a href="/terms">contribution terms</a>{frequency === "monthly" ? ` and a recurring charge of $${amount} each month until I cancel` : ""}.</label><Honeypot /><Challenge action="donation_checkout" onToken={setToken} reset={reset} /><button className={s.primary} type="submit" disabled={!token || busy || !scriptReady}>{busy ? "Opening secure checkout..." : "Open secure checkout"}</button></form>}
      </> : <p className={s.small} role="status">{checked ? frequency === "monthly" ? "Monthly contributions are not available right now. Please check back soon." : "Card checkout is temporarily unavailable. Please try again later or contribute cryptocurrency below." : "Checking secure checkout..."}</p>}
    </>}
    {error && <p className={s.error} role="alert">{error}</p>}

  </>;
}
