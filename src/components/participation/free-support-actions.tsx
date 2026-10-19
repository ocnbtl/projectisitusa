import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import s from "./support.module.css";
export function FreeSupportActions(){
 return <div className={s.freeActions}>
  <Link href="/report"><span>Document and report a sighting</span><ArrowUpRight size={19} aria-hidden="true"/></Link>
  <Link href="/"><span>Share your county&apos;s map</span><ArrowUpRight size={19} aria-hidden="true"/></Link>
  <Link href="/join"><span>Get invasive species updates near you</span><ArrowUpRight size={19} aria-hidden="true"/></Link>
 </div>;
}
