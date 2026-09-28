export type MapArea = { left: number; right: number; top: number; bottom: number };
export type MapViewport = { width: number; height: number; area: MapArea };

// Never publish a partially measured or inverted viewport to the projection.
export function measuredMapViewport(width: number, height: number, area: MapArea): MapViewport | null {
  if (![width, height, ...Object.values(area)].every(Number.isFinite) || width <= 0 || height <= 0) return null;
  const left = Math.max(0, Math.min(area.left, width - 1));
  const right = Math.min(width, Math.max(left + 1, area.right));
  const top = Math.max(0, Math.min(area.top, height - 1));
  const bottom = Math.min(height, Math.max(top + 1, area.bottom));
  return { width, height, area: { left, right, top, bottom } };
}

export function sameMapViewport(a: MapViewport | null, b: MapViewport): boolean {
  return Boolean(a && a.width === b.width && a.height === b.height &&
    a.area.left === b.area.left && a.area.right === b.area.right && a.area.top === b.area.top && a.area.bottom === b.area.bottom);
}
