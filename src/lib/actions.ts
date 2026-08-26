"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/currentUser";
import { applyFeedback } from "@/lib/ranking/rank";
import type { FeedbackType, Platform } from "@/generated/prisma/client";

// ── Topic actions: Read / Follow / Remind / Save — four independent lifecycles ──

export async function markRead(topicId: string) {
  const user = await getCurrentUser();
  await prisma.topicRead.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    update: { readAt: new Date() },
    create: { userId: user.id, topicId },
  });
  revalidatePath("/");
}
