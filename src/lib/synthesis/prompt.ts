import type { SynthesisInput } from "./types";

/** Shared prompt builder for every optional LLM-backed provider (Layer 2/3).
 * Explicitly instructs the model to ground every section in the provided
 * sources and never introduce a claim that isn't supported by them —
 * mirrors the same sourcing discipline Layer 1 enforces structurally. */
export function buildSynthesisPrompt(input: SynthesisInput): string {
  const sourceBlocks = input.sources
    .map(
      (s, i) =>
        `[Source ${i + 1} — ${s.publication}${s.isPrimary ? ", PRIMARY SOURCE" : ""}]\n${s.text.slice(0, 2000)}`,
    )
    .join("\n\n");

  return `You are writing a factual briefing about a news topic for a content creator. Use ONLY the sources below — never introduce a fact, quote, or claim that isn't supported by them.

Topic: ${input.topicTitle}
Known entities: ${input.topicEntityNames.join(", ") || "none extracted"}

${sourceBlocks}

Respond with strict JSON matching this shape (omit a key if you have nothing grounded to say for it):
{
  "whatHappened": string,
  "whatChangedToday": string,
  "howWeGotHere": string,
  "whyItMatters": string,
  "whyPeopleAreTalking": string,
  "whatToWatchNext": string
}`;
}

export function parseSynthesisJson(raw: string): Record<string, string> {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON object found in model response");
  return JSON.parse(match[0]);
}
