import type { FeatureExtractionPipeline } from "@huggingface/transformers";

// Lazily loaded, memoized — the model (~90MB, all-MiniLM-L6-v2) downloads
// once and is cached by transformers.js locally; nothing about this touches
// a paid API. 384-dim output, matches the `vector(384)` column in schema.prisma.
let pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (!pipelinePromise) {
    pipelinePromise = import("@huggingface/transformers").then(({ pipeline }) =>
      pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2"),
    );
  }
  return pipelinePromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getPipeline();
  const results: number[][] = [];
  // Sequential on purpose: keeps peak memory bounded on a GitHub Actions
  // runner processing a modest daily batch (tens of candidates, not thousands).
  for (const text of texts) {
    const output = await extractor(text, { pooling: "mean", normalize: true });
    results.push(Array.from(output.data as Float32Array));
  }
  return results;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function toPgVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
