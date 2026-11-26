import { createLocalWorldDb } from "./storage/local-world-db.mjs";

export function resolveLocalWorldDbScope(doc, scope) {
  const explicitId =
    doc?.querySelector('meta[name="lingguang-local-db"]')?.content.trim() ||
    (typeof scope?.artifactId === "string" ? scope.artifactId.trim() : "");
  const template = doc?.querySelector('meta[name="seed-world-default-template"]')?.content.trim() || "original";
  return {
    name: explicitId ? `${explicitId}:${template}` : template,
    importLegacyPreview: !explicitId
  };
}

function installPageDatabase(scope) {
  const api = (scope.lingguang ??= {});
  if (api.db) return { source: "sdk", importLegacyPreview: false };
  const { name, importLegacyPreview } = resolveLocalWorldDbScope(document, scope);
  api.db = createLocalWorldDb(name);
  return { source: "local", importLegacyPreview };
}

export const pageDatabase = typeof document === "undefined" ? undefined : installPageDatabase(window);
