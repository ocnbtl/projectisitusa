import "server-only";
import published from "@/content/species-profile-published.json";

interface PublishedProfile {
  identification: string[];
  actions: string[];
  sources: { label: string; url: string }[];
  evidenceStatus: string;
}

// Detailed guidance and references stay on the server; the directory only loads summaries.
export function getPublishedSpeciesProfile(id: string): PublishedProfile | undefined {
  return (published as Record<string, PublishedProfile>)[id];
}
