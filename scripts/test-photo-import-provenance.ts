import assert from "node:assert/strict";
import { commonsPhotoProvenance, inaturalistPhotoProvenance } from "../src/lib/data/photo-import-provenance";

// Offline fixtures follow Imageinfo formatversion=2 and CommonsMetadata fields:
// https://www.mediawiki.org/wiki/API:Imageinfo
// https://commons.wikimedia.org/wiki/Commons:Machine-readable_data
const filename = "Example bird.jpg";
const original = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Example_bird.jpg";
const thumbnail = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example_bird.jpg/1400px-Example_bird.jpg";
const filePage = "https://commons.wikimedia.org/wiki/File:Example_bird.jpg";
const bySa = "https://creativecommons.org/licenses/by-sa/4.0/";
const fields: Record<string, string> = {
  Artist: '<a href="//commons.wikimedia.org/wiki/User:Example">Example &amp; Partner</a>',
  Attribution: "Credit: Example &amp; Partner",
  Credit: "Own work",
  LicenseShortName: "CC BY-SA 4.0",
  LicenseUrl: bySa,
  UsageTerms: "Creative Commons Attribution-Share Alike 4.0",
  License: "cc-by-sa-4.0",
  AttributionRequired: "true",
  Copyrighted: "True",
  Restrictions: "",
};
function fixture(changes: Record<string, unknown> = {}, infoChanges = {}, pageChanges = {}) {
  return { query: { pages: [{
    ns: 6, title: `File:${filename}`, imagerepository: "local", ...pageChanges,
    imageinfo: [{ url: original, thumburl: thumbnail, descriptionurl: filePage, mime: "image/jpeg",
      extmetadata: Object.fromEntries(Object.entries({ ...fields, ...changes }).map(([k, v]) => [k, { value: v }])),
      ...infoChanges,
    }],
  }] } };
}
let cases = 0;
function commons(name: string, response: unknown, expected: boolean) {
  const before = JSON.stringify(response);
  const result = commonsPhotoProvenance(filename, response);
  assert.equal(Boolean(result), expected, name);
  assert.equal(JSON.stringify(response), before, `${name}: no mutation`);
  cases++;
  return result;
}
const accepted = commons("exact file and attribution", fixture(), true)!;
assert.equal(accepted.sourceUrl, filePage);
assert.equal(accepted.sourceMediaUrl, thumbnail);
assert.equal(accepted.license, bySa);
assert.equal(accepted.licenseScope, "media");
assert.equal(accepted.credit, "Example & Partner (https://commons.wikimedia.org/wiki/User:Example); Credit: Example & Partner; Own work");
commons("CC0 supported with explicit consistent metadata", fixture({
  LicenseShortName: "CC0", LicenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  UsageTerms: "Creative Commons CC0 1.0 Universal Public Domain Dedication", License: "cc-zero",
  AttributionRequired: "false", Copyrighted: "False",
}), true);
commons("explicit public domain", fixture({
  LicenseShortName: "Public domain", LicenseUrl: "https://creativecommons.org/publicdomain/mark/1.0/",
  UsageTerms: "Public domain", License: "pd", AttributionRequired: "false", Copyrighted: "False",
}), true);
commons("missing rights", fixture({ LicenseUrl: undefined }), false);
commons("hosting is not a license", fixture({ LicenseShortName: "Wikimedia Commons" }), false);
commons("missing creator", fixture({ Artist: "" }), false);
commons("uploader cannot replace unknown creator", fixture({ Artist: "Unknown" }, { user: "ExampleUploader" }), false);
commons("linked unknown creator", fixture({ Artist: '<a href="/wiki/User:Unknown">Unknown</a>' }), false);
commons("conflicting usage terms", fixture({ UsageTerms: "CC BY-NC 4.0" }), false);
commons("additional restrictions", fixture({ Restrictions: "Noncommercial only" }), false);
commons("ND is unsuitable for the derivative pipeline", fixture({ LicenseUrl: "https://creativecommons.org/licenses/by-nd/4.0/" }), false);
commons("conflicting version", fixture({ LicenseShortName: "CC BY-SA 3.0" }), false);
commons("conflicting license slug", fixture({ License: "cc-by-4.0" }), false);
commons("compound grants need review", fixture({ LicenseShortName: "CC BY-SA 4.0 or GFDL" }), false);
commons("license hostname lookalike", fixture({ LicenseUrl: "https://creativecommons.org.evil.example/licenses/by-sa/4.0/" }), false);
commons("unsafe attribution markup", fixture({ Artist: "<script>claimCreator()</script>Example" }), false);
commons("unknown entities require review rather than mutilated credit", fixture({ Artist: "Ren&eacute;" }), false);
commons("unicode numeric entities preserved", fixture({ Artist: "Ren&#233;" }), true);
commons("attribution not silently truncated", fixture({ Attribution: "X".repeat(2100) }), false);
commons("missing file", fixture({}, {}, { missing: true }), false);
commons("different file title", fixture({}, {}, { title: "File:Other.jpg" }), false);
commons("different original filename", fixture({}, { url: original.replace("Example_bird", "Other") }), false);
commons("different thumbnail", fixture({}, { thumburl: thumbnail.replaceAll("Example_bird", "Other") }), false);

commons("official Commons thumbnail host", fixture({}, { thumburl: thumbnail.replace("upload.wikimedia.org", "thumb.wikimedia.org") }), true);
commons("thumbnail hostname lookalike", fixture({}, { thumburl: thumbnail.replace("upload.wikimedia.org", "thumb.wikimedia.org.evil.example") }), false);
commons("different file on official thumbnail host", fixture({}, { thumburl: thumbnail.replace("upload.wikimedia.org", "thumb.wikimedia.org").replaceAll("Example_bird", "Other") }), false);
commons("different file page", fixture({}, { descriptionurl: filePage.replace("Example_bird", "Other") }), false);
commons("non-image MIME", fixture({}, { mime: "application/pdf" }), false);
commons("failed metadata request", null, false);
commons("missing metadata", fixture({}, { extmetadata: {} }), false);
commons("hidden file", fixture({}, { filehidden: true }), false);
commons("exact original when thumbnail absent", fixture({}, { thumburl: undefined }), true);

const photo = { id: 608698453, attribution: "(c) Mark Richman, some rights reserved (CC BY)", license_code: "cc-by",
  large_url: "https://inaturalist-open-data.s3.amazonaws.com/photos/608698453/large.jpg" };
function inat(name: string, value: unknown, expected: boolean) {
  const result = inaturalistPhotoProvenance(value);
  assert.equal(Boolean(result), expected, name);
  cases++;
  return result;
}
const inatAccepted = inat("exact iNaturalist photo", photo, true)!;
assert.equal(inatAccepted.sourceUrl, "https://www.inaturalist.org/photos/608698453");
assert.equal(inatAccepted.sourceMediaUrl, photo.large_url);
assert.equal(inatAccepted.credit, photo.attribution);
assert.equal(inatAccepted.licenseScope, "media");
inat("missing photo ID", { ...photo, id: undefined }, false);
inat("taxon ID cannot fill missing default_photo", undefined, false);
inat("non-integer photo ID", { ...photo, id: 1.5 }, false);
inat("different photo ID in media URL", { ...photo, id: 999 }, false);
inat("missing attribution", { ...photo, attribution: "" }, false);
inat("unlicensed photo", { ...photo, license_code: undefined }, false);
inat("NC photo", { ...photo, license_code: "cc-by-nc" }, false);
inat("ND photo", { ...photo, license_code: "cc-by-nd" }, false);
inat("exact square URL stays exact", { ...photo, large_url: undefined, url: photo.large_url.replace("large", "square") }, true);
inat("insecure media URL", { ...photo, large_url: photo.large_url.replace("https:", "http:") }, false);
console.log(`Photo import provenance: ${cases} offline cases passed; importer was not loaded or executed.`);
