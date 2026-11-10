import { NextResponse, type NextRequest } from "next/server";
import { teamDestination } from "./src/lib/team-routing";

export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  if (pathname === "/measurement/default") {
    // Read country at the hosting edge. Return only eligibility, and never cache
    // this response across visitors or enable the default on deployment previews.
    const enabled = hostname === "isitusa.com" &&
      process.env.VERCEL_ENV === "production" &&
      request.headers.get("x-vercel-ip-country") === "US" &&
      request.headers.get("sec-gpc") !== "1" &&
      request.headers.get("dnt") !== "1";
    return new Response(null, {
      status: enabled ? 204 : 403,
      headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  // Reject the synthetic harness on every production hostname before streaming.
  if ((pathname === "/admin/preview" || pathname.startsWith("/admin/preview/")) && process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  const destination = teamDestination(hostname, pathname);
  if (!destination && pathname === "/species/page/1") {
    const canonical = request.nextUrl.clone();
    canonical.pathname = "/species";
    return NextResponse.redirect(canonical, 308);
  }
  const response = destination ? NextResponse.redirect(new URL(destination), 307) : NextResponse.next();
  if (hostname === "team.isitusa.com" || pathname.startsWith("/admin") || pathname.startsWith("/auth/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/).*)"] };
