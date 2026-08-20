import { prisma } from "@/lib/db";
import { toPgVectorLiteral } from "./embeddings";

export interface NearestTopic {
  id: string;
  title: string;
  similarity: number;
}

/**
 * pgvector cosine-similarity search, scoped to Topics active in the last
 * `withinDays` — an old, settled Topic should never silently reopen because
 * an unrelated story happens to share phrasing. Raw SQL because Prisma's
 * query builder doesn't yet support vector operators.
 */
export async function findNearestTopics(
  embedding: number[],
  withinDays = 30,
  limit = 5,
): Promise<NearestTopic[]> {
  const vectorLiteral = toPgVectorLiteral(embedding);
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);

  return prisma.$queryRaw<NearestTopic[]>`
    SELECT
      id,
      title,
      1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
    FROM "Topic"
    WHERE embedding IS NOT NULL
      AND "lastUpdatedAt" >= ${since}
      AND irrelevant = false
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit};
  `;
}

export async function setTopicEmbedding(topicId: string, embedding: number[]): Promise<void> {
  const vectorLiteral = toPgVectorLiteral(embedding);
  await prisma.$executeRaw`
    UPDATE "Topic" SET embedding = ${vectorLiteral}::vector WHERE id = ${topicId};
  `;
}
