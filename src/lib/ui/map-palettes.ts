/** Sequential palettes change appearance only; count thresholds remain unchanged. */
export const MAP_PALETTES = [
  { id: "earth", name: "Earth", colors: ["#f1e6aa", "#e3c86d", "#eea455", "#e27943", "#c84c38", "#922f35"] },
  { id: "ocean", name: "Ocean", colors: ["#dceaf2", "#b2d5e8", "#80b8d6", "#4c93b8", "#2b678f", "#193f65"] },
  { id: "forest", name: "Forest", colors: ["#e3eccc", "#bfd799", "#94b96e", "#659345", "#3e6e36", "#244929"] },
  { id: "dusk", name: "Dusk", colors: ["#f3dce9", "#debadb", "#bb98c9", "#9974b1", "#744e92", "#4f2d6b"] },
] as const;
export type MapPaletteId = typeof MAP_PALETTES[number]["id"];
export const MAP_PALETTE_STORAGE_KEY = "isitusa-map-palette";
export function getMapPalette(value: unknown) {
  return MAP_PALETTES.find(palette => palette.id === value) ?? MAP_PALETTES[0];
}
