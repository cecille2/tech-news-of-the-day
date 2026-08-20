import { buildSynthesisPrompt, parseSynthesisJson } from "./prompt";
import type { Briefing, SynthesisInput, SynthesisProvider } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Every provider below is OPTIONAL and OFF by default. Each is gated by its
// own API key/host env var — with nothing set, `isAvailable()` returns
// false and `index.ts` never calls it. None of these run in V1 unless you
// explicitly configure one. Implemented via raw fetch (no provider SDKs)
// to keep paid-provider dependencies out of the default install entirely.
//
// Endpoints/model names below are current as of this writing but drift over
// time — verify before enabling, and set a spend cap with the provider
// first (see README § accidental-charge protection).
// ─────────────────────────────────────────────────────────────────────────

function briefingFromJson(json: Record<string, string>): Briefing["sections"] {
  return {
    whatHappened: json.whatHappened,
    whatChangedToday: json.whatChangedToday,
    howWeGotHere: json.howWeGotHere,
    whyItMatters: json.whyItMatters,
    whyPeopleAreTalking: json.whyPeopleAreTalking,
    whatToWatchNext: json.whatToWatchNext,
  };
}

export class LocalOllamaSynthesisProvider implements SynthesisProvider {
  readonly method = "LOCAL_LLM" as const;
  private host = process.env.OLLAMA_HOST;
  private model = process.env.OLLAMA_MODEL ?? "llama3.1";

  isAvailable(): boolean {
    return Boolean(this.host); // opt-in: only "on" if you've set OLLAMA_HOST yourself
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: buildSynthesisPrompt(input),
        stream: false,
        format: "json",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Ollama request failed: ${res.status}`);
    const data = (await res.json()) as { response: string };
    return {
      sections: briefingFromJson(parseSynthesisJson(data.response)),
      extractedSentences: [],
      method: this.method,
    };
  }
}

export class KimiSynthesisProvider implements SynthesisProvider {
  readonly method = "KIMI" as const;
  private apiKey = process.env.MOONSHOT_API_KEY;
  private model = process.env.MOONSHOT_MODEL ?? "moonshot-v1-8k";

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const res = await fetch("https://api.moonshot.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: buildSynthesisPrompt(input) }],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Moonshot/Kimi request failed: ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return {
      sections: briefingFromJson(parseSynthesisJson(data.choices[0].message.content)),
      extractedSentences: [],
      method: this.method,
    };
  }
}

export class AnthropicSynthesisProvider implements SynthesisProvider {
  readonly method = "ANTHROPIC" as const;
  private apiKey = process.env.ANTHROPIC_API_KEY;
  private model = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: "user", content: buildSynthesisPrompt(input) }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Anthropic request failed: ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((b) => b.type === "text")?.text ?? "";
    return {
      sections: briefingFromJson(parseSynthesisJson(text)),
      extractedSentences: [],
      method: this.method,
    };
  }
}

export class OpenAISynthesisProvider implements SynthesisProvider {
  readonly method = "OPENAI" as const;
  private apiKey = process.env.OPENAI_API_KEY;
  private model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: "user", content: buildSynthesisPrompt(input) }],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);
    const data = (await res.json()) as { choices: { message: { content: string } }[] };
    return {
      sections: briefingFromJson(parseSynthesisJson(data.choices[0].message.content)),
      extractedSentences: [],
      method: this.method,
    };
  }
}

export class GeminiSynthesisProvider implements SynthesisProvider {
  readonly method = "GEMINI" as const;
  private apiKey = process.env.GEMINI_API_KEY;
  private model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  async generateTopicBriefing(input: SynthesisInput): Promise<Briefing> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildSynthesisPrompt(input) }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Gemini request failed: ${res.status}`);
    const data = (await res.json()) as {
      candidates: { content: { parts: { text: string }[] } }[];
    };
    const text = data.candidates[0].content.parts[0].text;
    return {
      sections: briefingFromJson(parseSynthesisJson(text)),
      extractedSentences: [],
      method: this.method,
    };
  }
}
