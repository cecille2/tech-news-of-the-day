import type { BriefingSection, SourceTier, SynthesisMethod } from "@/generated/prisma/client";

export interface SourceInput {
  id: string;
  publication: string;
  url: string;
  tier: SourceTier;
  isPrimary: boolean;
  publishedAt?: Date;
  /** Full article text, held only in memory for this run — never persisted (see README § storage discipline). */
  text: string;
}

export interface TopicContextSignals {
  distinctPublicationCount: number;
  sourcesInLastSixHours: number;
  socialMentionCount: number;
  creatorMentionLabels: string[]; // e.g. ["StephTheFounder on YouTube"]
  isFirstBriefing: boolean; // no prior TopicUpdate yet
}

export interface BriefingSections {
  whatHappened?: string;
  whatChangedToday?: string;
  howWeGotHere?: string;
  whyItMatters?: string;
  whyPeopleAreTalking?: string;
  whatToWatchNext?: string;
}

export interface ExtractedSentenceOutput {
  sourceId: string;
  section: BriefingSection;
  text: string;
  score: number;
}

export interface Briefing {
  sections: BriefingSections;
  extractedSentences: ExtractedSentenceOutput[];
  method: SynthesisMethod;
}

export interface SynthesisInput {
  topicTitle: string;
  topicEntityNames: string[];
  sources: SourceInput[];
  signals: TopicContextSignals;
}

/**
 * The one interface the rest of the app depends on. Every implementation is
 * interchangeable behind this contract — swapping providers is a config
 * change, never a rewrite. See `index.ts` for selection + fallback logic.
 */
export interface SynthesisProvider {
  readonly method: SynthesisMethod;
  /** Cheap, synchronous-ish check — e.g. "is an API key present". Never throws. */
  isAvailable(): boolean;
  generateTopicBriefing(input: SynthesisInput): Promise<Briefing>;
}
