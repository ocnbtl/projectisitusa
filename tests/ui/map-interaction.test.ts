import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import type * as GestureModule from "../../src/lib/ui/map-gestures";
import type * as ViewportModule from "../../src/lib/ui/map-viewport";

async function loadModule(path: string) {
  const source = stripTypeScriptTypes(readFileSync(path, "utf8"), { mode: "strip" });
  return import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
}
const { createMapGesture, beginMapPointer, moveMapPointer, endMapPointer, cancelMapGesture, scaleMapAt, wheelMapView } = await loadModule("src/lib/ui/map-gestures.ts") as typeof GestureModule;
const { measuredMapViewport, sameMapViewport } = await loadModule("src/lib/ui/map-viewport.ts") as typeof ViewportModule;
const view = { x: 20, y: -30, k: 2 };

test("wheel zoom preserves the map point under the cursor", () => {
  const point = { x: 423, y: 219 };
  const next = wheelMapView(view, -80, 0, point, 800);
  assert.ok(next.k > view.k);
  assert.ok(Math.abs((point.x - next.x) / next.k - (point.x - view.x) / view.k) < 1e-10);
  assert.ok(Math.abs((point.y - next.y) / next.k - (point.y - view.y) / view.k) < 1e-10);
});
test("wheel units normalize consistently and small trackpad steps stay small", () => {
  const point = { x: 100, y: 200 };
  assert.deepEqual(wheelMapView(view, 1, 1, point, 800), wheelMapView(view, 16, 0, point, 800));
  assert.deepEqual(wheelMapView(view, 0.02, 2, point, 800), wheelMapView(view, 16, 0, point, 800));
  assert.ok(Math.abs(wheelMapView(view, 0.5, 0, point, 800).k - view.k) < 0.01);
});
test("extreme wheel steps are bounded and zoom stays between one and twelve", () => {
  const point = { x: 500, y: 300 };
  assert.deepEqual(wheelMapView(view, -99999, 0, point, 800), wheelMapView(view, -120, 0, point, 800));
  assert.equal(wheelMapView({ x: 0, y: 0, k: 1 }, 120, 0, point, 800).k, 1);
  assert.equal(wheelMapView({ x: 0, y: 0, k: 12 }, -120, 0, point, 800).k, 12);
  assert.equal(wheelMapView(view, NaN, 0, point, 800), view);
  assert.equal(wheelMapView(view, 10, 0, point, Infinity), view);
});
test("a drag starts from the current wheel position without a jump", () => {
  const point = { x: 350, y: 200 };
  const wheeled = wheelMapView(view, -80, 0, point, 800);
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, point, wheeled, null);
  const dragged = moveMapPointer(gesture, 1, { x: 370, y: 230 });
  assert.deepEqual(dragged, { ...wheeled, x: wheeled.x + 20, y: wheeled.y + 30 });
  assert.equal(endMapPointer(gesture, 1), null);
});

test("a tap selects its original county, while a pan never selects one", () => {
  const tap = createMapGesture();
  beginMapPointer(tap, 8, { x: 100, y: 100 }, view, "01001");
  assert.equal(moveMapPointer(tap, 8, { x: 101, y: 101 }), null);
  assert.equal(endMapPointer(tap, 8), "01001");
  assert.equal(endMapPointer(tap, 8), null);
  const pan = createMapGesture();
  beginMapPointer(pan, 8, { x: 100, y: 100 }, view, "01001");
  assert.deepEqual(moveMapPointer(pan, 8, { x: 140, y: 125 }), { x: 60, y: -5, k: 2 });
  assert.equal(endMapPointer(pan, 8), null);
});

test("untracked pointers cannot move or end the active gesture", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 0, y: 0 }, view, "01001");
  assert.equal(moveMapPointer(gesture, 2, { x: 100, y: 100 }), null);
  assert.equal(endMapPointer(gesture, 2), null);
  assert.equal(gesture.pointers.size, 1);
  assert.deepEqual(gesture.view, view);
});

test("pinch zoom keeps the same map point under the moving midpoint", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 100, y: 100 }, view, "01001");
  beginMapPointer(gesture, 2, { x: 200, y: 100 }, view, null);
  moveMapPointer(gesture, 1, { x: 50, y: 150 });
  const next = moveMapPointer(gesture, 2, { x: 250, y: 150 })!;
  assert.equal(next.k, 4);
  assert.equal((150 - next.x) / next.k, (150 - view.x) / view.k);
  assert.equal((150 - next.y) / next.k, (100 - view.y) / view.k);
  assert.equal(endMapPointer(gesture, 1), null);
  assert.equal(endMapPointer(gesture, 2), null);
});

test("lifting one finger rebases the remaining pan without jumping", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 100, y: 100 }, view, null);
  beginMapPointer(gesture, 2, { x: 200, y: 100 }, view, null);
  moveMapPointer(gesture, 2, { x: 300, y: 100 });
  const pinched = { ...gesture.view };
  endMapPointer(gesture, 2);
  assert.deepEqual(moveMapPointer(gesture, 1, { x: 100, y: 100 }), pinched);
  assert.deepEqual(moveMapPointer(gesture, 1, { x: 110, y: 120 }), { ...pinched, x: pinched.x + 10, y: pinched.y + 20 });
});

test("a second finger after panning starts from the current visible view", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 100, y: 100 }, view, null);
  const panned = moveMapPointer(gesture, 1, { x: 150, y: 120 })!;
  beginMapPointer(gesture, 2, { x: 250, y: 120 }, panned, null);
  assert.deepEqual(moveMapPointer(gesture, 2, { x: 250, y: 120 }), panned);
});

test("zoom limits preserve the anchor instead of drifting at the limit", () => {
  for (const requested of [.01, 100]) {
    const anchor = { x: 130, y: 170 };
    const next = scaleMapAt(view, requested, anchor);
    assert.equal(next.k, requested < 1 ? 1 : 12);
    assert.equal((anchor.x - next.x) / next.k, (anchor.x - view.x) / view.k);
    assert.equal((anchor.y - next.y) / next.k, (anchor.y - view.y) / view.k);
  }
});

test("cancelled capture never selects a county and the next tap works", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 100, y: 100 }, view, "01001");
  assert.equal(endMapPointer(gesture, 1, true), null);
  assert.equal(gesture.pointers.size, 0);
  beginMapPointer(gesture, 2, { x: 100, y: 100 }, view, "01003");
  assert.equal(endMapPointer(gesture, 2), "01003");
});

test("resize or state changes cancel all pointers and pending selection", () => {
  const gesture = createMapGesture();
  beginMapPointer(gesture, 1, { x: 100, y: 100 }, view, "01001");
  beginMapPointer(gesture, 2, { x: 200, y: 100 }, view, null);
  cancelMapGesture(gesture);
  assert.equal(gesture.pointers.size, 0);
  assert.equal(gesture.origin.size, 0);
  assert.equal(moveMapPointer(gesture, 1, { x: 500, y: 500 }), null);
  assert.equal(endMapPointer(gesture, 2), null);
});

test("coincident fingers and extra touches do not create non-finite transforms", () => {
  const gesture = createMapGesture();
  for (const id of [1, 2, 3]) beginMapPointer(gesture, id, { x: 100, y: 100 }, view, null);
  const next = moveMapPointer(gesture, 2, { x: 110, y: 100 })!;
  assert.ok(Object.values(next).every(Number.isFinite));
  endMapPointer(gesture, 1);
  assert.ok(Object.values(moveMapPointer(gesture, 3, { x: 90, y: 100 })!).every(Number.isFinite));
});

test("the map waits for valid dimensions and fits to one coherent measured area", () => {
  const area = { left: 24, right: 366, top: 380, bottom: 650 };
  for (const width of [0, NaN, Infinity, -1]) assert.equal(measuredMapViewport(width, 844, area), null);
  const mobile = measuredMapViewport(390, 844, area)!;
  assert.deepEqual(mobile, { width: 390, height: 844, area });
  assert.equal(sameMapViewport(mobile, { ...mobile }), true);
  assert.equal(sameMapViewport(mobile, { ...mobile, height: 900 }), false);
  assert.equal(sameMapViewport(null, mobile), false);
});

test("a short or partially hidden viewport cannot invert the projection extent", () => {
  const measured = measuredMapViewport(320, 300, { left: -10, right: 800, top: 400, bottom: 100 })!;
  assert.equal(measured.area.left, 0);
  assert.equal(measured.area.right, 320);
  assert.ok(measured.area.top < measured.area.bottom);
  assert.ok(measured.area.bottom <= measured.height);
});
