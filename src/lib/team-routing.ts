export const TEAM_ORIGIN = "https://team.isitusa.com";
export const PUBLIC_ORIGIN = "https://isitusa.com";

// Exact host matching; never trust suffixes or a user-supplied redirect target.
export function teamDestination(hostname: string, pathname: string): string | null {
  if (hostname !== "team.isitusa.com") return null;
  if (pathname === "/") return TEAM_ORIGIN + "/admin";
  if (pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/auth/confirm" || pathname === "/api/contributions/checkout" || pathname.startsWith("/_next/") || pathname.startsWith("/brand/") || pathname.startsWith("/fonts/") || pathname === "/favicon.ico") return null;
  return PUBLIC_ORIGIN + pathname;
}
