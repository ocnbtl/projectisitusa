import type { Metadata } from "next";

import { ResearchControlCenter } from "@/components/research-control-center";

export const metadata: Metadata = {
  title: "Research status | Project Isitusa",
  description: "Alabama county research coverage, source operations, and review queue status.",
};

export default function ResearchPage() {
  return <ResearchControlCenter />;
}
