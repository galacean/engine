import { pageDatabase } from "../base.js";
import { scheduleWorldDb } from "./WorldDbRateLimit";
import { SharedWorldStorage, type WorldDb, type WorldIdentity, type WorldSelection } from "./SharedWorldStorage";
import { createLocalWorldDb } from "./local-world-db.mjs";

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
  legacyLocalDbName?: string | null;
}

export interface SeedWorldSaveSelection extends WorldSelection {
  readonly legacyPreview?: WorldSelection;
  readonly skipLegacyPreview?: boolean;
}

function openLegacyLocalDb(name: string | null): WorldDb {
  return createLocalWorldDb(name, { create: false }) as WorldDb;
}

export async function selectSeedWorldSave(host: StorageHost, template: string): Promise<SeedWorldSaveSelection> {
  const current = await SharedWorldStorage.select(host.db, host.appVersion, template);
  const legacyName = host.legacyLocalDbName;
  if (current.raw !== undefined || legacyName === undefined) return current;
  try {
    const legacy = await SharedWorldStorage.select(openLegacyLocalDb(legacyName), host.appVersion, template);
    if (legacy.checkpoint) return { ...current, legacyPreview: legacy };
  } catch (error) {
    console.warn("读取旧浏览器存档失败，将初始化入口模板", error);
  }
  return current;
}

export async function loadSeedWorldLegacyPreview(
  host: StorageHost,
  identity: WorldIdentity,
  selection: WorldSelection
) {
  const legacyName = host.legacyLocalDbName;
  if (legacyName === undefined) return undefined;
  const storage = await SharedWorldStorage.open(
    openLegacyLocalDb(legacyName), true, host.appVersion, identity, undefined, undefined, undefined, selection
  );
  try {
    return await storage.load();
  } finally {
    storage.close();
  }
}

export async function resolveStorageHost(
  scope: HostGlobals,
  binding: { source: string; legacyLocalDbName?: string | null } = { source: "sdk" }
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
    legacyLocalDbName: binding.legacyLocalDbName
  };
}

let current: Promise<StorageHost> | undefined;
export function seedWorldStorageHost(): Promise<StorageHost | undefined> {
  if (!pageDatabase) return Promise.resolve(undefined);
  return (current ??= resolveStorageHost(window as unknown as HostGlobals, pageDatabase));
}
