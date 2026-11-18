import { resolveSeedWorldDocumentUrl, type SeedWorldDocumentUrl } from "../../SeedWorldDocumentUrl.ts";

/** Resolve the host's actual entry in both direct pages and the existing Flash App srcdoc shell. */
export function planningPageUrl(): SeedWorldDocumentUrl {
  return resolveSeedWorldDocumentUrl(
    location.href,
    document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]')?.content
  );
}
