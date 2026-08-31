import webpush from "web-push";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";

let configured = false;

/** True only if privateKey actually derives publicKey — catches a
 * transcription slip in one of two separately-pasted, unviewable "Secret"
 * env vars, which otherwise manifests as every push silently failing with
 * an opaque 403 BadJwtToken from the push service instead of a clear error. */
function vapidKeysMatch(publicKeyB64url: string, privateKeyB64url: string): boolean {
  try {
    const ecdh = crypto.createECDH("prime256v1");
    ecdh.setPrivateKey(Buffer.from(privateKeyB64url, "base64url"));
    const derivedPublicKey = ecdh.getPublicKey();
    const providedPublicKey = Buffer.from(publicKeyB64url, "base64url");
    return Buffer.compare(derivedPublicKey, providedPublicKey) === 0;
  } catch {
    return false;
  }
}

/** Apple's push service rejects the whole JWT with a bare 403 BadJwtToken —
 * no detail — if the "sub" claim isn't exactly "mailto:x" or "https://x".
 * A hand-pasted env var with a stray trailing newline/space still "looks"
 * fine and passes an emptiness check, so validate the shape explicitly. */
function isValidVapidSubject(subject: string): boolean {
  return /^mailto:\S+@\S+$/i.test(subject) || /^https:\/\/\S+$/i.test(subject);
}

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = (process.env.VAPID_SUBJECT ?? "mailto:you@example.com").trim();
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set. Generate a pair with `npx web-push generate-vapid-keys` and add them to .env.",
    );
  }
  if (!vapidKeysMatch(publicKey, privateKey)) {
    throw new Error(
      "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY do not form a matching keypair — every push would otherwise fail " +
        "with an opaque 403 from the push service. Regenerate both with `npx web-push generate-vapid-keys` and " +
        "re-set both values together (in Vercel and in GitHub Actions secrets).",
    );
  }
  if (!isValidVapidSubject(subject)) {
    // Don't interpolate the raw value — GitHub redacts any log line
    // containing a secret's literal text to "***", which would hide the
    // one thing we need to see. These derived facts aren't a literal
    // substring match against the secret, so they print through.
    const rawSubject = process.env.VAPID_SUBJECT ?? "";
    const diagnostics = {
      length: rawSubject.length,
      trimmedLength: subject.length,
      startsWithMailto: rawSubject.toLowerCase().startsWith("mailto:"),
      startsWithHttps: rawSubject.toLowerCase().startsWith("https://"),
      hasAtSign: rawSubject.includes("@"),
      firstCharCodes: [...rawSubject.slice(0, 12)].map((c) => c.charCodeAt(0)),
      lastCharCodes: [...rawSubject.slice(-12)].map((c) => c.charCodeAt(0)),
    };
    throw new Error(
      "VAPID_SUBJECT is not a valid mailto:/https: value, which Apple's push service will silently reject " +
        `with a 403 BadJwtToken. Diagnostics (raw value withheld by GitHub's secret redaction): ${JSON.stringify(diagnostics)}. ` +
        "Char code 10 = \\n, 13 = \\r, 32 = space — look for one of those where it shouldn't be.",
    );
  }
  // Public key only — never log the private key. This exists to answer one
  // question directly: does the keypair GitHub Actions signs pushes with
  // actually match NEXT_PUBLIC_VAPID_PUBLIC_KEY (the one the phone
  // subscribed against on Vercel)? The two were hand-set in separate
  // secret stores at separate times, so "both keypairs are internally
  // self-consistent" doesn't guarantee "both stores hold the same keypair."
  console.log(`[pipeline] VAPID_PUBLIC_KEY in use (GitHub Actions): ${publicKey}`);
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
