"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, ChevronDown, Copy, Info, CreditCard, Repeat2, Wallet } from "lucide-react";
import { cryptoUri } from "@/lib/participation/contracts";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { verifiedPublicWallets } from "@/lib/ui/support-destinations";
import { DonationCheckout, useDonationConfig } from "./donation-checkout";
import s from "./support.module.css";
const names: Record<string,string> = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", XRP:"XRP", XMR:"Monero" };
export function SupportForm() {
 const {config,checked}=useDonationConfig();
 const [onceCheckoutActive,setOnceCheckoutActive]=useState(false),[monthlyCheckoutActive,setMonthlyCheckoutActive]=useState(false);
 // Destinations remain release-reviewed, never replaced by unchecked runtime responses.
 const wallets=verifiedPublicWallets(SUPPORT_DESTINATIONS.wallets);
 const [selected,setSelected]=useState(wallets[0]?.id??"");
 const wallet=wallets.find(item=>item.id===selected)??wallets[0];
 const [feedback,setFeedback]=useState(""),[copied,setCopied]=useState(false);
 const request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>>();
 useEffect(()=>()=>{request.current++;clearTimeout(timer.current);},[]);
 function select(id:string){request.current++;clearTimeout(timer.current);setSelected(id);setFeedback("");setCopied(false);}
 async function copy(){
  if(!wallet)return;
  const current=++request.current;clearTimeout(timer.current);
  try{await navigator.clipboard.writeText(wallet.address);if(current!==request.current)return;setCopied(true);track("crypto_address_copied",{surface:"support",asset:wallet.asset});setFeedback(`${wallet.asset} address copied. Check the full address in your wallet.`);timer.current=setTimeout(()=>{setCopied(false);setFeedback("");},5000);}
  catch{if(current===request.current){setCopied(false);setFeedback("Could not copy. Select and copy the full address above.");}}
 }
 return <main id="main-content" className={s.page}>
  <div className={s.layout}>
   <section className={s.mission} aria-labelledby="mission-heading">
    <header className={s.intro}><h1 id="mission-heading" className="page-heading">Support the mission.</h1><p>ISITUSA is independent, apolitical, and doesn&apos;t accept lobbying money. We&apos;re building a free, open-source tool to help you understand invasive species and protect the places you love. Your contribution keeps it free for everyone.</p></header>
   </section>
   <section id="contribute" className={s.donation} aria-labelledby="donation-heading">
    <header className={s.donationHeading}><h2 id="donation-heading">Make a contribution</h2></header>
    <nav className={s.contributionLinks} aria-label="Contribution options"><a href="#give-once">Once</a><a href="#give-monthly">Recurring</a><a href="#give-crypto">Cryptocurrency</a></nav>
    <div className={s.paymentOptions}>
    <section id="give-once" className={s.oncePanel}><h3><CreditCard size={22} aria-hidden="true"/> Once</h3><p className={s.panelIntro}>Make a one-time contribution to help people find, understand, and use invasive species research.</p><DonationCheckout frequency="once" config={config} checked={checked} onCheckoutActiveChange={setOnceCheckoutActive}/></section>
    <section id="give-monthly" className={s.monthlyPanel}><h3><Repeat2 size={22} aria-hidden="true"/> Recurring</h3><p className={s.panelIntro}>Support ongoing research, species updates, and improvements to ISITUSA each month.</p><DonationCheckout frequency="monthly" config={config} checked={checked} onCheckoutActiveChange={setMonthlyCheckoutActive}/></section>
    {(onceCheckoutActive || monthlyCheckoutActive) && <p className={s.checkoutReassurance}>Payment details are handled securely by Stripe. Contributing does not subscribe you to email updates.</p>}
    <section id="give-crypto" className={s.crypto}><h3><Wallet size={22} aria-hidden="true"/> Cryptocurrency</h3><p className={s.panelIntro}>Contribute to ISITUSA using one of our verified cryptocurrency addresses.</p>{wallet?<>
  {/* eslint-disable-next-line @next/next/no-img-element -- Fixed-size local SVG currency icons do not benefit from raster optimization. */}
     <div className={s.assets} role="group" aria-label="Choose cryptocurrency">{wallets.map(item=><button type="button" key={item.id} aria-label={names[item.asset]} aria-pressed={item.id===wallet.id} onClick={()=>select(item.id)}><img src={`/brand/crypto/${item.asset.toLowerCase()}.svg`} width={26} height={26} alt=""/><span>{item.asset}</span></button>)}</div>
     <div className={s.network}><strong>{names[wallet.asset]}</strong><span>{wallet.network}</span></div><label className={s.addressLabel} htmlFor="contribution-address">Receiving address</label><textarea id="contribution-address" className={s.address} aria-label={`${wallet.asset} receiving address`} readOnly spellCheck={false} value={wallet.address} rows={3} onFocus={e=>e.currentTarget.select()}/>
     <div className={s.addressActions}><button type="button" className={s.primary} onClick={copy}>{copied?<Check size={17} aria-hidden="true"/>:<Copy size={17} aria-hidden="true"/>}{copied?"Address copied":"Copy address"}</button>{cryptoUri(wallet)&&<a href={cryptoUri(wallet)!}>Open wallet <ArrowUpRight size={16} aria-hidden="true"/></a>}</div><p className={s.feedback} role="status">{feedback}</p>
     <details className={s.networkHelp}><summary><Info size={16} aria-hidden="true"/><span>Send only {wallet.asset} on {wallet.network}.</span><ChevronDown className={s.disclosureChevron} size={14} aria-hidden="true"/></summary><p>Check the full address before sending. Crypto transfers cannot be reversed by isitusa.{wallet.asset==="XRP"?" No destination tag is required.":""}</p></details>
    </>:<p className={s.small}>Receiving addresses are being verified.</p>}</section></div>
    <footer className={s.donationFoot}><p>ISITUSA is an independent initiative, not a registered nonprofit. Contributions are not represented as tax-deductible.</p><div><Link href="/terms">Contribution terms</Link><Link href="/support/refund">Request a refund</Link><Link href="/privacy">Privacy</Link></div></footer>
   </section>
   <section className={s.freeHelp} aria-labelledby="other-heading">
    <div className={s.otherWays}><h2 id="other-heading">Ways you can help for free</h2>
     <Link href="/report"><strong>Document and report a sighting</strong><ArrowUpRight size={19} aria-hidden="true"/></Link>
     <Link href="/"><strong>Share your county&apos;s map with your community</strong><ArrowUpRight size={19} aria-hidden="true"/></Link>
     <Link href="/join"><strong>Get invasive species updates near you</strong><ArrowUpRight size={19} aria-hidden="true"/></Link>
    </div>
    <p className={s.missionFoot}>Contributions support the work as a whole. They never influence a research finding. <Link href="/about">About ISITUSA <ArrowUpRight size={14} aria-hidden="true"/></Link></p>
   </section>
  </div>
  {config?.portal && <section className={s.supporterPortal} aria-labelledby="supporter-heading">
   <div><h2 id="supporter-heading">Your monthly giving</h2><p>Already supporting ISITUSA? Manage your recurring contribution or cancel future payments in your secure billing portal.</p></div>
   <div className={s.portalAction}><a className={s.portalButton} href={config.portal} target="_blank" rel="noopener noreferrer">Manage monthly giving <ArrowUpRight size={18} aria-hidden="true"/><span className={s.srOnly}> (opens a new tab)</span></a><p>Opens Stripe’s secure billing portal.</p></div>
  </section>}
  <p className={s.questions}>Questions about contributing? <a href={`mailto:${SUPPORT_DESTINATIONS.cardSupport.contactEmail}`}>{SUPPORT_DESTINATIONS.cardSupport.contactEmail}</a></p>
 </main>;
}
