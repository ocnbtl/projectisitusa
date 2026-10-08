"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";

type ConnectionState = { checkedAt: string; email: { enabled: boolean; configured: boolean }; reports: { enabled: boolean; configured: boolean }; analytics: { configured: boolean }; invitations: { enabled: boolean }; reconciliation: { enabled: boolean }; delivery: { configured: boolean } };
type Checkout = { available: boolean; monthly: boolean; portal?: string };
export function Connections({ token }: { token: string }) {
  const [data,setData]=useState<ConnectionState|null>(null),[checkout,setCheckout]=useState<Checkout|null>(null),[error,setError]=useState("");
  useEffect(()=>{let active=true;Promise.allSettled([
    request<ConnectionState>("connections",{},token),
    fetch("/api/contributions/checkout",{cache:"no-store",credentials:"omit",signal:AbortSignal.timeout(12000)}).then(async response=>{if(!response.ok)throw new Error();return await response.json() as Checkout;})
  ]).then(([services,payments])=>{if(!active)return;if(services.status==="fulfilled")setData(services.value);else setError("Connection details could not load. Refresh to check again.");if(payments.status==="fulfilled")setCheckout(payments.value);});return()=>{active=false;};},[token]);
  return <div>{error&&<Notice error>{error}</Notice>}<dl className={admin.connectionList}>
    <div><dt>Public card contributions</dt><dd><strong>{checkout?checkout.available?(checkout.monthly?"One-time and monthly available":"One-time available"):"Unavailable":"Not verified"}</strong>Reported by the website checkout. No payment was made.</dd></div>
    <div><dt>Email updates</dt><dd><strong>{data?data.email.enabled?"Intake enabled":"Intake closed":"Not verified"}</strong>{data?.email.configured?"Sending configuration is present. Delivery still requires verification.":"Sending configuration has not been verified."}</dd></div>
    <div><dt>Sighting reports</dt><dd><strong>{data?data.reports.enabled?"Intake enabled":"Intake closed":"Not verified"}</strong>Private storage and moderation must be tested before accepting observations.</dd></div>
    <div><dt>Site activity</dt><dd><strong>{data?data.analytics.configured?"Query connection configured":"Query connection needed":"Not verified"}</strong>Public consent analytics is separate from the internal reporting connection.</dd></div>
    <div><dt>Team invitations</dt><dd><strong>{data?data.invitations.enabled?"Enabled":"Not enabled":"Not verified"}</strong>Owner setup, invitation delivery and authenticator verification are required.</dd></div>
    <div><dt>Contribution reconciliation</dt><dd><strong>{data?data.reconciliation.enabled?"Enabled; receipts require verification":"Not enabled":"Not verified"}</strong>The internal receipt ledger is separate from public checkout.</dd></div>
    <div><dt>Email delivery worker</dt><dd><strong>{data?data.delivery.configured?"Configuration present":"Setup needed":"Not verified"}</strong>Credentials alone do not establish a running schedule or successful delivery.</dd></div>
  </dl><p className={styles.hint} style={{marginTop:24}}>Configuration checks disclose no credentials. Provider health, successful delivery and payment reconciliation need their own verification.{data&&` Checked ${new Date(data.checkedAt).toLocaleString()}.`}</p></div>;
}
