import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";

export const FLASH_APP_DEFAULT_TEMPLATE_META = "seed-world-default-template";

function normalizeTemplateId(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === "original") return "original";
  return worldTemplate(trimmed)?.id;
}

/**
 * Reads the bound template declared in the demo/Flash App HTML via
 * `<meta name="seed-world-default-template" content="<templateId>" />`.
 */
export function readBoundFlashAppTemplate(doc?: Pick<Document, "querySelector">): string | undefined {
  const target = doc ?? (typeof document !== "undefined" ? document : undefined);
  if (!target) return undefined;
  const content = target.querySelector<HTMLMetaElement>(`meta[name="${FLASH_APP_DEFAULT_TEMPLATE_META}"]`)?.content;
  return normalizeTemplateId(content);
}

/**
 * Resolves this standalone Seed World app/demo's fixed template ID from `<meta>`.
 * Applications are strictly single-template and never read URL `?template=`.
 */
export function resolveAppTemplate(doc?: Pick<Document, "querySelector">): string {
  return readBoundFlashAppTemplate(doc) ?? "original";
}
