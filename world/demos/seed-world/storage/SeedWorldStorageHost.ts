import { pageDatabase } from "../base.js";
import { scheduleWorldDb } from "./WorldDbRateLimit";
import type { WorldDb } from "./SharedWorldStorage";

interface HostGlobals {
  lingguang: { db: WorldDb; _getArtifactVersion?(): string };
  artifactVersion?: string;
  currentRole?: string;
  currentRoleReady?: Promise<unknown>;
}

interface StorageHost {
  db: WorldDb;
  readOnly: boolean;
  appVersion: string;
  importLegacyPreview: boolean;
}

export async function resolveStorageHost(
  scope: HostGlobals,
  binding = { source: "sdk", importLegacyPreview: false }
): Promise<StorageHost> {
  const db = scope.lingguang.db;
  const appVersion = String(scope.lingguang._getArtifactVersion?.() || scope.artifactVersion || "1");
  let role: string | undefined;
  try {
    if (binding.source !== "local" && scope.currentRoleReady) {
      await scope.currentRoleReady;
      role = scope.currentRole;
    } else {
      const result = await db.role();
      if (result.success !== false) role = result.role ?? result.data?.role;
    }
  } catch (error) {
    console.warn("灵光角色读取失败，以访客身份打开世界", error);
  }
  return {
    db: scheduleWorldDb(db, binding.source === "sdk"),
    appVersion,
    readOnly: role !== "MANAGER",
    importLegacyPreview: binding.importLegacyPreview
  };
}

let current: Promise<StorageHost> | undefined;
export function seedWorldStorageHost(): Promise<StorageHost | undefined> {
  if (!pageDatabase) return Promise.resolve(undefined);
  return (current ??= resolveStorageHost(window as unknown as HostGlobals, pageDatabase));
}
