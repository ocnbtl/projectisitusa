import { specimenInfraspecificCandidate } from "./specimen-infraspecific-inventory";

export const WCVP_CANDIDATE_METHOD = "wcvp-infraspecific-concept-candidate-v1";
export type WcvpName = Record<string, string>;
export type WcvpCandidateResolution =
  | { status: "mapped-candidate"; methodId: typeof WCVP_CANDIDATE_METHOD; speciesId: string; catalogScientificName: string;
      sourceScientificName: string; acceptedSpeciesId: string; acceptedTaxonId: string; catalogTaxonId: string; referenceIds: string[]; route: "exact-authoritative-name" | "explicit-source-autonym-parent" }
  | { status: "held"; reason: string };
const normalize = (text: string | undefined) => (text ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
const nameStatuses = new Set(["Accepted", "Synonym", "Orthographic", "Illegitimate", "Invalid"]);
const infraRanks = new Set(["Subspecies", "Variety", "Form", "Subvariety", "Subform"]);

/** Diagnostic taxonomy mapping only. Source-run acceptance separately verifies the reference bytes and specimen context. */
export function createWcvpCandidateResolver(rows: WcvpName[], catalog: Array<{ id: string; scientificName: string }>) {
  const byId = new Map<string, WcvpName>(); const byName = new Map<string, WcvpName[]>();
  for (const row of rows) {
    if (!row.plant_name_id || byId.has(row.plant_name_id)) throw new Error("WCVP IDs are missing or duplicated.");
    byId.set(row.plant_name_id, row); const key = normalize(row.taxon_name);
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  function speciesConcept(start: WcvpName) {
    const chain: string[] = []; const ancestorIds: string[] = []; let current = start;
    for (let depth = 0; depth < 12; depth++) {
      if (chain.includes(current.plant_name_id)) throw new Error("Cyclic WCVP concept path.");
      chain.push(current.plant_name_id);
      if (!nameStatuses.has(current.taxon_status) || current.genus_hybrid || current.species_hybrid || current.hybrid_formula) return null;
      if (current.taxon_status !== "Accepted") {
        if (!current.accepted_plant_name_id) return null;
        const accepted = byId.get(current.accepted_plant_name_id);
        if (!accepted) throw new Error("Missing WCVP accepted-name reference.");
        current = accepted; continue;
      }
      if (current.accepted_plant_name_id !== current.plant_name_id) throw new Error("Accepted WCVP row does not identify itself.");
      ancestorIds.push(current.plant_name_id);
      if (current.taxon_rank === "Species") return { id: current.plant_name_id, acceptedId: ancestorIds[0]!, ancestorIds, chain };
      if (!infraRanks.has(current.taxon_rank)) return null;
      const parent = byId.get(current.parent_plant_name_id);
      if (!parent) throw new Error("Missing WCVP parent reference.");
      if (parent.taxon_status !== "Accepted") throw new Error("Accepted infraspecific parent is not accepted.");
      current = parent;
    }
    throw new Error("Excessive WCVP concept depth.");
  }
  const catalogConcepts = new Map<string, Array<{ id: string; scientificName: string; acceptedId: string; referenceIds: string[] }>>();
  for (const item of catalog) {
    const matches = byName.get(normalize(item.scientificName)) ?? [];
    const concepts = matches.map(row => speciesConcept(row)).filter(x => x !== null);
    if (!concepts.length || concepts.length !== matches.length || new Set(concepts.map(x => x.acceptedId)).size !== 1) continue;
    const concept = concepts[0]!;
    catalogConcepts.set(concept.id, [...(catalogConcepts.get(concept.id) ?? []), { ...item, acceptedId: concept.acceptedId, referenceIds: [...new Set(concepts.flatMap(x => x.chain))] }]);
  }
  return (source: Record<string, string | undefined>): WcvpCandidateResolution => {
    const structure = specimenInfraspecificCandidate(source);
    if (structure.status === "held") return structure;
    const canonicalRank = structure.rank === "subspecies" ? "subsp." : structure.rank === "variety" ? "var." : "f.";
    const canonical = structure.parentBinomial + " " + canonicalRank + " " + structure.infraspecificEpithet;
    const full = normalize(source.scientificName);
    const names = byName.get(canonical) ?? [];
    const exact = names.filter(row => normalize(row.taxon_name + " " + row.taxon_authors) === full);
    let witnesses = exact; let route: "exact-authoritative-name" | "explicit-source-autonym-parent" = "exact-authoritative-name";
    if (!witnesses.length && structure.infraspecificEpithet === normalize(source.specificEpithet)) {
      // An explicit source autonym identifies the source species' type-bearing subdivision.
      // Resolve only that parent species concept; do not claim Kew accepts this infraspecific name or rank.
      // Madrid Code Art. 26 defines the repeated epithet and omission of an author after it.
      const marker = structure.rank === "subspecies" ? "(?:subsp\\.?|ssp\\.?|subspecies)" : structure.rank === "variety" ? "(?:var\\.?|varietas|variety)" : "(?:f\\.?|forma|form)";
      const suffix = new RegExp("\\s+" + marker + "\\s+" + structure.infraspecificEpithet + "$", "u");
      if (!suffix.test(full)) return { status: "held", reason: "autonym-has-unverified-author-or-tail" };
      const prefix = full.replace(suffix, "");
      const parentRows = (byName.get(structure.parentBinomial) ?? []).filter(row => row.taxon_rank === "Species");
      witnesses = parentRows.filter(row => prefix === normalize(row.taxon_name) || prefix === normalize(row.taxon_name + " " + row.taxon_authors));
      route = "explicit-source-autonym-parent";
    }
    if (!witnesses.length) return { status: "held", reason: "no-exact-authoritative-name-or-supported-autonym-parent" };
    const concepts = witnesses.map(row => speciesConcept(row));
    if (concepts.some(x => x === null)) return { status: "held", reason: "unresolved-or-hybrid-reference-concept" };
    const valid = concepts.filter(x => x !== null);
    if (new Set(valid.map(x => x.acceptedId)).size !== 1) return { status: "held", reason: "ambiguous-source-concept" };
    const concept = valid[0]!; const targets = (catalogConcepts.get(concept.id) ?? []).filter(target => valid.every(sourceConcept => sourceConcept.ancestorIds.includes(target.acceptedId)));
    if (targets.length !== 1) return { status: "held", reason: targets.length ? "multiple-catalog-targets-for-concept" : "accepted-concept-outside-resolved-catalog" };
    const target = targets[0]!;
    return { status: "mapped-candidate", methodId: WCVP_CANDIDATE_METHOD, speciesId: target.id, catalogScientificName: target.scientificName,
      sourceScientificName: source.scientificName!, acceptedSpeciesId: concept.id, acceptedTaxonId: concept.acceptedId, catalogTaxonId: target.acceptedId, referenceIds: [...new Set([...valid.flatMap(x => x.chain), ...target.referenceIds])].sort(), route };
  };
}
