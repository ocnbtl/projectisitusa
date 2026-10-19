import { Suspense } from "react";
import type { Metadata } from "next";
import { Observations } from "@/components/participation/observations";
export const metadata:Metadata={title:"Reviewed observations | ISITUSA",description:"Explore county-level observations reviewed by the ISITUSA team.",robots:{index:false,follow:true}};
export default function Page(){return <Suspense fallback={<p>Loading observations...</p>}><Observations/></Suspense>;}
