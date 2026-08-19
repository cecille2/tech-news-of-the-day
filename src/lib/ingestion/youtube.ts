import { pollRssFeed, type CandidateStory } from "./rss";
import { prisma } from "@/lib/db";

/**
 * Followed channels are monitored via YouTube's free per-channel RSS feed —
 * zero quota cost, no API key required. This should be the primary path for
 * every creator you've actually added.
 */
export function channelRssUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
}

export async function pollChannelUploads(channelId: string, channelLabel: string) {
  return pollRssFeed(channelRssUrl(channelId), channelLabel);
}

// ── Quota-metered discovery search (YouTube Data API v3) ──────────────────
// Reserved for keyword-based topic discovery beyond your followed channels.
// A search.list call costs 100 quota units against a 10,000/day free budget.
// We track spend in YouTubeQuotaLog and refuse to call the API past a
// configurable daily ceiling — the rest of the pipeline (RSS, followed
// channels) is completely unaffected if this is skipped.

const SEARCH_COST_UNITS = 100;
const DEFAULT_DAILY_DISCOVERY_BUDGET_UNITS = 1_000; // 10 searches/day, well under the 10k free quota

export async function getTodaysYouTubeUnitsUsed(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const result = await prisma.youTubeQuotaLog.aggregate({
    _sum: { units: true },
    where: { date: startOfDay },
  });
  return result._sum.units ?? 0;
}

async function logQuotaUsage(callType: string, units: number) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  await prisma.youTubeQuotaLog.create({
    data: { date: startOfDay, callType, units },
  });
}

export interface YouTubeSearchResult extends CandidateStory {
  videoId: string;
}

/**
 * Keyword discovery search. Returns `null` (not an empty array) when the
 * call is skipped due to budget — callers should treat `null` as "degraded,
 * not failed" and continue the rest of the pipeline.
 */
export async function searchYouTubeForTopic(
  query: string,
  apiKey: string | undefined,
  dailyBudgetUnits = DEFAULT_DAILY_DISCOVERY_BUDGET_UNITS,
): Promise<YouTubeSearchResult[] | null> {
  if (!apiKey) return null; // no key configured — discovery search is entirely optional

  const usedToday = await getTodaysYouTubeUnitsUsed();
  if (usedToday + SEARCH_COST_UNITS > dailyBudgetUnits) {
    return null; // over our own configured budget — degrade gracefully, don't call the API
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("order", "date");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  await logQuotaUsage("search", SEARCH_COST_UNITS);

  if (!res.ok) return [];

  const data = (await res.json()) as {
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        channelTitle?: string;
        publishedAt?: string;
      };
    }>;
  };

  return (data.items ?? [])
    .filter((item) => item.id?.videoId && item.snippet?.title)
    .map((item) => {
      const publishedAt = item.snippet!.publishedAt ? new Date(item.snippet!.publishedAt) : undefined;
      const url = `https://www.youtube.com/watch?v=${item.id!.videoId}`;
      return {
        videoId: item.id!.videoId!,
        title: item.snippet!.title!,
        url,
        publication: item.snippet!.channelTitle ?? "YouTube",
        excerpt: item.snippet!.description?.slice(0, 600),
        publishedAt,
        contentHash: `yt:${item.id!.videoId}`,
      };
    });
}
