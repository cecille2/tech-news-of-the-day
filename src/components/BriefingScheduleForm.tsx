"use client";

import { useActionState } from "react";
import { submitBriefingSchedule } from "@/lib/actions";

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

export function BriefingScheduleForm({ timezone, briefingHour }: { timezone: string; briefingHour: number }) {
  const [state, formAction, pending] = useActionState(submitBriefingSchedule, null);

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <select
        name="timezone"
        defaultValue={timezone}
        className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
      >
        {COMMON_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
      <select
        name="hour"
        defaultValue={briefingHour}
        className="rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
      >
        {Array.from({ length: 24 }, (_, h) => (
          <option key={h} value={h}>
            {h.toString().padStart(2, "0")}:00
          </option>
        ))}
      </select>
      <button
        disabled={pending}
        className="text-sm px-3 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {state && !pending && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">Saved ✓</span>
      )}
    </form>
  );
}
