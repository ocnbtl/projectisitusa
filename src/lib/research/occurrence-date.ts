/** Preserve source precision; bounds are used for comparison only, never as invented observation dates. */
export type OccurrenceDateBounds = {
  start: number;
  end: number;
  precision: "year" | "month" | "day" | "instant" | "interval";
};
const DAY = 86_400_000;
const datePattern = /^\d{4}-\d{2}-\d{2}$/u;
function monthDays(year: number, month: number) {
  return [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}
function validDay(value: string) {
  if (!datePattern.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= monthDays(year, month);
}
function dayStart(value: string) { return Date.parse(value + "T00:00:00.000Z"); }
export function occurrenceDateBounds(value: string | null | undefined): OccurrenceDateBounds | null {
  if (!value) return null;
  if (/^\d{4}$/u.test(value)) {
    if (Number(value) < 1) return null;
    return { start: dayStart(value + "-01-01"), end: dayStart(value + "-12-31") + DAY - 1, precision: "year" };
  }
  if (/^\d{4}-\d{2}$/u.test(value)) {
    if (!validDay(value + "-01")) return null;
    const [year, month] = value.split("-").map(Number);
    return { start: dayStart(value + "-01"), end: dayStart(value + "-" + monthDays(year, month)) + DAY - 1, precision: "month" };
  }
  if (validDay(value)) return { start: dayStart(value), end: dayStart(value) + DAY - 1, precision: "day" };
  if (value.includes("/")) {
    const parts = value.split("/");
    if (parts.length !== 2 || !parts.every(validDay) || parts[0] > parts[1]) return null;
    return { start: dayStart(parts[0]), end: dayStart(parts[1]) + DAY - 1, precision: "interval" };
  }
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match || !validDay(match[1]) || Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) return null;
  if (match[5] !== "Z") {
    const [hours, minutes] = match[5].slice(1).split(":").map(Number);
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) return null;
  }
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? { start: instant, end: instant, precision: "instant" } : null;
}

/** Never render a year-only source record as January 1. Unrecognized source text remains visible. */
export function formatOccurrenceDate(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const bounds = occurrenceDateBounds(value);
  if (!bounds || bounds.precision === "year") return value;
  if (bounds.precision === "interval") return value.split("/").map(formatOccurrenceDate).join(" to ");
  return new Intl.DateTimeFormat("en-US", {
    month: "short", ...(bounds.precision === "month" ? {} : { day: "numeric" }), year: "numeric", timeZone: "UTC",
  }).format(new Date(bounds.start));
}
