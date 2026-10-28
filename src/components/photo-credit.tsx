import { ContextPopover } from "./context-popover";

export function PhotoCredit({ credit, sourceUrl, license, name }: { credit: string; sourceUrl?: string; license?: string; name: string }) {
  const safeUrl = sourceUrl && /^https:\/\//.test(sourceUrl) ? sourceUrl : undefined;
  const licenseLabel = license?.replaceAll("-", " ").toUpperCase();
  return <ContextPopover label={`Photo credit for ${name}`}><p>{credit}</p>{licenseLabel && !credit.toUpperCase().includes(licenseLabel) && <p>{licenseLabel}</p>}{safeUrl && <p><a href={safeUrl} target="_blank" rel="noreferrer">Photo source and usage terms</a></p>}</ContextPopover>;
}
