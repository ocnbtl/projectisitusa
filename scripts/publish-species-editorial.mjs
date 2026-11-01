import fs from "node:fs";
import crypto from "node:crypto";

// Explicit publication step, never part of a build or an automatic draft sync.
// The owner authorized this complete edition on 2026-11-01.
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const revisions = read("src/content/species-editorial-revisions.json");
const catalog = read("src/content/editorial-queue.json");
const byId = new Map(revisions.map(row => [row.speciesId, row]));
if (byId.size !== revisions.length || catalog.length !== revisions.length) throw new Error("Publication/catalog counts differ");
const summaries = {}, profiles = {};
const paragraphs = value => value.trim().split(/\n\s*\n/).map(part => part.trim()).filter(Boolean);
for (const item of catalog) {
  const row = byId.get(item.id);
  if (!row || row.researchDepth !== "full_profile" || !row.proposedDescription?.trim() || !row.identification?.trim() || !row.actions?.trim() || !row.sources?.length) throw new Error(`Incomplete profile: ${item.id}`);
  if (!["ready_for_review", "research_gap"].includes(row.status)) throw new Error(`Unreviewed publication status: ${item.id}`);
  const sources = [...new Map(row.sources.map(source => {
    const url = new URL(source.url);
    if (!["https:", "http:"].includes(url.protocol) || !source.title.trim()) throw new Error(`Invalid citation: ${item.id}`);
    return [source.url, { label: source.title, url: source.url }];
  })).values()];
  summaries[item.id] = { summary: row.proposedDescription, reviewedAt: row.revisedAt };
  profiles[item.id] = { identification: paragraphs(row.identification), actions: paragraphs(row.actions), sources, evidenceStatus: row.status === "research_gap" ? "limited" : "documented" };
}
const outputs = {
  "src/content/editorial-published.json": summaries,
  "src/content/species-profile-published.json": profiles,
  "src/content/species-publication.json": {
    publishedAt: "2026-11-01",
    profiles: catalog.length,
    qualifiedProfiles: revisions.filter(row => row.status === "research_gap").length,
    revisionSha256: crypto.createHash("sha256").update(fs.readFileSync("src/content/species-editorial-revisions.json")).digest("hex"),
  },
};
const check = process.argv.includes("--check");
for (const [file, value] of Object.entries(outputs)) {
  const content = JSON.stringify(value) + "\n";
  if (check) { if (fs.readFileSync(file, "utf8") !== content) throw new Error(`Publication is stale: ${file}`); }
  else fs.writeFileSync(file, content);
}
console.log(`${check ? "Verified" : "Prepared"} ${catalog.length} public profiles; ${outputs["src/content/species-publication.json"].qualifiedProfiles} retain documented evidence limits.`);
