const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "says", "said", "new", "after", "over", "amid", "amid", "its", "it's",
]);

/** Lowercase, strip punctuation, drop stopwords — for cheap title-similarity checks. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .join(" ");
}

export function titleTokenSet(title: string): Set<string> {
  return new Set(normalizeTitle(title).split(" ").filter(Boolean));
}

/** Jaccard similarity of two token sets — cheapest possible clustering signal. */
export function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const tok of a) if (b.has(tok)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Splits article text into sentences for extractive scoring. Deliberately simple —
 * good enough for well-formed news prose, not a full sentence-boundary model. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z"'])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && s.length < 400);
}

/** Strips common legal suffixes so "OpenAI Inc." and "OpenAI" compare equal. */
export function stripLegalSuffix(name: string): string {
  return name
    .replace(/\b(inc\.?|corp\.?|corporation|llc|ltd\.?|co\.?|company|group|holdings)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function foldEntityName(name: string): string {
  return stripLegalSuffix(name).toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
}
