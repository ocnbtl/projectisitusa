import { notFound } from "next/navigation";
import { WorkspacePreview } from "@/components/admin/workspace-preview";
export const metadata = { title: "Workspace design verification | isitusa", robots: { index: false, follow: false } };
export default function Page() {
  // Synthetic presentation harness only. No identity, private data or write client.
  // Production builds never render this surface.
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return <WorkspacePreview/>;
}
