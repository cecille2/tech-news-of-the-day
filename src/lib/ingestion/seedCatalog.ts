import { prisma } from "@/lib/db";
import { DEFAULT_SOURCE_CATALOG } from "./sourceCatalog";

async function healthCheck(feedUrl: string): Promise<boolean> {
  try {
    const res = await fetch(feedUrl, {
      method: "GET",
      headers: { "User-Agent": "daily-briefing-bot/1.0 (+personal project)" },
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface SeedResult {
  added: string[];
  skipped: string[];
}

/** Health-checks every default catalog feed before inserting it — a
 * publisher's RSS can disappear without notice, and we'd rather skip a
 * stale entry at seed time than silently ship a dead source. Shared by
 * the CLI script (scripts/seed.ts) and the one-time /api/admin/seed route. */
export async function seedSourceCatalog(): Promise<SeedResult> {
  const added: string[] = [];
  const skipped: string[] = [];

  for (const source of DEFAULT_SOURCE_CATALOG) {
    const healthy = await healthCheck(source.feedUrl);
    if (!healthy) {
      skipped.push(source.name);
      continue;
    }

    await prisma.sourceCatalogEntry.upsert({
      where: { feedUrl: source.feedUrl },
      update: {
        name: source.name,
        sourceType: source.sourceType,
        tier: source.tier,
        category: source.category,
        isPrimary: source.isPrimary ?? false,
      },
      create: {
        name: source.name,
        feedUrl: source.feedUrl,
        sourceType: source.sourceType,
        tier: source.tier,
        category: source.category,
        isPrimary: source.isPrimary ?? false,
      },
    });
    added.push(source.name);
  }

  return { added, skipped };
}
