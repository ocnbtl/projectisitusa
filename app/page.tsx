import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Suspense } from "react";

import { MapExplorer } from "@/components/map-explorer";
import type { ClientDataStorePayload } from "@/lib/data/client-store";
import type { CountyRecord, ExplorerPresenceIndex, ExplorerSpecies } from "@/lib/data/types";

function readGeneratedJson<T>(fileName: string) {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), "src/data/generated", fileName), "utf8"),
  ) as T;
}

export default function HomePage() {
  const initialStore = {
    allSpecies: readGeneratedJson<ExplorerSpecies[]>("explorer-species.json"),
    countyIndex: readGeneratedJson<Record<string, CountyRecord>>("counties.json"),
    presenceIndex: readGeneratedJson<ExplorerPresenceIndex>("explorer-presence.json"),
    datasetSnapshot: readGeneratedJson<ClientDataStorePayload["datasetSnapshot"]>("snapshot.json"),
  } as ClientDataStorePayload;

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 sm:px-6 lg:px-8">
          <div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--muted)]">
            Loading map explorer…
          </div>
        </div>
      }
    >
      <MapExplorer initialStore={initialStore} />
    </Suspense>
  );
}
