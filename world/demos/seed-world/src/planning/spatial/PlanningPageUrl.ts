import { resolveSeedWorldDocumentUrl, type SeedWorldDocumentUrl } from "../../SeedWorldDocumentUrl.ts";

export const PRESERVED_DIAG_PARAMS = [
  "bootTrace",
  "agentTrace",
  "photoInputTrace",
  "shaderAudit",
  "perfTour",
  "perfTourSec"
] as const;

/** Capture present opt-in diagnostic query params before rebuilding a clean Seed World URL. */
export function capturePreservedDiagParams(params: URLSearchParams): [string, string][] {
  const preserved: [string, string][] = [];
  for (const key of PRESERVED_DIAG_PARAMS) {
    const value = params.get(key);
    if (value !== null) preserved.push([key, value]);
  }
  return preserved;
}

/** Re-append captured diagnostic query params onto a clean URL without clobbering core params. */
export function appendPreservedDiagParams(params: URLSearchParams, preserved: readonly [string, string][]): void {
  for (const [key, value] of preserved) {
    params.set(key, value);
  }
}

/** Resolve the host's actual entry in both direct pages and the existing Flash App srcdoc shell. */
export function planningPageUrl(): SeedWorldDocumentUrl {
  return resolveSeedWorldDocumentUrl(
    location.href,
    document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]')?.content
  );
}
