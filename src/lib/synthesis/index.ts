import { ExtractiveSynthesisProvider } from "./ExtractiveSynthesisProvider";
import {
  AnthropicSynthesisProvider,
  GeminiSynthesisProvider,
  KimiSynthesisProvider,
  LocalOllamaSynthesisProvider,
  OpenAISynthesisProvider,
} from "./optionalProviders";
import type { Briefing, SynthesisInput, SynthesisProvider } from "./types";

export type { Briefing, SynthesisInput, SynthesisProvider } from "./types";

const extractive = new ExtractiveSynthesisProvider();

// Order reflects a rough cost/local-first preference when more than one
// optional provider happens to be configured — it does not matter for V1,
// since none are configured by default.
const optionalProviders: SynthesisProvider[] = [
  new LocalOllamaSynthesisProvider(),
  new KimiSynthesisProvider(),
  new AnthropicSynthesisProvider(),
  new OpenAISynthesisProvider(),
  new GeminiSynthesisProvider(),
];

/**
 * Picks a synthesis provider. `PREFERRED_SYNTHESIS_PROVIDER` (e.g. "ANTHROPIC")
 * pins a specific one; otherwise the first available optional provider wins.
 * With no API keys configured — the V1 default — this always resolves to
 * ExtractiveSynthesisProvider, and that's a supported, permanent outcome,
 * not a degraded one.
 */
function selectPreferredProvider(): SynthesisProvider {
  const pinned = process.env.PREFERRED_SYNTHESIS_PROVIDER;
  if (pinned) {
    const match = optionalProviders.find((p) => p.method === pinned);
    if (match?.isAvailable()) return match;
  }
  return optionalProviders.find((p) => p.isAvailable()) ?? extractive;
}

/**
 * Generates a briefing, always with Layer 1 as the source of `extractedSentences`
 * (source-attributed citations) regardless of which provider wrote the prose —
 * and always falling back to Extractive on any error, timeout, or unavailability.
 * The fallback direction is one-way: free → paid never happens automatically,
 * only paid/local → free, and only when the configured provider itself fails.
 */
export async function generateBriefing(input: SynthesisInput): Promise<Briefing> {
  // Layer 1 always runs — it's the citation backbone even when an optional
  // provider supplies the prose, and it's the only thing that runs otherwise.
  const extractiveResult = await extractive.generateTopicBriefing(input);

  const provider = selectPreferredProvider();
  if (provider.method === "EXTRACTIVE") return extractiveResult;

  try {
    const generated = await provider.generateTopicBriefing(input);
    return {
      sections: generated.sections,
      extractedSentences: extractiveResult.extractedSentences, // citations still trace to real sources
      method: provider.method,
    };
  } catch (err) {
    console.warn(`[synthesis] ${provider.method} failed, falling back to EXTRACTIVE:`, err);
    return extractiveResult;
  }
}
