import { ContextPopover } from "./context-popover";

export function PhotoCredit({ credit, sourceUrl, license, name }: { credit: string; sourceUrl?: string; license?: string; name: string }) {
  const safeUrl = sourceUrl && /^https:\/\//.test(sourceUrl) ? sourceUrl : undefined;
  const ccLicense = license?.match(/creativecommons\.org\/licenses\/(by(?:-sa|-nd)?)\/([\d.]+)/i);
  const gfdl = license === "https://www.gnu.org/licenses/old-licenses/fdl-1.2.html";
  const licenseLabel = ccLicense ? `CC ${ccLicense[1].toUpperCase()} ${ccLicense[2]}`
    : /creativecommons\.org\/publicdomain\/zero|^cc0$/i.test(license ?? "") ? "CC0"
    : /^public[- ]domain$/i.test(license ?? "") ? "Public domain"
    : gfdl ? "GNU Free Documentation License 1.2"
    : license?.replace(/^cc-(by(?:-sa|-nd)?)$/i, (_, value: string) => `CC ${value.toUpperCase()}`);
  const licenseHref = license && (/^https?:\/\/(?:www\.)?creativecommons\.org\//i.test(license) || gfdl) ? license.replace(/^http:/i, "https:") : undefined;
  const taxonSource = safeUrl && /^https:\/\/(?:www\.)?inaturalist\.org\/taxa\/\d+(?:[/?#]|$)/i.test(safeUrl);
  return <ContextPopover label={`Photo credit for ${name}`}><p>{credit}</p>{licenseLabel && (licenseHref || !credit.toUpperCase().includes(licenseLabel)) && <p>{licenseHref ? <a href={licenseHref} target="_blank" rel="noreferrer">{licenseLabel}</a> : licenseLabel}</p>}<p>Resized for display.</p>{safeUrl && <p><a href={safeUrl} target="_blank" rel="noreferrer">{taxonSource ? "Species image source on iNaturalist" : "Photo source and usage terms"}</a></p>}</ContextPopover>;
}
