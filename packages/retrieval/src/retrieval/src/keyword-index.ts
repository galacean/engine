import { z } from "zod";
import { sourceKeySchema, type SourceAsset } from "./contracts";

export const SEARCH_STRATEGY = "keyword-substring-v1";
export const MAX_INDEX_BYTES = 256 * 1024 * 1024;
export const normalizeKeywordText = (text: string) => text.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
const text = (value: unknown) => (typeof value === "string" ? normalizeKeywordText(value) : "");
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const entrySchema = z
  .object({
    key: sourceKeySchema.refine((value) => value.endsWith("/describe.json")),
    type: z.string().nullable(),
    name: z.string(),
    tags: z.array(z.string()),
    description: z.string()
  })
  .strict();
const indexSchema = z
  .object({
    strategy: z.literal(SEARCH_STRATEGY),
    entries: z.array(entrySchema).min(1)
  })
  .strict();
export type KeywordIndex = z.infer<typeof indexSchema>;
type KeywordEntry = KeywordIndex["entries"][number];

/** Only discovery fields are retained; technical metadata, instructions and URLs stay lazy. */
export function buildKeywordIndex(sources: readonly SourceAsset[]): KeywordIndex {
  return restoreKeywordIndex({
    strategy: SEARCH_STRATEGY,
    entries: sources
      .map(({ key, metadata }) => {
        const overview =
          metadata.overview && typeof metadata.overview === "object"
            ? (metadata.overview as Record<string, unknown>)
            : {};
        return {
          key,
          type: typeof metadata.assetType === "string" ? metadata.assetType : null,
          name: text(overview.name),
          description: text(overview.description),
          tags: [
            ...new Set(
              [
                ...strings(metadata.tags),
                ...["overview", "visualProfile", "usage", "technical"].flatMap((section) => {
                  const value = metadata[section];
                  return value && typeof value === "object" ? strings((value as Record<string, unknown>).tags) : [];
                })
              ]
                .map(normalizeKeywordText)
                .filter(Boolean)
            )
          ]
        };
      })
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  });
}

export function restoreKeywordIndex(raw: unknown): KeywordIndex {
  const index = indexSchema.parse(raw);
  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i];
    if (i > 0 && index.entries[i - 1].key >= entry.key) throw new Error("Duplicate or unsorted asset keys");
    if ([entry.name, entry.description, ...entry.tags].some((value) => value !== normalizeKeywordText(value))) {
      throw new Error("Keyword index contains non-normalized text");
    }
  }
  return index;
}

/** Space-separated literal keywords. No segmentation, regex, synonyms or language-model calls. */
export function rankKeywords(query: string, entries: readonly KeywordEntry[]): KeywordEntry[] {
  const normalized = normalizeKeywordText(query);
  const keywords = [...new Set(normalized.split(" ").filter(Boolean))];
  if (!keywords.length) return [];
  const ranked = [];
  for (const entry of entries) {
    let coverage = 0,
      names = 0,
      tags = 0,
      descriptions = 0;
    for (const keyword of keywords) {
      if (entry.name.includes(keyword)) {
        names++;
        coverage++;
      } else if (entry.tags.some((tag) => tag.includes(keyword))) {
        tags++;
        coverage++;
      } else if (entry.description.includes(keyword)) {
        descriptions++;
        coverage++;
      }
    }
    if (coverage)
      ranked.push({ entry, score: [coverage, Number(entry.name === normalized), names, tags, descriptions] });
  }
  ranked.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
    }
    return a.entry.key < b.entry.key ? -1 : a.entry.key > b.entry.key ? 1 : 0;
  });
  return ranked.map((item) => item.entry);
}
