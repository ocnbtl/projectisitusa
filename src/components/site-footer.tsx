"use client";
import Link from "next/link";
import { useId, useState } from "react";
import { ANALYTICS_SETTINGS_EVENT } from "@/lib/ui/telemetry";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { FooterGrove } from "@/components/footer-grove";
import "./site-footer.css";
import { FooterSocials } from "@/components/footer-socials";
import { ArrowUp, ChevronDown, Map, Leaf, BookOpen, Route, Database, Award, Camera, Bell, HandHelping, Settings, Heart, FileText, Receipt, Repeat, Info, Palette, Shield, Users, Binoculars } from "lucide-react";

const groups = [
  { title: "Explore", links: [{icon:Map,label:"County map",href:"/"},{icon:Leaf,label:"Species profiles",href:"/species"},{icon:Binoculars,label:"Reviewed sightings",href:"/observations"}] },
  { title: "Our research", links: [{icon:BookOpen,label:"Research overview",href:"/research"},{icon:Route,label:"Our approach",href:"/approach"},{icon:Database,label:"Data sources",href:"/data-sources"},{icon:Award,label:"Credits",href:"/credits"}] },
  { title: "Get involved", links: [{icon:Bell,label:"Email updates",href:"/join"},{icon:Settings,label:"Email preferences",href:"/preferences"},{icon:HandHelping,label:"Ways to help for free",href:"/support/free"},{icon:Camera,label:"Report a sighting",href:"/report"},{icon:Users,label:"Volunteer",href:"/volunteer"}] },
  { title: "Contributions", links: [{icon:Heart,label:"Support the mission",href:"/support"},{icon:FileText,label:"Contribution terms",href:"/terms"},{icon:Receipt,label:"Request a refund",href:"/support/refund"},{icon:Repeat,label:"Manage your monthly support",href:"/support#supporter-heading"}] },
  { title: "ISITUSA", links: [{icon:Info,label:"About us",href:"/about"},{icon:Palette,label:"Brand kit",href:"/brand"},{icon:Shield,label:"Privacy policy",href:"/privacy"}] },
] as const;

function FooterMobileGroup({ group }: { group: (typeof groups)[number] }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <div className="footer-mobile-group" data-open={open}>
    <button className="footer-mobile-toggle" type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
      {group.title}<ChevronDown size={16} aria-hidden="true" />
    </button>
    <div id={panelId} className="footer-mobile-panel" aria-hidden={!open} inert={!open}>
      <div><nav aria-label={group.title}>{group.links.map(link => <Link key={link.href} href={{ pathname: link.href.split("#")[0], hash: link.href.split("#")[1] }}><link.icon size={16} aria-hidden="true" /><span>{link.label}</span></Link>)}</nav></div>
    </div>
  </div>;
}

export function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/" || pathname.startsWith("/admin") || pathname.startsWith("/auth/") || pathname === "/preferences") return null;
  return (
    <footer className="site-footer footer-refined">
      <div className="footer-main">
        <div className="footer-introduction"><Link href="/" className="footer-brand" aria-label="ISITUSA home"><Image className="brand-art" src="/brand/v10/symbol-name.svg?v=1.005" alt="ISITUSA" width={90} height={116} unoptimized /></Link><p>Accessible invasive species research to protect the places you love</p></div>
        <div className="footer-navigation">
          {groups.map(group=><div key={group.title} className="footer-group">
            <nav className="footer-desktop-group" aria-label={group.title}><h2>{group.title}</h2>{group.links.map(link=><Link key={link.href} href={{pathname:link.href.split("#")[0],hash:link.href.split("#")[1]}}><link.icon size={16} aria-hidden="true"/><span>{link.label}</span></Link>)}</nav>
            <FooterMobileGroup group={group} />
          </div>)}
        </div>
      </div>
      <div className="footer-details"><FooterSocials /><div className="footer-utilities"><a href="mailto:contact@isitusa.com">Contact us</a><button type="button" onClick={() => window.dispatchEvent(new Event(ANALYTICS_SETTINGS_EVENT))}>Privacy choices</button><a href="#main-content" className="footer-return">Back to top <ArrowUp size={16} aria-hidden="true" /></a></div></div>
      <FooterGrove />
    </footer>
  );
}
