"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Challenge, Honeypot } from "./shared";
import { checkoutDestination, donationAmount, type DonationFrequency } from "@/lib/ui/donation-checkout";
import s from "./support.module.css";
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
export function DonationCheckout({ frequency = "once", active = true, config, checked, onCheckoutActiveChange }: { frequency?: DonationFrequency; active?: boolean; config: Config | null; checked: boolean; onCheckoutActiveChange: (active: boolean) => void }) {
  const [amount, setAmount] = useState("25");
  const [custom, setCustom] = useState(false), [confirming, setConfirming] = useState(false), [token, setToken] = useState("");
  const [reset, setReset] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const lock = useRef(false), attempt = useRef("");
  const customId = useId(), customInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    onCheckoutActiveChange(Boolean(confirming || checkoutUrl));
    return () => onCheckoutActiveChange(false);
  }, [confirming, checkoutUrl, onCheckoutActiveChange]);
  useEffect(() => {
    if (custom) customInput.current?.focus({ preventScroll: true });
  }, [custom]);
  function change() { setConfirming(false); setError(""); setToken(""); setCheckoutUrl(""); attempt.current = ""; }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || !token || !donationAmount(amount)) return;
    track("checkout_started", {surface:"support", frequency}); lock.current = true; setBusy(true); setError("");
    if (!attempt.current) attempt.current = crypto.randomUUID();
    try {
      const fields = new FormData(event.currentTarget);
      const response = await fetch("/api/contributions/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, frequency, token, attempt: attempt.current, consent: fields.get("consent") === "on", website: fields.get("website") ?? "" }), signal: AbortSignal.timeout(40000) });
      const result = await response.json();
      const destination = checkoutDestination(result.url);
      if (!response.ok || !destination) throw new Error(result.error || "Checkout could not open. Please try again.");
      setCheckoutUrl(destination);
      track("checkout_opened", {surface:"support", frequency});
      window.location.assign(destination);
    } catch (failure) { track("checkout_failed", {surface:"support", frequency}); setError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "Checkout took too long. Please try again."); }
    finally { lock.current = false; setBusy(false); setToken(""); setReset(value => value + 1); }
  }
  return <>
    {checkoutUrl ? <><p role="status">Opening Stripe&apos;s secure checkout...</p><a className={s.primary} href={checkoutUrl}>Continue to secure checkout <ArrowRight size={17} aria-hidden="true" /></a><button type="button" className="text-link" onClick={change}>Change amount</button></> : <>
      {config?.available && (frequency === "once" || config.monthly) ? <>
        <p className={s.amountLabel}>Choose an amount in USD</p><div className={s.amounts} role="group" aria-label={frequency === "monthly" ? "Monthly contribution amount" : "One-time contribution amount"}>{["5", "10", "25", "50"].map(value => <button type="button" key={value} disabled={busy} aria-pressed={!custom && amount === value} onClick={() => { change(); setCustom(false); setAmount(value); }}>${value}</button>)}<button type="button" disabled={busy} aria-pressed={custom} aria-expanded={custom} aria-controls={customId} onClick={() => { change(); setCustom(true); }}>Other</button></div>
        <div id={customId} className={s.customDisclosure} data-open={custom} aria-hidden={!custom}>
          <div className={s.customDisclosureInner}>
            <label className={s.customAmount}><span>USD</span><input ref={customInput} aria-label={frequency === "monthly" ? "Custom monthly amount in US dollars" : "Custom one-time amount in US dollars"} aria-describedby={`${customId}-help`} inputMode="decimal" maxLength={7} value={amount} disabled={!custom || busy} onChange={e => { change(); setAmount(e.target.value); }} /></label>
            <p id={`${customId}-help`} className={s.customHelp}>Enter $5 to $1,000.</p>
          </div>
        </div>
        {!confirming ? <button type="button" className={`${s.primary} ${s.checkoutAction}`} disabled={!donationAmount(amount)} onClick={() => setConfirming(true)}>{frequency === "monthly" ? "Give" : "Continue with"} ${amount}{frequency === "monthly" ? " monthly" : ""}<ArrowRight size={17} aria-hidden="true" /></button> : <form className={s.checkoutForm} onSubmit={submit}><label className={s.small}><input name="consent" type="checkbox" required disabled={busy} /> I agree to the <a href="/terms">contribution terms</a>{frequency === "monthly" ? ` and a recurring charge of $${amount} each month until I cancel` : ""}.</label><Honeypot />{active && <><Challenge action="donation_checkout" onToken={setToken} reset={reset} appearance="interaction-only" /><p className={s.securityStatus} role="status"><ShieldCheck size={16} aria-hidden="true"/>{token?"Ready for secure checkout":"Checking your secure connection…"}</p></>}<button className={s.primary} type="submit" disabled={!token || busy}>{busy ? "Opening secure checkout..." : "Open secure checkout"}</button></form>}
      </> : <p className={s.small} role="status">{checked ? frequency === "monthly" ? "Monthly contributions are not available right now. Please check back soon." : "Card checkout is temporarily unavailable. Please try again later or choose the Cryptocurrency tab." : "Checking secure checkout..."}</p>}
    </>}
    {error && <p className={s.error} role="alert">{error}</p>}

  </>;
}
