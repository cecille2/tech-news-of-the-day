import "dotenv/config";
import { prisma } from "@/lib/db";
import { DEFAULT_SOURCE_CATALOG } from "@/lib/ingestion/sourceCatalog";

/**
 * Seeds the default source catalog. Health-checks every feed URL before
 * inserting it — a publisher's RSS can disappear without notice, and we'd
 * rather skip a stale entry at seed time than silently ship a dead source.
 */
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

async function main() {
  console.log(`[seed] checking ${DEFAULT_SOURCE_CATALOG.length} catalog sources…`);

  for (const source of DEFAULT_SOURCE_CATALOG) {
    const healthy = await healthCheck(source.feedUrl);
    if (!healthy) {
      console.warn(`[seed] SKIPPING "${source.name}" — feed did not respond OK: ${source.feedUrl}`);
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
    console.log(`[seed] ok: ${source.name}`);
  }

  console.log("[seed] done.");
}

main()
  .catch((err) => {
    console.error("[seed] fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
