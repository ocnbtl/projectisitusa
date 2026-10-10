import type { Metadata } from "next";
import { SupportForm } from "@/components/participation/support-form";
export const metadata:Metadata={title:"Support the work | ISITUSA",description:"Help ISITUSA make invasive species information easier to find and use."};
export default function Page(){return <SupportForm/>;}
