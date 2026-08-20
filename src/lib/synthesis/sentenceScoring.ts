import type { BriefingSection, SourceTier } from "@/generated/prisma/client";
import { splitSentences, jaccardSimilarity, titleTokenSet } from "@/lib/nlp/normalize";

const TIER_WEIGHT: Record<SourceTier, number> = { TIER_1: 1.0, TIER_2: 0.65, DISCOVERY: 0.25 };

// Section-specific keyword patterns — how each section decides which
// sentences are actually its job to contain. Deliberately simple regexes:
// transparent, debuggable, and good enough for structuring real reporting
// prose (which uses fairly predictable phrasing for consequences/forecasts).
const SECTION_PATTERNS: Partial<Record<BriefingSection, RegExp>> = {
  WHY_IT_MATTERS:
    /\b(means|could (lead|mean|result)|impact|affects?|threatens?|risk|regulat|antitrust|market share|users?|consumers?|investors?|competitors?|industry|strategic|signals?)\b/i,
  WHAT_TO_WATCH_NEXT:
    /\b(will|plans? to|expected to|is (set|slated) to|next (week|month|year)|upcoming|could (soon|eventually)|remains to be seen|has yet to)\b/i,
};

export interface ScoredCandidate {
  sourceId: string;
  text: string;
  score: number;
}

function recencyScore(publishedAt: Date | undefined, now: number): number {
  if (!publishedAt) return 0.3;
  const hoursAgo = (now - publishedAt.getTime()) / (1000 * 60 * 60);
  return Math.max(0, 1 - hoursAgo / 72); // decays to 0 over ~3 days
}

function entityRelevance(sentence: string, entityNames: string[]): number {
  if (entityNames.length === 0) return 0.3;
  const lower = sentence.toLowerCase();
  const hits = entityNames.filter((e) => lower.includes(e.toLowerCase())).length;
  return Math.min(hits / Math.min(entityNames.length, 2), 1);
}

/**
 * Scores every sentence from every source for a specific briefing section,
 * corroboration-boosts sentences whose claim is echoed elsewhere, and
 * suppresses near-duplicates so a section doesn't repeat the same fact
 * three times in three different sources' phrasing.
 */
export function scoreCandidatesForSection(
  section: BriefingSection,
  sources: { id: string; tier: SourceTier; publishedAt?: Date; text: string }[],
  topicEntityNames: string[],
  alreadySelected: string[] = [],
): ScoredCandidate[] {
  const now = Date.now();
  const pattern = SECTION_PATTERNS[section];
  const allCandidates: ScoredCandidate[] = [];
  const selectedTokenSets = alreadySelected.map((s) => titleTokenSet(s));

  for (const source of sources) {
    const sentences = splitSentences(source.text);
    for (const text of sentences) {
      const reputation = TIER_WEIGHT[source.tier];
      const recency = recencyScore(source.publishedAt, now);
      const relevance = entityRelevance(text, topicEntityNames);
      const sectionMatch = pattern ? (pattern.test(text) ? 1 : 0) : 0.5;

      // Corroboration: does the same claim show up (roughly) in another source?
      const tokens = titleTokenSet(text);
      const corroboration = sources
        .filter((s) => s.id !== source.id)
        .some((other) =>
          splitSentences(other.text).some((t) => jaccardSimilarity(tokens, titleTokenSet(t)) > 0.5),
        )
        ? 1
        : 0;

      const duplicatePenalty = selectedTokenSets.some((t) => jaccardSimilarity(tokens, t) > 0.6)
        ? 1
        : 0;

      // Section-gated: if this section has a keyword pattern, sentences that
      // don't match it are excluded outright rather than merely down-scored —
      // otherwise "why it matters" silently fills with generic sentences.
      if (pattern && sectionMatch === 0) continue;

      const score =
        reputation * 0.3 +
        recency * 0.15 +
        relevance * 0.25 +
        corroboration * 0.15 +
        sectionMatch * 0.15 -
        duplicatePenalty * 1.5;

      if (score > 0) allCandidates.push({ sourceId: source.id, text, score });
    }
  }

  return allCandidates.sort((a, b) => b.score - a.score);
}
