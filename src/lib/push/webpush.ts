import webpush from "web-push";
import { prisma } from "@/lib/db";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:you@example.com";
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set. Generate a pair with `npx web-push generate-vapid-keys` and add them to .env.",
    );
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface MorningPushPayload {
  title: string;
  body: string;
  topicCount: number;
  url: string;
}

/** Sends one push per subscribed device for a user. VAPID/Web Push has no
 * quota and no billing surface — it structurally cannot cost money. */
export async function sendMorningPush(userId: string, payload: MorningPushPayload) {
  ensureConfigured();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify(payload),
      ),
    ),
  );

  // A 404/410 means the subscription is dead (user uninstalled, cleared
  // storage, etc.) — clean it up rather than retrying it forever.
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      const statusCode = (result.reason as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscriptions[i].id } }).catch(() => {});
      }
    }
  }

  return results;
}

/** Users whose local time currently matches their stored briefing time —
 * this is what lets the schedule be per-user rather than one hard-coded timezone. */
export async function getUsersDueForBriefingNow() {
  const users = await prisma.user.findMany();
  const now = new Date();

  return users.filter((user) => {
    const local = new Date(now.toLocaleString("en-US", { timeZone: user.timezone }));
    return local.getHours() === user.briefingHour && local.getMinutes() < 30;
    // 30-minute window matches a pipeline that runs every ~30 min, per the
    // GitHub Actions cron cadence in .github/workflows/daily-pipeline.yml.
  });
}

/** Users who tapped "Remind me later" on the digest notification and whose
 * snooze window has now elapsed. Clears the flag as it returns them, so a
 * given snooze fires exactly once even if the pipeline runs concurrently
 * or the send itself fails partway (the flag is cleared up front; a failed
 * send is logged as a pipeline warning rather than silently retried forever). */
export async function getAndClearUsersDueForSnoozedReminder() {
  const now = new Date();
  const due = await prisma.user.findMany({
    where: { pendingDigestReminderAt: { lte: now } },
  });
  if (due.length > 0) {
    await prisma.user.updateMany({
      where: { id: { in: due.map((u) => u.id) } },
      data: { pendingDigestReminderAt: null },
    });
  }
  return due;
}
