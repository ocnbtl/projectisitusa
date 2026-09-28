import type { Metadata } from "next";
import { ReportForm } from "@/components/participation/report-form";
export const metadata:Metadata={title:"Share an observation | IsItUSA",description:"Share a species observation for review."};
export default function Page(){return <ReportForm/>;}
