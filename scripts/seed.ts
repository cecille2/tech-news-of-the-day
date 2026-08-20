import "dotenv/config";
import { prisma } from "@/lib/db";
import { seedSourceCatalog } from "@/lib/ingestion/seedCatalog";

async function main() {
  const { added, skipped } = await seedSourceCatalog();
  for (const name of added) console.log(`[seed] ok: ${name}`);
  for (const name of skipped) console.warn(`[seed] SKIPPING "${name}" — feed did not respond OK`);
  console.log("[seed] done.");
}

main()
  .catch((err) => {
    console.error("[seed] fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
