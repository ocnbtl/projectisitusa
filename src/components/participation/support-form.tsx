"use client";
import { track } from "@/lib/ui/telemetry";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Check, ChevronDown, Copy, Info, CreditCard, Repeat2, Wallet, HandHeart, ArrowRight, MessageCircle, Map, Users, Share2 } from "lucide-react";
import { cryptoUri } from "@/lib/participation/contracts";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { verifiedPublicWallets } from "@/lib/ui/support-destinations";
import { DonationCheckout, useDonationConfig } from "./donation-checkout";
import { FooterSocials } from "@/components/footer-socials";
import { socialProfiles } from "@/content/social-profiles";
import { FreeSupportActions } from "./free-support-actions";
import s from "./support.module.css";
import { EditorialArt } from "@/components/editorial-art";
const options = [{id:"once",label:"Once"},{id:"monthly",label:"Recurring"},{id:"crypto",label:"Cryptocurrency"},{id:"free",label:"Help for free"}] as const;
type SupportOption = typeof options[number]["id"];
const names: Record<string,string> = { BTC:"Bitcoin", ETH:"Ethereum", SOL:"Solana", XRP:"XRP", XMR:"Monero" };
export function SupportForm() {
 const {config,checked}=useDonationConfig();
 const [option,setOption]=useState<SupportOption>("once");
 const [shareStatus,setShareStatus]=useState("");
 async function shareSite(){
  try{
   if(navigator.share){await navigator.share({title:"ISITUSA",text:"Find invasive species recorded near you, with sources you can explore.",url:"https://isitusa.com"});setShareStatus("");}
   else{await navigator.clipboard.writeText("https://isitusa.com");setShareStatus("Website link copied. Share it with someone who cares about the places you love.");}
  }catch(error){if(!(error instanceof DOMException && error.name==="AbortError"))setShareStatus("You can copy this link instead: https://isitusa.com");}
 }
 const tabs=useRef<Array<HTMLButtonElement|null>>([]);
 function tabKey(event: React.KeyboardEvent<HTMLButtonElement>, index:number){
  let next=index;
  if(event.key==="ArrowRight")next=(index+1)%options.length;
  else if(event.key==="ArrowLeft")next=(index+options.length-1)%options.length;
  else if(event.key==="Home")next=0;
  else if(event.key==="End")next=options.length-1;
  else return;
  event.preventDefault();setOption(options[next].id);tabs.current[next]?.focus();
 }
 const [onceCheckoutActive,setOnceCheckoutActive]=useState(false),[monthlyCheckoutActive,setMonthlyCheckoutActive]=useState(false);
 // Destinations remain release-reviewed, never replaced by unchecked runtime responses.
 const wallets=verifiedPublicWallets(SUPPORT_DESTINATIONS.wallets);
 const [selected,setSelected]=useState(wallets[0]?.id??"");
 const wallet=wallets.find(item=>item.id===selected)??wallets[0];
 const networkLabel=wallet?.asset==="XRP"?"XRP mainnet":wallet?.network;
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
    <header className={s.intro}><h1 id="mission-heading" className="page-heading">Support the mission.</h1><p>ISITUSA is independent, apolitical, and doesn&apos;t accept lobbying money. We&apos;re building a free, open-source tool to help people understand invasive species and protect the places they love. Your contribution keeps it free for everyone.</p></header>
    <EditorialArt subject="support" className={s.missionArt}/>
   </section>
   <section id="contribute" className={s.donation} aria-labelledby="donation-heading">
    <header className={s.donationHeading}><h2 id="donation-heading">Make a contribution</h2></header>
    <div className={s.contributionTabs} role="tablist" aria-label="Ways to support ISITUSA">{options.map((item,index)=><button key={item.id} ref={element=>{tabs.current[index]=element;}} type="button" role="tab" id={`tab-${item.id}`} aria-selected={option===item.id} aria-controls={`give-${item.id}`} tabIndex={option===item.id?0:-1} onClick={()=>setOption(item.id)} onKeyDown={event=>tabKey(event,index)}>{item.label}</button>)}</div>
    <div className={s.paymentOptions}>
    <section id="give-once" role="tabpanel" aria-labelledby="tab-once" tabIndex={0} hidden={option!=="once"} className={s.oncePanel}><h3><CreditCard size={22} aria-hidden="true"/> Once</h3><p className={s.panelIntro}>Make a one-time contribution to help people find, understand, and use invasive species research.</p><DonationCheckout frequency="once" active={option==="once"} config={config} checked={checked} onCheckoutActiveChange={setOnceCheckoutActive}/></section>
    <section id="give-monthly" role="tabpanel" aria-labelledby="tab-monthly" tabIndex={0} hidden={option!=="monthly"} className={s.monthlyPanel}><h3><Repeat2 size={22} aria-hidden="true"/> Recurring</h3><p className={s.panelIntro}>Support ongoing research, species updates, and improvements to ISITUSA each month.</p><DonationCheckout frequency="monthly" active={option==="monthly"} config={config} checked={checked} onCheckoutActiveChange={setMonthlyCheckoutActive}/></section>
    {((option==="once" && onceCheckoutActive) || (option==="monthly" && monthlyCheckoutActive)) && <p className={s.checkoutReassurance}>Payment details are handled securely by Stripe. Contributing does not subscribe you to email updates.</p>}
    <section id="give-crypto" role="tabpanel" aria-labelledby="tab-crypto" tabIndex={0} hidden={option!=="crypto"} className={s.crypto}><h3><Wallet size={22} aria-hidden="true"/> Cryptocurrency</h3><p className={s.panelIntro}>Support ISITUSA using one of our verified cryptocurrency addresses.</p>{wallet?<>
  {/* eslint-disable-next-line @next/next/no-img-element -- Fixed-size local SVG currency icons do not benefit from raster optimization. */}
     <div className={s.assets} role="group" aria-label="Choose cryptocurrency">{wallets.map(item=><button type="button" key={item.id} aria-label={names[item.asset]} aria-pressed={item.id===wallet.id} onClick={()=>select(item.id)}><img src={`/brand/crypto/${item.asset.toLowerCase()}.svg`} width={26} height={26} alt=""/><span>{item.asset}</span></button>)}</div>
     <div className={s.network}><strong><Image src={`/brand/crypto/${wallet.asset.toLowerCase()}.svg`} width={22} height={22} alt="" unoptimized/>{names[wallet.asset]}</strong><span>{networkLabel}</span></div><label className={s.addressLabel} htmlFor="contribution-address">Receiving address</label><textarea id="contribution-address" className={s.address} aria-label={`${wallet.asset} receiving address`} readOnly spellCheck={false} value={wallet.address} rows={3} onFocus={e=>e.currentTarget.select()}/>
     <div className={s.addressActions}><button type="button" className={s.primary} onClick={copy}>{copied?<Check size={17} aria-hidden="true"/>:<Copy size={17} aria-hidden="true"/>}{copied?"Address copied":"Copy address"}</button>{cryptoUri(wallet)&&<a href={cryptoUri(wallet)!}>Open wallet <ArrowUpRight size={16} aria-hidden="true"/></a>}</div><p className={s.feedback} role="status">{feedback}</p>
     <details className={s.networkHelp}><summary><Info size={16} aria-hidden="true"/><span>Send only {wallet.asset} on {networkLabel}.</span><ChevronDown className={s.disclosureChevron} size={14} aria-hidden="true"/></summary><p>Check the full address before sending. Crypto transfers cannot be reversed by ISITUSA.{wallet.asset==="XRP"?" No destination tag is required.":""}</p><p>Open wallet works with compatible apps. If it does not open, copy the address into your wallet.</p></details>
    </>:<p className={s.small}>Receiving addresses are being verified.</p>}</section>
    <section id="give-free" role="tabpanel" aria-labelledby="tab-free" tabIndex={0} hidden={option!=="free"} className={s.freePanel}><h3><HandHeart size={22} aria-hidden="true"/>Ways you can support for free</h3><FreeSupportActions/><Link className={s.freePageLink} href="#help-for-free">More ways to spread the word <ArrowRight size={16} aria-hidden="true"/></Link></section></div>
    <footer className={s.donationFoot}><p><span>ISITUSA is an independent initiative.</span>{" "}<span>Contributions are not tax deductible.</span></p><div><Link href="/terms">Contribution terms</Link><Link href="/support/refund">Request a refund</Link><Link href="/privacy">Privacy</Link></div></footer>
   </section>

  </div>
  <div className={s.supportDetails}>
  {config?.portal && <section className={s.supporterPortal} aria-labelledby="supporter-heading">
   <div><h2 id="supporter-heading">Manage your monthly support</h2><p>Update or cancel your recurring contribution securely through Stripe.</p></div>
   <div className={s.portalAction}><a className={s.portalButton} href={config.portal} target="_blank" rel="noopener noreferrer">Open billing portal <ArrowUpRight size={18} aria-hidden="true"/><span className={s.srOnly}> (opens a new tab)</span></a></div>
  </section>}
  <section className={s.contactCard} aria-labelledby="contribution-questions"><h2 id="contribution-questions"><MessageCircle size={24} aria-hidden="true"/><span>Questions about contributing?</span></h2><p>Whether you need a hand with a contribution or want to ask about the work, we&apos;re happy to help. Reach us at <a href={`mailto:${SUPPORT_DESTINATIONS.cardSupport.contactEmail}`}>{SUPPORT_DESTINATIONS.cardSupport.contactEmail}</a>.</p></section>
  </div>
  <section id="help-for-free" className={s.spreadSection} aria-labelledby="spread-heading">
   <div className={s.spreadIntro}><div><h2 id="spread-heading">Help more people find ISITUSA.</h2><p>Help someone discover what has been recorded near them. Send a friend their county map, share a species profile with your local group, or introduce ISITUSA to an organization in your community. Each introduction helps more people find and use the research we bring together.</p><button type="button" className={s.shareButton} onClick={shareSite}><Share2 size={18} aria-hidden="true"/>Share ISITUSA<ArrowRight size={18} aria-hidden="true"/></button><p className={s.shareStatus} role="status">{shareStatus}</p></div><EditorialArt subject="message" className={s.messageArt}/></div>
   <div className={s.spreadCards}>
    <article><h3><Map size={23} aria-hidden="true"/><span>Share a place you care about.</span></h3><p>Send your county&apos;s map to a friend or neighbor. It gives you a place to start: which species have been recorded nearby, what they look like, and where to learn more.</p><Link href="/">Find your county<ArrowRight size={17} aria-hidden="true"/></Link></article>
    <article><h3><Users size={23} aria-hidden="true"/><span>Introduce us to your community.</span></h3><p>If you&apos;re part of a garden club, school, park group, or conservation organization, show them around ISITUSA. You may know someone who could use the map in a lesson, a local project, or their next walk outdoors.</p><Link href="/about">Share what we do<ArrowRight size={17} aria-hidden="true"/></Link></article>
    <article><h3><MessageCircle size={23} aria-hidden="true"/><span>Pass along what you learn.</span></h3><p>Found a species profile worth sharing? Add a link to your group chat or social feed and tell people what caught your attention. A familiar place or a personal observation can make the research feel closer to home.</p>{socialProfiles.some(profile=>profile.url)?<><p>Follow ISITUSA for more to explore and share.</p><FooterSocials/></>:<p>You can also sign up for local updates and share the ones your friends would find useful.</p>}<Link href="/join">Get updates near you<ArrowRight size={17} aria-hidden="true"/></Link></article>
   </div>
  </section>
  <section className={s.takePart} aria-labelledby="take-part-heading"><EditorialArt subject="footsteps" className={s.footstepsArt}/><div><h2 id="take-part-heading">Help shape ISITUSA.</h2><p>Report a possible sighting for our team to review, or tell us about your interests and availability to volunteer. We&apos;d love to hear how you&apos;d like to help.</p><div className={s.partActions}><Link className={s.partPrimary} href="/report">Report a sighting<ArrowRight size={18} aria-hidden="true"/></Link><Link href={{pathname:"/volunteer"}}>Volunteer with us<ArrowRight size={18} aria-hidden="true"/></Link></div></div></section>
 </main>;
}
