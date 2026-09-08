import { getSpeciesImageAsset, legacyCatalogImages } from "@/lib/data/species-image-assets";
export const dynamic = "force-static";
export const dynamicParams = false;
export function generateStaticParams() { return legacyCatalogImages.map(image => ({ image })); }
// Preserve bookmarked image URLs and cached older pages without packaging originals.
export async function GET(_request: Request, { params }: { params: Promise<{ image: string }> }) {
  const asset = getSpeciesImageAsset(`/species/catalog/${(await params).image}`);
  if (!asset) return new Response("Image not found", { status: 404 });
  return new Response(null, { status: 308, headers: { Location: asset.full.src, "Cache-Control": "public, max-age=86400" } });
}
