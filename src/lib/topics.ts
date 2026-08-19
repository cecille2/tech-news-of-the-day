import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { TopicCardData } from "@/components/TopicCard";

const topicInclude = {
  sources: { select: { id: true, publication: true, url: true, isPrimary: true } },
  socialMentions: { select: { id: true, platform: true, url: true, accountName: true } },
} satisfies Prisma.TopicInclude;

type TopicWithRelations = Prisma.TopicGetPayload<{ include: typeof topicInclude }>;

export async function toCardData(topic: TopicWithRelations, userId: string): Promise<TopicCardData> {
  const [read, follow, save] = await Promise.all([
    prisma.topicRead.findUnique({ where: { userId_topicId: { userId, topicId: topic.id } } }),
    prisma.topicFollow.findUnique({ where: { userId_topicId: { userId, topicId: topic.id } } }),
    prisma.topicSave.findUnique({ where: { userId_topicId: { userId, topicId: topic.id } } }),
  ]);

  return {
    id: topic.id,
    title: topic.title,
    verificationStatus: topic.verificationStatus,
    synthesisMethod: topic.synthesisMethod,
    rankScore: topic.rankScore,
    whatHappened: topic.whatHappened,
    whatChangedToday: topic.whatChangedToday,
    howWeGotHere: topic.howWeGotHere,
    whyItMatters: topic.whyItMatters,
    whyPeopleAreTalking: topic.whyPeopleAreTalking,
    whatToWatchNext: topic.whatToWatchNext,
    sources: topic.sources,
    socialMentions: topic.socialMentions,
    isRead: Boolean(read),
    isFollowed: Boolean(follow),
    isSaved: Boolean(save),
  };
}

export async function getTodaysTopics(userId: string) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const topics = await prisma.topic.findMany({
    where: { irrelevant: false, OR: [{ firstSeenAt: { gte: since } }, { lastUpdatedAt: { gte: since } }] },
    include: topicInclude,
    orderBy: { rankScore: "desc" },
  });
  return Promise.all(topics.map((t) => toCardData(t, userId)));
}

export async function getFollowedTopics(userId: string) {
  const follows = await prisma.topicFollow.findMany({
    where: { userId },
    include: { topic: { include: topicInclude } },
    orderBy: { followedAt: "desc" },
  });
  return Promise.all(follows.map((f) => toCardData(f.topic, userId)));
}

export async function getSavedTopics(userId: string) {
  const saves = await prisma.topicSave.findMany({
    where: { userId },
    include: { topic: { include: topicInclude } },
    orderBy: { savedAt: "desc" },
  });
  return Promise.all(saves.map((s) => toCardData(s.topic, userId)));
}

export async function searchArchive(userId: string, query: string) {
  const topics = await prisma.topic.findMany({
    where: query
      ? { OR: [{ title: { contains: query, mode: "insensitive" } }, { whatHappened: { contains: query, mode: "insensitive" } }] }
      : {},
    include: topicInclude,
    orderBy: { firstSeenAt: "desc" },
    take: 100,
  });
  return Promise.all(topics.map((t) => toCardData(t, userId)));
}
