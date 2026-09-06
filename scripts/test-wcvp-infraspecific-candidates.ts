import assert from "node:assert/strict";
import { createWcvpCandidateResolver, type WcvpName } from "./research/wcvp-infraspecific-candidates";
const row = (id: string, name: string, rank = "Species", author = "L.", rest: Partial<WcvpName> = {}): WcvpName => ({ plant_name_id: id, taxon_name: name, taxon_rank: rank, taxon_authors: author, taxon_status: "Accepted", accepted_plant_name_id: id, parent_plant_name_id: "", genus_hybrid: "", species_hybrid: "", hybrid_formula: "", ...rest } as WcvpName);
const source = (genus: string, species: string, infra: string, name: string, rank = "subspecies") => ({ genus, specificEpithet: species, infraspecificEpithet: infra, scientificName: name, taxonRank: rank });
const catalog = [{ id: "hordeum-marinum", scientificName: "Hordeum marinum" }, { id: "medicago-sativa", scientificName: "Medicago sativa" }, { id: "nelumbo-nucifera", scientificName: "Nelumbo nucifera" }];
const rows = [row("1", "Hordeum marinum", "Species", "Huds."), row("2", "Hordeum marinum subsp. gussoneanum", "Subspecies", "(Parl.) Thell.", { parent_plant_name_id: "1" }), row("3", "Medicago sativa"), row("4", "Nelumbo nucifera", "Species", "Gaertn."), row("5", "Nelumbo lutea", "Species", "Willd."), row("6", "Nelumbo nucifera subsp. lutea", "Subspecies", "(Willd.) Borsch & Barthlott", { taxon_status: "Synonym", accepted_plant_name_id: "5" })];
const resolve = createWcvpCandidateResolver(rows, catalog);
const good = source("Hordeum", "marinum", "gussoneanum", "Hordeum marinum subsp. gussoneanum (Parl.) Thell.");
const answer = resolve(good); assert.equal(answer.status, "mapped-candidate"); if (answer.status === "mapped-candidate") { assert.equal(answer.speciesId, "hordeum-marinum"); assert.deepEqual(answer.referenceIds, ["1", "2"]); }
for (const name of ["Medicago sativa var. sativa", "Medicago sativa L. var. sativa"]) { const r = resolve(source("Medicago", "sativa", "sativa", name, "variety")); assert.equal(r.status, "mapped-candidate"); if (r.status === "mapped-candidate") assert.equal(r.route, "explicit-source-autonym-parent"); }
for (const change of [{ scientificName: "Hordeum marinum subsp. gussoneanum (Parl.) Wrong" }, { identificationQualifier: "cf." }, { taxonRank: "variety" }, { specificEpithet: "murinum" }, { cultivarEpithet: "Garden" }, { taxonomicStatus: "misapplied" }]) assert.equal(resolve({ ...good, ...change }).status, "held");
assert.equal(resolve(source("Medicago", "sativa", "sativa", "Medicago sativa Wrong var. sativa", "variety")).status, "held");
assert.equal(resolve(source("Medicago", "sativa", "sativa", "Medicago sativa var. sativa L.", "variety")).status, "held");
assert.deepEqual(resolve(source("Nelumbo", "nucifera", "lutea", "Nelumbo nucifera subsp. lutea (Willd.) Borsch & Barthlott")), { status: "held", reason: "accepted-concept-outside-resolved-catalog" });
const lutea = createWcvpCandidateResolver(rows, [...catalog, { id: "nelumbo-lutea", scientificName: "Nelumbo lutea" }])(source("Nelumbo", "nucifera", "lutea", "Nelumbo nucifera subsp. lutea (Willd.) Borsch & Barthlott")); assert.equal(lutea.status, "mapped-candidate"); if (lutea.status === "mapped-candidate") assert.equal(lutea.speciesId, "nelumbo-lutea");
assert.throws(() => createWcvpCandidateResolver([...rows, rows[0]!], catalog), /duplicated/u);
const missing = createWcvpCandidateResolver(rows.map(r => r.plant_name_id === "2" ? { ...r, parent_plant_name_id: "missing" } : r), catalog); assert.throws(() => missing(good), /Missing WCVP parent/u);
const cycle = createWcvpCandidateResolver(rows.map(r => r.plant_name_id === "2" ? { ...r, parent_plant_name_id: "2" } : r), catalog); assert.throws(() => cycle(good), /Cyclic/u);
const misapplied = createWcvpCandidateResolver(rows.map(r => r.plant_name_id === "2" ? { ...r, taxon_status: "Misapplied" } : r), catalog); assert.equal(misapplied(good).status, "held");
const hybrid = createWcvpCandidateResolver(rows.map(r => r.plant_name_id === "2" ? { ...r, species_hybrid: "×" } : r), catalog); assert.equal(hybrid(good).status, "held");
const ambiguous = createWcvpCandidateResolver(rows, [...catalog, { id: "another-id", scientificName: "Hordeum marinum" }]); assert.deepEqual(ambiguous(good), { status: "held", reason: "multiple-catalog-targets-for-concept" });
// A catalog species may resolve to one narrow subspecies of a broader accepted species.
// Shared species ancestry does not make sibling subspecies interchangeable.
const sorghumRows = [row("s", "Sorghum bicolor", "Species", "(L.) Moench"), row("b", "Sorghum bicolor subsp. bicolor", "Subspecies", "", { parent_plant_name_id: "s" }), row("v", "Sorghum bicolor subsp. verticilliflorum", "Subspecies", "Author", { parent_plant_name_id: "s" }), row("a", "Sorghum arundinaceum", "Species", "(Desv.) Stapf", { taxon_status: "Synonym", accepted_plant_name_id: "v" })];
const siblingSource = source("Sorghum", "bicolor", "bicolor", "Sorghum bicolor subsp. bicolor");
const narrowCatalog = [{ id: "sorghum-arundinaceum", scientificName: "Sorghum arundinaceum" }];
assert.equal(createWcvpCandidateResolver(sorghumRows, narrowCatalog)(siblingSource).status, "held");
const broadAndNarrow = createWcvpCandidateResolver(sorghumRows, [...narrowCatalog, { id: "sorghum-bicolor", scientificName: "Sorghum bicolor" }])(siblingSource);
assert.equal(broadAndNarrow.status, "mapped-candidate"); if (broadAndNarrow.status === "mapped-candidate") assert.equal(broadAndNarrow.speciesId, "sorghum-bicolor");
console.log("WCVP candidate mapping: exact authorship and rank, explicit autonym parent, changed accepted species, outside catalog, qualifiers/cultivars, unknown author, missing/cyclic links, misapplied/hybrid concepts and duplicate catalog concepts passed. Diagnostic only; no source admission.");
