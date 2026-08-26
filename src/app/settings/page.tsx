import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { PushSetup } from "@/components/PushSetup";
import { BriefingScheduleForm } from "@/components/BriefingScheduleForm";

// Reads live per-user DB state on every request — never statically prerender.
export const dynamic = "force-dynamic";

async function getYouTubeQuotaToday() {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const result = await prisma.youTubeQuotaLog.aggregate({
    _sum: { units: true },
    where: { date: startOfDay },
  });
  return result._sum.units ?? 0;
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const unitsUsed = await getYouTubeQuotaToday();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      <section className="mb-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-semibold mb-3">Notifications</h2>
        <PushSetup />
      </section>

      <section className="mb-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-semibold mb-3">Briefing schedule</h2>
        <BriefingScheduleForm timezone={user.timezone} briefingHour={user.briefingHour} />
        <p className="text-xs text-neutral-500 mt-2">
          Checked every 30 minutes by the scheduled pipeline — see the Build Order in the README.
        </p>
      </section>

      <section className="mb-8 rounded-xl border border-neutral-200 dark:border-neutral-800 p-5">
        <h2 className="font-semibold mb-2">YouTube discovery quota</h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {unitsUsed.toLocaleString()} / 10,000 free daily units used today. Followed-channel monitoring uses free
          RSS and is unaffected by this — only keyword discovery search spends quota, and it degrades gracefully
          if the budget runs low.
        </p>
      </section>

      <nav className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/settings/sources" className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          <div className="font-semibold">Sources</div>
          <div className="text-sm text-neutral-500 mt-1">Default catalog + your own RSS/Substack feeds</div>
        </Link>
        <Link href="/settings/creators" className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          <div className="font-semibold">Creators</div>
          <div className="text-sm text-neutral-500 mt-1">Add creators, connect platforms, follow</div>
        </Link>
        <Link href="/settings/duplicates" className="rounded-xl border border-neutral-200 dark:border-neutral-800 p-5 hover:bg-neutral-100 dark:hover:bg-neutral-900">
          <div className="font-semibold">Possible duplicates</div>
          <div className="text-sm text-neutral-500 mt-1">Review topics clustering flagged as uncertain</div>
        </Link>
      </nav>
    </div>
  );
}
