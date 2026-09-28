export interface MapCountBand { min: number; max: number; label: string; color: string }
const colors = ["#f1e6aa", "#e3c86d", "#eea455", "#e27943", "#c84c38", "#922f35"];

/** Quantile starts on observed positive counts; zero and unavailable never share a band.
 * Absolute labels are retained and geographic scope is displayed beside the legend.
 */
export function createMapCountBands(values: number[]): MapCountBand[] {
  const positive = values.filter(value => Number.isSafeInteger(value) && value > 0).sort((a, b) => a - b);
  const zero = { min: 0, max: 0, label: "0", color: "var(--county-none)" };
  if (!positive.length) return [zero];
  const max = positive[positive.length - 1];
  const starts = [...new Set([1, ...Array.from({ length: 5 }, (_, i) => positive[Math.floor(positive.length * (i + 1) / 6)])])].filter(value => value <= max);
  return [zero, ...starts.map((min, i) => {
    const end = i + 1 < starts.length ? starts[i + 1] - 1 : max;
    return { min, max: end, label: min === end ? String(min) : `${min}–${end}`, color: colors[starts.length === 1 ? 2 : Math.round(i * (colors.length - 1) / (starts.length - 1))] };
  })];
}
export const MAP_COUNT_BANDS = createMapCountBands([1, 10, 25, 50, 100, 200]);
export function mapCountColor(count: number, hasData: boolean, bands: MapCountBand[] = MAP_COUNT_BANDS): string {
  if (!hasData || !Number.isSafeInteger(count) || count < 0) return "var(--county-unknown)";
  return [...bands].reverse().find(band => count >= band.min)?.color ?? "var(--county-none)";
}
