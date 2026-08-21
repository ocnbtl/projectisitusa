import assert from "node:assert/strict";

import { auditGbifNationalMarginalYield } from "./research/audit-national-gbif-marginal-yield";

async function main() {
  const audit = await auditGbifNationalMarginalYield();

  assert.deepEqual(
  audit.rounds.map((entry) => ({
    round: entry.round,
    selectedTaxa: entry.selectedTaxa,
    selectedPairs: entry.selectedPairs,
    presentPairs: entry.presentPairs,
    researchedUnresolvedPairs: entry.researchedUnresolvedPairs,
    marginalYieldPercent: entry.marginalYieldPercent,
    providerRows: entry.providerRows,
  })),
  [
    { round: 70, selectedTaxa: 13, selectedPairs: 25_406, presentPairs: 1_147, researchedUnresolvedPairs: 24_259, marginalYieldPercent: 4.515, providerRows: 30_994 },
    { round: 72, selectedTaxa: 9, selectedPairs: 27_223, presentPairs: 1_420, researchedUnresolvedPairs: 25_803, marginalYieldPercent: 5.216, providerRows: 11_002 },
    { round: 74, selectedTaxa: 9, selectedPairs: 26_424, presentPairs: 726, researchedUnresolvedPairs: 25_698, marginalYieldPercent: 2.748, providerRows: 4_986 },
    { round: 75, selectedTaxa: 9, selectedPairs: 25_048, presentPairs: 2_572, researchedUnresolvedPairs: 22_476, marginalYieldPercent: 10.268, providerRows: 16_077 },
    { round: 76, selectedTaxa: 10, selectedPairs: 26_031, presentPairs: 918, researchedUnresolvedPairs: 25_113, marginalYieldPercent: 3.527, providerRows: 13_770 },
    { round: 77, selectedTaxa: 8, selectedPairs: 25_152, presentPairs: 25, researchedUnresolvedPairs: 25_127, marginalYieldPercent: 0.099, providerRows: 381 },
    { round: 78, selectedTaxa: 8, selectedPairs: 25_152, presentPairs: 197, researchedUnresolvedPairs: 24_955, marginalYieldPercent: 0.783, providerRows: 1_638 },
    { round: 79, selectedTaxa: 8, selectedPairs: 25_152, presentPairs: 30, researchedUnresolvedPairs: 25_122, marginalYieldPercent: 0.119, providerRows: 433 },
  ],
  );

  const round77 = audit.rounds.find((entry) => entry.round === 77);
  assert(round77);
  assert.deepEqual(
  {
    providerRows: round77.providerRows,
    geographyRejectedRows: round77.geographyRejectedRows,
    selectedScopeRows: round77.selectedScopeRows,
    selectedRejectedArchiveRows: round77.selectedRejectedArchiveRows,
    selectedAcceptedArchiveRows: round77.selectedAcceptedArchiveRows,
    representativeRejectionGroups: round77.representativeRejectionGroups,
    rejectionReasonRows: round77.rejectionReasonRows,
  },
  {
    providerRows: 381,
    geographyRejectedRows: 272,
    selectedScopeRows: 109,
    selectedRejectedArchiveRows: 32,
    selectedAcceptedArchiveRows: 77,
    representativeRejectionGroups: 20,
    rejectionReasonRows: { "cultivated-or-captive": 32, "geography-ambiguous": 3 },
  },
  );
  assert.deepEqual(
  round77.perTaxon.map((taxon) => [taxon.speciesId, taxon.acceptedPairs]),
  [
    ["abies-alba", 6],
    ["abutilon-hirtum", 2],
    ["acacia-elata", 3],
    ["acacia-podalyriifolia", 5],
    ["acaena-magellanica", 0],
    ["acanthogobius-flavimanus", 9],
    ["acanthomysis-aspera", 0],
    ["acarapis-woodi", 0],
  ],
  );
  assert.equal(round77.presentPairs, 25);
  assert.equal(round77.researchedUnresolvedPairs, 25_127);
  assert(Object.values(round77.checks).every(Boolean));

  const round78 = audit.rounds.find((entry) => entry.round === 78);
  assert(round78);
  assert.deepEqual(
    {
      integrationPath: round78.integrationPath,
      providerRows: round78.providerRows,
      geographyRejectedRows: round78.geographyRejectedRows,
      selectedScopeRows: round78.selectedScopeRows,
      selectedRejectedArchiveRows: round78.selectedRejectedArchiveRows,
      selectedAcceptedArchiveRows: round78.selectedAcceptedArchiveRows,
      duplicateAcceptedArchiveRows: round78.duplicateAcceptedArchiveRows,
      representativeRejectionGroups: round78.representativeRejectionGroups,
    },
    {
      integrationPath: null,
      providerRows: 1_638,
      geographyRejectedRows: 1_117,
      selectedScopeRows: 521,
      selectedRejectedArchiveRows: 81,
      selectedAcceptedArchiveRows: 440,
      duplicateAcceptedArchiveRows: 243,
      representativeRejectionGroups: 43,
    },
  );
  assert.deepEqual(
    round78.perTaxon.map((taxon) => [taxon.speciesId, taxon.selectionLane, taxon.acceptedPairs]),
    [
      ["aceria-kuko", "exploration", 0],
      ["aclerda-takahashii", "exploitation", 0],
      ["acleris-comariana", "exploitation", 1],
      ["acyrthosiphon-kondoi", "exploitation", 2],
      ["aegilops-tauschii", "exploitation", 5],
      ["agrostis-castellana", "exploitation", 21],
      ["aleurites-moluccanus", "exploitation", 11],
      ["allium-sativum", "exploitation", 157],
    ],
  );
  assert.deepEqual(round78.lanes, [
    { selectionLane: "exploitation", selectedTaxa: 7, selectedPairs: 22_008, presentPairs: 197, researchedUnresolvedPairs: 21_811, marginalYieldPercent: 0.895 },
    { selectionLane: "exploration", selectedTaxa: 1, selectedPairs: 3_144, presentPairs: 0, researchedUnresolvedPairs: 3_144, marginalYieldPercent: 0 },
  ]);
  assert(Object.values(round78.checks).every(Boolean));

  const round79 = audit.rounds.find((entry) => entry.round === 79);
  assert(round79);
  assert.deepEqual(
    {
      integrationPath: round79.integrationPath,
      providerRows: round79.providerRows,
      geographyRejectedRows: round79.geographyRejectedRows,
      selectedScopeRows: round79.selectedScopeRows,
      selectedRejectedArchiveRows: round79.selectedRejectedArchiveRows,
      selectedAcceptedArchiveRows: round79.selectedAcceptedArchiveRows,
      duplicateAcceptedArchiveRows: round79.duplicateAcceptedArchiveRows,
      representativeRejectionGroups: round79.representativeRejectionGroups,
      rejectionReasonRows: round79.rejectionReasonRows,
    },
    {
      integrationPath: null,
      providerRows: 433,
      geographyRejectedRows: 350,
      selectedScopeRows: 83,
      selectedRejectedArchiveRows: 38,
      selectedAcceptedArchiveRows: 45,
      duplicateAcceptedArchiveRows: 15,
      representativeRejectionGroups: 35,
      rejectionReasonRows: { "cultivated-or-captive": 37, "geography-ambiguous": 21, "source-contradiction": 1 },
    },
  );
  assert.deepEqual(
    round79.perTaxon.map((taxon) => [taxon.speciesId, taxon.selectionLane, taxon.acceptedPairs]),
    [
      ["aceria-litchii", "exploration", 0],
      ["adiantum-macrophyllum", "exploitation", 1],
      ["agdestis-clematidea", "exploitation", 8],
      ["aglaonema-commutatum", "exploitation", 1],
      ["alpinia-zerumbet", "exploitation", 6],
      ["alternanthera-brasiliana", "exploitation", 6],
      ["alternanthera-ficoidea", "exploitation", 6],
      ["alyssum-strigosum", "exploitation", 2],
    ],
  );
  assert.deepEqual(round79.lanes, [
    { selectionLane: "exploitation", selectedTaxa: 7, selectedPairs: 22_008, presentPairs: 30, researchedUnresolvedPairs: 21_978, marginalYieldPercent: 0.136 },
    { selectionLane: "exploration", selectedTaxa: 1, selectedPairs: 3_144, presentPairs: 0, researchedUnresolvedPairs: 3_144, marginalYieldPercent: 0 },
  ]);
  assert(Object.values(round79.checks).every(Boolean));
  assert.deepEqual(audit.aggregate, {
    auditedRounds: 8,
    selectedTaxa: 74,
    selectedPairs: 205_588,
    presentPairs: 7_035,
    researchedUnresolvedPairs: 198_553,
    providerRows: 79_281,
  });

  process.stdout.write("National GBIF marginal-yield audit passed for Rounds 70, 72, and 74-79.\n");
}

void main();
