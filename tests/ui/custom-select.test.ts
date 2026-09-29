import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import type * as SelectModule from "../../src/lib/ui/select-navigation";
const source = stripTypeScriptTypes(readFileSync("src/lib/ui/select-navigation.ts", "utf8"), { mode: "strip" });
const { nextSelectOption, findSelectOption, selectSearchText } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64")) as typeof SelectModule;
const options = [
  { value: "AK", label: "Alaska" }, { value: "AZ", label: "Arizona", disabled: true },
  { value: "CA", label: "California" }, { value: "CO", label: "Colorado" },
];
test("arrow navigation wraps and skips disabled options", () => {
  assert.equal(nextSelectOption(options, 0, "ArrowDown"), 2);
  assert.equal(nextSelectOption(options, 2, "ArrowUp"), 0);
  assert.equal(nextSelectOption(options, 3, "ArrowDown"), 0);
  assert.equal(nextSelectOption(options, 0, "ArrowUp"), 3);
});
test("Home and End target the first and last enabled choices", () => {
  const disabledEdges = [{ value: "start", label: "Unavailable", disabled: true }, ...options, { value: "end", label: "Unavailable", disabled: true }];
  assert.equal(nextSelectOption(disabledEdges, 3, "Home"), 1);
  assert.equal(nextSelectOption(disabledEdges, 1, "End"), 4);
});
test("empty and fully disabled choices cannot become active", () => {
  assert.equal(nextSelectOption([], -1, "ArrowDown"), -1);
  assert.equal(nextSelectOption(options.map(option => ({ ...option, disabled: true })), 0, "Home"), -1);
  assert.equal(findSelectOption([], "a"), -1);
});
test("type-ahead cycles matching names while skipping disabled choices", () => {
  assert.equal(findSelectOption(options, "c", 0), 2);
  assert.equal(findSelectOption(options, "c", 2), 3);
  assert.equal(findSelectOption(options, "c", 3), 2);
  assert.equal(findSelectOption(options, "ari"), -1);
  assert.equal(findSelectOption(options, "colo"), 3);
});
test("search ignores case and accents without changing option values", () => {
  assert.equal(selectSearchText("Doña Ana"), "dona ana");
  assert.equal(findSelectOption([{ value: "35013", label: "Doña Ana County" }], "DONA"), 0);
  assert.equal(findSelectOption(options, ""), -1);
});
