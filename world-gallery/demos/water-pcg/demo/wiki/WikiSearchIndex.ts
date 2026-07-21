import type { WaterWikiPage } from "./model";

export interface WaterWikiSearchEntry {
  readonly page: WaterWikiPage;
  readonly title: string;
  readonly keywords: string;
  readonly body: string;
}

function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase();
}

export function markdownToSearchText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[>*_|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createWaterWikiSearchIndex(pages: readonly WaterWikiPage[]): readonly WaterWikiSearchEntry[] {
  return pages.map((page) => ({
    page,
    title: normalizeSearchText(`${page.title} ${page.summary}`),
    keywords: normalizeSearchText(page.keywords.join(" ")),
    body: normalizeSearchText(markdownToSearchText(page.markdown))
  }));
}

export function searchWaterWiki(entries: readonly WaterWikiSearchEntry[], query: string): readonly WaterWikiPage[] {
  const terms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries.map(({ page }) => page);

  return entries
    .map((entry, index) => {
      let score = 0;
      for (const term of terms) {
        if (entry.title.includes(term)) score += 8;
        else if (entry.keywords.includes(term)) score += 4;
        else if (entry.body.includes(term)) score += 1;
        else return undefined;
      }
      return { entry, index, score };
    })
    .filter((result): result is NonNullable<typeof result> => result !== undefined)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ entry }) => entry.page);
}
