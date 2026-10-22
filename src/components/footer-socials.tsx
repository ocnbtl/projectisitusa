import { Instagram, Facebook } from "lucide-react";
import { socialProfiles } from "@/content/social-profiles";

function SocialIcon({ platform }: { platform: string }) {
  if (platform === "Instagram") return <Instagram size={21} aria-hidden="true" />;
  if (platform === "Facebook") return <Facebook size={21} aria-hidden="true" />;
  return <svg viewBox="0 0 24 24" width="21" height="21" fill="currentColor" aria-hidden="true">
    {platform === "X"
      ? <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.3l8.2-9.4L.8 2h6.5l5.7 7.7L18.9 2ZM17.8 20h1.7L6.3 4H4.5l13.3 16Z" />
      : <path d="M16.7 2c.2 2.4 1.6 4 4.3 4.2v3.5a9.2 9.2 0 0 1-4.3-1.3V16a6.1 6.1 0 1 1-5.3-6v3.5a2.7 2.7 0 1 0 1.8 2.5V2h3.5Z" />}
  </svg>;
}

export function FooterSocials() {
  const published = socialProfiles.filter(profile => profile.url?.startsWith("https://"));
  if (!published.length) return null;
  return <nav className="footer-socials" aria-label="Follow ISITUSA">
    {published.map(profile => <a key={profile.platform} href={profile.url!} target="_blank" rel="noreferrer" aria-label={`ISITUSA on ${profile.platform} (opens in a new tab)`}><SocialIcon platform={profile.platform} /></a>)}
  </nav>;
}
