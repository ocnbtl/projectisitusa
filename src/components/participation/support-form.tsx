"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Copy, Heart, Mail, MapPin, ScanSearch } from "lucide-react";
import { cryptoUri } from "@/lib/participation/contracts";
import { Frame, Notice, styles, useConfig } from "./shared";
import { SUPPORT_DESTINATIONS } from "@/content/support-destinations";
import { activeStripePaymentLink, verifiedPublicWallets } from "@/lib/ui/support-destinations";
export function SupportForm(){
 const {config}=useConfig(),[error,setError]=useState(""),[copied,setCopied]=useState("");
 const hostedLink=activeStripePaymentLink(SUPPORT_DESTINATIONS);
 const wallets=verifiedPublicWallets(config?.wallets.length ? config.wallets : SUPPORT_DESTINATIONS.wallets);
 return <Frame title="Help the atlas grow." description="Share useful information, document what you see, follow the research, or support the work behind it." aside={<><h2>What your support helps build</h2><p>Clearer species profiles, traceable county records, and tools that make the research easier to use.</p><details className={styles.supportDetails}><summary>About contributions</summary><p>isitusa is an independent initiative in the United States, not a registered nonprofit. We do not offer tax-deductible donations.</p><p>Email updates are a separate choice. A contribution will never sign you up automatically.</p></details><Link href="/about" className="text-link">Why we are building isitusa <ArrowUpRight size={16} aria-hidden="true"/></Link></>}>
 <section className={styles.supportActions} aria-labelledby="help-today"><h2 id="help-today">Choose how you would like to help</h2><div>
 <Link href="/"><MapPin size={24} aria-hidden="true"/><span><strong>Share the map</strong><small>Find your county, then send its link to a neighbor, school, or local group.</small></span><ArrowUpRight size={19} aria-hidden="true"/></Link>
 <Link href="/report"><ScanSearch size={24} aria-hidden="true"/><span><strong>Document a sighting</strong><small>Learn what to photograph, what to record, and where to report it.</small></span><ArrowUpRight size={19} aria-hidden="true"/></Link>
 <Link href="/join"><Mail size={24} aria-hidden="true"/><span><strong>Get email updates</strong><small>{config?.email ? "Choose the counties, species, and research you want to follow." : "See the updates we are planning. Email signups are not open yet."}</small></span><ArrowUpRight size={19} aria-hidden="true"/></Link>
 <a href="#contribute"><Heart size={24} aria-hidden="true"/><span><strong>Make a contribution</strong><small>{hostedLink || wallets.length ? "Support clearer profiles, traceable records, and better tools." : "Financial contributions are not open yet. See what they will support."}</small></span><ArrowUpRight size={19} aria-hidden="true"/></a>
 </div></section>
 <div id="contribute" className={styles.supportAvailability}><h2 className="text-2xl mb-4">Support the work</h2>
 {!hostedLink&&<Notice><strong>Card contributions are not open yet.</strong><p>We are completing checkout and support setup before opening contributions. {wallets.length ? "Crypto options are listed below." : "Crypto contributions are also not open yet."}</p></Notice>}
 {hostedLink&&<><a className={styles.button} href={hostedLink} target="_blank" rel="noreferrer">Contribute through Stripe <ArrowUpRight size={16} aria-hidden="true"/></a><p className={styles.hint}>Choose a one-time amount on Stripe&apos;s secure payment page. Review the final amount and currency before paying. Contributions are not tax-deductible. Read our <Link className="text-link" href="/terms">support terms</Link>.</p></>}
 </div>
 {wallets.length>0&&<section className={styles.section}><h2>Contribute with crypto</h2>{wallets.map(wallet=><article key={wallet.id} className={styles.wallet}><h3>{wallet.asset}</h3><p className={styles.hint}>{wallet.network} only</p><code>{wallet.address}</code><div className={styles.row}><button type="button" className={`${styles.button} ${styles.secondary}`} onClick={()=>{if(!navigator.clipboard){setError("Copy is unavailable. Select the full address above.");return;}navigator.clipboard.writeText(wallet.address).then(()=>setCopied(wallet.id)).catch(()=>setError("Copy is unavailable. Select the full address above."));}}><Copy size={16} aria-hidden="true"/>{copied===wallet.id?"Copied":"Copy address"}</button>{cryptoUri(wallet)&&<a href={cryptoUri(wallet)!} className={styles.button}>Open wallet<ArrowUpRight size={16} aria-hidden="true"/></a>}</div><p className={styles.hint}>Check the full address and network in your wallet before sending. Crypto transfers cannot be reversed by isitusa.</p></article>)}</section>}{error&&<Notice error>{error}</Notice>}</Frame>;
}
