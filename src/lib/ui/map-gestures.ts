export type MapView = { x: number; y: number; k: number };
export type MapPoint = { x: number; y: number };
export type MapGesture = {
  pointers: Map<number, MapPoint>;
  origin: Map<number, MapPoint>;
  startView: MapView;
  view: MapView;
  moved: boolean;
  county: string | null;
};

export function createMapGesture(): MapGesture {
  return { pointers: new Map(), origin: new Map(), startView: { x: 0, y: 0, k: 1 }, view: { x: 0, y: 0, k: 1 }, moved: false, county: null };
}

export function scaleMapAt(view: MapView, scale: number, from: MapPoint, to: MapPoint = from): MapView {
  const k = Math.max(1, Math.min(12, scale));
  return { k, x: to.x - (from.x - view.x) * k / view.k, y: to.y - (from.y - view.y) * k / view.k };
}

function rebase(gesture: MapGesture) {
  gesture.origin = new Map(gesture.pointers);
  gesture.startView = { ...gesture.view };
}

export function beginMapPointer(gesture: MapGesture, id: number, point: MapPoint, view: MapView, county: string | null) {
  if (!gesture.pointers.size) {
    gesture.view = { ...view };
    gesture.moved = false;
    gesture.county = county;
  } else {
    gesture.moved = true;
    gesture.county = null;
  }
  gesture.pointers.set(id, point);
  rebase(gesture);
}

export function moveMapPointer(gesture: MapGesture, id: number, point: MapPoint): MapView | null {
  if (!gesture.pointers.has(id)) return null;
  gesture.pointers.set(id, point);
  const entries = [...gesture.pointers.entries()].slice(0, 2);
  const [firstId, first] = entries[0];
  const start = gesture.origin.get(firstId)!;
  if (entries.length === 1) {
    const dx = first.x - start.x, dy = first.y - start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 4) return null;
    gesture.moved = true;
    gesture.view = { ...gesture.startView, x: gesture.startView.x + dx, y: gesture.startView.y + dy };
  } else {
    const [secondId, second] = entries[1], secondStart = gesture.origin.get(secondId)!;
    const from = { x: (start.x + secondStart.x) / 2, y: (start.y + secondStart.y) / 2 };
    const to = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const initialDistance = Math.hypot(start.x - secondStart.x, start.y - secondStart.y);
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    gesture.moved = true;
    gesture.view = scaleMapAt(gesture.startView, gesture.startView.k * (initialDistance > 0 ? distance / initialDistance : 1), from, to);
  }
  return gesture.view;
}

export function endMapPointer(gesture: MapGesture, id: number, cancelled = false): string | null {
  if (!gesture.pointers.delete(id)) return null;
  if (cancelled) { gesture.moved = true; gesture.county = null; }
  if (gesture.pointers.size) { rebase(gesture); return null; }
  const county = !gesture.moved ? gesture.county : null;
  gesture.county = null;
  gesture.origin.clear();
  return county;
}

export function cancelMapGesture(gesture: MapGesture) {
  gesture.pointers.clear();
  gesture.origin.clear();
  gesture.county = null;
  gesture.moved = true;
}
