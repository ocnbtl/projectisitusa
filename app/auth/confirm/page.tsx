import type { Metadata } from "next";
import { AuthConfirm } from "@/components/admin/auth-confirm";
export const metadata:Metadata={title:"Team account | IsItUSA",robots:{index:false,follow:false},referrer:"no-referrer"};
export default function Page(){return <AuthConfirm/>;}
