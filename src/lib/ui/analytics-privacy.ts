export function isPrivateAnalyticsRoute(pathname: string): boolean {
  return ["/admin", "/auth", "/preferences", "/join", "/report", "/volunteer", "/support", "/checkout", "/contact", "/uploads", "/account", "/privacy"].some(
    route => pathname === route || pathname.startsWith(route + "/"),
  );
}
export function mayTrackUrl(value: string): boolean {
  try { return !isPrivateAnalyticsRoute(new URL(value, "https://isitusa.com").pathname); }
  catch { return false; }
}

// Keep the existing staff/test exclusion effective across every optional vendor.
export function optionalAnalyticsExcluded(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return true;
  try {
    if (new URLSearchParams(location.search).get("analytics") === "off") localStorage.setItem("isitusa.analytics-exclude.v1", "yes");
    return Boolean(navigator.webdriver) || localStorage.getItem("isitusa.analytics-exclude.v1") === "yes";
  } catch { return true; }
}
