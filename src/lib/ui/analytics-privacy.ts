export function isPrivateAnalyticsRoute(pathname: string): boolean {
  return ["/admin", "/auth", "/preferences", "/join", "/report"].some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

export function mayTrackUrl(value: string): boolean {
  try { return !isPrivateAnalyticsRoute(new URL(value, "https://isitusa.com").pathname); }
  catch { return false; }
}
