import type { BriefingSection } from "@/generated/prisma/client";
import { scoreCandidatesForSection } from "./sentenceScoring";
import type {
  Briefing,
  BriefingSections,
  ExtractedSentenceOutput,
  SynthesisInput,
  SynthesisProvider,
} from "./types";

const SECTION_KEY: Record<BriefingSection, keyof BriefingSections> = {
  WHAT_HAPPENED: "whatHappened",
  WHAT_CHANGED_TODAY: "whatChangedToday",
  HOW_WE_GOT_HERE: "howWeGotHere",
  WHY_IT_MATTERS: "whyItMatters",
  WHY_PEOPLE_ARE_TALKING: "whyPeopleAreTalking",
  WHAT_TO_WATCH_NEXT: "whatToWatchNext",
};

/**
 * Required, default, always-available. Builds the briefing entirely from
 * real sentences in real sources — nothing here is generated. See README
 * § Layer 1 for why this is the honest choice, not just the free one:
 * every sentence traces back to exactly one Source row.
 */
export class ExtractiveSynthesisProvider implements SynthesisProvider {
  readonly method = "EXTRACTIVE" as const;

  isAvailable(): boolean {
    return true; // no external dependency — this can never be unavailable
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const sections: BriefingSections = {};
    const extractedSentences: ExtractedSentenceOutput[] = [];

    const fillSection = (section: BriefingSection, maxSentences: number, sourceFilter?: (s: SynthesisInput["sources"][number]) => boolean) => {
      const pool = sourceFilter ? input.sources.filter(sourceFilter) : input.sources;
      if (pool.length === 0) return;

      const alreadyChosen = extractedSentences.map((s) => s.text);
      const candidates = scoreCandidatesForSection(
        section,
        pool,
        input.topicEntityNames,
        alreadyChosen,
      ).slice(0, maxSentences);

      if (candidates.length === 0) return;

      // Selection is score-based, but scrambled sentence order reads badly —
      // re-sort the chosen few back into their original position within
      // each source's text before joining them into prose.
      const bySourceText = new Map(pool.map((s) => [s.id, s.text]));
      const ordered = [...candidates].sort((a, b) => {
        const posA = bySourceText.get(a.sourceId)?.indexOf(a.text) ?? 0;
        const posB = bySourceText.get(b.sourceId)?.indexOf(b.text) ?? 0;
        return posA - posB;
      });

      sections[SECTION_KEY[section]] = ordered.map((c) => c.text).join(" ");
      for (const c of candidates) {
        extractedSentences.push({ sourceId: c.sourceId, section, text: c.text, score: c.score });
      }
    };

    fillSection("WHAT_HAPPENED", 2);

    if (!input.signals.isFirstBriefing) {
      // "what changed today" only pulls from the most recently published source(s).
      const sorted = [...input.sources].sort(
        (a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
      const newest = sorted.slice(0, Math.max(1, Math.ceil(sorted.length / 3)));
      fillSection("WHAT_CHANGED_TODAY", 2, (s) => newest.some((n) => n.id === s.id));

      const older = sorted.slice(Math.ceil(sorted.length / 3));
      if (older.length > 0) {
        fillSection("HOW_WE_GOT_HERE", 2, (s) => older.some((o) => o.id === s.id));
      }
    }

    fillSection("WHY_IT_MATTERS", 2);
    fillSection("WHAT_TO_WATCH_NEXT", 1);

    // Fully deterministic, not extracted — built straight from the signals.
    sections.whyPeopleAreTalking = buildWhyPeopleAreTalking(input);

    return { sections, extractedSentences, method: this.method };
  }
}

function buildWhyPeopleAreTalking(input: SynthesisInput): string {
  const { distinctPublicationCount, sourcesInLastSixHours, socialMentionCount, creatorMentionLabels } =
    input.signals;
  const parts: string[] = [];

  if (distinctPublicationCount > 1) {
    parts.push(`Covered by ${distinctPublicationCount} independent publications`);
  } else if (distinctPublicationCount === 1) {
    parts.push("Covered by one publication so far");
  }

  if (sourcesInLastSixHours > 1) {
    parts.push(`${sourcesInLastSixHours} new sources in the last 6 hours`);
  }

  if (creatorMentionLabels.length > 0) {
    parts.push(`discussed by ${creatorMentionLabels.join(", ")}`);
  } else if (socialMentionCount > 0) {
    parts.push(`${socialMentionCount} social mention${socialMentionCount === 1 ? "" : "s"} tracked`);
  }

  if (parts.length === 0) return "Newly surfaced — not yet corroborated by additional coverage.";
  return parts.join("; ") + ".";
}
