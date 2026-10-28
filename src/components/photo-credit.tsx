import { ContextPopover } from "./context-popover";

export function PhotoCredit({ credit, sourceUrl, license, name }: { credit: string; sourceUrl?: string; license?: string; name: string }) {
  const safeUrl = sourceUrl && /^https:\/\//.test(sourceUrl) ? sourceUrl : undefined;
  const ccLicense = license?.match(/creativecommons\.org\/licenses\/(by(?:-sa)?)\/([\d.]+)/i);
  const licenseLabel = ccLicense ? `CC ${ccLicense[1].toUpperCase()} ${ccLicense[2]}`
    : /creativecommons\.org\/publicdomain\/zero|^cc0$/i.test(license ?? "") ? "CC0"
    : /^public[- ]domain$/i.test(license ?? "") ? "Public domain"
    : license?.replace(/^cc-(by(?:-sa)?)$/i, (_, value: string) => `CC ${value.toUpperCase()}`);
  return <ContextPopover label={`Photo credit for ${name}`}><p>{credit}</p>{licenseLabel && !credit.toUpperCase().includes(licenseLabel) && <p>{licenseLabel}</p>}<p>Resized for display.</p>{safeUrl && <p><a href={safeUrl} target="_blank" rel="noreferrer">Photo source and usage terms</a></p>}</ContextPopover>;
}
