// Reviewed public copy only. Dynamic text, contact details and injected strings
// stay masked even when inserted into otherwise public layout elements.
const publicCopy = new Set([
  "Accessible invasive species research to protect the places you love",
  "ISITUSA is an independent initiative established in the United States of America by environmentalists.",
  "Our mission is to make invasive species research accessible, understandable, and useful to everyone. We connect people with accurate information about the species near them, helping communities take informed action to protect native biodiversity and the places they love.",
  "Data gathered from trusted researchers", "Our approach", "Our data sources", "Get involved",
  "Every record needs context.", "Where", "When", "According to whom",
  "Brand kit.", "Sharing our work? Here are the official logos, lettering, and a few simple guidelines to help you present ISITUSA clearly.",
  "Logos", "Typography", "Colors", "Guidelines", "Choose a logo.", "Invasive Serif.",
  "Our colors.", "Keep it recognizable.", "Use our name clearly.", "Give the artwork room.",
  "Choose a clear contrast.", "Brand green", "White", "Black", "Download font", "Read usage notes",
]);
export function maskReplayText(text: string, element?: Element | null): string {
  if (element?.closest("[data-private], form, input, textarea, select, [contenteditable], dialog")) return text.replace(/\S/g, "*");
  return publicCopy.has(text.replace(/\s+/g, " ").trim()) ? text : text.replace(/\S/g, "*");
}
