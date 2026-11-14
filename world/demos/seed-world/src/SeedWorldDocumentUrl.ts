/** URL state that can be shared even when the app runs inside an `about:srcdoc` Flash App iframe. */
export interface SeedWorldDocumentUrl {
  /** URL that should receive Seed World query parameters. */
  readonly url: URL;
  /** Whether the current document can safely replace its own history entry with `url`. */
  readonly canReplaceHistory: boolean;
}

/**
 * Resolves the URL used for Seed World query state.
 * Flash App production embeds the entry HTML through `iframe.srcdoc`, whose document URL is
 * `about:srcdoc`; mutating that URL with `history.replaceState` aborts application startup.
 */
export function resolveSeedWorldDocumentUrl(
  currentHref: string,
  embeddedEntryHref?: string | null
): SeedWorldDocumentUrl {
  const currentUrl = new URL(currentHref);
  if (isHttpUrl(currentUrl)) return Object.freeze({ url: currentUrl, canReplaceHistory: true });

  if (embeddedEntryHref) {
    try {
      const embeddedEntryUrl = new URL(embeddedEntryHref);
      if (isHttpUrl(embeddedEntryUrl)) {
        return Object.freeze({ url: embeddedEntryUrl, canReplaceHistory: false });
      }
    } catch {
      // A malformed optional host hint must not prevent the world from starting.
    }
  }

  return Object.freeze({ url: currentUrl, canReplaceHistory: false });
}

function isHttpUrl(url: URL): boolean {
  return url.protocol === "http:" || url.protocol === "https:";
}
