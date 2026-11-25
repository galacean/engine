import { createLocalWorldDb } from "./storage/local-world-db.mjs";

function installPageDatabase(scope) {
  const api = (scope.lingguang ??= {});
  if (api.db) return { source: "sdk", importLegacyPreview: false };
  const artifactId = document.querySelector('meta[name="lingguang-local-db"]')?.content || scope.artifactId;
  api.db = createLocalWorldDb(artifactId);
  return { source: "local", importLegacyPreview: !artifactId };
}

export const pageDatabase = typeof document === "undefined" ? undefined : installPageDatabase(window);
