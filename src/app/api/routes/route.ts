import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listRoutes, routeToPublic } from "@/lib/data/routes";

export const runtime = "nodejs";

/** GET /api/routes — active routes for the send page selector (no secrets). */
export async function GET() {
  const auth = await requireUser();
  if (auth.error) return auth.error;

  const routes = await listRoutes(true);
  return NextResponse.json({
    success: true,
    routes: routes.map((r) => {
      const pub = routeToPublic(r);
      return {
        id: pub.id,
        country: pub.country,
        countryCode: pub.countryCode,
        carrier: pub.carrier,
        pricePerSegment: pub.pricePerSegment,
        currency: pub.currency,
      };
    }),
  });
}
