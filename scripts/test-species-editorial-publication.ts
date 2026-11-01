import assert from "node:assert/strict";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { getSpeciesNames, matchedSpeciesName, speciesNameMatches, speciesStructuredData } from "../src/lib/data/species-names";

const read = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const catalog = read("src/content/editorial-queue.json");
const revisions = read("src/content/species-editorial-revisions.json");
const summaries = read("src/content/editorial-published.json");
const profiles = read("src/content/species-profile-published.json");
const publication = read("src/content/species-publication.json");
const searchIndex = read("src/content/species-name-search.json");
const byId = new Map(revisions.map((row: any) => [row.speciesId, row]));
assert.equal(catalog.length, 2504);
assert.equal(Object.keys(profiles).length, catalog.length);
assert.equal(Object.keys(summaries).length, catalog.length);
let aliases = 0;
for (const species of catalog) {
  const revision: any = byId.get(species.id);
  const profile = profiles[species.id];
  assert.equal(summaries[species.id].summary, revision.proposedDescription);
  assert.deepEqual(Object.keys(summaries[species.id]).sort(), ["reviewedAt", "summary"]);
  assert.deepEqual(Object.keys(profile).sort(), ["actions", "evidenceStatus", "identification", "sources"]);
  for (const field of ["identification", "actions"]) {
    assert.deepEqual(profile[field], revision[field].trim().split(/\n\s*\n/).map((part: string) => part.trim()).filter(Boolean));
  }
  assert.equal(profile.evidenceStatus, revision.status === "research_gap" ? "limited" : "documented");
  assert.ok(profile.sources.length > 0);
  assert.deepEqual(profile.sources, [...new Map(revision.sources.map((source: any) => [source.url, { label: source.title, url: source.url }])).values()]);
  const names = getSpeciesNames(species.id);
  assert.deepEqual(searchIndex[species.id] ?? [], names.names.map(name => name.kind === "misapplied" ? [name.name, 1] : name.name), `${species.id}: exact search-index parity`);
  const structured = speciesStructuredData({ ...species, slug: species.id });
  for (const name of names.names) {
    assert.ok(speciesNameMatches(species, name.name), `${species.id}: search misses ${name.name}`);
    assert.ok(speciesNameMatches(species, name.name.toLocaleUpperCase("en-US")), `${species.id}: case-sensitive alias`);
    if (name.kind !== "common") {
      assert.ok(name.explanation?.trim(), `${species.id}: missing name qualification`);
      assert.ok(!structured.alternateName.includes(name.name), `${species.id}: qualified name asserted as an alias`);
    }
    if (name.sourceUrl) assert.ok(/^https?:\/\//.test(name.sourceUrl));
    aliases += 1;
  }
  assert.ok(!("sameAs" in structured));
  if (names.warning) assert.equal(structured.disambiguatingDescription, names.warning);
}
assert.equal(publication.profiles, catalog.length);
const snakehead = catalog.find((species: any) => species.id === "channa-aurolineata");
const snakeheadNames = getSpeciesNames(snakehead.id).names;
assert.equal(snakeheadNames.find(name => name.name === "Channa marulius")?.kind, "misapplied");
assert.equal(matchedSpeciesName(snakehead, "Channa marulius"), "Name clarification: Channa marulius");
assert.ok(!snakeheadNames.some(name => name.name === "Channa pseudomarulius"));
assert.ok(!getSpeciesNames("xanthomonas-citri").names.some(name => name.name === "Xanthomonas cissicola"));
for (const id of ["channa-aurolineata", "xanthomonas-citri"]) {
  assert.ok(getSpeciesNames(id).sources.every(source => !source.url.startsWith("https://www.gbif.org/species/")), `${id}: rejected taxonomy references retained`);
}
assert.equal(publication.qualifiedProfiles, revisions.filter((row: any) => row.status === "research_gap").length);
const timing = performance.now();
for (const query of ["japanese knotweed", "launaea", "sandalwood", "running myrtle", "psyllid"]) {
  for (const species of catalog) {
    if (speciesNameMatches(species, query)) matchedSpeciesName(species, query);
  }
}
console.log(JSON.stringify({ profiles: catalog.length, searchableAliases: aliases, qualifiedProfiles: publication.qualifiedProfiles, fiveDirectorySearchesMs: Math.round(performance.now() - timing), result: "passed" }));
