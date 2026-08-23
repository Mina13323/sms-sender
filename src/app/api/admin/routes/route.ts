import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, requireAdmin } from "@/lib/auth";
import { routeCreateSchema } from "@/lib/schema";
import { createRoute, listRoutes, routeToPublic } from "@/lib/data/routes";
import { getProvider } from "@/lib/data/providers";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const routes = await listRoutes(false);
  return NextResponse.json({ success: true, routes: routes.map(routeToPublic) });
}

export async function POST(req: NextRequest) {
  const originError = assertSameOrigin(req);
  if (originError) return originError;

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = routeCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const provider = await getProvider(parsed.data.providerId);
  if (!provider) {
    return NextResponse.json(
      { success: false, message: "Selected provider does not exist." },
      { status: 400 },
    );
  }

  const route = await createRoute(parsed.data);
  return NextResponse.json({ success: true, route: routeToPublic(route) }, { status: 201 });
}
