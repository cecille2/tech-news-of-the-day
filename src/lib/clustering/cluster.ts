import { prisma } from "@/lib/db";
import { findNearestTopics } from "@/lib/nlp/vector";
import { jaccardSimilarity, titleTokenSet } from "@/lib/nlp/normalize";

// Thresholds tuned deliberately conservative — see README § Clustering.
// A false split costs one manual merge; a false merge silently corrupts a
// Topic's history, so ties resolve toward "keep separate, flag for review."
const HIGH_SEMANTIC = 0.85;
const HIGH_MIN_SHARED_ENTITIES = 2;
const MID_SEMANTIC_FLOOR = 0.6;
const MID_WITH_ENTITY_SEMANTIC_FLOOR = 0.5;

export type ClusterDecision =
  | { type: "MERGE"; topicId: string; confidence: number }
  | { type: "FLAG"; topicId: string; confidence: number }
  | { type: "NEW" };

export interface ClusterCandidateInput {
  title: string;
  embedding: number[];
  entityIds: string[];
}

async function sharedEntityCount(topicId: string, entityIds: string[]): Promise<number> {
  if (entityIds.length === 0) return 0;
  const matches = await prisma.topicEntity.count({
    where: { topicId, entityId: { in: entityIds } },
  });
  return matches;
}

export async function decideCluster(input: ClusterCandidateInput): Promise<ClusterDecision> {
  const nearest = await findNearestTopics(input.embedding, 30, 5);
  const candidateTokens = titleTokenSet(input.title);

  let best: { topicId: string; confidence: number; tier: "MERGE" | "FLAG" } | null = null;

  for (const topic of nearest) {
    const shared = await sharedEntityCount(topic.id, input.entityIds);
    const titleSim = jaccardSimilarity(candidateTokens, titleTokenSet(topic.title));
    // Combined confidence: mostly semantic, with entity/title agreement as corroboration.
    const confidence = topic.similarity * 0.6 + Math.min(shared / 3, 1) * 0.25 + titleSim * 0.15;

    let tier: "MERGE" | "FLAG" | null = null;
    if (topic.similarity >= HIGH_SEMANTIC && shared >= HIGH_MIN_SHARED_ENTITIES) {
      tier = "MERGE";
    } else if (
      topic.similarity >= MID_SEMANTIC_FLOOR ||
      (topic.similarity >= MID_WITH_ENTITY_SEMANTIC_FLOOR && shared >= 1)
    ) {
      tier = "FLAG";
    }

    if (tier && (!best || confidence > best.confidence)) {
      best = { topicId: topic.id, confidence, tier };
    }
  }

  if (!best) return { type: "NEW" };
  return { type: best.tier, topicId: best.topicId, confidence: best.confidence };
}

/** Records an UNCERTAIN match for later manual review instead of guessing. */
export async function flagPossibleDuplicate(topicAId: string, topicBId: string, confidence: number) {
  const [a, b] = [topicAId, topicBId].sort();
  await prisma.topicDuplicateFlag.upsert({
    where: { topicAId_topicBId: { topicAId: a, topicBId: b } },
    update: { confidence },
    create: { topicAId: a, topicBId: b, confidence },
  });
}
