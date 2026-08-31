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

export async function toggleFollow(topicId: string, follow: boolean) {
  const user = await getCurrentUser();
  if (follow) {
    await prisma.topicFollow.upsert({
      where: { userId_topicId: { userId: user.id, topicId } },
      update: {},
      create: { userId: user.id, topicId },
    });
  } else {
    await prisma.topicFollow.deleteMany({ where: { userId: user.id, topicId } });
  }
  revalidatePath("/");
  revalidatePath("/following");
}

export async function remindLater(topicId: string, hoursFromNow: number) {
  const user = await getCurrentUser();
  await prisma.topicReminder.create({
    data: { userId: user.id, topicId, remindAt: new Date(Date.now() + hoursFromNow * 60 * 60 * 1000) },
  });
  revalidatePath("/");
}

export async function toggleSave(topicId: string, save: boolean, note?: string) {
  const user = await getCurrentUser();
  if (save) {
    await prisma.topicSave.upsert({
      where: { userId_topicId: { userId: user.id, topicId } },
      update: { note },
      create: { userId: user.id, topicId, note },
    });
  } else {
    await prisma.topicSave.deleteMany({ where: { userId: user.id, topicId } });
  }
  revalidatePath("/");
  revalidatePath("/saved");
}

export async function requestVideoCoverage(topicId: string) {
  const user = await getCurrentUser();
  await prisma.videoCoverageRequest.upsert({
    where: { userId_topicId: { userId: user.id, topicId } },
    update: {},
    create: { userId: user.id, topicId },
  });
  revalidatePath("/");
}

export async function giveFeedback(topicId: string, feedback: FeedbackType) {
  const user = await getCurrentUser();
  await applyFeedback(user.id, topicId, feedback);
  revalidatePath("/");
  revalidatePath("/archive");
}

// ── Manual correction tools (§ admin) ───────────────────────────

export async function boostTopic(topicId: string, delta: number) {
  await prisma.topic.update({ where: { id: topicId }, data: { manualBoost: { increment: delta } } });
  revalidatePath("/");
  revalidatePath("/archive");
}

export async function markIrrelevant(topicId: string) {
  await prisma.topic.update({ where: { id: topicId }, data: { irrelevant: true } });
  revalidatePath("/");
  revalidatePath("/archive");
}

export async function renameTopic(topicId: string, title: string) {
  await prisma.topic.update({ where: { id: topicId }, data: { title } });
  revalidatePath("/archive");
}

export async function resolveDuplicateFlag(flagId: string, action: "merge" | "dismiss") {
  const flag = await prisma.topicDuplicateFlag.findUniqueOrThrow({ where: { id: flagId } });

  if (action === "merge") {
    // Merge B into A: move sources/mentions/entities/updates, then delete B.
    await prisma.$transaction([
      prisma.source.updateMany({ where: { topicId: flag.topicBId }, data: { topicId: flag.topicAId } }),
      prisma.socialMention.updateMany({ where: { topicId: flag.topicBId }, data: { topicId: flag.topicAId } }),
      prisma.topicUpdate.updateMany({ where: { topicId: flag.topicBId }, data: { topicId: flag.topicAId } }),
      prisma.topic.delete({ where: { id: flag.topicBId } }),
    ]);
  }

  await prisma.topicDuplicateFlag.update({ where: { id: flagId }, data: { resolved: true } });
  revalidatePath("/settings/duplicates");
  revalidatePath("/archive");
}

export async function attachSocialMention(
  topicId: string,
  platform: Platform,
  url: string,
  accountName: string,
) {
  await prisma.socialMention.create({
    data: { topicId, platform, url, accountName, attachedVia: "MANUAL" },
  });
  revalidatePath("/");
  revalidatePath("/archive");
}

// ── Source catalog & custom sources ────────────────────────────

export async function toggleCatalogSource(catalogEntryId: string, enabled: boolean) {
  const user = await getCurrentUser();
  await prisma.userSourcePreference.upsert({
    where: { userId_catalogEntryId: { userId: user.id, catalogEntryId } },
    update: { enabled },
    create: { userId: user.id, catalogEntryId, enabled },
  });
  revalidatePath("/settings/sources");
}

export async function addCustomSource(label: string, feedUrl: string) {
  const user = await getCurrentUser();
  await prisma.userCustomSource.create({
    data: { userId: user.id, label, feedUrl, sourceType: "RSS" },
  });
  revalidatePath("/settings/sources");
}

export async function removeCustomSource(id: string) {
  await prisma.userCustomSource.delete({ where: { id } });
  revalidatePath("/settings/sources");
}

// ── Creators ──────────────────────────────────────────

export async function addCreator(displayName: string) {
  const user = await getCurrentUser();
  return prisma.creator.create({ data: { displayName, addedByUserId: user.id } });
}

export async function addCreatorPlatformAccount(
  creatorId: string,
  platform: Platform,
  handle: string,
  url: string,
) {
  const ingestionMethod = platform === "YOUTUBE" || platform === "SUBSTACK" ? "RSS" : "MANUAL";
  await prisma.creatorPlatformAccount.create({
    data: { creatorId, platform, handle, url, ingestionMethod },
  });
  revalidatePath("/settings/creators");
}

export async function followCreator(creatorId: string) {
  const user = await getCurrentUser();
  const follow = await prisma.userCreatorFollow.upsert({
    where: { userId_creatorId: { userId: user.id, creatorId } },
    update: {},
    create: { userId: user.id, creatorId },
  });
  const accounts = await prisma.creatorPlatformAccount.findMany({ where: { creatorId } });
  for (const account of accounts) {
    await prisma.userCreatorPlatformPref.upsert({
      where: { userCreatorFollowId_platform: { userCreatorFollowId: follow.id, platform: account.platform } },
      update: {},
      create: { userCreatorFollowId: follow.id, platform: account.platform, enabled: true },
    });
  }
  revalidatePath("/settings/creators");
}

export async function unfollowCreator(creatorId: string) {
  const user = await getCurrentUser();
  await prisma.userCreatorFollow.deleteMany({ where: { userId: user.id, creatorId } });
  revalidatePath("/settings/creators");
}

export async function setCreatorPlatformPref(followId: string, platform: Platform, enabled: boolean) {
  await prisma.userCreatorPlatformPref.upsert({
    where: { userCreatorFollowId_platform: { userCreatorFollowId: followId, platform } },
    update: { enabled },
    create: { userCreatorFollowId: followId, platform, enabled },
  });
  revalidatePath("/settings/creators");
}

// ── Briefing time / timezone settings ──────────────────────────

export async function updateBriefingSchedule(timezone: string, briefingHour: number, briefingMin: number) {
  const user = await getCurrentUser();
  // Clearing lastDigestSentAt means changing your briefing time gives you a
  // fresh shot at today's digest at the new time, rather than being blocked
  // by whatever happened (or didn't) at the old time.
  await prisma.user.update({
    where: { id: user.id },
    data: { timezone, briefingHour, briefingMin, lastDigestSentAt: null },
  });
  revalidatePath("/settings");
}

/** useActionState-shaped wrapper so the Settings form can show a "Saved" confirmation. */
export async function submitBriefingSchedule(_prevState: { savedAt: number } | null, formData: FormData) {
  const timezone = String(formData.get("timezone"));
  const hour = Number(formData.get("hour"));
  await updateBriefingSchedule(timezone, hour, 0);
  return { savedAt: Date.now() };
}
