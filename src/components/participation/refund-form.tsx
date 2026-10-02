"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, ClipboardCheck } from "lucide-react";
import { Challenge, Honeypot } from "./shared";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import s from "./refund.module.css";

export function RefundForm() {
  const [available, setAvailable] = useState<boolean|null>(null), [token, setToken] = useState(""), [reset, setReset] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [receipt, setReceipt] = useState("");
  const locked = useRef(false), notice = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    fetch("/api/contributions/refund", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error();
      const result = await response.json(); setAvailable(result.available === true);
    }).catch(() => { if (!controller.signal.aborted) setAvailable(false); }).finally(() => { clearTimeout(timeout); if (controller.signal.aborted) setAvailable(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);
  useEffect(() => { if (error || receipt) notice.current?.focus(); }, [error, receipt]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!available || !token || locked.current) return;
    locked.current = true; setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(data.entries());
    try {
      const response = await fetch("/api/contributions/refund", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, token, consent: data.get("consent") === "on" }), signal: AbortSignal.timeout(30000) });
      const result = await response.json();
      if (!response.ok || result.accepted !== true || typeof result.reference !== "string") throw new Error(result.error || "We could not confirm submission. Please try again.");
      setReceipt(result.reference);
    } catch (failure) { setError(failure instanceof Error && failure.name !== "TimeoutError" ? failure.message : "We could not confirm submission. Your details are still here; please try again."); }
    finally { setBusy(false); locked.current = false; setToken(""); setReset(value => value + 1); }
  }
  return <main id="main-content" className={s.page}>
    <Link href="/support" className={s.back}><ArrowLeft size={16} aria-hidden="true"/> Back to supporting isitusa</Link>
    <header className={s.intro}><span><ClipboardCheck size={18} aria-hidden="true"/> Contribution support</span><h1>Request a refund.</h1><p>Tell us what happened and which contribution you are asking about. We review every request individually and reply by email.</p></header>
    <div className={s.layout}><section>
      {receipt ? <div ref={notice} tabIndex={-1} role="status" className={s.notice}><h2>Your request has been submitted.</h2><p>Keep this reference: <strong>{receipt}</strong>.</p><p>This confirms submission for review, not approval or completion of a refund. We will reply to the email you provided.</p></div> : <>
        {available !== true && <p role="status" className={s.notice}>{available === null ? "Checking form availability..." : "The refund request form is temporarily unavailable. Please try again later, or contact contact@isitusa.com for help submitting your request."}</p>}
        {error && <div ref={notice} tabIndex={-1} role="alert" className={s.notice}>{error}</div>}
        <form onSubmit={submit} className={s.form}>
          <fieldset disabled={!available || busy}>
            <legend className={s.srOnly}>Your contribution details</legend>
            <label>Email used for the contribution<input name="email" type="email" autoComplete="email" required maxLength={254}/></label>
            <div className={s.fields}><label>Contribution date<input name="date" type="date" required max={new Date().toISOString().slice(0,10)}/></label><label>Payment method<select name="method" required defaultValue=""><option value="" disabled>Choose a method</option><option value="card">Card or Stripe</option><option value="crypto">Cryptocurrency</option></select></label></div>
            <label>Amount and currency<input name="amount" placeholder="For example, 25 USD or 0.1 XMR" required maxLength={30} pattern="[0-9]+(\.[0-9]{1,12})? [A-Z]{3,5}" aria-describedby="amount-help"/><small id="amount-help">Enter the amount, a space, then the currency in capital letters.</small></label>
            <label>Payment reference <small>(optional)</small><input name="reference" maxLength={150} autoComplete="off"/><small>A Stripe receipt reference or transaction ID can help us locate it. For Monero, a transaction ID alone does not prove receipt.</small></label>
            <label>Reason for your request<textarea name="reason" required minLength={10} maxLength={2000} rows={5} placeholder="What would you like us to review?"/></label>
            <p className={s.hint}>Do not include card numbers, passwords, private keys, or recovery words.</p>
            <Honeypot/>
            <label className={s.consent}><input name="consent" type="checkbox" required/><span>I agree that isitusa may use these details to review my request and contact me about it. <Link href="/privacy">Privacy notice</Link></span></label>
            {available && <Challenge action="refund_request" onToken={setToken} reset={reset}/>}
            <button type="submit" disabled={!token || busy}>{busy ? "Submitting request..." : "Submit for review"}<ArrowUpRight size={17} aria-hidden="true"/></button>
          </fieldset>
        </form>
      </>}
    </section><aside><h2>What happens next</h2><ol><li>We locate the original contribution.</li><li>We review your request and reply by email.</li><li>If approved, a card refund goes back through the original payment method.</li></ol><p>{SUPPORT_DESTINATIONS.cardSupport.refundPolicy}</p><p>Crypto transfers cannot be reversed by isitusa. Any request involving crypto needs separate review and verification.</p><a href="mailto:contact@isitusa.com">Questions? Contact us</a></aside></div>
  </main>;
}
