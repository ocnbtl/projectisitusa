import { ShieldCheck, Wallet, FileText, CalendarDays, Megaphone, Users, ScanSearch, ChartNoAxesCombined, Mail, ClipboardCheck } from "lucide-react";
import type { Permission } from "@/lib/participation/contracts";
export function RoleIcon({permissions,owner=false,size=20}:{permissions:readonly Permission[];owner?:boolean;size?:number}){
 const Icon=owner?ShieldCheck:permissions.includes("team")?Users:permissions.includes("finance")?Wallet:permissions.includes("approve")?ClipboardCheck:permissions.includes("audience")?Mail:permissions.includes("content")?FileText:permissions.includes("events")?CalendarDays:permissions.includes("outreach")?Megaphone:permissions.includes("analytics")?ChartNoAxesCombined:ScanSearch;
 return <Icon size={size} aria-hidden="true"/>;
}
