"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, ChevronDown, Copy, Info, CreditCard, Repeat2, Wallet } from "lucide-react";
import { cryptoUri } from "@/lib/participation/contracts";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { activeStripePaymentLink, verifiedPublicWallets } from "@/lib/ui/support-destinations";
import { DonationCheckout, useDonationConfig } from "./donation-checkout";
import s from "./support.module.css";
const names: Record<string,string> = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", XRP:"XRP", XMR:"Monero" };
export function SupportForm() {
 const {config,checked}=useDonationConfig();
 const hostedLink=activeStripePaymentLink(SUPPORT_DESTINATIONS);
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
    <header className={s.intro}><h1 id="mission-heading">Support the mission<br/>and protect our planet.</h1><p>Your support and contributions enable the research and keep our free, open-source tool operating for everyone.</p><a className={s.mobileContribution} href="#contribute">Make a contribution <ArrowDown size={16} aria-hidden="true"/></a></header>
    <section className={s.otherWays} aria-labelledby="other-heading"><h2 id="other-heading">Other ways to help</h2>
     <Link href="/report"><div><strong>Document a sighting</strong><p>Learn what to photograph and where to report it.</p></div><ArrowUpRight size={19} aria-hidden="true"/></Link>
     <Link href="/"><div><strong>Share your county&apos;s map</strong><p>Help a neighbor, school, or local group find their records.</p></div><ArrowUpRight size={19} aria-hidden="true"/></Link>
     <Link href="/join"><div><strong>Follow the research</strong><p>Explore plans for county and species updates.</p></div><ArrowUpRight size={19} aria-hidden="true"/></Link>
    </section>
    <p className={s.missionFoot}>Contributions support the work as a whole. They never influence a research finding. <Link href="/about">About isitusa <ArrowUpRight size={14} aria-hidden="true"/></Link></p>
   </section>
   <section id="contribute" className={s.donation} aria-labelledby="donation-heading">
    <header className={s.donationHeading}><h2 id="donation-heading">Make a contribution</h2><p>Support research that stays open to everyone.</p></header>
    <div className={s.paymentOptions}>
    <section className={s.oncePanel}><h3><CreditCard size={22} aria-hidden="true"/> Give once</h3><p className={s.panelIntro}>A contribution today helps keep the research open.</p><DonationCheckout hostedLink={hostedLink} frequency="once" config={config} checked={checked}/></section>
    <section className={s.monthlyPanel}><h3><Repeat2 size={22} aria-hidden="true"/> Keep it growing</h3><p className={s.panelIntro}>Monthly support helps us plan the work ahead.</p><DonationCheckout hostedLink={null} frequency="monthly" config={config} checked={checked}/></section>
    <section className={s.crypto}><h3><Wallet size={22} aria-hidden="true"/> Contribute cryptocurrency</h3><p className={s.panelIntro}>Send directly to a verified receiving address.</p>{wallet?<>
     <div className={s.assets} role="group" aria-label="Choose cryptocurrency">{wallets.map(item=><button type="button" key={item.id} aria-label={names[item.asset]} aria-pressed={item.id===wallet.id} onClick={()=>select(item.id)}><img src={`/brand/crypto/${item.asset.toLowerCase()}.svg`} width={26} height={26} alt=""/><span>{item.asset}</span></button>)}</div>
     <div className={s.network}><strong>{names[wallet.asset]}</strong><span>{wallet.network}</span></div><label className={s.addressLabel} htmlFor="contribution-address">Receiving address</label><textarea id="contribution-address" className={s.address} aria-label={`${wallet.asset} receiving address`} readOnly spellCheck={false} value={wallet.address} rows={3} onFocus={e=>e.currentTarget.select()}/>
     <div className={s.addressActions}><button type="button" className={s.primary} onClick={copy}>{copied?<Check size={17} aria-hidden="true"/>:<Copy size={17} aria-hidden="true"/>}{copied?"Address copied":"Copy address"}</button>{cryptoUri(wallet)&&<a href={cryptoUri(wallet)!}>Open wallet <ArrowUpRight size={16} aria-hidden="true"/></a>}</div><p className={s.feedback} role="status">{feedback}</p>
     <details className={s.networkHelp}><summary><Info size={16} aria-hidden="true"/><span>Send only {wallet.asset} on {wallet.network}.</span><ChevronDown className={s.disclosureChevron} size={14} aria-hidden="true"/></summary><p>Check the full address before sending. Crypto transfers cannot be reversed by isitusa.{wallet.asset==="XRP"?" No destination tag is required.":""}</p></details>
    </>:<p className={s.small}>Receiving addresses are being verified.</p>}</section></div>
    {(config?.portal || hostedLink) && <nav className={s.givingLinks} aria-label="More contribution options">
     {config?.portal && <a href={config.portal} target="_blank" rel="noopener noreferrer">Manage or cancel monthly giving <ArrowUpRight size={15} aria-hidden="true"/><span className={s.srOnly}> (opens a new tab)</span></a>}
     {hostedLink && <a href={hostedLink} target="_blank" rel="noopener noreferrer">Prefer a one-time contribution on Stripe? <ArrowUpRight size={15} aria-hidden="true"/><span className={s.srOnly}> (opens a new tab)</span></a>}
    </nav>}
    <footer className={s.donationFoot}><p>isitusa is an independent initiative, not a registered nonprofit. Contributions are not represented as tax-deductible.</p><div><Link href="/terms">Contribution terms</Link><Link href="/support/refund">Request a refund</Link><Link href="/privacy">Privacy</Link></div></footer>
   </section>
  </div><p className={s.questions}>Questions about contributing? <a href={`mailto:${SUPPORT_DESTINATIONS.cardSupport.contactEmail}`}>{SUPPORT_DESTINATIONS.cardSupport.contactEmail}</a></p>
 </main>;
}
