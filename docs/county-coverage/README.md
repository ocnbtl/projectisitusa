# County-Species Coverage Matrix

This track measures the real long-term Project Isitusa goal: a reputable county-species determination for every invasive species in every county.

For Alabama, that means `2504` catalog species across `67` counties, or `167768` county-species determinations.

## Statuses

- `verified-present`: a reputable source supports county-level presence through imported county presence data or a manual authoritative presence override.
- `verified-absent`: a reputable source explicitly supports absence for the county and species.
- `not-detected`: a reputable survey or monitoring source searched for the species and did not detect it.
- `unknown`: no defensible county-species determination has been added yet.

Unknown does not mean absent. It means the project has not yet found a reputable county-species source that supports presence, absence, or non-detection.

## 90 Percent Target

The target is county-specific.

A county reaches the 90 percent target only when at least 90 percent of the catalog species have one of these known statuses for that county:

- `verified-present`
- `verified-absent`
- `not-detected`

For the current `2504` species catalog, each county needs `2254` known determinations to hit 90 percent. Alabama needs that threshold in all `67` counties, not just a statewide average.

## Storage Model

The matrix is sparse:

- Verified presence comes from `src/data/generated/presence.json`, which is built from source-family imports and manual authoritative presence overrides.
- Verified absence and not-detected records live in `src/data/source/county-species-status-overrides.ts`.
- Every missing pair is treated as `unknown`.

This avoids committing a huge repetitive table where most entries are unknown.

## Commands

Build a state matrix:

```bash
npm run build:county-matrix -- AL
```

Reconcile a maintained state denominator list against the catalog and state matrix:

```bash
npm run reconcile:state-denominators -- AL ALIPC-2012
npm run reconcile:state-denominators -- AL AL-ANS-2021
```

Refresh the ALIPC denominator snapshot with EDDMapS subject IDs:

```bash
npm run import:alipc-list
```

The command writes:

- `docs/county-coverage/states/<STATE>.json`
- `docs/county-coverage/states/<STATE>.md`

The reconciliation command writes:

- `docs/county-coverage/states/<STATE>-<list-id>-reconciliation.json`
- `docs/county-coverage/states/<STATE>-<list-id>-reconciliation.md`

The ALIPC import command writes:

- `src/data/source/state-denominator-snapshots/alipc-2012.json`

## Maintenance Rules

1. Do not hand-edit generated state matrix files.
2. Add new verified presence through the county presence import pipeline or manual authoritative presence overrides.
3. Add verified absence and not-detected records only in `src/data/source/county-species-status-overrides.ts`.
4. Every non-presence record must include a reputable source URL, notes, and a review date.
5. Do not convert unknown to absent just because no record was found.
6. Regenerate the state matrix after source data changes.
7. Keep maintained denominator lists in `src/data/source/state-species-denominators.ts`.
8. Run denominator reconciliation after adding or changing a maintained list.
9. Use denominator snapshots to preserve external subject IDs and other source-table metadata when a reputable source exposes them.
10. Run a no-dash audit on edited docs and source files before committing.

## State Order

Use Alabama as the first state framework. After Alabama reaches a stable source-family loop, proceed alphabetically through the states.
