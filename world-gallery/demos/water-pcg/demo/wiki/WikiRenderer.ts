import DOMPurify from "dompurify";
import { marked, Renderer, type Tokens } from "marked";
import type { WaterWikiHeading } from "./model";

export interface RenderedWaterWikiPage {
  readonly html: string;
  readonly headings: readonly WaterWikiHeading[];
}

export function createWaterWikiHeadingId(label: string, occurrence = 0): string {
  const base = label
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/<[^>]*>/g, "")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  const safeBase = base || "section";
  return occurrence === 0 ? safeBase : `${safeBase}-${occurrence + 1}`;
}

export function renderWaterWikiMarkdown(markdown: string): RenderedWaterWikiPage {
  const renderer = new Renderer();
  const headingOccurrences = new Map<string, number>();
  const headings: WaterWikiHeading[] = [];

  renderer.heading = ({ tokens, depth, text }: Tokens.Heading): string => {
    const occurrence = headingOccurrences.get(text) ?? 0;
    headingOccurrences.set(text, occurrence + 1);
    const id = createWaterWikiHeadingId(text, occurrence);
    const labelHtml = renderer.parser.parseInline(tokens);
    if (depth === 2 || depth === 3) headings.push({ depth, id, label: text });
    return `<h${depth} id="${id}">${labelHtml}<button class="wiki-heading-anchor" type="button" data-heading-id="${id}" aria-label="定位到 ${text}">#</button></h${depth}>`;
  };

  const unsafeHtml = marked.parse(markdown, { gfm: true, renderer }) as string;
  const html = DOMPurify.sanitize(unsafeHtml, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["data-heading-id"],
    FORBID_TAGS: ["style"]
  });
  return { html, headings };
}
