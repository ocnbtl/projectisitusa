import fs from "node:fs";

// Search needs labels and misapplication flags, not every citation and explanation.
// The complete sourced names remain available to the server-rendered profiles.
const records = JSON.parse(fs.readFileSync("src/content/species-names.json", "utf8"));
const index = Object.fromEntries(Object.entries(records).map(([id, record]) => [
  id, record.names.map(name => name.kind === "misapplied" ? [name.name, 1] : name.name),
]));
const file = "src/content/species-name-search.json";
const content = JSON.stringify(index) + "\n";
if (process.argv.includes("--check")) {
  if (fs.readFileSync(file, "utf8") !== content) throw new Error("Species name search index is stale");
} else fs.writeFileSync(file, content);
console.log(`Species name search: ${Object.keys(index).length} entries, ${Buffer.byteLength(content)} bytes; ${process.argv.includes("--check") ? "verified" : "prepared"}.`);
