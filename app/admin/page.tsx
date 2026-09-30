import type { Metadata } from "next";
import { Workspace } from "@/components/admin/workspace";
export const metadata:Metadata={title:"Team workspace | isitusa",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function Page(){return <Workspace/>;}
