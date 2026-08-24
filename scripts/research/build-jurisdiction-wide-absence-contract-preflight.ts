import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EVALUATION_ID = "post-usfws-jurisdiction-wide-absence-contract-preflight-20260824-r1";
const EVALUATED_AT = "2026-08-24T18:45:00.000Z";
const BASELINE_SHA = "4d981e9f970b7d2864ba505404765d5b7b0e4e4c";
const OUTPUT_PATH = `ops/national-research/evaluations/${EVALUATION_ID}.json`;
const INPUT_ROOT = "ops/national-research/inputs/jurisdiction-wide-absence-contract-preflight-20260824-r1/sources";
const NATIONAL_FIPS_SHA256 = "e637d99538d4e253df2320f0a660e6bfca6d674d50c215f907fa1a67e287e333";
const NEW_JERSEY_FIPS = ["34017", "34023", "34039"] as const;
const NEW_JERSEY_FIPS_SHA256 = "e4d94d261487f00a7cae06b83b7635d9eccde70fdf5f68eebe31e75cf29e3030";

type CountyRegistry = {
  activeCountyEquivalentCount: number;
  countyEquivalents: Array<{
    countyFips: string;
    stateCode: string;
    shortName: string;
    status: string;
  }>;
};

type StateRegistry = {
  nationalV1: {
    jurisdictionCount: number;
    countyEquivalentCount: number;
    certificationOrder: string[];
  };
};

type Species = {
  id: string;
  commonName: string;
  scientificName: string;
  category: string;
};

type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{
    speciesId: string;
    displayStatus: string;
    determinationStatus: string;
  }>;
};

type SourceDefinition = {
  id: string;
  role: "candidate-support" | "ambiguity-record";
  publisher: string;
  title: string;
  url: string;
  artifactPath: string;
  sha256: string;
  bytes: number;
  retrievedAt: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  supportText: string;
  supportTextSha256: string;
  scopeSupportText?: string;
  scopeSupportTextSha256?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(root: string, relativePath: string): T {
  return JSON.parse(readFileSync(path.join(root, relativePath), "utf8")) as T;
}

function sourceDefinitions(): SourceDefinition[] {
  return [
    {
      id: "aphis-northern-giant-hornet-eradication-2024",
      role: "candidate-support",
      publisher: "USDA Animal and Plant Health Inspection Service",
      title: "APHIS Achieves Victory Over World's Largest Hornet Species",
      url: "https://www.aphis.usda.gov/news/agency-announcements/aphis-action-victory-over-worlds-largest-hornet-species",
      artifactPath: `${INPUT_ROOT}/aphis-ngh-eradication.pdf`,
      sha256: "0e39f61791ac65f9fed71e32ba1ef07d4f7c19313c63720c5c7d95e9ffede9b9",
      bytes: 1_638_367,
      retrievedAt: "2026-08-24T18:36:44.6611213Z",
      publishedAt: "2024-12-18",
      modifiedAt: null,
      supportText: "After five years of relentless effort, the northern giant hornet (Vespa mandarinia) has been eradicated from Washington State and the United States.",
      supportTextSha256: "00fc870cc2406cec8fe7a2c13612cc1afc519a44d895c80c6f8e8398d02227e0",
    },
    {
      id: "aphis-northern-giant-hornet-current-page-2025",
      role: "ambiguity-record",
      publisher: "USDA Animal and Plant Health Inspection Service",
      title: "Northern Giant Hornet",
      url: "https://www.aphis.usda.gov/plantsplant-healthplant-pests-and-diseases/northern-giant-hornet",
      artifactPath: `${INPUT_ROOT}/aphis-northern-giant-hornet-current-2025.html`,
      sha256: "9c979b4417732fdc29a978446557f6cea2a76dd12f7c3ea872938f26b728effd",
      bytes: 93_787,
      retrievedAt: "2026-08-24T19:25:51.8123847Z",
      publishedAt: null,
      modifiedAt: "2025-07-30",
      supportText: "The northern giant hornet was first reported in the Vancouver Island area of Canada in August 2019 and has since been detected in the northwest corner of Washington State. If it spreads to other U.S. States, it could adversely impact honey bees and the pollination services they provide.",
      supportTextSha256: "8c9f19bdbc9d7b7e5601c1fe603d6a9aa1af6921eadb37b91bf2fa60adbbec51",
    },
    {
      id: "wsda-northern-giant-hornet-eradication-2024",
      role: "candidate-support",
      publisher: "Washington State Department of Agriculture",
      title: "Northern giant hornet eradicated from Washington and the United States",
      url: "https://agr.wa.gov/about-wsda/news-and-media-relations/news-releases?article=41658",
      artifactPath: `${INPUT_ROOT}/wsda-ngh-eradication-20241218.html`,
      sha256: "a6b0c7bd5007d6cfb08724257284cadf57a122a3c22dd675216a80f78bb10a57",
      bytes: 713_961,
      retrievedAt: "2026-08-24T18:35:01.7766754Z",
      publishedAt: "2024-12-18",
      modifiedAt: null,
      supportText: "After three years without confirmed detections, the Washington State Department of Agriculture (WSDA) and the United States Department of Agriculture (USDA) have declared the northern giant hornet (Vespa mandarinia) eradicated from Washington and the United States.",
      supportTextSha256: "6bf3089c633da4a089f63c8593fcb86e79eb09f5acf0e2c84cc5941088f17a71",
    },
    {
      id: "wsda-northern-giant-hornet-surveillance-2025",
      role: "candidate-support",
      publisher: "Washington State Department of Agriculture",
      title: "WSDA wraps up 2025 pest survey season",
      url: "https://agr.wa.gov/about-wsda/news-and-media-relations/news-releases?article=45115",
      artifactPath: `${INPUT_ROOT}/wsda-pest-survey-2025.html`,
      sha256: "701af43088488b6bd719378e19797308d1878c936165c537f3bccc81e6e175bb",
      bytes: 713_961,
      retrievedAt: "2026-08-24T18:35:23.6584464Z",
      publishedAt: "2025-11-03",
      modifiedAt: null,
      supportText: "Although WSDA declared the northern giant hornet (Vespa mandarinia) eradicated in December 2024, this year some traps were placed near the site of a previous suspicious report. No hornets were detected, nor any hornet reports confirmed as northern giant hornet.",
      supportTextSha256: "91d16ff927c6f216ed7d253d4357d9d5174c593cce69f3791a581c553110c45c",
    },
    {
      id: "njdep-asian-longhorned-beetle-eradication-current",
      role: "candidate-support",
      publisher: "New Jersey Department of Environmental Protection",
      title: "Forest Health - Asian Longhorned Beetle",
      url: "https://dep.nj.gov/parksandforests/conservation/forest-health/",
      artifactPath: `${INPUT_ROOT}/njdep-forest-health.html`,
      sha256: "0e36cf47deb4f18de758f229794891f71e1eb4fdda147b22d5850908eb7e62af",
      bytes: 378_481,
      retrievedAt: "2026-08-24T18:35:22.5949223Z",
      publishedAt: null,
      modifiedAt: "2026-02-13",
      supportText: "The Asian longhorned beetle (ALB) was detected in New Jersey in 2002 in Hudson County. In 2004, additional ALB populations were detected in Middlesex and Union Counties. However, as a result of an aggressive and successful ALB eradication program, in 2013, NJ deregulated the ALB quarantine zone, and no ALB have been detected in the state since.",
      supportTextSha256: "7ee108ad08aeb95d059047a5ce6625e6ceabefa9f5c43b62b26c91860d1b1c23",
      scopeSupportText: "Eradicated from Hudson, Union, and Middlesex Counties",
      scopeSupportTextSha256: "12df0444b144ad5154f7b3ac6429859bcb5b7575aa688b73d94cbe783442de3b",
    },
    {
      id: "aphis-asian-longhorned-beetle-program-update-2026",
      role: "candidate-support",
      publisher: "USDA Animal and Plant Health Inspection Service",
      title: "APHIS Removes Portions of Nassau and Suffolk Counties, New York, from the Asian Longhorned Beetle Quarantine Area",
      url: "https://direct.aphis.usda.gov/news/program-update/aphis-removes-portions-nassau-suffolk-counties-new-york-asian-longhorned-0",
      artifactPath: `${INPUT_ROOT}/aphis-alb-program-update-2026.html`,
      sha256: "cdff9a6067a31b7af1be91f64b6346ea676c7cb90a51daed7c6589c5fd2506c0",
      bytes: 66_362,
      retrievedAt: "2026-08-24T18:35:21.9601269Z",
      publishedAt: "2026-07-30",
      modifiedAt: "2026-08-12",
      supportText: "After the completion of control and regulatory activities, and following confirmation surveys, APHIS declared ALB eradicated in Illinois (2008); Hudson County, New Jersey (2008); Islip, New York (2011); Union and Middlesex Counties, New Jersey (2013); Manhattan and Staten Island, New York (2013); Suffolk and Norfolk Counties, Massachusetts (2014); portions of Batavia, Monroe, and Stonelick Townships, Ohio (2018); Brooklyn and Queens, New York (2019); a portion of Tate Township, Ohio (2025); and the Town of Holden, Massachusetts (2025).",
      supportTextSha256: "2f135feb4b9422f9c0ac8b59aad96428f046166dea6f35ce1fb287a815892ae8",
    },
  ];
}

function verifySources(root: string, sources: SourceDefinition[]) {
  return sources.map((source) => {
    const bytes = readFileSync(path.join(root, source.artifactPath));
    assert(bytes.length === source.bytes, `${source.id}: retained byte count changed.`);
    assert(sha256(bytes) === source.sha256, `${source.id}: retained artifact hash changed.`);
    assert(sha256(Buffer.from(source.supportText.normalize("NFC"), "utf8")) === source.supportTextSha256, `${source.id}: support text hash changed.`);
    if (source.scopeSupportText || source.scopeSupportTextSha256) {
      assert(source.scopeSupportText && source.scopeSupportTextSha256, `${source.id}: scope support text is incomplete.`);
      assert(sha256(Buffer.from(source.scopeSupportText.normalize("NFC"), "utf8")) === source.scopeSupportTextSha256, `${source.id}: scope support text hash changed.`);
    }
    return source;
  });
}

function inspectSpecies(root: string, nationalCounties: Array<{ countyFips: string; stateCode: string }>, speciesId: string) {
  const displayCounts: Record<string, number> = {};
  const determinationCounts: Record<string, number> = {};
  const explicitCountyFips: string[] = [];
  const verifiedPresentCountyFips: string[] = [];
  for (const county of nationalCounties) {
    const projection = readJson<CountyProjection>(root, `public/generated/research/${county.stateCode}/counties/${county.countyFips}.json`);
    assert(projection.countyFips === county.countyFips && projection.stateCode === county.stateCode, `Projection identity mismatch for ${county.countyFips}.`);
    const pair = projection.pairs.find((entry) => entry.speciesId === speciesId);
    const displayStatus = pair?.displayStatus ?? projection.pairResolution.defaultDisplayStatus;
    const determinationStatus = pair?.determinationStatus ?? "none";
    displayCounts[displayStatus] = (displayCounts[displayStatus] ?? 0) + 1;
    determinationCounts[determinationStatus] = (determinationCounts[determinationStatus] ?? 0) + 1;
    if (pair) explicitCountyFips.push(county.countyFips);
    if (displayStatus === "verified-present") verifiedPresentCountyFips.push(county.countyFips);
  }
  return {
    explicitCountyCount: explicitCountyFips.length,
    displayCounts,
    determinationCounts,
    verifiedPresentCountyFips,
  };
}

export function buildJurisdictionWideAbsenceContractPreflight(root = process.cwd()) {
  const stateRegistry = readJson<StateRegistry>(root, "src/data/research/state-registry.json");
  const countyRegistry = readJson<CountyRegistry>(root, "src/data/research/county-equivalent-registry.json");
  const nationalStates = [...stateRegistry.nationalV1.certificationOrder].sort();
  const nationalStateSet = new Set(nationalStates);
  const nationalCounties = countyRegistry.countyEquivalents
    .filter((county) => county.status === "active" && nationalStateSet.has(county.stateCode))
    .map((county) => ({ countyFips: county.countyFips, stateCode: county.stateCode, countyName: county.shortName }))
    .sort((left, right) => left.countyFips.localeCompare(right.countyFips));
  const nationalCountyFips = nationalCounties.map((county) => county.countyFips);
  assert(stateRegistry.nationalV1.jurisdictionCount === 51 && nationalStates.length === 51, "National V1 jurisdiction count changed.");
  assert(stateRegistry.nationalV1.countyEquivalentCount === 3_144 && nationalCounties.length === 3_144, "National V1 county-equivalent count changed.");
  assert(countyRegistry.activeCountyEquivalentCount === 3_235, "Full active Census topology count changed.");
  assert(sha256(JSON.stringify(nationalCountyFips)) === NATIONAL_FIPS_SHA256, "National V1 county FIPS set changed.");
  assert(sha256(JSON.stringify(NEW_JERSEY_FIPS)) === NEW_JERSEY_FIPS_SHA256, "New Jersey candidate FIPS set changed.");

  const newJerseyCounties = nationalCounties.filter((county) => NEW_JERSEY_FIPS.includes(county.countyFips as typeof NEW_JERSEY_FIPS[number]));
  assert(JSON.stringify(newJerseyCounties.map((county) => county.countyName)) === JSON.stringify(["Hudson", "Middlesex", "Union"]), "New Jersey county mapping changed.");

  const speciesCatalog = readJson<Species[]>(root, "public/generated/species.json");
  const candidates = [
    { id: "vespa-mandarinia", scientificName: "Vespa mandarinia", jurisdiction: "United States" },
    { id: "asian-longhorned-beetle", scientificName: "Anoplophora glabripennis", jurisdiction: "Hudson, Middlesex, and Union Counties, New Jersey" },
  ].map((candidate) => {
    const catalogEntry = speciesCatalog.find((entry) => entry.id === candidate.id);
    assert(catalogEntry?.scientificName === candidate.scientificName, `${candidate.id}: catalog identity changed.`);
    return { ...candidate, commonName: catalogEntry.commonName, category: catalogEntry.category };
  });

  const vespaProjection = inspectSpecies(root, nationalCounties, "vespa-mandarinia");
  const albProjection = inspectSpecies(root, nationalCounties, "asian-longhorned-beetle");
  assert(vespaProjection.explicitCountyCount === 67, "Vespa baseline explicit-pair count changed.");
  assert(vespaProjection.verifiedPresentCountyFips.length === 0, "Vespa baseline now contains accepted presence.");
  assert(albProjection.explicitCountyCount === 3_144, "ALB baseline explicit-pair count changed.");
  assert(JSON.stringify(albProjection.verifiedPresentCountyFips) === JSON.stringify(["25027", "36059", "36103", "39025", "45019", "45035"]), "ALB accepted-presence baseline changed.");
  assert(albProjection.verifiedPresentCountyFips.every((fips) => !NEW_JERSEY_FIPS.includes(fips as typeof NEW_JERSEY_FIPS[number])), "ALB target counties contain accepted current presence.");

  const sources = verifySources(root, sourceDefinitions());
  return {
    schemaVersion: 1,
    evaluationId: EVALUATION_ID,
    evaluatedAt: EVALUATED_AT,
    evaluatedAgainstCommit: BASELINE_SHA,
    mode: "zero-assertion-authoritative-jurisdiction-contract-preflight",
    candidateCatalog: candidates,
    retainedSources: sources,
    exactJurisdictionCoverage: {
      fullActiveCensusTopologyCount: countyRegistry.activeCountyEquivalentCount,
      nationalV1: {
        jurisdictionCount: nationalStates.length,
        stateCodes: nationalStates,
        countyEquivalentCount: nationalCountyFips.length,
        countyFipsSha256: NATIONAL_FIPS_SHA256,
        countyFips: nationalCountyFips,
        derivation: "Active county equivalents whose stateCode is in state-registry nationalV1.certificationOrder.",
      },
      newJerseyAsianLonghornedBeetle: {
        countyEquivalentCount: newJerseyCounties.length,
        countyFipsSha256: NEW_JERSEY_FIPS_SHA256,
        counties: newJerseyCounties,
        exclusions: [],
      },
    },
    baselineProjectionAudit: {
      vespaMandarinia: vespaProjection,
      asianLonghornedBeetle: albProjection,
      targetSetAcceptedPresenceConflicts: 0,
      currentOfficiallyAbsentPairs: 0,
    },
    laterPresenceAudit: {
      method: "Compare candidate effective dates with current generated accepted-presence projections and review the retained current official program pages. This is source-bounded, not a claim of exhaustive web absence.",
      vespaMandarinia: {
        effectiveAt: "2024-12-18",
        laterOfficialReaffirmationAt: "2025-11-03",
        generatedAcceptedPresencePairs: 0,
        officialPageAmbiguity: "The current APHIS species page uses unqualified historical wording that the species has since been detected in northwest Washington; it is not treated as a post-eradication detection.",
      },
      asianLonghornedBeetleNewJersey: {
        hudsonEffectiveYear: 2008,
        middlesexAndUnionEffectiveYear: 2013,
        laterOfficialReaffirmationAt: "2026-07-30",
        generatedAcceptedPresencePairsInTargetCounties: 0,
      },
      result: "no-current-accepted-presence-conflict-found-within-bounded-audit",
    },
    proposedSemanticContract: {
      parentJurisdictionEvidence: {
        requiredFields: ["id", "sourceIds", "speciesId", "statementType", "jurisdictionLevel", "jurisdictionId", "effectiveAt", "reaffirmedAt", "validThrough", "countyFips", "countyFipsSha256", "exclusions", "reviewGate"],
        childAssertionReference: "parent_jurisdiction_evidence_id",
        sourceDocumentDuplicationPerCounty: false,
        countyDerivationMustFailOn: ["registry-set-drift", "count-mismatch", "hash-mismatch", "unresolved-exclusion", "unmapped-county"],
      },
      timeAwareDetermination: {
        historicalOccurrenceStatus: ["recorded-present", "none"],
        currentDeterminationStatus: ["present", "officially-eradicated", "officially-absent", "none"],
        compatibilityDisplayRule: "Preserve verified-present when historical accepted presence exists; expose current eradication separately. If no historical presence exists, a fresh explicit-authority absence may retain legacy verified-absent display behavior.",
        conflictRule: "Accepted presence before the eradication effective date coexists as history. Accepted presence on or after the effective date, or undated accepted presence, conflicts until reviewed.",
        staleRule: "When validThrough passes, current absence or eradication must cease publishing as current; retained historical occurrence and source evidence remain.",
      },
      freshnessPolicyCandidate: {
        status: "proposed-not-registered",
        refreshCadenceDays: 365,
        vespaMandariniaValidThrough: "2026-11-03",
        asianLonghornedBeetleNewJerseyValidThrough: "2027-07-30",
        rule: "Derive validThrough from the latest authoritative reaffirmation, never from retrieval time alone.",
      },
      reviewGate: "human-approval-required-before-assertion-publication",
      backwardsCompatibility: "Existing event schemas and verified-present display semantics remain readable. New parent references and temporal fields are additive until a separately reviewed migration is accepted.",
    },
    candidateBatchIfLaterApproved: {
      currentDeterminationPairs: 3_147,
      historicalRecordedPresencePairs: 4,
      historicalRecordedPresenceCountyFips: {
        vespaMandarinia: ["53073"],
        asianLonghornedBeetle: [...NEW_JERSEY_FIPS],
      },
      assertionEventsCreatedByThisPreflight: 0,
      matrixPairsMovedByThisPreflight: 0,
      status: "deferred-pending-semantic-implementation-and-human-approval",
    },
    decision: {
      status: "go-semantic-implementation-required-assertions-deferred",
      reason: "The retained federal and state sources provide explicit eradication language and exact mappable jurisdictions, but the current compiler cannot safely represent historical presence together with a fresh current eradication determination.",
      nextAction: "Implement and test the additive parent-jurisdiction and time-aware determination contract without creating candidate assertions, then obtain human approval for any data batch.",
    },
    operations: {
      assertionEvents: 0,
      reviewEvents: 0,
      generatedProjectionMutations: 0,
      publicationMutations: 0,
      r2Mutations: 0,
      providerPosts: 0,
    },
    checks: {
      retainedArtifactHashesMatch: true,
      supportTextHashesMatch: true,
      catalogIdentitiesMatch: true,
      nationalV1FipsSetComplete: true,
      newJerseyFipsSetComplete: true,
      baselineTargetPresenceConflictCountIsZero: true,
      staleNegativePublicationForbidden: true,
      zeroAssertionsCreated: true,
    },
  } as const;
}

export function serializeJurisdictionWideAbsenceContractPreflight(value: ReturnType<typeof buildJurisdictionWideAbsenceContractPreflight>) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function main() {
  const root = process.cwd();
  const mode = process.argv[2];
  assert(mode === "--write" || mode === "--check", "Expected --write or --check.");
  const outputPath = path.join(root, OUTPUT_PATH);
  const serialized = serializeJurisdictionWideAbsenceContractPreflight(buildJurisdictionWideAbsenceContractPreflight(root));
  if (mode === "--write") {
    assert(!existsSync(outputPath), `Refusing to overwrite ${OUTPUT_PATH}.`);
    writeFileSync(outputPath, serialized);
    console.log(`Wrote ${OUTPUT_PATH}.`);
    return;
  }
  assert(existsSync(outputPath), `${OUTPUT_PATH} is missing.`);
  assert(readFileSync(outputPath, "utf8") === serialized, `${OUTPUT_PATH} differs from the reproducible preflight.`);
  console.log("Jurisdiction-wide absence contract preflight is reproducible.");
}

if (process.argv[1]?.endsWith("build-jurisdiction-wide-absence-contract-preflight.ts")) main();
