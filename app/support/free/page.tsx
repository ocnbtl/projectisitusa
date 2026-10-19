import type { Metadata } from "next";
import Link from "next/link";
import { FreeSupportActions } from "@/components/participation/free-support-actions";
import s from "@/components/participation/support.module.css";
export const metadata:Metadata={title:"Ways you can support for free | ISITUSA",description:"Report a sighting, share your county map, or get invasive species updates. Help ISITUSA without making a financial contribution."};
export default function Page(){return <main id="main-content" className={`${s.page} ${s.freePage}`}><header className={s.intro}><h1>Ways you can support for free</h1><p>Help people notice invasive species, find local information, and stay informed. Choose a way to get involved.</p></header><FreeSupportActions/><Link className={s.freePageLink} href="/support">Back to Support</Link></main>;}
