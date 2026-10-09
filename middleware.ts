// Reject the synthetic review harness before React streaming can send a 200.
// The page-level guard remains in place as a second boundary.
export function middleware() {
  if (process.env.VERCEL_ENV === "preview") return;
  return new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  });
}

export const config = { matcher: ["/admin/preview/:path*"] };
