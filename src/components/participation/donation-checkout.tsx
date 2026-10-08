"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Challenge, Honeypot } from "./shared";
import { donationAmount, type DonationFrequency } from "@/lib/ui/donation-checkout";
import s from "./support.module.css";
type Embedded = { mount: (element: HTMLElement) => void; destroy: () => void };
declare global { interface Window { Stripe?: (key: string) => { initEmbeddedCheckout: (options: { clientSecret: string }) => Promise<Embedded> } } }
type Config = { available: boolean; monthly: boolean; publicKey: string | null; portal: string | null };
export function DonationCheckout({ hostedLink }: { hostedLink: string | null }) {
  const [config, setConfig] = useState<Config | null>(null), [checked, setChecked] = useState(false);
  const [frequency, setFrequency] = useState<DonationFrequency>("once"), [amount, setAmount] = useState("25");
  const [custom, setCustom] = useState(false), [confirming, setConfirming] = useState(false), [token, setToken] = useState("");
  const [reset, setReset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [scriptReady, setScriptReady] = useState(false), [clientSecret, setClientSecret] = useState("");
  const mount = useRef<HTMLDivElement>(null), embedded = useRef<Embedded | null>(null), lock = useRef(false), attempt = useRef("");
  useEffect(() => {
    let active = true; const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    fetch("/api/contributions/checkout", { cache: "no-store", signal: controller.signal }).then(async response => { if (!response.ok) throw new Error(); const value = await response.json(); if (active) setConfig(value); }).catch(() => {}).finally(() => { clearTimeout(timer); if (active) setChecked(true); });
    return () => { active = false; controller.abort(); clearTimeout(timer); };
  }, []);
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
    {config?.available && <Script src="https://js.stripe.com/v3/" onReady={() => setScriptReady(true)} onError={() => setError("Stripe could not load. Check your connection or use the secure Stripe link below.")} />}
    {clientSecret ? <><div className={s.checkoutHeader}><strong>{frequency === "monthly" ? "Monthly contribution" : "One-time contribution"}</strong><button type="button" onClick={change}>Change amount</button></div><div ref={mount} className={s.checkoutForm} /></> : <>
      {config?.available ? <>
        <div className={s.frequency} role="group" aria-label="Contribution frequency"><button type="button" aria-pressed={frequency === "once"} disabled={busy} onClick={() => { change(); setFrequency("once"); }}>One time</button><button type="button" aria-pressed={frequency === "monthly"} disabled={!config.monthly || busy} onClick={() => { change(); setFrequency("monthly"); }}>Monthly</button></div>
        <p className={s.amountLabel}>Choose an amount in USD</p><div className={s.amounts} role="group" aria-label="Contribution amount">{["10", "25", "50"].map(value => <button type="button" key={value} disabled={busy} aria-pressed={!custom && amount === value} onClick={() => { change(); setCustom(false); setAmount(value); }}>${value}</button>)}<button type="button" disabled={busy} aria-pressed={custom} onClick={() => { change(); setCustom(true); }}>Other</button></div>
        {custom && <label className={s.customAmount}><span>USD</span><input aria-label="Custom contribution in US dollars" inputMode="decimal" maxLength={7} value={amount} disabled={busy} onChange={e => { change(); setAmount(e.target.value); }} /></label>}
        <p className={s.small}>{frequency === "monthly" ? <>${amount || "0"} each month until canceled. <a href={config.portal!} target="_blank" rel="noopener noreferrer">Manage or cancel monthly giving</a>.</> : "One contribution, with no recurring charge."} {custom && "Enter $5 to $1,000."}</p>
        {!confirming ? <button type="button" className={`${s.primary} ${s.checkoutAction}`} disabled={!donationAmount(amount)} onClick={() => setConfirming(true)}>Continue with ${amount}{frequency === "monthly" ? " / month" : ""}<ArrowRight size={17} aria-hidden="true" /></button> : <form className={s.checkoutForm} onSubmit={submit}><label className={s.small}><input name="consent" type="checkbox" required disabled={busy} /> I agree to the <a href="/terms">contribution terms</a>{frequency === "monthly" ? ` and a recurring charge of $${amount} each month until I cancel` : ""}.</label><Honeypot /><Challenge action="donation_checkout" onToken={setToken} reset={reset} /><button className={s.primary} type="submit" disabled={!token || busy || !scriptReady}>{busy ? "Opening secure checkout..." : "Open secure checkout"}</button></form>}
      </> : <><p className={s.small}>{checked ? "Choose your own amount for a one-time contribution through Stripe." : "Checking secure checkout..."}</p>{hostedLink && <a className={s.primary} href={hostedLink} target="_blank" rel="noopener noreferrer">Contribute on Stripe <ArrowUpRight size={17} aria-hidden="true" /><span className={s.srOnly}> (opens a new tab)</span></a>}</>}
    </>}
    {error && <p className={s.error} role="alert">{error}</p>}
    <p className={s.small}>Payment details are handled securely by Stripe. Contributing does not subscribe you to email updates.</p>
    {config?.portal && <p className={s.small}><a href={config.portal} target="_blank" rel="noopener noreferrer">Manage or cancel monthly giving <ArrowUpRight size={12} aria-hidden="true" /></a></p>}
    {config?.available && hostedLink && <p className={s.small}><a href={hostedLink} target="_blank" rel="noopener noreferrer">Prefer a one-time contribution on Stripe? <ArrowUpRight size={12} aria-hidden="true" /></a></p>}
  </>;
}
