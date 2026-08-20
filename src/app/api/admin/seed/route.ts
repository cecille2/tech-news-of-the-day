import { NextRequest, NextResponse } from "next/server";
import { seedSourceCatalog } from "@/lib/ingestion/seedCatalog";

/**
 * One-time source-catalog seeding endpoint for deployments with no local
 * Node access (e.g. Vercel-only setups where `npm run seed` can't be run).
 * Gated behind SEED_TOKEN so it can't be triggered by a stranger who finds
 * the URL; fails closed if the token isn't configured at all.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.SEED_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "SEED_TOKEN is not configured on the server." },
      { status: 401 },
    );
  }

  const provided = req.headers.get("x-seed-token");
  if (provided !== expected) {
    return NextResponse.json({ error: "Invalid seed token." }, { status: 401 });
  }

  const result = await seedSourceCatalog();
  return NextResponse.json(result);
}
