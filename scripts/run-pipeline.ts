import "dotenv/config";
import { runDailyPipeline } from "@/lib/pipeline/runDailyPipeline";

async function main() {
  console.log("[pipeline] starting…");
  const result = await runDailyPipeline();
  console.log(`[pipeline] ${result.status} — ${result.storiesProcessed} stories, ` +
    `${result.topicsCreated} new topics, ${result.topicsUpdated} updated topics`);
  if (result.warnings.length > 0) {
    console.log("[pipeline] warnings:");
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  if (result.status === "FAILED") process.exitCode = 1;
}

main().catch((err) => {
  console.error("[pipeline] fatal error:", err);
  process.exitCode = 1;
});
