import { prisma } from "@/lib/db";
import type { RankingWeights, SourceTier } from "@/generated/prisma/client";

const TIER_REPUTATION: Record<SourceTier, number> = {
  TIER_1: 1.0,
  TIER_2: 0.6,
  DISCOVERY: 0.2,
};

export interface TopicSignals {
  sourceCount: number;
  distinctPublications: number;
  avgSourceReputation: number; // 0..1
  distinctSourceTypeCount: number; // RSS / YouTube / social, etc.
  hasPrimarySource: boolean;
  socialMentionCount: number;
  hoursSinceFirstSeen: number;
  sourcesInLastSixHours: number;
  isFollowupToFollowedTopic: boolean;
  followedCreatorCoverage: boolean;
  entityIds: string[];
  manualBoost: number;
}

/** Pulls the raw signals a Topic needs for scoring — pure data gathering, no weighting. */
export async function gatherTopicSignals(topicId: string, userId: string): Promise<TopicSignals> {
  const topic = await prisma.topic.findUniqueOrThrow({
    where: { id: topicId },
    include: {
      sources: true,
      socialMentions: { include: { creator: true } },
      entities: true,
    },
  });

  const publications = new Set(topic.sources.map((s) => s.publication));
  const sourceTypeSignals = new Set<string>([
    ...(topic.sources.length ? ["article"] : []),
    ...(topic.socialMentions.length ? ["social"] : []),
  ]);
  const avgReputation =
    topic.sources.length === 0
      ? 0
      : topic.sources.reduce((sum, s) => sum + TIER_REPUTATION[s.tier], 0) / topic.sources.length;

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const sourcesInLastSixHours = topic.sources.filter(
    (s) => s.createdAt && s.createdAt >= sixHoursAgo,
  ).length;

  const followedCreatorIds = new Set(
    (
      await prisma.userCreatorFollow.findMany({ where: { userId }, select: { creatorId: true } })
    ).map((f) => f.creatorId),
  );
  const followedCreatorCoverage = topic.socialMentions.some(
    (m) => m.creatorId && followedCreatorIds.has(m.creatorId),
  );

  const followedTopic = await prisma.topicFollow.findUnique({
    where: { userId_topicId: { userId, topicId } },
  });

  return {
    sourceCount: topic.sources.length,
    distinctPublications: publications.size,
    avgSourceReputation: avgReputation,
    distinctSourceTypeCount: sourceTypeSignals.size,
    hasPrimarySource: topic.sources.some((s) => s.isPrimary),
    socialMentionCount: topic.socialMentions.length,
    hoursSinceFirstSeen: (Date.now() - topic.firstSeenAt.getTime()) / (1000 * 60 * 60),
    sourcesInLastSixHours,
    isFollowupToFollowedTopic: Boolean(followedTopic),
    followedCreatorCoverage,
    entityIds: topic.entities.map((e) => e.entityId),
    manualBoost: topic.manualBoost,
  };
}

async function interestOverlapScore(userId: string, entityIds: string[]): Promise<number> {
  if (entityIds.length === 0) return 0;
  const affinities = await prisma.userEntityAffinity.findMany({
    where: { userId, entityId: { in: entityIds } },
  });
  if (affinities.length === 0) return 0;
  const total = affinities.reduce((sum, a) => sum + a.score, 0);
  // Squash into 0..1-ish so it combines sanely with the other 0..1 signals.
  return Math.tanh(total / 10);
}

export async function scoreTopic(
  topicId: string,
  userId: string,
  weights: RankingWeights,
): Promise<number> {
  const s = await gatherTopicSignals(topicId, userId);
  const interestOverlap = await interestOverlapScore(userId, s.entityIds);

  const velocity = s.hoursSinceFirstSeen < 1 ? 0 : Math.min(s.sourcesInLastSixHours / 3, 1);
  const novelty = s.hoursSinceFirstSeen < 12 ? 1 : Math.max(0, 1 - s.hoursSinceFirstSeen / 72);
  const corroboration = Math.min(s.distinctPublications / 3, 1);

  return (
    weights.sourceCount * Math.min(s.sourceCount / 5, 1) +
    weights.sourceReputation * s.avgSourceReputation +
    weights.coverageVelocity * velocity +
    weights.crossSourceTypeBonus * Math.min(s.distinctSourceTypeCount / 2, 1) +
    weights.interestOverlap * interestOverlap +
    weights.followedCreatorOverlap * (s.followedCreatorCoverage ? 1 : 0) +
    weights.followupBonus * (s.isFollowupToFollowedTopic ? 1 : 0) +
    weights.novelty * novelty +
    weights.primarySourceBonus * (s.hasPrimarySource ? 1 : 0) +
    weights.independentCorroboration * corroboration +
    weights.creatorCoverageCount * Math.min(s.socialMentionCount / 3, 1) +
    weights.manualBoostWeight * Math.max(-1, Math.min(1, s.manualBoost / 3))
  );
}

export async function getOrCreateDefaultWeights(userId: string): Promise<RankingWeights> {
  const existing = await prisma.rankingWeights.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.rankingWeights.create({ data: { userId } });
}

/** Applies More/Less/Not-relevant feedback to the user's entity affinity counters. */
export async function applyFeedback(
  userId: string,
  topicId: string,
  feedback: "MORE_LIKE_THIS" | "LESS_LIKE_THIS" | "NOT_RELEVANT",
) {
  await prisma.topicFeedback.create({ data: { userId, topicId, feedback } });

  const delta = feedback === "MORE_LIKE_THIS" ? 2 : feedback === "LESS_LIKE_THIS" ? -1 : -3;
  const entities = await prisma.topicEntity.findMany({ where: { topicId } });

  for (const te of entities) {
    await prisma.userEntityAffinity.upsert({
      where: { userId_entityId: { userId, entityId: te.entityId } },
      update: { score: { increment: delta } },
      create: { userId, entityId: te.entityId, score: delta },
    });
  }

  if (feedback === "NOT_RELEVANT") {
    await prisma.topic.update({ where: { id: topicId }, data: { irrelevant: true } });
  }
}
