import Parser from "rss-parser";
import { createHash } from "node:crypto";

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "daily-briefing-bot/1.0 (+personal project)" },
});

export interface CandidateStory {
  title: string;
  url: string;
  publication: string;
  excerpt?: string;
  author?: string;
  publishedAt?: Date;
  contentHash: string;
}

export interface ConditionalFetchState {
  etag?: string | null;
  lastModified?: string | null;
}

export interface RssPollResult {
  stories: CandidateStory[];
  notModified: boolean;
  etag?: string;
  lastModified?: string;
  failed: boolean;
}

function hashStory(url: string, title: string, publishedAt?: Date): string {
  return createHash("sha256")
    .update(`${url}::${title}::${publishedAt?.toISOString() ?? ""}`)
    .digest("hex");
}

/**
 * Polls one RSS feed with conditional GET (ETag / If-Modified-Since) so an
 * unchanged feed costs one small HTTP round-trip, not a full re-parse.
 * Never throws — a broken feed comes back as `failed: true` so the caller
 * can bump the source's consecutive-failure counter and keep the pipeline
 * running (see IngestionState / auto-disable in the pipeline orchestrator).
 */
export async function pollRssFeed(
  feedUrl: string,
  publicationName: string,
  prior: ConditionalFetchState = {},
): Promise<RssPollResult> {
  try {
    const headers: Record<string, string> = {
      "User-Agent": "daily-briefing-bot/1.0 (+personal project)",
    };
    if (prior.etag) headers["If-None-Match"] = prior.etag;
    if (prior.lastModified) headers["If-Modified-Since"] = prior.lastModified;

    const res = await fetch(feedUrl, { headers, signal: AbortSignal.timeout(15_000) });

    if (res.status === 304) {
      return { stories: [], notModified: true, failed: false };
    }
    if (!res.ok) {
      return { stories: [], notModified: false, failed: true };
    }

    const xml = await res.text();
    const feed = await parser.parseString(xml);

    const stories: CandidateStory[] = (feed.items ?? [])
      .filter((item) => item.link && item.title)
      .map((item) => {
        const publishedAt = item.isoDate ? new Date(item.isoDate) : undefined;
        return {
          title: item.title!.trim(),
          url: item.link!.trim(),
          publication: publicationName,
          excerpt: (item.contentSnippet ?? item.summary ?? "").trim().slice(0, 600),
          author: item.creator ?? item.author,
          publishedAt,
          contentHash: hashStory(item.link!, item.title!, publishedAt),
        };
      });

    return {
      stories,
      notModified: false,
      etag: res.headers.get("etag") ?? undefined,
      lastModified: res.headers.get("last-modified") ?? undefined,
      failed: false,
    };
  } catch {
    return { stories: [], notModified: false, failed: true };
  }
}
