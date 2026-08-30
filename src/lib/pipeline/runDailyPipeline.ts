import { prisma } from "@/lib/db";
import { pollRssFeed, type CandidateStory } from "@/lib/ingestion/rss";
import { extractMentions } from "@/lib/nlp/entities";
import { resolveEntities } from "@/lib/nlp/entities";
import { embedText } from "@/lib/nlp/embeddings";
import { setTopicEmbedding } from "@/lib/nlp/vector";
import { decideCluster, flagPossibleDuplicate } from "@/lib/clustering/cluster";
import { generateBriefing } from "@/lib/synthesis";
import { getOrCreateDefaultWeights, scoreTopic } from "@/lib/ranking/rank";
import {
  getUsersDueForBriefingNow,
  getAndClearUsersDueForSnoozedReminder,
  sendTopicPushes,
} from "@/lib/push/webpush";
import type { SourceTier } from "@/generated/prisma/client";

// Runaway-job guardrails (see README § accidental-charge protection). These
// keep one malformed feed or an unusually newsy day from ballooning the
// GitHub Actions run past what the free minutes budget expects.
const MAX_CANDIDATE_STORIES_PER_RUN = 300;
const MAX_NEW_TOPICS_PER_RUN = 60;
const FAILURE_THRESHOLD_TO_AUTO_DISABLE = 5;

// Each due user gets one push per story, capped so a heavy news day (dozens
// of new/updated topics) doesn't turn into notification spam.
const TOP_STORIES_PER_DIGEST = 5;

/** First sentence (or a hard truncation) of a briefing section — keeps a
 * push notification body glanceable rather than dumping the full paragraph. */
function firstSentence(text: string, maxLen = 160): string {
  const match = new RegExp(`^.{1,${maxLen}}?[.!?](\\s|$)`).exec(text);
  if (match) return match[0].trim();
  return text.length > maxLen ? `${text.slice(0, maxLen).trim()}…` : text;
}

interface PolledCandidate extends CandidateStory {
  tier: SourceTier;
  isPrimary: boolean;
}

async function ingestAllSources(): Promise<{ candidates: PolledCandidate[]; warnings: string[] }> {
  const warnings: string[] = [];
  const candidates: PolledCandidate[] = [];

  const catalogEntries = await prisma.sourceCatalogEntry.findMany({ where: { active: true } });
  const customSources = await prisma.userCustomSource.findMany({ where: { active: true } });

  for (const entry of catalogEntries) {
    if (candidates.length >= MAX_CANDIDATE_STORIES_PER_RUN) break;

    const state = await prisma.ingestionState.upsert({
      where: { catalogEntryId: entry.id },
      update: {},
      create: { catalogEntryId: entry.id },
    });

    const result = await pollRssFeed(entry.feedUrl, entry.name, {
      etag: state.etag,
      lastModified: state.lastModified,
    });

    if (result.failed) {
      const failures = entry.consecutiveFailures + 1;
      await prisma.sourceCatalogEntry.update({
        where: { id: entry.id },
        data: {
          consecutiveFailures: failures,
          active: failures < FAILURE_THRESHOLD_TO_AUTO_DISABLE,
        },
      });
      if (failures >= FAILURE_THRESHOLD_TO_AUTO_DISABLE) {
        warnings.push(`Auto-disabled "${entry.name}" after ${failures} consecutive failures.`);
      }
      continue;
    }

    if (entry.consecutiveFailures > 0) {
      await prisma.sourceCatalogEntry.update({
        where: { id: entry.id },
        data: { consecutiveFailures: 0 },
      });
    }

    await prisma.ingestionState.update({
      where: { id: state.id },
      data: {
        etag: result.etag,
        lastModified: result.lastModified,
        lastPolledAt: new Date(),
        lastSuccessAt: new Date(),
      },
    });

    for (const story of result.stories) {
      candidates.push({ ...story, tier: entry.tier, isPrimary: entry.isPrimary });
    }
  }

  for (const custom of customSources) {
    if (candidates.length >= MAX_CANDIDATE_STORIES_PER_RUN) break;

    const state = await prisma.ingestionState.upsert({
      where: { customSourceId: custom.id },
      update: {},
      create: { customSourceId: custom.id },
    });

    const result = await pollRssFeed(custom.feedUrl, custom.label, {
      etag: state.etag,
      lastModified: state.lastModified,
    });

    if (result.failed) {
      const failures = custom.consecutiveFailures + 1;
      await prisma.userCustomSource.update({
        where: { id: custom.id },
        data: { consecutiveFailures: failures, active: failures < FAILURE_THRESHOLD_TO_AUTO_DISABLE },
      });
      continue;
    }

    await prisma.ingestionState.update({
      where: { id: state.id },
      data: { etag: result.etag, lastModified: result.lastModified, lastPolledAt: new Date(), lastSuccessAt: new Date() },
    });

    // User-added feeds default to Tier 2 confidence — DISCOVERY only applies
    // to creator/social content, which flows through SocialMention, not here.
    for (const story of result.stories) {
      candidates.push({ ...story, tier: "TIER_2", isPrimary: false });
    }
  }

  return { candidates: candidates.slice(0, MAX_CANDIDATE_STORIES_PER_RUN), warnings };
}

/** Processes one candidate story: dedup → entities → embed → cluster → persist. */
async function processCandidate(
  candidate: PolledCandidate,
  newTopicsSoFar: number,
): Promise<{ topicId: string | null; createdNewTopic: boolean }> {
  const existing = await prisma.source.findUnique({ where: { contentHash: candidate.contentHash } });
  if (existing) return { topicId: null, createdNewTopic: false }; // already ingested, skip

  const text = `${candidate.title}. ${candidate.excerpt ?? ""}`;
  const mentions = extractMentions(text);
  const entities = await resolveEntities(mentions);
  const embedding = await embedText(text);

  let topicId: string;
  let createdNewTopic = false;

  if (newTopicsSoFar >= MAX_NEW_TOPICS_PER_RUN) {
    // Budget exhausted for genuinely new topics this run — still attach the
    // source if it clearly matches something existing, otherwise drop it
    // (it'll resurface and cluster correctly on the next run).
    const decision = await decideCluster({ title: candidate.title, embedding, entityIds: entities.map((e) => e.id) });
    if (decision.type === "NEW") return { topicId: null, createdNewTopic: false };
    topicId = decision.topicId;
  } else {
    const decision = await decideCluster({ title: candidate.title, embedding, entityIds: entities.map((e) => e.id) });

    if (decision.type === "NEW") {
      const topic = await prisma.topic.create({
        data: {
          title: candidate.title,
          slug: `${candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${Date.now().toString(36)}`,
          verificationStatus: candidate.tier === "DISCOVERY" ? "UNVERIFIED" : "VERIFIED",
        },
      });
      topicId = topic.id;
      createdNewTopic = true;
    } else if (decision.type === "MERGE") {
      topicId = decision.topicId;
      await prisma.topicUpdate.create({
        data: { topicId, body: candidate.title, publishedInDigestDate: new Date() },
      });
      // A new corroborating source can upgrade an UNVERIFIED topic.
      if (candidate.tier !== "DISCOVERY") {
        await prisma.topic.update({ where: { id: topicId }, data: { verificationStatus: "VERIFIED" } });
      }
    } else {
      // FLAG — uncertain. Create as a separate topic but record the possible
      // relationship for one-tap manual review instead of guessing.
      const topic = await prisma.topic.create({
        data: {
          title: candidate.title,
          slug: `${candidate.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60)}-${Date.now().toString(36)}`,
          verificationStatus: candidate.tier === "DISCOVERY" ? "UNVERIFIED" : "VERIFIED",
        },
      });
      topicId = topic.id;
      createdNewTopic = true;
      await flagPossibleDuplicate(topicId, decision.topicId, decision.confidence);
    }
  }

  await prisma.source.create({
    data: {
      topicId,
      publication: candidate.publication,
      url: candidate.url,
      excerpt: candidate.excerpt,
      author: candidate.author,
      publishedAt: candidate.publishedAt,
      isPrimary: candidate.isPrimary,
      tier: candidate.tier,
      contentHash: candidate.contentHash,
    },
  });

  for (const entity of entities) {
    await prisma.topicEntity.upsert({
      where: { topicId_entityId: { topicId, entityId: entity.id } },
      update: {},
      create: { topicId, entityId: entity.id, relevanceScore: 1 },
    });
  }

  await setTopicEmbedding(topicId, embedding);

  return { topicId, createdNewTopic };
}

async function synthesizeBriefing(topicId: string) {
  const topic = await prisma.topic.findUniqueOrThrow({
    where: { id: topicId },
    include: { sources: true, socialMentions: { include: { creator: true } }, entities: { include: { entity: true } }, updates: true },
  });

  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

  const briefing = await generateBriefing({
    topicTitle: topic.title,
    topicEntityNames: topic.entities.map((e) => e.entity.canonicalName),
    sources: topic.sources.map((s) => ({
      id: s.id,
      publication: s.publication,
      url: s.url,
      tier: s.tier,
      isPrimary: s.isPrimary,
      publishedAt: s.publishedAt ?? undefined,
      text: `${topic.title}. ${s.excerpt ?? ""}`,
    })),
    signals: {
      distinctPublicationCount: new Set(topic.sources.map((s) => s.publication)).size,
      sourcesInLastSixHours: topic.sources.filter((s) => s.createdAt >= sixHoursAgo).length,
      socialMentionCount: topic.socialMentions.length,
      creatorMentionLabels: topic.socialMentions
        .filter((m) => m.creator)
        .map((m) => `${m.creator!.displayName} on ${m.platform}`),
      isFirstBriefing: topic.updates.length === 0,
    },
  });

  await prisma.topic.update({
    where: { id: topicId },
    data: {
      whatHappened: briefing.sections.whatHappened,
      whatChangedToday: briefing.sections.whatChangedToday,
      howWeGotHere: briefing.sections.howWeGotHere,
      whyItMatters: briefing.sections.whyItMatters,
      whyPeopleAreTalking: briefing.sections.whyPeopleAreTalking,
      whatToWatchNext: briefing.sections.whatToWatchNext,
      synthesisMethod: briefing.method,
    },
  });

  if (briefing.extractedSentences.length > 0) {
    await prisma.extractedSentence.createMany({
      data: briefing.extractedSentences.map((s) => ({
        sourceId: s.sourceId,
        section: s.section,
        text: s.text,
        score: s.score,
      })),
    });
  }
}

export interface PipelineResult {
  runId: string;
  storiesProcessed: number;
  topicsCreated: number;
  topicsUpdated: number;
  warnings: string[];
  status: "SUCCESS" | "DEGRADED" | "FAILED";
}

export async function runDailyPipeline(): Promise<PipelineResult> {
  const run = await prisma.pipelineRun.create({ data: { status: "RUNNING" } });
  const warnings: string[] = [];
  let storiesProcessed = 0;
  let topicsCreated = 0;
  let topicsUpdated = 0;

  try {
    const { candidates, warnings: ingestWarnings } = await ingestAllSources();
    warnings.push(...ingestWarnings);

    const touchedTopicIds = new Set<string>();
    let newTopicsSoFar = 0;

    for (const candidate of candidates) {
      try {
        const { topicId, createdNewTopic } = await processCandidate(candidate, newTopicsSoFar);
        if (topicId) {
          touchedTopicIds.add(topicId);
          storiesProcessed++;
          if (createdNewTopic) {
            newTopicsSoFar++;
            topicsCreated++;
          } else {
            topicsUpdated++;
          }
        }
      } catch (err) {
        warnings.push(`Failed to process "${candidate.title}": ${(err as Error).message}`);
      }
    }

    // Rank + synthesize only topics this run actually touched — never
    // recompute untouched Topics (see README § incremental processing).
    for (const topicId of touchedTopicIds) {
      try {
        await synthesizeBriefing(topicId);
      } catch (err) {
        warnings.push(`Synthesis failed for topic ${topicId}: ${(err as Error).message}`);
      }
    }

    // V1 is single-user, so this also serves as each user's cached sort key.
    // At multi-user scale, ranking becomes a per-viewer read-time query
    // (scoreTopic already takes a userId) rather than a stored Topic field.
    const users = await prisma.user.findMany();
    for (const user of users) {
      const weights = await getOrCreateDefaultWeights(user.id);
      for (const topicId of touchedTopicIds) {
        const score = await scoreTopic(topicId, user.id, weights);
        await prisma.topic.update({ where: { id: topicId }, data: { rankScore: score } });
      }
    }

    const newToday = await prisma.topic.count({
      where: { firstSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    const dueUsers = await getUsersDueForBriefingNow();
    const snoozedUsers = await getAndClearUsersDueForSnoozedReminder();
    // A user could be in both lists (rare) — dedupe so they get one push, not two.
    const usersToNotify = new Map([...dueUsers, ...snoozedUsers].map((u) => [u.id, u]));
    console.log(
      `[pipeline] newToday=${newToday} dueUsers=${dueUsers.length} snoozedUsers=${snoozedUsers.length} usersToNotify=${usersToNotify.size}`,
    );

    if (newToday > 0) {
      const topStories = await prisma.topic.findMany({
        where: { firstSeenAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { rankScore: "desc" },
        take: TOP_STORIES_PER_DIGEST,
      });
      const topicPushes = topStories.map((topic) => ({
        topicId: topic.id,
        title: topic.title,
        summary: firstSentence(topic.whatHappened ?? topic.title),
        url: `/#topic-${topic.id}`,
      }));

      for (const user of usersToNotify.values()) {
        try {
          const results = await sendTopicPushes(user.id, topicPushes);
          const succeeded = results.filter((r) => r.status === "fulfilled").length;
          console.log(
            `[pipeline] push to user ${user.id}: ${succeeded}/${results.length} sends succeeded (${topicPushes.length} stories)`,
          );
          if (results.length === 0) {
            console.log(`[pipeline] user ${user.id} has zero push subscriptions on file`);
          }
          for (const r of results) {
            if (r.status === "rejected") console.log(`[pipeline] push rejection: ${JSON.stringify(r.reason)}`);
          }
          // Mark today handled even with zero subscriptions — otherwise a
          // user with no working subscription would appear "due" on every
          // run for the rest of the day. Enabling push later that same day
          // means waiting until tomorrow's briefing; acceptable at this scale.
          await prisma.user.update({ where: { id: user.id }, data: { lastDigestSentAt: new Date() } });
        } catch (err) {
          warnings.push(`Push failed for user ${user.id}: ${(err as Error).message}`);
        }
      }
    } else {
      console.log("[pipeline] skipping push send: no new topics today");
    }

    const status = warnings.length > 0 ? "DEGRADED" : "SUCCESS";
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status, storiesProcessed, topicsCreated, topicsUpdated, warnings, finishedAt: new Date() },
    });

    return { runId: run.id, storiesProcessed, topicsCreated, topicsUpdated, warnings, status };
  } catch (err) {
    await prisma.pipelineRun.update({
      where: { id: run.id },
      data: { status: "FAILED", errorMessage: (err as Error).message, finishedAt: new Date() },
    });
    throw err;
  }
}
