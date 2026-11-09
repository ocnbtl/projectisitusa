import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { allSpecies } from "@/lib/data/species-store";
import { SpeciesDirectoryPage } from "@/components/species-directory-page";
import { directoryPageCount, directoryPagePath } from "@/lib/ui/species-directory-pagination";

export const dynamicParams = true;
export function generateStaticParams() {
  return Array.from({ length: directoryPageCount(allSpecies.length) - 1 }, (_, index) => ({ page: String(index + 2) }));
}
function parsePage(value: string) {
  if (!/^[1-9]\d*$/.test(value)) notFound();
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page > directoryPageCount(allSpecies.length)) notFound();
  if (page === 1) permanentRedirect("/species");
  return page;
}
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> {
  const page = parsePage((await params).page);
  return { title: `Species - Page ${page} | ISITUSA`, description: `Browse page ${page} of the species catalog for identification guidance, county records and sources.`, alternates: { canonical: "https://isitusa.com" + directoryPagePath(page) } };
}
export default async function Page({ params }: { params: Promise<{ page: string }> }) {
  return <SpeciesDirectoryPage page={parsePage((await params).page)} />;
}
