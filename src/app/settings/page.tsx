import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { updateBriefingSchedule } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { PushSetup } from "@/components/PushSetup";

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

// IANA timezones — a short, practical list rather than all ~400.
const COMMON_TIMEZONES = [
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Asia/Tokyo",
  "Australia/Sydney",
];

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
        <form action={async (formData: FormData) => {
          "use server";
          const timezone = String(formData.get("timezone"));
          const hour = Number(formData.get("hour"));
          await updateBriefingSchedule(timezone, hour, 0);
        }} className="flex flex-wrap items-center gap-3">
          <select name="timezone" defaultValue={user.timezone} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm">
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
          <select name="hour" defaultValue={user.briefingHour} className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm">
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{h.toString().padStart(2, "0")}:00</option>
            ))}
          </select>
          <button className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            Save
          </button>
        </form>
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
