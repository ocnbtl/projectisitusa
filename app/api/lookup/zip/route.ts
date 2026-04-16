import { NextResponse } from "next/server";

import { lookupZipToCounty } from "@/lib/geo/county-lookup";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
} as const;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { zip?: string } | null;
  const zip = body?.zip?.trim() ?? "";

  if (!/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      { ok: false, message: "Enter a valid 5-digit U.S. ZIP code." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const result = lookupZipToCounty(zip);

  if (!result) {
    return NextResponse.json(
      {
        ok: false,
        message:
          "ZIP lookup did not resolve to a county in the current dataset. Try another ZIP or click a county directly.",
      },
      { status: 404, headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json({ ok: true, data: result }, { headers: NO_STORE_HEADERS });
}
