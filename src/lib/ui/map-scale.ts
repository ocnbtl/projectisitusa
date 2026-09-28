/** Fixed count bands keep equal counts comparable across states and filters. */
export const MAP_COUNT_BANDS = [
  { min: 0, label: "0", color: "var(--county-none)" },
  { min: 1, label: "1–9", color: "var(--county-band-1)" },
  { min: 10, label: "10–24", color: "var(--county-band-2)" },
  { min: 25, label: "25–49", color: "var(--county-band-3)" },
  { min: 50, label: "50–99", color: "var(--county-band-4)" },
  { min: 100, label: "100–199", color: "var(--county-band-5)" },
  { min: 200, label: "200+", color: "var(--county-band-6)" },
] as const;

export function mapCountColor(count: number, hasData: boolean): string {
  if (!hasData || !Number.isFinite(count) || count < 0) return "var(--county-unknown)";
  return [...MAP_COUNT_BANDS].reverse().find(band => count >= band.min)!.color;
}
