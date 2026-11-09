import type { Metadata } from "next";
import { ReportForm } from "@/components/participation/report-form";
export const metadata: Metadata = {
  title: "Share an observation | ISITUSA",
  description: "Share a species observation for review.",
  alternates: { canonical: "https://isitusa.com/report" },
};
export default function Page() { return <ReportForm />; }

