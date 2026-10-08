export const STREAMS = [
  { id: "counties", title: "My counties", detail: "Newly published records and important corrections. A weekly email when something changes." },
  { id: "species", title: "Species I follow", detail: "Follow the species you care about. A weekly roundup of meaningful changes." },
  { id: "facts", title: "Get to know invasive species", detail: "Identification tips, species stories, and practical facts, once a month." },
  { id: "action", title: "Ways to help", detail: "Occasional restoration opportunities, conservation campaigns, and ways to support the work." },
] as const;
export type Stream = typeof STREAMS[number]["id"];
export const PERMISSIONS = ["review", "review_decide", "audience", "finance", "analytics", "team"] as const;
export type Permission = typeof PERMISSIONS[number];
export const ROLE_PRESETS: {name:string; permissions:Permission[]; detail:string}[] = [
 {name:"Volunteer",permissions:["review"],detail:"Inspect sightings and record preliminary reviews."},
 {name:"Lead reviewer",permissions:["review","review_decide"],detail:"Accept or reject observations for research review."},
 {name:"Communications",permissions:["audience","analytics"],detail:"Manage email content and view site usage."},
 {name:"Operations",permissions:["review","review_decide","audience","finance","analytics"],detail:"Manage day-to-day project operations."},
 {name:"Team manager",permissions:["review","team"],detail:"Invite volunteers. Only the owner can grant elevated access."},
];
export const REVIEW_STATES = ["submitted", "in_review", "needs_info", "accepted", "rejected"] as const;
export type ReviewState = typeof REVIEW_STATES[number];
export const STATE_LABELS: Record<ReviewState, string> = {
  submitted: "Submitted", in_review: "In review", needs_info: "More information needed",
  accepted: "Accepted for research review", rejected: "Not accepted",
};
export const CONSENT_VERSION = "2026-09-28-v1";
export const MAX_PHOTOS = 3;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export type Preferences = { streams: Stream[]; counties: string[]; species: string[] };
export type CatalogItem = { id: string; label: string };
export type Staff = { user_id: string; email: string; display_name: string; is_owner: boolean; active: boolean; permissions: Permission[] };
export type Sighting = {
  id: string; species_label: string; county_id: string; observed_on: string; location_note: string;
  latitude: number | null; longitude: number | null; notes: string; contact_email: string | null;
  status: ReviewState; version: number; created_at: string; review_note: string | null;
  matched_species_id: string | null;
  assets?: { path: string; mime: string; bytes: number }[];
};
export type Subscriber = { id: string; email: string; confirmed_at: string | null; suppressed_at: string | null; suppression_reason: string | null; preferences: Preferences; created_at: string };
export type Contribution = { id: string; provider: "stripe" | "crypto"; provider_reference: string; currency: string; amount_minor: string; decimals: number; status: string; supporter_email: string | null; created_at: string; verification_note: string | null };
export type Wallet = { id: string; asset: string; network: string; address: string; verified_at: string; active: boolean };
export type PublicConfig = { email: boolean; reports: boolean; payments: boolean; wallets: Wallet[] };
export const EMPTY_PREFERENCES: Preferences = { streams: [], counties: [], species: [] };

export function normalizeEmail(value: unknown): string {
  if (typeof value !== "string") throw new Error("Enter a valid email address.");
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
  return email;
}
function selection(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || value.length > max || value.some(v => typeof v !== "string" || !v.length || v.length > 120)) throw new Error("Choose a smaller selection.");
  return [...new Set(value as string[])];
}
export function validatePreferences(value: unknown, requireStream = true): Preferences {
  if (!value || typeof value !== "object") throw new Error("Choose your email preferences.");
  const input = value as Record<string, unknown>;
  const streams = selection(input.streams, 4);
  if (streams.some(s => !STREAMS.some(item => item.id === s))) throw new Error("Unknown email choice.");
  const counties = selection(input.counties, 20);
  const species = selection(input.species, 20);
  if (requireStream && !streams.length) throw new Error("Choose at least one kind of update.");
  if (streams.includes("counties") && !counties.length) throw new Error("Choose at least one county.");
  if (streams.includes("species") && !species.length) throw new Error("Choose at least one species.");
  return { streams: streams as Stream[], counties: streams.includes("counties") ? counties : [], species: streams.includes("species") ? species : [] };
}
export function boundedText(value: unknown, label: string, max: number, required = true): string {
  if (typeof value !== "string") throw new Error(`Enter ${label}.`);
  const text = value.trim();
  if ((required && !text) || text.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error(`Check ${label} (up to ${max} characters).`);
  return text;
}
export function validateSighting(input: Record<string, unknown>, today = new Date().toISOString().slice(0, 10)) {
  const observed_on = boundedText(input.observed_on, "the observation date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(observed_on) || Number.isNaN(Date.parse(observed_on)) || new Date(observed_on).toISOString().slice(0,10) !== observed_on || observed_on > today || observed_on < "1900-01-01") throw new Error("Choose a valid observation date, no later than today.");
  const coordinate = (value: unknown, max: number) => {
    if (value === "" || value == null) return null;
    const result = Number(value);
    if (!Number.isFinite(result) || Math.abs(result) > max) throw new Error("Check the coordinates.");
    return result;
  };
  const latitude = coordinate(input.latitude, 90), longitude = coordinate(input.longitude, 180);
  if ((latitude === null) !== (longitude === null)) throw new Error("Include both coordinates, or leave both blank.");
  if (input.permission !== true) throw new Error("Please confirm permission to review your observation.");
  return {
    species_label: boundedText(input.species_label, "a species name, or Not sure", 180),
    county_id: boundedText(input.county_id, "a county", 5), observed_on,
    location_note: boundedText(input.location_note, "the location", 500),
    latitude, longitude, notes: boundedText(input.notes, "your notes", 3000, false),
    contact_email: input.contact_email ? normalizeEmail(input.contact_email) : null,
    permission_version: CONSENT_VERSION,
  };
}
export function photoType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length < 12 || bytes.length > MAX_PHOTO_BYTES) return null;
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return "image/png";
  const text = new TextDecoder("ascii");
  if (text.decode(bytes.slice(0,4)) === "RIFF" && text.decode(bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
export function donationAmount(value: unknown): number {
  const text = String(value);
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(text)) throw new Error("Enter an amount from $1 to $10,000.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2,"0"));
  if (!Number.isSafeInteger(cents) || cents < 100 || cents > 1_000_000) throw new Error("Enter an amount from $1 to $10,000.");
  return cents;
}
export function cryptoUri(wallet: Wallet): string | null {
  if (!wallet.active || !wallet.verified_at) return null;
  if (wallet.asset === "BTC" && wallet.network === "Bitcoin mainnet" && /^(bc1[ac-hj-np-z02-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(wallet.address)) return `bitcoin:${wallet.address}`;
  if (wallet.asset === "XMR" && wallet.network === "Monero mainnet" && /^[48][1-9A-HJ-NP-Za-km-z]{94}$/.test(wallet.address)) return `monero:${wallet.address}`;
  if (wallet.asset === "ETH" && wallet.network === "Ethereum mainnet" && /^0x[a-fA-F0-9]{40}$/.test(wallet.address)) return `ethereum:${wallet.address}@1`;
  return null;
}
export function displayAmount(amount: string, decimals: number, currency: string): string {
  if (!/^\d+$/.test(amount) || !Number.isInteger(decimals) || decimals < 0 || decimals > 18) return "Amount unavailable";
  const padded = amount.padStart(decimals + 1, "0");
  const number = decimals ? `${padded.slice(0,-decimals)}.${padded.slice(-decimals)}` : padded;
  return `${number} ${currency.toUpperCase()}`;
}
