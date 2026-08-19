import type { SourceTier, SourceType } from "@/generated/prisma/client";

export interface CatalogSeed {
  name: string;
  feedUrl: string;
  sourceType: SourceType;
  tier: SourceTier;
  category: string[];
  isPrimary?: boolean;
}

/**
 * Default source catalog — enabled for every user out of the box.
 * Selected for credibility AND a reliable, free, compliant feed. A famous
 * publication with no working public feed is left out rather than scraped.
 *
 * RSS availability drifts over time (publishers add/remove feeds without
 * notice), so this list is a starting point, not a promise — `seed.ts`
 * health-checks every URL before inserting it, and the ingestion pipeline
 * auto-disables anything that starts failing (see IngestionState).
 */
export const DEFAULT_SOURCE_CATALOG: CatalogSeed[] = [
  // Tier 2 — strong domain tech/business publications
  {
    name: "TechCrunch",
    feedUrl: "https://techcrunch.com/feed/",
    sourceType: "RSS",
    tier: "TIER_2",
    category: ["tech", "startups"],
  },
  {
    name: "The Verge",
    feedUrl: "https://www.theverge.com/rss/index.xml",
    sourceType: "RSS",
    tier: "TIER_2",
    category: ["tech", "culture"],
  },
  {
    name: "Wired",
    feedUrl: "https://www.wired.com/feed/rss",
    sourceType: "RSS",
    tier: "TIER_2",
    category: ["tech"],
  },
  {
    name: "Ars Technica",
    feedUrl: "https://feeds.arstechnica.com/arstechnica/index",
    sourceType: "RSS",
    tier: "TIER_2",
    category: ["tech", "science"],
  },

  // Tier 1 — wire services, major business/tech desks
  {
    name: "CNBC Technology",
    feedUrl: "https://www.cnbc.com/id/19854910/device/rss/rss.html",
    sourceType: "RSS",
    tier: "TIER_1",
    category: ["business", "tech"],
  },
  {
    name: "NYT Technology",
    feedUrl: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
    sourceType: "RSS",
    tier: "TIER_1",
    category: ["tech", "business"],
  },

  // Primary sources — highest trust for claims about that company specifically
  {
    name: "OpenAI Blog",
    feedUrl: "https://openai.com/news/rss.xml",
    sourceType: "PRIMARY",
    tier: "TIER_1",
    category: ["ai"],
    isPrimary: true,
  },
  {
    name: "Google AI Blog",
    feedUrl: "https://blog.google/technology/ai/rss/",
    sourceType: "PRIMARY",
    tier: "TIER_1",
    category: ["ai"],
    isPrimary: true,
  },
];

/**
 * A few well-known publishers (Reuters, AP, Bloomberg, WSJ, FT) are
 * deliberately NOT hard-coded here: their public RSS availability has
 * shrunk over the years and varies by section/region. Add them via
 * `scripts/seed.ts --add-feed` once you've confirmed a working feed URL —
 * the seed script validates and health-checks whatever you add before it
 * goes live, so a stale or wrong URL never silently sits in the catalog.
 */
