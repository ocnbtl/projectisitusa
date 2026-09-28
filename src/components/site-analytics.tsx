"use client";
import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { isPrivateAnalyticsRoute, mayTrackUrl } from "@/lib/ui/analytics-privacy";

export function SiteAnalytics() {
  const pathname = usePathname();
  if (isPrivateAnalyticsRoute(pathname)) return null;
  // The filter also covers a previously loaded analytics script after navigation.
  return <Analytics beforeSend={(event) => mayTrackUrl(event.url) ? event : null} />;
}
