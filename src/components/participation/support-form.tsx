"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Copy, CreditCard, Heart, Leaf, Mail, MapPin, ScanSearch, ShieldCheck, WalletCards } from "lucide-react";
import { cryptoUri } from "@/lib/participation/contracts";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { activeStripePaymentLink, verifiedPublicWallets } from "@/lib/ui/support-destinations";
import { useConfig } from "./shared";
import s from "./support.module.css";
const names: Record<string,string> = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", XRP:"XRP", XMR:"Monero" };
export function SupportForm() {
 const {config}=useConfig();
 const hostedLink=activeStripePaymentLink(SUPPORT_DESTINATIONS);
 // Destinations are reviewed at release, never replaced by an unchecked runtime response.
 const wallets=verifiedPublicWallets(SUPPORT_DESTINATIONS.wallets);
 const [selected,setSelected]=useState(wallets[0]?.id??"");
 const wallet=wallets.find(item=>item.id===selected)??wallets[0];
 const [feedback,setFeedback]=useState("");
 const [copied,setCopied]=useState(false);
 const request=useRef(0),timer=useRef<ReturnType<typeof setTimeout>>();
 useEffect(()=>()=>{request.current++;clearTimeout(timer.current);},[]);
 function select(id:string){request.current++;clearTimeout(timer.current);setSelected(id);setFeedback("");setCopied(false);}
 async function copy(){
  if(!wallet)return;
  const current=++request.current;clearTimeout(timer.current);
  try{await navigator.clipboard.writeText(wallet.address);if(current!==request.current)return;setCopied(true);setFeedback(`${wallet.asset} address copied. Check the full address and network in your wallet.`);timer.current=setTimeout(()=>{setCopied(false);setFeedback("");},5000);}
  catch{if(current===request.current){setCopied(false);setFeedback("Could not copy automatically. Select and copy the full address above.");}}
 }
 const {contactEmail,contactVerifiedAt}=SUPPORT_DESTINATIONS.cardSupport;
 return <main id="main-content" className={s.page}>
  <header className={s.intro}><span className={s.eyebrow}><Heart size={17} aria-hidden="true"/> Support isitusa</span><h1>Help make local knowledge<br className={s.desktopBreak}/> easier to find.</h1><p>Your contribution supports the research, source review, and everyday work that keep this free invasive species atlas growing.</p></header>
  <section id="contribute" className={s.contribute} aria-labelledby="give-heading"><div className={s.sectionHeading}><h2 id="give-heading">A little support. More useful research.</h2><p>Choose the way that works for you.</p></div>
   <div className={s.methods}>
    <article className={s.card} aria-labelledby="card-heading"><div className={s.cardTop}><CreditCard size={25} aria-hidden="true"/><span>One-time contribution</span></div><h3 id="card-heading">Give by card</h3><p>Choose your own amount on Stripe. No subscription, and no isitusa account needed.</p><div className={s.cardBottom}>{hostedLink?<a className={s.primary} href={hostedLink} target="_blank" rel="noopener noreferrer">Choose an amount <ArrowUpRight size={18} aria-hidden="true"/><span className={s.srOnly}> (opens Stripe in a new tab)</span></a>:<p className={s.pending}>Card contributions are not open yet. We are finishing checkout setup.</p>}<p className={s.small}><ShieldCheck size={16} aria-hidden="true"/> Payment details stay with Stripe.</p></div></article>
    <article className={`${s.card} ${s.crypto}`} aria-labelledby="crypto-heading"><div className={s.cardTop}><WalletCards size={25} aria-hidden="true"/><span>Direct to our wallet</span></div><h3 id="crypto-heading">Give with crypto</h3><p>Select a currency, then copy its receiving address.</p>
     {wallet?<><div className={s.assets} role="group" aria-label="Choose cryptocurrency">{wallets.map(item=><button type="button" key={item.id} aria-pressed={item.id===wallet.id} onClick={()=>select(item.id)}>{item.asset}<span>{names[item.asset]??item.asset}</span></button>)}</div>
      <div className={s.addressPanel}><div className={s.network}><strong>{names[wallet.asset]??wallet.asset}</strong><span>{wallet.network} only</span></div><label htmlFor="contribution-address">Receiving address</label><textarea id="contribution-address" aria-label={`${wallet.asset} receiving address`} readOnly spellCheck={false} value={wallet.address} rows={3} onFocus={e=>e.currentTarget.select()}/><div className={s.addressActions}><button type="button" className={s.copy} onClick={copy}>{copied?<Check size={16} aria-hidden="true"/>:<Copy size={16} aria-hidden="true"/>}{copied?"Address copied":"Copy address"}</button>{cryptoUri(wallet)&&<a className={s.walletLink} href={cryptoUri(wallet)!}>Open in your wallet <ArrowUpRight size={16} aria-hidden="true"/></a>}</div>{wallet.asset==="XRP"&&<p className={s.small}>No destination tag is required. Send at least 1 XRP to cover the network's initial account reserve.</p>}<p className={s.feedback} role="status" aria-live="polite">{feedback}</p></div><p className={s.small}>Send only {wallet.asset} on {wallet.network}. Check the full address before sending. Crypto transfers cannot be reversed by isitusa.</p></>:<p className={s.pending}>Crypto contributions are not open yet. Receiving addresses are being verified.</p>}
    </article>
   </div><div className={s.contributionNote}><p>isitusa is an independent initiative, not a registered nonprofit. We do not claim tax-deductible status.</p><Link href="/terms">Contribution &amp; refund terms <ArrowUpRight size={15} aria-hidden="true"/></Link></div>
  </section>
  <section className={s.purpose} aria-labelledby="purpose-heading"><div><Leaf size={27} aria-hidden="true"/><h2 id="purpose-heading">Keep the atlas open<br/> to everyone.</h2></div><div><p>Finding reliable information about invasive species should not depend on knowing where to look. Your support helps us check sources, explain what they tell us, and make local records easier to explore.</p><p>Contributions support the work as a whole. They do not buy a particular research result or change what appears on the map.</p><Link href="/about">Meet the project <ArrowUpRight size={16} aria-hidden="true"/></Link></div></section>
  <section className={s.otherWays} aria-labelledby="other-heading"><h2 id="other-heading">There is more than one way to help.</h2><div>
   <Link href="/"><MapPin size={24} aria-hidden="true"/><strong>Share the map</strong><p>Send your county page to a neighbor, school, or local group.</p><span>Explore the map <ArrowUpRight size={16} aria-hidden="true"/></span></Link>
   <Link href="/report"><ScanSearch size={24} aria-hidden="true"/><strong>Document a sighting</strong><p>Learn what to photograph, what to record, and where to report it.</p><span>See how to help <ArrowUpRight size={16} aria-hidden="true"/></span></Link>
   <Link href="/join"><Mail size={24} aria-hidden="true"/><strong>Follow the research</strong><p>{config?.email?"Choose the counties and species you want to hear about.":"See the email updates we are preparing. Signups are not open yet."}</p><span>{config?.email?"Choose your updates":"Preview planned updates"} <ArrowUpRight size={16} aria-hidden="true"/></span></Link>
  </div></section>
  <div className={s.questions}><p>Questions about contributing? {contactVerifiedAt&&<a href={`mailto:${contactEmail}`}>{contactEmail}</a>}</p><p><Link href="/support/refund">Request a refund</Link>. Every request is reviewed individually.</p><p>Contributing never signs you up for emails. <Link href="/privacy">Privacy</Link></p></div>
 </main>;
}
