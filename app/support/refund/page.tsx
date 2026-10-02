import type { Metadata } from "next";
import { RefundForm } from "@/components/participation/refund-form";
export const metadata: Metadata = { title: "Request a contribution refund | isitusa", description: "Submit a contribution refund request for individual review." };
export default function Page() { return <RefundForm/>; }
