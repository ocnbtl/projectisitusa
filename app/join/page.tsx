import type { Metadata } from "next";
import { JoinForm } from "@/components/participation/join-form";
export const metadata:Metadata={title:"Email updates | isitusa",description:"Choose county updates, species alerts, practical facts, and ways to help."};
export default function Page(){return <JoinForm/>;}
