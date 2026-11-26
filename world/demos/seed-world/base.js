import { createLocalWorldDb } from "./storage/local-world-db.mjs";

function installPageDatabase(scope) {
  const api = (scope.lingguang ??= {});
  if (api.db) return { source: "sdk", importLegacyPreview: false };
  const name = document.querySelector('meta[name="seed-world-default-template"]')?.content.trim() || "original";
  api.db = createLocalWorldDb(name, { restoreUnscopedPreview: true });
  return { source: "local", importLegacyPreview: true };
}

export const pageDatabase = typeof document === "undefined" ? undefined : installPageDatabase(window);
