export interface ExactPhotoProvenance {
  credit: string;
  sourceUrl: string;
  sourceMediaUrl: string;
  license: string;
  licenseScope: "media";
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function httpsUrl(value: unknown, host?: string): URL | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port
      && (!host || url.hostname === host) ? url : undefined;
  } catch { return undefined; }
}

/** Plain text only; retain author/credit link targets instead of losing attribution. */
function creditText(value: string): string | undefined {
  if (value.length > 12000 || /<(?:script|style)\b/i.test(value)) return undefined;
  const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", copy: "(c)" };
  let invalid = false;
  const text = value.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_all, href: string, label: string) => {
    try {
      const url = new URL(href.replace(/&amp;/g, "&"), "https://commons.wikimedia.org");
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) { invalid = true; return label; }
      return `${label} (${url.href})`;
    } catch { invalid = true; return label; }
  }).replace(/<[^>]*>/g, " ").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, key: string) => {
    if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? (invalid = true, whole);
    const code = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    if (!Number.isSafeInteger(code) || code < 32 || code > 0x10ffff || code >= 0xd800 && code <= 0xdfff) {
      invalid = true; return whole;
    }
    return String.fromCodePoint(code);
  }).replace(/\s+/g, " ").trim();
  return !invalid && text.length <= 2000 ? text : undefined;
}

function fileName(title: string) {
  return title.replace(/^File:/, "").replace(/_/g, " ").normalize("NFC").trim();
}

function licenseLabel(value: string): string | undefined {
  const label = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(?:cc-zero|cc0(?: 1\.0)?|cc0 1\.0 universal|creative commons cc0 1\.0 universal public domain dedication)$/.test(label)) return "cc0";
  if (label === "public domain" || label === "pd") return "pd";
  const short = label.match(/^cc[ -]by(-sa)?[ -](1\.0|2\.0|2\.5|3\.0|4\.0)$/);
  const long = label.match(/^creative commons attribution(-share alike)? (1\.0|2\.0|2\.5|3\.0|4\.0)(?: international)?$/);
  const match = short ?? long;
  return match ? `by${match[1] ? "-sa" : ""}/${match[2]}` : undefined;
}

/** Select only the requested Commons file's current, explicit metadata. No network. */
export function commonsPhotoProvenance(requestedFile: string, response: unknown): ExactPhotoProvenance | null {
  const pages = object(object(response)?.query)?.pages;
  if (!Array.isArray(pages) || pages.length !== 1) return null;
  const page = object(pages[0]);
  if (!page || page.ns !== 6 || "missing" in page || page.imagerepository !== "local"
    || typeof page.title !== "string" || fileName(page.title) !== fileName(requestedFile)
    || !Array.isArray(page.imageinfo) || page.imageinfo.length !== 1) return null;
  const info = object(page.imageinfo[0]);
  if (!info || "filehidden" in info || !["image/jpeg", "image/png", "image/webp"].includes(String(info.mime))) return null;
  const original = httpsUrl(info.url, "upload.wikimedia.org");
  const media = httpsUrl(info.thumburl ?? info.url);
  const source = httpsUrl(info.descriptionurl, "commons.wikimedia.org");
  if (!original || !media || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(media.hostname)
    || !source || !source.pathname.startsWith("/wiki/File:")) return null;
  try {
    if (fileName(decodeURIComponent(source.pathname.slice("/wiki/".length))) !== fileName(page.title)
      || !original.pathname.startsWith("/wikipedia/commons/")
      || fileName(decodeURIComponent(original.pathname.split("/").at(-1)!)) !== fileName(page.title)) return null;
    if (media.href !== original.href && (!media.pathname.startsWith("/wikipedia/commons/thumb/")
      || fileName(decodeURIComponent(media.pathname.split("/").at(-2)!)) !== fileName(page.title))) return null;
  } catch { return null; }
  const metadata = object(info.extmetadata);
  if (!metadata) return null;
  const get = (key: string) => object(metadata[key])?.value;
  const text = (key: string) => typeof get(key) === "string" ? (get(key) as string).trim() : undefined;
  // Commons hosting and the uploader's identity do not establish photo rights.
  const artist = text("Artist");
  const shortName = text("LicenseShortName");
  const rawLicense = text("LicenseUrl");
  if (!artist || !shortName || !rawLicense) return null;
  let licenseUrl: URL;
  try { licenseUrl = new URL(rawLicense); } catch { return null; }
  if (!/^https?:$/.test(licenseUrl.protocol) || !["creativecommons.org", "www.creativecommons.org"].includes(licenseUrl.hostname)
    || licenseUrl.username || licenseUrl.password || licenseUrl.port || licenseUrl.search || licenseUrl.hash) return null;
  const path = licenseUrl.pathname.replace(/\/$/, "").replace(/\/legalcode$/, "");
  const key = path === "/publicdomain/zero/1.0" ? "cc0"
    : path === "/publicdomain/mark/1.0" ? "pd"
      : path.match(/^\/licenses\/(by(?:-sa)?\/(?:1\.0|2\.0|2\.5|3\.0|4\.0))$/)?.[1];
  if (!key || licenseLabel(shortName) !== key) return null;
  for (const field of ["UsageTerms", "License"]) {
    const value = text(field);
    if (get(field) !== undefined && typeof get(field) !== "string") return null;
    if (value && licenseLabel(value) !== key) return null;
  }
  if (get("Restrictions") !== undefined && get("Restrictions") !== "") return null;
  for (const field of ["AttributionRequired", "Copyrighted"]) {
    const value = text(field)?.toLowerCase();
    if (get(field) !== undefined && !["true", "false"].includes(value ?? "")) return null;
    if (field === "Copyrighted" && (key === "pd" || key === "cc0") && value === "true") return null;
  }
  const author = creditText(artist);
  if (!author || /^(?:unknown|anonymous|wikimedia commons|own work)(?:$| \()/i.test(author)) return null;
  const credits = [author];
  for (const field of ["Attribution", "Credit"]) {
    const value = text(field);
    if (get(field) !== undefined && typeof get(field) !== "string") return null;
    if (!value) continue;
    const plain = creditText(value);
    if (plain === undefined) return null;
    if (plain && !credits.includes(plain)) credits.push(plain);
  }
  return {
    credit: credits.join("; "), sourceUrl: source.href, sourceMediaUrl: media.href,
    license: `https://creativecommons.org${path}/`, licenseScope: "media",
  };
}

/** Preserve the photo ID, not the taxon ID; a missing photo cannot borrow a credit. */
export function inaturalistPhotoProvenance(value: unknown): ExactPhotoProvenance | null {
  const photo = object(value);
  if (!photo || !Number.isSafeInteger(photo.id) || Number(photo.id) <= 0
    || typeof photo.attribution !== "string" || !photo.attribution.trim()
    || typeof photo.license_code !== "string"
    || !["cc0", "pd", "cc-by", "cc-by-sa"].includes(photo.license_code)) return null;
  const media = httpsUrl(photo.large_url ?? photo.medium_url ?? photo.url);
  if (!media) return null;
  const embeddedId = media.pathname.match(/\/photos\/(\d+)\//)?.[1];
  if (embeddedId && Number(embeddedId) !== photo.id) return null;
  // Retain the exact supplied representation; do not manufacture an original URL.
  return {
    credit: photo.attribution.trim(), sourceUrl: `https://www.inaturalist.org/photos/${photo.id}`,
    sourceMediaUrl: media.href, license: photo.license_code, licenseScope: "media",
  };
}
