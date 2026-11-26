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
  const scheduled = scheduleWorldDb(db, binding.source === "sdk");
  if (binding.source === "sdk") {
    scheduled.persistentTime = async () => {
      const result = await scheduled.query({
        sql: "SELECT UNIX_TIMESTAMP(NOW(3)) AS epochSeconds FROM world_save WHERE id = ? LIMIT 1",
        binds: ["world"],
        timeoutMs: 30000
      });
      const seconds = result.data?.[0]?.epochSeconds;
      const now = Math.round(Number(seconds) * 1000);
      if (!result.success || !Number.isSafeInteger(now) || now <= 0)
        throw new Error(result.message || "世界存档数据库时钟不可用");
      return now;
    };
  }
  return {
    db: scheduled,
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
