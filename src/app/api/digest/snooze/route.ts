import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";

const SNOOZE_HOURS = 4;

/** Called by the service worker's "Remind me later" action on the morning
 * digest push. Server-driven (see webpush.ts) rather than a setTimeout in
 * the service worker, which browsers can and do kill long before 4 hours pass. */
export async function POST() {
  const user = await getCurrentUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { pendingDigestReminderAt: new Date(Date.now() + SNOOZE_HOURS * 60 * 60 * 1000) },
  });
  return NextResponse.json({ ok: true, remindAt: new Date(Date.now() + SNOOZE_HOURS * 60 * 60 * 1000) });
}
