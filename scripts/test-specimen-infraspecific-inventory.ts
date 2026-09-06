import assert from "node:assert/strict";
import { specimenInfraspecificCandidate } from "./research/specimen-infraspecific-inventory";
const botanical = { genus: "Quercus", specificEpithet: "agrifolia", infraspecificEpithet: "oxyadenia", taxonRank: "var.", scientificName: "Quercus agrifolia var. oxyadenia (Torr.) J.T. Howell" };
assert.deepEqual(specimenInfraspecificCandidate(botanical), { status: "candidate", parentBinomial: "quercus agrifolia", rank: "variety", infraspecificEpithet: "oxyadenia" });
assert.equal(specimenInfraspecificCandidate({ ...botanical, scientificName: "Quercus agrifolia Nee var. oxyadenia (Torr.) J.T. Howell" }).status, "candidate");
assert.equal(specimenInfraspecificCandidate({ genus: "Puma", specificEpithet: "concolor", infraspecificEpithet: "concolor", taxonRank: "subspecies", scientificName: "Puma concolor concolor" }).status, "candidate");
assert.equal(specimenInfraspecificCandidate({ ...botanical, infraspecificEpithet: "minor", taxonRank: "forma", scientificName: "Quercus agrifolia f. minor" }).status, "candidate");
for (const changed of [
  { taxonRank: "constructor", scientificName: "Quercus agrifolia f. oxyadenia" },
  { taxonRank: "species" }, { taxonRank: "cultivar" }, { taxonRank: "nothosubspecies" }, { identificationQualifier: "cf." },
  { scientificName: "Quercus agrifolia cf. var. oxyadenia" }, { scientificName: "Quercus agrifolia x var. oxyadenia" },
  { scientificName: "Quercus agrifolia var. wrong" }, { scientificName: "Quercus agrifolia" },
  { scientificName: "Quercus agrifolia subsp. oxyadenia" }, { scientificName: "Another species var. oxyadenia" },
  { genus: "Othergenus" }, { specificEpithet: "other" }, { infraspecificEpithet: "" },
  { genericName: "Othergenus" }, { acceptedNameUsage: "Quercus other var. oxyadenia" },
  { taxonomicStatus: "misapplied" }, { taxonomicStatus: "synonym" }, { cultivarEpithet: "Garden variety" },
]) assert.equal(specimenInfraspecificCandidate({ ...botanical, ...changed }).status, "held", JSON.stringify(changed));
console.log("Infraspecific inventory: explicit rank and matching source parent, trinomial/form examples, qualifiers, hybrids, cultivar and parent/name conflicts passed. No acceptance method activated.");
