/** Conservative import screening, not a legal determination or a dataset-license fallback. */
export interface GbifMediaRightsDeclaration {
  field: string;
  value: unknown;
}

export type GbifMediaRightsDecision = {
  allowed: true;
  license: string;
  sourceMediaUrl: string;
  licenseScope: "media";
  declarations: GbifMediaRightsDeclaration[];
} | {
  allowed: false;
  reason: "missing-media-identifier" | "missing-verbatim" | "unmatched-media"
    | "missing-verbatim-rights" | "ambiguous-rights" | "restricted-rights"
    | "contradictory-rights";
  declarations: GbifMediaRightsDeclaration[];
};

type ObjectValue = Record<string, unknown>;
type License = { family: "cc0" | "public-domain" | "by" | "by-sa"; version?: string };
const EXTENSIONS = new Set([
  "http://rs.tdwg.org/ac/terms/Multimedia", "https://rs.tdwg.org/ac/terms/Multimedia",
  "http://rs.gbif.org/terms/1.0/Multimedia", "https://rs.gbif.org/terms/1.0/Multimedia",
]);
const DC = /^https?:\/\/purl\.org\/dc\/(?:terms|elements\/1\.1)\/(license|rights|accessRights|identifier)$/i;
const XMP = /^https?:\/\/ns\.adobe\.com\/xap\/1\.0\/rights\/(WebStatement|UsageTerms)$/i;
const ACCESS = /^https?:\/\/rs\.tdwg\.org\/ac\/terms\/accessURI$/i;

function object(value: unknown): ObjectValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as ObjectValue : undefined;
}

function nonempty(value: unknown) {
  return value !== undefined && value !== null && !(typeof value === "string" && !value.trim());
}

function parseLicense(value: unknown): License | "restricted" | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase();
  // Reject restrictions even if another part of the declaration mentions CC0 or CC BY.
  if (/\b(?:non[ -]?commercial|no[ -]?derivatives|all rights reserved)\b|\bby[- _](?:nc|nd)\b/.test(text)) {
    return "restricted";
  }
  if (/^https?:\/\//.test(text)) {
    let url: URL;
    try { url = new URL(text); } catch { return undefined; }
    if (!new Set(["creativecommons.org", "www.creativecommons.org"]).has(url.hostname)
      || url.username || url.password || url.port || url.search || url.hash) return undefined;
    const path = url.pathname.replace(/\/$/, "");
    if (/^\/publicdomain\/zero\/1\.0(?:\/legalcode)?$/.test(path)) return { family: "cc0", version: "1.0" };
    if (/^\/publicdomain\/mark\/1\.0$/.test(path)) return { family: "public-domain" };
    const match = path.match(/^\/licenses\/(by|by-sa)\/(1\.0|2\.0|2\.5|3\.0|4\.0)(?:\/(?:legalcode|deed(?:\.[a-z-]+)?))?$/);
    if (match) return { family: match[1] as "by" | "by-sa", version: match[2] };
    return undefined;
  }
  if (/^(?:cc0|cc[- ]0)(?:[- ]1\.0)?(?: universal)?$/.test(text)) return { family: "cc0", version: "1.0" };
  if (text === "public domain") return { family: "public-domain" };
  // These exact human-readable labels occur in provider UsageTerms. Do not
  // strip arbitrary prose or parentheses: they can contain extra conditions.
  const shorthand = text
    .replace(/^(cc[- ]by(?:[- ](?:1\.0|2\.0|2\.5|3\.0|4\.0))?) \(attribution\)$/, "$1")
    .replace(/^(cc[- ]by-sa(?:[- ](?:1\.0|2\.0|2\.5|3\.0|4\.0))?) \(attribution-sharealike\)$/, "$1");
  const match = shorthand.match(/^cc[- ]by(-sa)?(?:[- ](1\.0|2\.0|2\.5|3\.0|4\.0))?$/);
  return match ? { family: match[1] ? "by-sa" : "by", version: match[2] } : undefined;
}

/**
 * Pass the selected normalized GBIF media object and that occurrence's COMPLETE
 * /verbatim response. A failed fetch must remain undefined, never an empty safe result.
 * Match only exact identifier/accessURI values; never the array index, filename,
 * thumbnail, occurrence rights, dataset license, or rights of a different photograph.
 * A provider UUID identifier may coexist with the actual image URL in accessURI.
 */
export function assessGbifMediaRights(
  media: { identifier?: unknown; license?: unknown },
  verbatim: unknown,
): GbifMediaRightsDecision {
  const declarations: GbifMediaRightsDeclaration[] = [];
  const reject = (reason: Extract<GbifMediaRightsDecision, { allowed: false }> ["reason"]): GbifMediaRightsDecision =>
    ({ allowed: false, reason, declarations });
  if (typeof media.identifier !== "string" || !media.identifier.trim()) return reject("missing-media-identifier");
  const identifier = media.identifier.trim();
  const extensions = object(object(verbatim)?.extensions);
  if (!extensions) return reject("missing-verbatim");

  let matched = 0;
  for (const [extension, rows] of Object.entries(extensions)) {
    if (!EXTENSIONS.has(extension)) continue;
    if (!Array.isArray(rows)) return reject("ambiguous-rights");
    for (const [index, item] of rows.entries()) {
      const row = object(item);
      if (!row) return reject("ambiguous-rights");
      const exactMedia = Object.entries(row).some(([key, value]) =>
        (DC.exec(key)?.[1].toLowerCase() === "identifier" || ACCESS.test(key))
        && typeof value === "string" && value.trim() === identifier);
      if (!exactMedia) continue;
      matched++;
      for (const [key, value] of Object.entries(row)) {
        const dcField = DC.exec(key)?.[1].toLowerCase();
        if ((dcField && dcField !== "identifier" || XMP.test(key)) && nonempty(value)) {
          declarations.push({ field: `${extension}[${index}].${key}`, value });
        }
      }
    }
  }
  if (!matched) return reject("unmatched-media");
  // Normalized media.license can itself be an interpretation; require a raw
  // declaration explicitly attached to the image before trusting the result.
  if (!declarations.length) return reject("missing-verbatim-rights");
  if (nonempty(media.license)) declarations.push({ field: "media.license", value: media.license });
  const licenses = declarations.map(({ value }) => parseLicense(value));
  if (licenses.includes("restricted")) return reject("restricted-rights");
  if (licenses.some((license) => !license)) return reject("ambiguous-rights");
  const permissive = licenses as License[];
  const families = new Set(permissive.map((license) => license.family));
  const versions = new Set(permissive.map((license) => license.version).filter(Boolean));
  if (families.size !== 1 || versions.size > 1) return reject("contradictory-rights");
  const license = permissive.find((candidate) => candidate.version) ?? permissive[0];
  // BY and BY-SA versions have different obligations. Unversioned shorthand
  // needs an accompanying explicit version, rather than an invented default.
  if ((license.family === "by" || license.family === "by-sa") && !license.version) return reject("ambiguous-rights");
  const canonical = license.family === "cc0" ? "https://creativecommons.org/publicdomain/zero/1.0/"
    : license.family === "public-domain" ? "https://creativecommons.org/publicdomain/mark/1.0/"
      : `https://creativecommons.org/licenses/${license.family}/${license.version}/`;
  return { allowed: true, license: canonical, sourceMediaUrl: identifier, licenseScope: "media", declarations };
}
