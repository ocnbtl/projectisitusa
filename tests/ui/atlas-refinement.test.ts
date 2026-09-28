import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

type Band = { min: number; max: number; label: string; color: string };
const source = stripTypeScriptTypes(readFileSync("src/lib/ui/map-scale.ts", "utf8"), { mode: "strip" });
const { boundsIntersectView, createMapCountBands, mapCountColor } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64")) as {
  boundsIntersectView: (bounds: [[number,number],[number,number]], view: {x:number;y:number;k:number}, area: {left:number;right:number;top:number;bottom:number}) => boolean;
  createMapCountBands: (values: number[]) => Band[];
  mapCountColor: (count: number, available: boolean, bands?: Band[]) => string;
};

test("zero records and unavailable records have different meanings and colors", () => {
  const bands = createMapCountBands([0, 0, 1, 4, 12]);
  assert.notEqual(mapCountColor(0, true, bands), mapCountColor(0, false, bands));
  assert.equal(bands[0].label, "0");
  for (const value of [NaN, -1, 0.5, Infinity]) assert.equal(mapCountColor(value, true, bands), "var(--county-unknown)");
});
test("every observed count belongs to one contiguous, labeled range", () => {
  for (const values of [[0], [1], [4,4,4], [1,2,3], [0,1,10,25,50,100,200,400], Array.from({length:500},(_,i)=>Math.floor(i*i/70))]) {
    const bands = createMapCountBands(values);
    assert.ok(bands.length <= 7);
    for (let i=1;i<bands.length;i++) assert.equal(bands[i].min,bands[i-1].max+1);
    for (const value of values) assert.equal(bands.filter(b => value>=b.min && value<=b.max).length,1);
    assert.ok(bands.every(b => b.min <= b.max && b.label));
  }
});
test("small state counts use distinct colors and retain exact thresholds", () => {
  const state = createMapCountBands([0,1,2,3,4,5]);
  assert.ok(new Set([1,2,3,4,5].map(n => mapCountColor(n,true,state))).size >= 4);
  const national = createMapCountBands([20,40,80,160,320,640]);
  assert.notDeepEqual(state.map(b=>b.min), national.map(b=>b.min));
  assert.equal(state.at(-1)?.max,5);
});

test("zoom scope includes intersecting counties whose centroids are outside the viewport", () => {
  const area = {left:0,right:100,top:0,bottom:100};
  assert.equal(boundsIntersectView([[80,20],[500,200]],{x:0,y:0,k:1},area),true);
  assert.equal(boundsIntersectView([[80,20],[500,200]],{x:0,y:0,k:2},area),false);
  assert.equal(boundsIntersectView([[80,20],[500,200]],{x:-100,y:0,k:2},area),true);
  assert.equal(boundsIntersectView([[NaN,20],[500,200]],{x:0,y:0,k:1},area),false);
});
