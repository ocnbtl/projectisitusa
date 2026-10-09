import { notFound } from "next/navigation";
import { WorkspacePreview } from "@/components/admin/workspace-preview";
import { AccountPreview } from "@/components/admin/account-preview";
export const metadata = { title: "Workspace design verification | isitusa", robots: { index: false, follow: false } };
export default async function Page({searchParams}:{searchParams:Promise<{flow?:string}>}) {
  // Synthetic presentation harness only. No identity, private data or write client.
  // Production builds never render this surface.
  if (process.env.VERCEL_ENV !== "preview") notFound();
  return (await searchParams).flow==="account"?<AccountPreview/>:<WorkspacePreview/>;
}
