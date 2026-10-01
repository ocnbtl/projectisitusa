export interface MapCountBand { min: number; max: number; label: string; color: string }
const colors = ["#f1e6aa", "#e3c86d", "#eea455", "#e27943", "#c84c38", "#922f35"];

/** RGB interpolation matches the browser's sRGB legend gradient. */
export function interpolateMapColor(left: string, right: string, position: number): string {
  const t = Math.max(0, Math.min(1, position));
  return "#" + [1, 3, 5].map(offset => {
    const a = parseInt(left.slice(offset, offset + 2), 16);
    const b = parseInt(right.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * t).toString(16).padStart(2, "0");
  }).join("");
}

/** Positive quantile anchors retain exact counts. Colors interpolate between them;
 * zero and unavailable are separate, and the geographic scope is retained.
 */
export function createMapCountBands(values: number[], palette: readonly string[] = colors): MapCountBand[] {
  const positive = values.filter(value => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b);
  const zero = { min: 0, max: 0, label: "0", color: "var(--county-none)" };
  if (!positive.length) return [zero];
  const anchors = [...new Set([positive[0], ...Array.from({ length: 4 }, (_, i) => positive[Math.floor((positive.length - 1) * (i + 1) / 5)]), positive[positive.length - 1]])];
  const stops = palette.length ? palette : colors;
  return [zero, ...anchors.map((count, index) => {
    const position = (anchors.length === 1 ? .5 : index / (anchors.length - 1)) * (stops.length - 1);
    const low = Math.floor(position), high = Math.ceil(position);
    return { min: count, max: count, label: String(count), color: interpolateMapColor(stops[low], stops[high], position - low) };
  })];
}
export const MAP_COUNT_BANDS = createMapCountBands([1, 10, 25, 50, 100, 200]);
export function mapCountColor(count: number, hasData: boolean, bands: MapCountBand[] = MAP_COUNT_BANDS): string {
  if (!hasData || !Number.isSafeInteger(count) || count < 0) return "var(--county-unknown)";
  if (count === 0) return "var(--county-none)";
  const anchors = bands.filter(band => band.min > 0);
  if (!anchors.length) return "var(--county-unknown)";
  if (count <= anchors[0].min) return anchors[0].color;
  const high = anchors.findIndex(anchor => anchor.min >= count);
  if (high < 0) return anchors[anchors.length - 1].color;
  const left = anchors[high - 1], right = anchors[high];
  return interpolateMapColor(left.color, right.color, (count - left.min) / (right.min - left.min));
}

/** Keep intersecting county geometry in the scale even when its center is off-screen. */
export function boundsIntersectView(bounds: [[number, number], [number, number]], view: { x: number; y: number; k: number }, area: { left: number; right: number; top: number; bottom: number }): boolean {
  if (!bounds.flat().every(Number.isFinite)) return false;
  return bounds[1][0] * view.k + view.x >= area.left
    && bounds[0][0] * view.k + view.x <= area.right
    && bounds[1][1] * view.k + view.y >= area.top
    && bounds[0][1] * view.k + view.y <= area.bottom;
}
