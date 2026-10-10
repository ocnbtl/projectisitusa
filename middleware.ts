import { NextResponse, type NextRequest } from "next/server";
import { teamDestination } from "./src/lib/team-routing";

export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;
  // Reject the synthetic harness on every production hostname before streaming.
  if ((pathname === "/admin/preview" || pathname.startsWith("/admin/preview/")) && process.env.VERCEL_ENV !== "preview") {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
  }
  const destination = teamDestination(hostname, pathname);
  const response = destination ? NextResponse.redirect(new URL(destination), 307) : NextResponse.next();
  if (hostname === "team.isitusa.com" || pathname.startsWith("/admin") || pathname.startsWith("/auth/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|fonts/).*)"] };
