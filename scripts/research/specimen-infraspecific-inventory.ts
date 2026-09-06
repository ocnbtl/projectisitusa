/** Inventory candidates only. This is not an accepted source adapter or a synonym resolver. */
export function specimenInfraspecificCandidate(row: Record<string, string | undefined>):
  | { status: "candidate"; parentBinomial: string; rank: string; infraspecificEpithet: string }
  | { status: "held"; reason: string } {
  const normalize = (value: string | undefined) => (value ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
  const rankAliases: Record<string, string> = { subspecies: "subspecies", subsp: "subspecies", "subsp.": "subspecies", ssp: "subspecies", "ssp.": "subspecies",
    variety: "variety", varietas: "variety", var: "variety", "var.": "variety", form: "form", forma: "form", f: "form", "f.": "form" };
  const sourceRank = normalize(row.taxonRank);
  const rank = Object.hasOwn(rankAliases, sourceRank) ? rankAliases[sourceRank] : null;
  if (!rank) return { status: "held", reason: "not-declared-supported-infraspecific-rank" };
  if (normalize(row.identificationQualifier)) return { status: "held", reason: "identification-qualifier" };
  const genus = normalize(row.genus), specific = normalize(row.specificEpithet), infra = normalize(row.infraspecificEpithet);
  const scientific = normalize(row.scientificName);
  if (![genus, specific, infra].every((part) => /^[a-z][a-z-]+$/u.test(part))) return { status: "held", reason: "missing-or-complex-name-components" };
  const parentBinomial = genus + " " + specific;
  if (!scientific.startsWith(parentBinomial + " ") || (normalize(row.genericName) && normalize(row.genericName) !== genus)) {
    return { status: "held", reason: "full-name-and-classification-parent-disagree" };
  }
  if (/[\u00d7?]/u.test(scientific) || /(?:^|\s)(?:x|cf\.?|aff\.?|nr\.?)(?:\s|$)/u.test(scientific) || normalize(row.cultivarEpithet)) {
    return { status: "held", reason: "hybrid-qualified-or-cultivar-name" };
  }
  const status = normalize(row.taxonomicStatus);
  if (status && !["accepted", "valid"].includes(status)) return { status: "held", reason: "taxonomic-status-needs-review" };
  const accepted = normalize(row.acceptedNameUsage);
  if (accepted && accepted !== parentBinomial && !accepted.startsWith(parentBinomial + " ")) return { status: "held", reason: "accepted-name-parent-disagrees" };
  const marker = rank === "subspecies" ? "(?:subsp\\.?|ssp\\.?|subspecies)" : rank === "variety" ? "(?:var\\.?|varietas|variety)" : "(?:f\\.?|forma|form)";
  const tail = scientific.slice(parentBinomial.length + 1);
  const marked = new RegExp("(?:^|\\s)" + marker + "\\s+" + infra + "(?:\\s|$)", "u").test(tail);
  const trinomial = rank === "subspecies" && (tail === infra || tail.startsWith(infra + " "));
  if (!marked && !trinomial) return { status: "held", reason: "full-name-rank-or-infraspecific-epithet-disagrees" };
  return { status: "candidate", parentBinomial, rank, infraspecificEpithet: infra };
}
