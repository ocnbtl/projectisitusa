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
  <section className={s.contactCard} aria-labelledby="contribution-questions"><MessageCircle size={24} aria-hidden="true"/><h2 id="contribution-questions">Questions about contributing?</h2><p>Whether you need a hand with a contribution or want to ask about the work, we&apos;re happy to help.</p><a href={`mailto:${SUPPORT_DESTINATIONS.cardSupport.contactEmail}`}>{SUPPORT_DESTINATIONS.cardSupport.contactEmail}<ArrowRight size={17} aria-hidden="true"/></a></section>
  </div>
  <section id="help-for-free" className={s.spreadSection} aria-labelledby="spread-heading">
   <div className={s.spreadIntro}><div><p className={s.eyebrow}>Support doesn&apos;t have to cost a thing</p><h2 id="spread-heading">Help someone discover what&apos;s nearby.</h2><p>One of the most useful things you can do for ISITUSA is tell someone about it. A conversation with a neighbor, a link in a group chat, or a map shared with your community can help more people learn about invasive species where they live.</p><button type="button" className={s.shareButton} onClick={shareSite}><Share2 size={18} aria-hidden="true"/>Share ISITUSA<ArrowRight size={18} aria-hidden="true"/></button><p className={s.shareStatus} role="status">{shareStatus}</p></div><EditorialArt subject="message" className={s.messageArt}/></div>
   <div className={s.spreadCards}>
    <article><Map size={25} aria-hidden="true"/><h3>Start with your local map.</h3><p>Look up your county and share what you find with neighbors, friends, or a local group. Point them to the sources, too—it&apos;s an invitation to learn about a place you share.</p><Link href="/">Find your county<ArrowRight size={17} aria-hidden="true"/></Link></article>
    <article><Users size={25} aria-hidden="true"/><h3>Bring it to your community.</h3><p>Know a teacher, garden club, park group, or conservation organization? Show them ISITUSA and how it could support their conversations, field trips, or local research.</p><Link href="/about">Introduce the project<ArrowRight size={17} aria-hidden="true"/></Link></article>
    <article><MessageCircle size={25} aria-hidden="true"/><h3>Keep the conversation going.</h3><p>Share a useful species profile or something you&apos;ve learned. When you share or repost our work on social media, include a link so others can explore the evidence for themselves.</p>{socialProfiles.some(profile=>profile.url)?<><p>Follow ISITUSA and pass along the updates that matter to you.</p><FooterSocials/></>:<p>Our social channels are on the way. For now, sign up for updates about the species and places you care about.</p>}<Link href="/join">Get updates near you<ArrowRight size={17} aria-hidden="true"/></Link></article>
   </div>
  </section>
  <section className={s.takePart} aria-labelledby="take-part-heading"><EditorialArt subject="footsteps" className={s.footstepsArt}/><div><p className={s.eyebrow}>Your time and curiosity matter, too</p><h2 id="take-part-heading">Be part of the work.</h2><p>Have an observation to share or skills you&apos;d like to put to use? Help us make local information more useful to the next person who needs it.</p><div className={s.partActions}><Link href="/report">Report a sighting<ArrowRight size={18} aria-hidden="true"/></Link><Link href={{pathname:"/volunteer"}}>Volunteer with us<ArrowRight size={18} aria-hidden="true"/></Link></div></div></section>
 </main>;
}
