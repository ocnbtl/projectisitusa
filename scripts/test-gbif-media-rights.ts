import assert from "node:assert/strict";
import { assessGbifMediaRights } from "../src/lib/data/gbif-media-rights";

const ac = "http://rs.tdwg.org/ac/terms/";
const dc = "http://purl.org/dc/terms/";
const xmp = "http://ns.adobe.com/xap/1.0/rights/";
const image = "https://provider.example/photos/selected.jpg";
const cc0 = "https://creativecommons.org/publicdomain/zero/1.0/";
const by = "https://creativecommons.org/licenses/by/4.0/";
const bySa = "https://creativecommons.org/licenses/by-sa/4.0/";
const raw = (rows: Record<string, unknown>[], extra = {}) => ({
  ...extra, extensions: { [`${ac}Multimedia`]: rows },
});
const row = (rights: unknown, extra = {}) => ({ [`${dc}identifier`]: image, [`${dc}rights`]: rights, ...extra });
let checked = 0;
function check(name: string, media: { identifier?: unknown; license?: unknown }, verbatim: unknown, expected: string) {
  const before = JSON.stringify({ media, verbatim });
  const decision = assessGbifMediaRights(media, verbatim);
  assert.equal(decision.allowed ? decision.license : decision.reason, expected, name);
  assert.equal(JSON.stringify({ media, verbatim }), before, `${name}: input mutation`);
  if (decision.allowed) {
    assert.equal(decision.licenseScope, "media");
    assert.equal(decision.sourceMediaUrl, media.identifier);
    assert.ok(decision.declarations.length);
  }
  checked++;
}
const selected = { identifier: image, license: cc0 };

// Reduced live GBIF /verbatim fields checked 2026-11-01. No network in tests.
// https://api.gbif.org/v1/occurrence/4104571922/verbatim
const cupImage = "https://biocoll.inhs.illinois.edu/media/idigbio/cup/mycology/CUP-027/CUP-027259_lg.jpg";
check("Ophiostoma: normalized CC0 does not override raw NC-SA", { identifier: cupImage, license: cc0 }, raw([{
  [`${dc}identifier`]: cupImage,
  [`${dc}rights`]: "http://creativecommons.org/publicdomain/zero/1.0/",
  [`${xmp}UsageTerms`]: "CC BY-NC-SA (Attribution-NonCommercial-ShareAlike)",
}]), "restricted-rights");
// https://api.gbif.org/v1/occurrence/4987920302/verbatim
const kuImage = "http://biimages.biodiversity.ku.edu/static/Ichthyology/originals/0c02b3a5-2eae-4e9e-91fe-b9762e01af77.jpg";
check("Pterygoplichthys: UUID plus exact accessURI, no media license", { identifier: kuImage }, raw([{
  [`${dc}identifier`]: "76c26711-f5a3-41f4-9ffb-79ba0a1c018b",
  [`${ac}accessURI`]: kuImage,
  [`${dc}license`]: "https://creativecommons.org/licenses/by-nc/4.0/legalcode",
  [`${dc}accessRights`]: "http://biodiversity.ku.edu/research/university-kansas-biodiversity-institute-data-publication-and-use-norms",
}], { license: by }), "restricted-rights");

check("equivalent CC0 URL and shorthand", { identifier: image, license: "CC0" }, raw([row(cc0)]), cc0);
check("explicit BY with compatible shorthand", { identifier: image, license: "CC-BY" }, raw([row(`${by}legalcode`)]), by);
check("BY-SA obligations preserved", { identifier: image, license: bySa }, raw([row("CC BY-SA 4.0")]), bySa);
check("compatible BY human label", { identifier: image, license: by }, raw([row(by, { [`${xmp}UsageTerms`]: "CC BY (Attribution)" })]), by);
check("compatible BY-SA human label", { identifier: image, license: bySa }, raw([row(bySa, { [`${xmp}UsageTerms`]: "CC BY-SA (Attribution-ShareAlike)" })]), bySa);
check("additional parenthetical terms are not stripped", { identifier: image, license: by }, raw([row(by, { [`${xmp}UsageTerms`]: "CC BY (Attribution; written permission required)" })]), "ambiguous-rights");
check("raw direct image license without normalized license", { identifier: image }, raw([row(by)]), by);
check("UUID accessURI linkage preserves permissive rights", { identifier: image }, raw([{
  [`${dc}identifier`]: "uuid-of-photo", [`${ac}accessURI`]: image, [`${dc}license`]: by,
}]), by);
check("duplicate matching rows with same rights", selected, raw([row(cc0), row("CC0 1.0")]), cc0);
check("other photograph restrictions do not contaminate exact selected media", selected, raw([
  row(cc0), row("CC BY-NC 4.0", { [`${dc}identifier`]: "https://provider.example/other.jpg" }),
]), cc0);
check("occurrence license cannot grant image rights", { identifier: image }, raw([row(undefined)], { license: cc0 }), "missing-verbatim-rights");
check("normalized license alone is insufficient", selected, raw([row(undefined)]), "missing-verbatim-rights");
check("missing identifier", { license: cc0 }, raw([row(cc0)]), "missing-media-identifier");
check("failed verbatim fetch", selected, undefined, "missing-verbatim");
check("no media extensions", selected, { extensions: {} }, "unmatched-media");
check("never match same filename on different host", selected, raw([row(cc0, { [`${dc}identifier`]: "https://elsewhere.example/photos/selected.jpg" })]), "unmatched-media");
check("never match thumbnail URL", selected, raw([row(cc0, { [`${dc}identifier`]: "uuid", [`${ac}thumbnailAccessURI`]: image })]), "unmatched-media");
check("normalized/raw permissive conflict", selected, raw([row(by)]), "contradictory-rights");
check("BY version conflict", { identifier: image, license: by }, raw([row("CC BY 3.0")]), "contradictory-rights");
check("BY and BY-SA conflict", { identifier: image, license: by }, raw([row(bySa)]), "contradictory-rights");
check("duplicate rows cannot hide restricted license", selected, raw([row(cc0), row("CC BY-NC 4.0")]), "restricted-rights");
check("WebStatement is checked", selected, raw([row(cc0, { [`${xmp}WebStatement`]: "https://creativecommons.org/licenses/by-nc/3.0/" })]), "restricted-rights");
check("ND is unsuitable for derivative image pipeline", { identifier: image }, raw([row("CC BY-ND 4.0")]), "restricted-rights");
check("unknown access restrictions require review", selected, raw([row(cc0, { [`${dc}accessRights`]: "Contact owner before use" })]), "ambiguous-rights");
check("copyright reservation overrides permissive string", selected, raw([row(cc0, { [`${xmp}UsageTerms`]: "All rights reserved" })]), "restricted-rights");
check("unknown license URL fails closed", selected, raw([row("https://provider.example/license")]), "ambiguous-rights");
check("license URL lookalike rejected", selected, raw([row("https://creativecommons.org.evil.example/publicdomain/zero/1.0/")]), "ambiguous-rights");
check("permissive substring is not a grant", selected, raw([row("Not CC0; permission required")]), "ambiguous-rights");
check("unversioned BY needs explicit version", { identifier: image }, raw([row("CC BY")]), "ambiguous-rights");
check("compound alternative licenses need review", { identifier: image }, raw([row("CC0 or CC BY 4.0")]), "ambiguous-rights");
check("malformed rights not coerced to a string", selected, raw([row([cc0])]), "ambiguous-rights");
check("malformed extension fails closed", selected, { extensions: { [`${ac}Multimedia`]: {} } }, "ambiguous-rights");
check("legacy simple multimedia DC elements supported", selected, { extensions: {
  "http://rs.gbif.org/terms/1.0/Multimedia": [{
    "http://purl.org/dc/elements/1.1/identifier": image,
    "http://purl.org/dc/elements/1.1/rights": cc0,
  }],
} }, cc0);
console.log(`GBIF media rights: ${checked} cases passed (offline, exact-media, no dataset fallback).`);
