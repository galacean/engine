export interface WaterWikiLocation {
  readonly search: string;
}

export function resolveWaterWikiSlug(
  location: WaterWikiLocation,
  validSlugs: ReadonlySet<string>,
  fallbackSlug: string
): string {
  const requestedSlug = new URLSearchParams(location.search).get("doc") ?? "";
  return validSlugs.has(requestedSlug) ? requestedSlug : fallbackSlug;
}

export function getWaterWikiHref(currentHref: string, slug: string): string {
  const url = new URL(currentHref);
  url.searchParams.delete("example");
  url.searchParams.delete("mode");
  url.searchParams.set("doc", slug);
  url.hash = "water-wiki";
  return url.href;
}
