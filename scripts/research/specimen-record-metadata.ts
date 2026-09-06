import { createHash } from "node:crypto";
import { once } from "node:events";
import { parse } from "csv-parse";
import { spawnZipEntry } from "./zip-tools";

export type SpecimenDate =
  | { status: "dated"; eventDate: string; year: number }
  | { status: "undated"; eventDate: null; year: null }
  | { status: "rejected"; reason: string };

export type SpecimenMetadataRecovery = {
  version: 1;
  asOf: string;
  extractedAt: string;
  preflightSha256: string;
  witnessSetSha256: string;
};

export type SpecimenRecoveryWitness = {
  recordId: string;
  occurrenceId: string;
  eventDate: string | null;
  year: number | null;
  identityKey?: string;
  sourceRowSha256?: string;
  sourceRow?: Record<string, string>;
};

/** These reviewed contradictions supplement, rather than replace, the source filters. */
export function specimenRecoveryHold(row: Record<string, string | undefined>): string | null {
  // Source county contradicts the named locality; retain for source correction, never reassign silently.
  const geographyHolds = new Set([
    "2e86bd0f8c86191695856193b8fb998f11bee6c6ed60871305ee9d91ee6e66e4",
    "50011c71ff7700b4356a2204a5bff132c0c932a0c1944355939214df705929aa",
  ]);
  if (geographyHolds.has(specimenRowSha256(row))) return "reviewed-county-locality-conflict";
  const narrative = [row.locality, row.verbatimLocality, row.locationRemarks, row.occurrenceRemarks,
    row.habitat, row.fieldNotes, row.preparations, row.establishmentMeans, row.degreeOfEstablishment]
    .filter(Boolean).join(" ");
  if (/\bgreen[\s-]+house\b/iu.test(narrative)) return "cultivated-greenhouse-text";
  if (/\binaturalist\s+observation\b/iu.test(narrative)) return "physical-voucher-basis-conflict";
  return null;
}

export function validateSpecimenRecoveryWitness(target: SpecimenRecoveryWitness, recovery: SpecimenMetadataRecovery) {
  const row = target.sourceRow;
  if (!row || Object.values(row).some((value) => typeof value !== "string")) throw new Error("Recovery raw source row is required.");
  if (specimenRowSha256(row) !== target.sourceRowSha256) throw new Error("Recovery source row hash differs.");
  const identity = specimenRecordIdentity(row);
  if (!identity || identity.recordId !== target.recordId || identity.occurrenceId !== target.occurrenceId
    || identity.identityKey !== target.identityKey) throw new Error("Recovery stable identity differs.");
  const date = parseSpecimenDate(row, recovery.asOf);
  if (date.status === "rejected" || date.eventDate !== target.eventDate || date.year !== target.year) {
    throw new Error("Recovery event date differs or is invalid.");
  }
  const hold = specimenRecoveryHold(row);
  if (hold) throw new Error(`Recovery witness held: ${hold}.`);
}

function validCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Missing dates support historical occurrence only; malformed dates are not missing. */
export function parseSpecimenDate(row: Record<string, string | undefined>, asOf: string): SpecimenDate {
  if (!validCalendarDate(asOf)) throw new Error("A valid explicit --as-of YYYY-MM-DD is required.");
  const eventDate = row.eventDate?.trim() ?? "";
  const explicitYear = row.year?.trim() ?? "";
  if (!eventDate && !explicitYear) {
    if ([row.month, row.day, row.verbatimEventDate].some((value) => value?.trim())) {
      return { status: "rejected", reason: "event-date-partial-or-verbatim-unresolved" };
    }
    return { status: "undated", eventDate: null, year: null };
  }
  if (explicitYear && !/^\d{4}$/u.test(explicitYear)) {
    return { status: "rejected", reason: "event-year-malformed" };
  }
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u.exec(eventDate || explicitYear);
  if (!match) return { status: "rejected", reason: "event-date-malformed" };
  const year = Number(match[1]);
  if (year < 1500) return { status: "rejected", reason: "event-year-out-of-range" };
  if (explicitYear && year !== Number(explicitYear)) {
    return { status: "rejected", reason: "event-date-year-conflict" };
  }
  const explicitMonth = row.month?.trim() ?? "";
  const explicitDay = row.day?.trim() ?? "";
  if ((explicitMonth && (!/^\d{1,2}$/u.test(explicitMonth) || Number(explicitMonth) < 1 || Number(explicitMonth) > 12))
    || (explicitDay && (!/^\d{1,2}$/u.test(explicitDay) || Number(explicitDay) < 1 || Number(explicitDay) > 31))) {
    return { status: "rejected", reason: "event-date-components-invalid" };
  }
  if ((match[2] && explicitMonth && Number(match[2]) !== Number(explicitMonth))
    || (match[3] && explicitDay && Number(match[3]) !== Number(explicitDay))) {
    return { status: "rejected", reason: "event-date-components-conflict" };
  }
  const month = match[2] ?? (explicitMonth ? explicitMonth.padStart(2, "0") : undefined);
  const day = match[3] ?? (explicitDay ? explicitDay.padStart(2, "0") : undefined);
  if (day && !month) return { status: "rejected", reason: "event-date-partial-or-verbatim-unresolved" };
  const earliest = `${match[1]}-${month ?? "01"}-${day ?? "01"}`;
  if (!validCalendarDate(earliest)) return { status: "rejected", reason: "event-date-calendar-invalid" };
  if (earliest > asOf) return { status: "rejected", reason: "event-date-future" };
  return { status: "dated", eventDate: `${match[1]}${month ? `-${month}` : ""}${day ? `-${day}` : ""}`, year };
}

export function specimenRecordIdentity(row: Record<string, string | undefined>) {
  const recordId = row.id?.trim() ?? "";
  const occurrenceId = row.occurrenceID?.trim() ?? "";
  if (!recordId && !occurrenceId) return null;
  if ([recordId, occurrenceId].some((value) => value.length > 1024 || /[\u0000-\u001f\u007f]/u.test(value))) return null;
  return { recordId, occurrenceId, identityKey: occurrenceId ? `occurrence:${occurrenceId}` : `core:${recordId}` };
}

/** Hash complete normalized parser output, retaining empty fields and original text. */
export function specimenRowSha256(row: Record<string, string | undefined>) {
  const entries = Object.entries(row).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

/** A second complete archive pass checks selected identities even in rejected rows. */
export class SpecimenIdentityAudit {
  private readonly seen = new Set<string>();
  private readonly conflicts = new Set<string>();

  constructor(private readonly expected: ReadonlyMap<string, string>) {}

  observe(row: Record<string, string | undefined>) {
    const keys = [row.occurrenceID?.trim() ? `occurrence:${row.occurrenceID.trim()}` : null,
      row.id?.trim() ? `core:${row.id.trim()}` : null].filter((key): key is string => key !== null);
    for (const key of keys) {
      const expectedHash = this.expected.get(key);
      if (!expectedHash) continue;
      this.seen.add(key);
      if (specimenRowSha256(row) !== expectedHash) this.conflicts.add(key);
    }
  }

  result() {
    return {
      expectedIdentities: this.expected.size,
      observedIdentities: this.seen.size,
      conflictingIdentities: [...this.conflicts].sort(),
      missingIdentities: [...this.expected.keys()].filter((key) => !this.seen.has(key)).sort(),
    };
  }
}

export async function auditSpecimenArchiveIdentities(archive: string, expected: ReadonlyMap<string, string>) {
  const audit = new SpecimenIdentityAudit(expected);
  const unzip = spawnZipEntry(archive, "occurrence.txt");
  const closed = once(unzip, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  const hash = createHash("sha256");
  let bytes = 0;
  let sourceRows = 0;
  let stderr = "";
  unzip.stderr.setEncoding("utf8");
  unzip.stderr.on("data", (chunk: string) => { stderr += chunk; });
  unzip.stdout.on("data", (chunk: Buffer) => { bytes += chunk.length; hash.update(chunk); });
  const parser = unzip.stdout.pipe(parse({ bom: true, columns: true, delimiter: "\t", quote: null,
    relax_column_count: true, skip_empty_lines: true }));
  try {
    for await (const row of parser) { sourceRows += 1; audit.observe(row); }
    const [code, signal] = await closed;
    if (code !== 0) throw new Error(`Identity-audit extraction failed (${code ?? signal}): ${stderr.trim()}`);
    return { ...audit.result(), sourceRows, occurrenceBytes: bytes, occurrenceSha256: hash.digest("hex") };
  } catch (error) {
    parser.destroy();
    unzip.kill();
    throw error;
  }
}
