import type { Texture2D } from "@galacean/engine";

/** Version-neutral atlas source. The skeleton asset selects the backend that interprets it. */
export class SpineAtlas {
  constructor(
    readonly text: string,
    readonly textures: readonly Texture2D[]
  ) {}

  /** Atlas pages begin a block; regions and their properties remain in the same block. */
  static pageNames(text: string): string[] {
    const pages: string[] = [];
    let pageStart = true;
    for (const line of text.split(/\r?\n/)) {
      const value = line.trim();
      if (!value) {
        pageStart = true;
      } else if (pageStart) {
        // Optional atlas-level properties precede the first page in newer exports.
        if (value.includes(":")) continue;
        pages.push(value);
        pageStart = false;
      }
    }
    return pages;
  }
}
