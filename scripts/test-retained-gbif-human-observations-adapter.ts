import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import { listCountyEquivalents } from "@/lib/research/geography-registry";
import sourceRegistry from "@/data/research/source-registry.json";
import {
  blmNisimsRetainedAdapter,
  gbifIpamsRetainedAdapter,
  type RetainedGbifObservationTarget,
} from "./research/adapters/retained-gbif-human-observations";

type Plan = {
  sourceId: "blm-nisims" | "gbif-ipams";
  stateCode: string;
  candidates: Array<{ sourceId: string; countyFips: string; speciesId: string }>;
  retainedGbifObservations: Record<string, unknown> & { targets: RetainedGbifObservationTarget[] };
};

const ROOT = process.cwd();
const PLAN_DIRECTORY = path.join(ROOT, "src/data/research/national-acquisition-plans");

function readPlans(sourceId: Plan["sourceId"]) {
  return readdirSync(PLAN_DIRECTORY)
    .filter((filename) => filename.startsWith(`${sourceId}-`) && filename.endsWith("-20260904-r1.json"))
    .sort()
    .map((filename) => JSON.parse(readFileSync(path.join(PLAN_DIRECTORY, filename), "utf8")) as Plan);
}

async function main() {
  const adapters = {
    "blm-nisims": blmNisimsRetainedAdapter,
    "gbif-ipams": gbifIpamsRetainedAdapter,
  } as const;
  const allPairs = new Set<string>();
  let totalAssertions = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Retained GBIF observation replay must not use the network."); };
  try {
    for (const sourceId of Object.keys(adapters) as Plan["sourceId"][]) {
      const adapter = adapters[sourceId];
      const registered = sourceRegistry.sources.find((source) => source.id === sourceId)?.researchAdapter;
      assert.equal(registered?.id, adapter.adapterId);
      assert(registered.allowedVersions.includes(adapter.adapterVersion));
      const plans = readPlans(sourceId);
      assert(plans.length > 0, `No retained ${sourceId} plans found.`);
      for (const plan of plans) {
        const counties = new Map(listCountyEquivalents(plan.stateCode).map((county) => [county.countyFips, county]));
        const targets = plan.retainedGbifObservations.targets;
        const context: SourceAdapterContext = {
          runId: `20260904T120000Z__${sourceId}__fixture`,
          sourceId,
          stateCode: plan.stateCode,
          requestedPairs: targets.map((target) => ({
            countyFips: target.countyFips,
            countyName: counties.get(target.countyFips)?.legalName ?? target.sourceCounty,
            speciesId: target.speciesId,
            scientificName: target.scientificName,
          })),
          runStartedAt: "2026-09-04T11:59:00.000Z",
          parameters: {
            stateCode: plan.stateCode,
            ...plan.retainedGbifObservations,
            candidatePairs: targets.map((target) => target.pairKey),
          },
        };
        const result = await adapter.run(context);
        assert.equal(result.assertions.length, targets.length);
        assert.equal(result.reviews.length, targets.length);
        assert.equal(result.outcomes.length, targets.length);
        assert.equal(result.rejections.length, 0);
        assert.equal(result.upstreamRequests.length, 0);
        for (const assertion of result.assertions) {
          assert.equal(assertion.claim_type, "recorded-present");
          assert.equal(assertion.evidence_kind, "occurrence");
          assert.equal(assertion.scope, "point");
        }
        for (const target of targets) {
          assert(!allPairs.has(target.pairKey), `Cross-source pair repeated: ${target.pairKey}`);
          allPairs.add(target.pairKey);
        }
        totalAssertions += result.assertions.length;
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(totalAssertions, 425);
  assert.equal(allPairs.size, 425);
  process.stdout.write("Retained GBIF human-observation adapter tests passed for 425 disjoint plans.\n");
}

void main();
