import assert from "node:assert/strict";

import {
  chunkPlannerObjectIds,
  stratifiedObjectIds,
} from "./research/plan-usfs-current-invasive-plants-state";

assert.deepEqual(stratifiedObjectIds([9, 1, 5, 3, 7], 0), [1, 3, 5, 7, 9]);
assert.deepEqual(stratifiedObjectIds([1, 2, 3, 4, 5], 3), [1, 3, 5]);
assert.deepEqual(stratifiedObjectIds([4, 4, 1, 2], 2), [1, 4]);
assert.deepEqual(chunkPlannerObjectIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);

process.stdout.write("USFS Current Invasive Plant Locations state planner tests passed.\n");
