import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

export type PrepareDataStep =
  | {
      kind: "legacy-base";
      script: "scripts/build-data.ts";
      arguments: [];
    }
  | {
      kind: "authoritative-research";
      stateCode: string;
      script: "scripts/compile-research-index.ts";
      arguments: ["--state", string, "--as-of", string];
    };

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function parsePrepareDataOptions(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag !== "--as-of" || !value || value.startsWith("--")) {
      throw new Error("prepare:data requires --as-of <YYYY-MM-DD>.");
    }
    if (values.has(flag)) throw new Error(`Duplicate prepare:data argument: ${flag}.`);
    values.set(flag, value);
  }
  const asOf = values.get("--as-of");
  if (!asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("prepare:data requires --as-of <YYYY-MM-DD>.");
  }
  if (!isCalendarDate(asOf)) {
    throw new Error("prepare:data --as-of must be a valid calendar date.");
  }
  return { asOf };
}

export function buildPrepareDataPlan(
  configFile: StateResearchConfigFile,
  asOf: string,
): PrepareDataStep[] {
  if (!isCalendarDate(asOf)) {
    throw new Error("prepare:data --as-of must be a valid calendar date.");
  }
  const authoritativeStates = configFile.states
    .filter((entry) => entry.compatibilityPublication)
    .map((entry) => entry.stateCode)
    .sort();
  if (authoritativeStates.length === 0) {
    throw new Error("prepare:data requires at least one compatibility publication state.");
  }
  if (new Set(authoritativeStates).size !== authoritativeStates.length) {
    throw new Error("prepare:data cannot plan duplicate compatibility publication states.");
  }
  return [
    {
      kind: "legacy-base",
      script: "scripts/build-data.ts",
      arguments: [],
    },
    ...authoritativeStates.map(
      (stateCode): PrepareDataStep => ({
        kind: "authoritative-research",
        stateCode,
        script: "scripts/compile-research-index.ts",
        arguments: ["--state", stateCode, "--as-of", asOf],
      }),
    ),
  ];
}

export function assertLegacyMatrixWriteAllowed(
  configFile: StateResearchConfigFile,
  stateCode: string,
) {
  const normalizedStateCode = stateCode.toUpperCase();
  const stateConfig = configFile.states.find((entry) => entry.stateCode === normalizedStateCode);
  if (stateConfig?.compatibilityPublication) {
    throw new Error(
      `Legacy county matrix generation is disabled for compiler-owned state ${normalizedStateCode}. Run npm run prepare:data -- --as-of <YYYY-MM-DD> instead.`,
    );
  }
}
