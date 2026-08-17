import counties from "@/data/generated/counties.json";
import type { CountyRecord } from "@/lib/data/types";

export const countyIndex = counties as unknown as Record<string, CountyRecord>;
