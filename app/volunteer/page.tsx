import type { Metadata } from "next";
import { VolunteerForm } from "@/components/participation/volunteer-form";
export const metadata:Metadata={title:"Volunteer with ISITUSA",description:"Bring your skills, curiosity, and care for the natural world. Help make invasive species research easier to find and use."};
export default function Page(){return <VolunteerForm/>;}
