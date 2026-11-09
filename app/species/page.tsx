import type { Metadata } from "next";
import { SpeciesDirectoryPage } from "@/components/species-directory-page";
export const metadata: Metadata = {
  alternates: { canonical: "https://isitusa.com/species" },
  title: "Species | ISITUSA",
  description: "Look up a species, explore its recorded occurrences, and follow the sources behind its profile.",
};
export default function SpeciesPage() { return <SpeciesDirectoryPage />; }

