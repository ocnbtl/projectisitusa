import imageAssets from "@/data/runtime/image-assets.json";
const assets: Record<string, { full: { src: string }; thumbnail: { src: string } }> = imageAssets.assets;
export function getSpeciesImageAsset(source: string) { return assets[source]; }
export const legacyCatalogImages = Object.keys(assets).filter(source => source.startsWith("/species/catalog/")).map(source => source.slice("/species/catalog/".length));
