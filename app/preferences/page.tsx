import type { Metadata } from "next";
import { PreferencesForm } from "@/components/participation/preferences-form";
export const metadata:Metadata={title:"Email preferences | isitusa",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function Page(){return <PreferencesForm/>;}
