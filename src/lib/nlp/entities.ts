import nlp from "compromise";
import { prisma } from "@/lib/db";
import { foldEntityName } from "./normalize";
import type { Entity, EntityType } from "@/generated/prisma/client";

export interface ExtractedMention {
  text: string;
  type: EntityType;
}

/** Strips a trailing possessive/punctuation a regex or sentence-boundary
 * split can leave attached — "Anthropic." / "OpenAI's" → "Anthropic" / "OpenAI". */
function trimMentionText(raw: string): string {
  return raw.replace(/['’]s$/i, "").replace(/[.,;:!?]+$/, "").trim();
}

/**
 * compromise's tagger leans on capitalization *and* sentence position — a
 * capitalized word at the very start of a sentence (which is where a news
 * headline's subject usually sits, e.g. "OpenAI launches...") often doesn't
 * get tagged ProperNoun/Organization at all, because every sentence-initial
 * word is capitalized and that alone isn't a strong signal. A regex sweep
 * for capitalized-word runs catches those regardless of position; it's
 * noisier than compromise alone, so callers only trust a regex-only hit
 * once it resolves against an already-known Entity (see resolveEntities).
 */
function regexCapitalizedPhrases(text: string): string[] {
  const matches = text.match(/\b[A-Z][a-zA-Z0-9]*(?:\s+[A-Z][a-zA-Z0-9]*){0,3}\b/g) ?? [];
  return matches
    .map(trimMentionText)
    .filter((m) => m.length > 2 && !/^(The|A|An|This|That|These|Those|It|They)$/.test(m));
}

/** Rule-based NER via `compromise` plus a capitalization-sweep fallback —
 * free, deterministic, runs in-process. Not as accurate as an LLM on novel
 * product names, but catches the overwhelming majority of companies/
 * people/orgs in ordinary news prose, including sentence-initial ones once
 * they're recognized against known entities (see resolveEntities). */
export function extractMentions(text: string): ExtractedMention[] {
  const doc = nlp(text);
  const mentions: ExtractedMention[] = [];

  doc.organizations().json().forEach((o: { text: string }) => {
    mentions.push({ text: trimMentionText(o.text), type: "ORG" });
  });
  doc.people().json().forEach((p: { text: string }) => {
    mentions.push({ text: trimMentionText(p.text), type: "PERSON" });
  });
  // compromise doesn't have a dedicated "product" tagger — proper nouns that
  // aren't already tagged as org/person are a reasonable free-tier proxy.
  const taggedText = new Set(mentions.map((m) => m.text.toLowerCase()));
  doc
    .match("#ProperNoun+")
    .json()
    .forEach((n: { text: string }) => {
      const trimmed = trimMentionText(n.text);
      if (!taggedText.has(trimmed.toLowerCase()) && trimmed.length > 2) {
        mentions.push({ text: trimmed, type: "PRODUCT" });
        taggedText.add(trimmed.toLowerCase());
      }
    });

  // Regex sweep for anything compromise's position-sensitive tagger missed —
  // tagged PRODUCT for now; resolveEntities upgrades it to a known entity's
  // real type the moment it matches an existing alias.
  for (const phrase of regexCapitalizedPhrases(text)) {
    if (!taggedText.has(phrase.toLowerCase())) {
      mentions.push({ text: phrase, type: "PRODUCT" });
      taggedText.add(phrase.toLowerCase());
    }
  }

  // de-dupe within this single document
  const seen = new Set<string>();
  return mentions.filter((m) => {
    const key = `${m.type}:${m.text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function similarEnough(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return false;
  const distance = levenshtein(a, b);
  return distance / maxLen < 0.15; // within ~15% edit distance, e.g. "OpenAI" vs "Open AI"
}

/**
 * Resolves a raw mention ("OpenAI Inc.") to a canonical Entity, creating one
 * if nothing close enough exists. Exact alias match short-circuits; fuzzy
 * match only kicks in against a small candidate set (same folded first
 * token) to keep this cheap even as the entity table grows.
 */
export async function resolveEntity(mention: ExtractedMention): Promise<Entity> {
  const folded = foldEntityName(mention.text);

  const exact = await prisma.entityAlias.findUnique({
    where: { aliasText: folded },
    include: { entity: true },
  });
  if (exact) return exact.entity;

  const firstToken = folded.split(" ")[0];
  const candidates = await prisma.entityAlias.findMany({
    where: { aliasText: { startsWith: firstToken } },
    include: { entity: true },
    take: 25,
  });
  const fuzzyMatch = candidates.find((c) => similarEnough(c.aliasText, folded));
  if (fuzzyMatch) {
    // Record this spelling as a new alias so next time it's an exact hit.
    await prisma.entityAlias.create({
      data: { entityId: fuzzyMatch.entityId, aliasText: folded, source: "AUTO" },
    });
    return fuzzyMatch.entity;
  }

  const entity = await prisma.entity.create({
    data: {
      canonicalName: mention.text,
      type: mention.type,
      aliases: { create: { aliasText: folded, source: "AUTO" } },
    },
  });
  return entity;
}

export async function resolveEntities(mentions: ExtractedMention[]): Promise<Entity[]> {
  const results: Entity[] = [];
  const seenIds = new Set<string>();
  for (const mention of mentions) {
    const entity = await resolveEntity(mention);
    if (!seenIds.has(entity.id)) {
      seenIds.add(entity.id);
      results.push(entity);
    }
  }
  return results;
}
