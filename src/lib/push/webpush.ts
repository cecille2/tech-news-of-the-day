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

export interface TopicPushPayload {
  topicId: string;
  title: string;
  summary: string;
  url: string;
}

/** Sends one push per story per subscribed device — each story stacks as
 * its own notification (see tag handling in public/sw.js) rather than
 * collapsing into a single "briefing ready" banner. */
export async function sendTopicPushes(userId: string, topics: TopicPushPayload[]) {
  ensureConfigured();
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

  const results = await Promise.allSettled(
    subscriptions.flatMap((sub) =>
      topics.map((topic) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: topic.title, body: topic.summary, url: topic.url, tag: `topic-${topic.topicId}` }),
        ),
      ),
    ),
  );

  // Map each result back to its subscription (results are grouped by
  // subscription since flatMap preserves outer-then-inner order).
  const subscriptionForResultIndex = subscriptions.flatMap((sub) => topics.map(() => sub));
  await cleanUpDeadSubscriptions(subscriptionForResultIndex, results);
  return results;
}

async function cleanUpDeadSubscriptions(
  subscriptions: { id: string }[],
  results: PromiseSettledResult<unknown>[],
) {
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
}

/** Users who are past today's briefing time and haven't been sent today's
 * digest yet. Deliberately NOT a narrow "are we within 30 minutes of
 * briefingHour" window — GitHub Actions' scheduling jitter (a run landing
 * even a few minutes late) can push a run past a fixed window and silently
 * skip the user for the entire day. Instead this catches up on whatever the
 * next run happens to be, and lastDigestSentAt (set by the caller after a
 * successful send) prevents re-sending later the same local day. */
export async function getUsersDueForBriefingNow() {
  const users = await prisma.user.findMany();
  const now = new Date();

  return users.filter((user) => {
    // A malformed timezone (e.g. a blank string from a bad env var) throws
    // RangeError — skip that one user rather than crashing the whole run.
    let local: Date;
    try {
      local = new Date(now.toLocaleString("en-US", { timeZone: user.timezone }));
    } catch {
      return false;
    }

    const pastBriefingTime =
      local.getHours() > user.briefingHour ||
      (local.getHours() === user.briefingHour && local.getMinutes() >= user.briefingMin);

    let alreadySentToday = false;
    if (user.lastDigestSentAt) {
      const lastLocal = new Date(user.lastDigestSentAt.toLocaleString("en-US", { timeZone: user.timezone }));
      alreadySentToday = lastLocal.toDateString() === local.toDateString();
    }

    const isDue = pastBriefingTime && !alreadySentToday;
    console.log(
      `[pipeline] user ${user.id}: timezone=${user.timezone} briefingHour=${user.briefingHour} localHour=${local.getHours()} localMinute=${local.getMinutes()} lastDigestSentAt=${user.lastDigestSentAt?.toISOString() ?? "never"} due=${isDue}`,
    );
    return isDue;
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
