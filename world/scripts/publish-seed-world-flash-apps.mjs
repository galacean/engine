#!/usr/bin/env node
/**
 * Multi-template Seed World Flash App publish orchestrator (6 apps sharing 1 common runtime).
 *
 * - Static app metadata (`templateId`, `title`, `artifactId`, `type`) lives in `world/demos/seed-world/flash-apps.json`.
 * - Each Artifact keeps its local publish state in its own file in `~/.config/galacean-flash-app/apps/`.
 * - Each Artifact backs up its own built static directory (`world/dist/seed-world-flash-apps/<templateId>`, no `package.json`)
 *   so cloud `copy`/clone skips `npm run build` and directly re-injects the cloned `artifactId`/`artifactVersion`.
 * - By default (`--registry-mode http`), registers releases via ASAP HTTP `/api/flash-app/register` (works from any developer
 *   machine without direct OceanBase/Layotto access) and verifies that the allocated version matches the injected version.
 *   Pass `--registry-mode direct-db` on release hosts with ASAP OceanBase/Layotto access to pre-reserve versions via
 *   `seed-world-flash-registry.py`.
 *
 * Defaults to `--dry-run`. Pass `--execute` to perform remote DB/OSS/Yuyan/PUGC operations.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_FLASH_APPS_CATALOG_RELATIVE,
  loadFlashAppsCatalog
} from "./flash-app-variants.mjs";

import { callFlashRegistry, deploySeedWorldFlashApp } from "./deploy-seed-world-flash-app.mjs";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultEngineRoot = resolve(scriptDirectory, "../..");
const defaultStateDir = join(homedir(), ".config/galacean-flash-app/apps");
const RELEASE_ID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
const WORLD_SAVE_DDL_RELATIVE = "world/demos/seed-world/storage/world_save.sql";

function matchesWorldSaveTable(schema) {
  if (schema?.tableKind !== "share" || schema.tableName !== "world_save" ||
      !Array.isArray(schema.primaryKeys) || schema.primaryKeys.length !== 1 || schema.primaryKeys[0] !== "id" ||
      !Array.isArray(schema.columns) || schema.columns.length !== 4) {
    return false;
  }
  // ASAP normalizes non-primary VARCHAR columns to VARCHAR(100000) under its default policy.
  const expected = [
    ["id", "VARCHAR", [128]],
    ["generation", "VARCHAR", [64, 100000]],
    ["part_no", "INT", [null]],
    ["payload", "VARCHAR", [100000]]
  ];
  return expected.every(([name, type, lengths]) => {
    const column = schema.columns.find((column) => column?.name === name);
    return column?.dataType === type && column.nullable === false && lengths.includes(column.length);
  });
}

async function ensureWorldSaveTable(callRemoteSkill, item, version, ddlSql) {
  const callDb = (action, params) => callRemoteSkill({
    action, alipayUid: item.alipayUid, sessionId: item.sessionId,
    payload: { action, artifactId: item.artifactId, artifactVersion: version, params }
  });
  async function readDb(action, params) {
    const response = await callDb(action, params);
    const result = typeof response?.data === "string" ? JSON.parse(response.data) : response?.data;
    if (response?.success !== true || result?.success !== true) {
      throw new Error(result?.message || response?.message || `ASAP could not confirm ${action}`);
    }
    return result.data;
  }
  async function verifySchema() {
    const schema = await readDb("lingguang.db.getTableSchema", { table_name: "world_save" });
    if (!matchesWorldSaveTable(schema)) throw new Error("world_save does not match the required Share table schema");
  }

  const tables = await readDb("lingguang.db.listTables", {});
  if (!Array.isArray(tables) || tables.some((name) => typeof name !== "string")) {
    throw new Error("ASAP returned an invalid list of database tables");
  }
  if (tables.includes("world_save")) {
    await verifySchema();
    return "ready";
  }
  if (ddlSql === undefined) throw new Error("world_save is missing and --skip-db-init disables table creation");

  let createError;
  try {
    const response = await callDb("lingguang.db.updateTableSchema", {
      ddl_sql: ddlSql, table_kind: "share", data_object: "世界存档"
    });
    // ASAP returns the DDL outcome as text inside the successful remote-skill envelope.
    const outcome = typeof response?.data === "string" ? response.data.trim() : "";
    if (response?.success !== true || !outcome.startsWith("创建表成功！")) {
      createError = new Error(outcome.split(/\r?\n/u, 1)[0] || "ASAP did not confirm that world_save was created");
    }
  } catch (error) {
    createError = error;
  }
  try {
    // A concurrent create or a lost reply can leave the correct table in place.
    await verifySchema();
  } catch (error) {
    if (!createError) throw error;
    throw new Error(`${createError.message}. ASAP could not confirm a matching world_save Share table: ${error.message}`, {
      cause: createError
    });
  }
  return "initialized";
}

export function mintArtifactId() {
  return `flashapp-${randomBytes(8).toString("hex")}`;
}

export function parseCliArgs(argv) {
  const parsed = {
    engineRoot: defaultEngineRoot,
    catalogPath: null,
    stateDir: defaultStateDir,
    publisherRoot: process.env.PUBLISHER_ROOT || "",
    asapServiceDir: process.env.ASAP_SERVICE_DIR || "",
    asapPython: process.env.ASAP_PYTHON || "",
    registryMode: "http",
    verifyRegistry: false,
    resumeRelease: null,
    templates: "all",
    type: null,
    appKey: "flash-app",
    timeout: 300,
    titleOverrides: {},
    execute: false,
    initMissing: false,
    syncCatalog: false,
    skipDbInit: false,
    skipOnlineCheck: false,
    allowContextMismatch: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      case "--engine-root":
        parsed.engineRoot = resolve(argv[++i] || "");
        break;
      case "--catalog":
        parsed.catalogPath = resolve(argv[++i] || "");
        break;
      case "--state-dir":
        parsed.stateDir = resolve(argv[++i] || "");
        break;
      case "--publisher-root":
        parsed.publisherRoot = resolve(argv[++i] || "");
        break;
      case "--asap-service-dir":
        parsed.asapServiceDir = resolve(argv[++i] || "");
        break;
      case "--asap-python":
        parsed.asapPython = resolve(argv[++i] || "");
        break;
      case "--registry-mode":
        parsed.registryMode = (argv[++i] || "").trim();
        break;
      case "--verify-registry":
        parsed.verifyRegistry = true;
        break;
      case "--resume-release":
        parsed.resumeRelease = argv[++i] || "";
        break;
      case "--templates":
        parsed.templates = argv[++i] || "all";
        break;
      case "--type":
        parsed.type = (argv[++i] || "").trim();
        break;
      case "--app-key":
        parsed.appKey = (argv[++i] || "flash-app").trim();
        break;
      case "--timeout":
        parsed.timeout = Number.parseInt(argv[++i] || "300", 10);
        break;
      case "--title-override": {
        const raw = argv[++i] || "";
        const eq = raw.indexOf("=");
        if (eq <= 0 || eq === raw.length - 1) {
          throw new Error(`Invalid --title-override "${raw}"; expected <templateId>=<title>`);
        }
        parsed.titleOverrides[raw.slice(0, eq).trim()] = raw.slice(eq + 1).trim();
        break;
      }
      case "--execute":
        parsed.execute = true;
        break;
      case "--dry-run":
        parsed.execute = false;
        break;
      case "--init-missing":
        parsed.initMissing = true;
        break;
      case "--sync-catalog":
        parsed.syncCatalog = true;
        break;
      case "--skip-db-init":
        parsed.skipDbInit = true;
        break;
      case "--skip-online-check":
        parsed.skipOnlineCheck = true;
        break;
      case "--allow-context-mismatch":
        parsed.allowContextMismatch = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (parsed.type !== null && parsed.type !== "game" && parsed.type !== "miniapp") {
    throw new Error(`Invalid --type "${parsed.type}"; expected "game" or "miniapp"`);
  }
  if (parsed.registryMode !== "http" && parsed.registryMode !== "direct-db") {
    throw new Error(`Invalid --registry-mode "${parsed.registryMode}"; expected "http" or "direct-db"`);
  }
  if (parsed.resumeRelease !== null && (!parsed.execute || !RELEASE_ID.test(parsed.resumeRelease))) {
    throw new Error("--resume-release requires --execute and a valid release ID");
  }
  if (parsed.verifyRegistry && (parsed.execute || parsed.skipOnlineCheck)) {
    throw new Error("--verify-registry is read-only and requires the online version lookup");
  }
  if (!Number.isFinite(parsed.timeout) || parsed.timeout <= 0) {
    throw new Error(`Invalid --timeout "${parsed.timeout}"`);
  }
  if (parsed.execute && parsed.skipOnlineCheck) {
    throw new Error("--skip-online-check is only supported with --dry-run");
  }

  parsed.catalogPath = parsed.catalogPath || resolve(parsed.engineRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE);
  return parsed;
}

export function selectTargetApps(catalog, templatesArg = "all") {
  if (!templatesArg || templatesArg === "all") {
    return [...catalog.apps];
  }
  const requested = templatesArg
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (requested.length === 0) {
    throw new Error("--templates must be 'all' or a comma-separated list of template IDs");
  }
  const byId = new Map(catalog.apps.map((app) => [app.templateId, app]));
  const seen = new Set();
  const selected = [];
  for (const id of requested) {
    const found = byId.get(id);
    if (!found) {
      throw new Error(
        `Unknown template "${id}" in --templates; expected one of: ${catalog.apps.map((a) => a.templateId).join(", ")}`
      );
    }
    if (!seen.has(id)) {
      seen.add(id);
      selected.push(found);
    }
  }
  return selected;
}

function artifactStateFileName(artifactId) {
  if (typeof artifactId !== "string" || !/^[a-z0-9_-]+$/u.test(artifactId)) {
    throw new Error(`Invalid Artifact ID: ${artifactId}`);
  }
  return `${artifactId}.local.json`;
}

export function loadLocalState(stateDir, catalog, publisherContext) {
  const apps = {};
  for (const app of catalog.apps) {
    const artifactId = app.artifactId || (app.reuseExisting ? publisherContext?.artifactId : null);
    if (artifactId) {
      const file = resolve(stateDir, artifactStateFileName(artifactId));
      if (!existsSync(file)) continue;
      const state = JSON.parse(readFileSync(file, "utf8"));
      if (state.artifactId !== artifactId) throw new Error(`Artifact ID mismatch in ${file}`);
      apps[app.templateId] = state;
      continue;
    }
    // A newly minted ID may be saved locally before the catalog is updated.
    const matches = (existsSync(stateDir) ? readdirSync(stateDir) : [])
      .filter((name) => name.endsWith(".local.json"))
      .map((name) => ({ name, state: JSON.parse(readFileSync(resolve(stateDir, name), "utf8")) }))
      .filter(({ name, state }) => state.templateId === app.templateId && name === artifactStateFileName(state.artifactId));
    if (matches.length > 1) {
      throw new Error(`Multiple local Artifacts for "${app.templateId}". Set its artifactId in the catalog.`);
    }
    if (matches.length === 1) apps[app.templateId] = matches[0].state;
  }
  return { apps };
}

function writeFileAtomic(filePath, content, mode = 0o600) {
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}`;
  try {
    writeFileSync(tempPath, content, { encoding: "utf8", mode });
    chmodSync(tempPath, mode);
    renameSync(tempPath, filePath);
  } catch (err) {
    rmSync(tempPath, { force: true });
    throw err;
  }
}

export function saveLocalState(stateDir, item, updates) {
  const file = resolve(stateDir, artifactStateFileName(item.artifactId));
  const previous = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  writeFileAtomic(file, `${JSON.stringify({
    ...previous,
    ...updates,
    artifactId: item.artifactId,
    templateId: item.templateId,
    sessionId: item.sessionId,
    type: item.type,
    updatedAt: new Date().toISOString()
  }, null, 2)}\n`);
}

export function readPublisherContext(publisherRoot) {
  if (!publisherRoot) return null;
  const contextPath = resolve(publisherRoot, "scripts/app-context.local.json");
  if (!existsSync(contextPath)) return null;
  return JSON.parse(readFileSync(contextPath, "utf8"));
}

export function isValidAlipayUidForDb(uid) {
  return typeof uid === "string" && /^2099\d+$/.test(uid.trim());
}

/**
 * Resolves the publish plan for all selected templates without mutating remote state.
 */
export function resolveAppReleasePlan({
  catalog,
  state,
  publisherContext,
  targetApps,
  options,
  mintId = mintArtifactId,
  onlineInfoByTemplate = {}
}) {
  const originalCatalog = catalog.apps.find((a) => a.templateId === "original");
  const originalOnline = onlineInfoByTemplate.original || null;
  const resolvedDefaultType =
    options.type ||
    originalOnline?.type ||
    originalCatalog?.type ||
    state.apps.original?.type ||
    null;

  if (options.type && targetApps.length > 1) {
    const conflicts = targetApps
      .map((app) => ({
        templateId: app.templateId,
        declaredType: onlineInfoByTemplate[app.templateId]?.type || app.type || null
      }))
      .filter((entry) => entry.declaredType && entry.declaredType !== options.type);
    if (conflicts.length > 0) {
      throw new Error(
        `Global --type ${options.type} conflicts with per-app declared type(s): ` +
          conflicts.map((c) => `${c.templateId}=${c.declaredType}`).join(", ") +
          `. Omit --type to use per-app types from flash-apps.json, or pass --templates <single> to override one app.`
      );
    }
  }

  const sharedAlipayUid = (publisherContext?.alipayUid || "").trim();
  const planItems = [];
  const newlyMinted = [];

  for (const app of targetApps) {
    const prevState = state.apps[app.templateId] || {};
    const online = onlineInfoByTemplate[app.templateId] || null;

    if (
      app.reuseExisting &&
      app.artifactId &&
      publisherContext?.artifactId &&
      publisherContext.artifactId !== app.artifactId &&
      !options.allowContextMismatch
    ) {
      throw new Error(
        `Publisher app-context.local.json artifactId (${publisherContext.artifactId}) does not match ` +
          `catalog "${app.templateId}" artifactId (${app.artifactId}). Point --publisher-root to the matching ` +
          `PUGC checkout or pass --allow-context-mismatch.`
      );
    }

    let artifactId = app.artifactId || prevState.artifactId || (app.reuseExisting ? publisherContext?.artifactId : null) || null;
    let mintedNow = false;
    if (!artifactId) {
      if (!options.initMissing) {
        if (options.execute) {
          throw new Error(
            `Template "${app.templateId}" has no artifactId yet. Re-run with --init-missing (and optionally --sync-catalog) to mint new Artifact IDs.`
          );
        }
        artifactId = "<pending --init-missing>";
      } else {
        artifactId = mintId();
        mintedNow = true;
        newlyMinted.push({ templateId: app.templateId, artifactId });
      }
    }

    const seededVersion =
      prevState.artifactVersion ||
      (app.reuseExisting && publisherContext?.artifactId === artifactId ? publisherContext.artifactVersion : null) ||
      "1";
    let targetVersion = Number.parseInt(String(seededVersion), 10);
    if (!Number.isFinite(targetVersion) || targetVersion <= 0) targetVersion = 1;
    if (online && Number.isFinite(online.latestVersion) && online.latestVersion >= targetVersion) {
      targetVersion = online.latestVersion + 1;
    }

    const resolvedType = options.type || online?.type || app.type || prevState.type || resolvedDefaultType;
    const title = options.titleOverrides[app.templateId] || app.title;
    const projectDir = resolve(options.engineRoot, "world/dist/seed-world-flash-apps", app.templateId);
    const sourceDir = projectDir;

    planItems.push({
      templateId: app.templateId,
      title,
      artifactId,
      mintedNow,
      reuseExisting: app.reuseExisting,
      targetVersion: String(targetVersion),
      onlineLatestVersion: online?.latestVersion ?? null,
      type: resolvedType,
      alipayUid: (prevState.alipayUid || sharedAlipayUid || "").trim(),
      sessionId: prevState.sessionId || `seed-world-${app.templateId}-${Date.now()}`,
      projectDir,
      sourceDir
    });
  }

  return {
    defaultType: resolvedDefaultType,
    items: planItems,
    newlyMinted
  };
}

export async function queryOnlineArtifactInfo(publisherRoot, artifactId) {
  const urlHelperPath = resolve(publisherRoot, "scripts/asap-service-url.cjs");
  try {
    if (!existsSync(urlHelperPath)) throw new Error(`Missing ${urlHelperPath}`);
    const { asapServiceUrl } = require(urlHelperPath);
    const endpoint = asapServiceUrl(`/api/trace/versions_by_artifact?artifact_id=${encodeURIComponent(artifactId)}`);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const data = json?.data ?? json;
    const versions = data?.versions ?? data;
    if (json?.success === false || !Array.isArray(versions)) throw new Error("Invalid version list");
    let latestVersion = null;
    let entryUrl = null;
    for (const version of versions) {
      const value = String(version?.version_number ?? version?.artifact_version ?? version?.version ?? "");
      const number = Number(value);
      if (!/^[0-9]+$/u.test(value) || !Number.isSafeInteger(number) || number < 1) {
        throw new Error("Invalid Artifact version");
      }
      if (latestVersion === null || number > latestVersion) {
        latestVersion = number;
        entryUrl = version.html_url ?? version.release_output_url ?? null;
      }
    }
    const rawType = data?.type ?? data?.artifact_type ?? versions[0]?.type ?? versions[0]?.artifact_type;
    const type =
      rawType === "game" || rawType === 1 || rawType === "1"
        ? "game"
        : rawType === "miniapp" || rawType === 2 || rawType === "2"
          ? "miniapp"
          : null;
    return { latestVersion, type, entryUrl };
  } catch (error) {
    throw new Error(`Could not verify online version for ${artifactId}: ${error.message}`, { cause: error });
  }
}

async function findOnlineVersionByEntryUrl(publisherRoot, artifactId, entryUrl) {
  if (!entryUrl) return null;
  try {
    const urlHelperPath = resolve(publisherRoot, "scripts/asap-service-url.cjs");
    if (!existsSync(urlHelperPath)) return null;
    const { asapServiceUrl } = require(urlHelperPath);
    const endpoint = asapServiceUrl(`/api/trace/versions_by_artifact?artifact_id=${encodeURIComponent(artifactId)}`);
    const response = await fetch(endpoint, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;
    const json = await response.json();
    const data = json?.data ?? json;
    const versions = data?.versions ?? data;
    if (json?.success === false || !Array.isArray(versions)) return null;
    let matchedVersion = null;
    for (const version of versions) {
      const versionUrl = version?.html_url ?? version?.release_output_url ?? null;
      if (versionUrl !== entryUrl) continue;
      const value = String(version?.version_number ?? version?.artifact_version ?? version?.version ?? "");
      const number = Number(value);
      if (!/^[1-9][0-9]*$/u.test(value) || !Number.isSafeInteger(number)) continue;
      if (matchedVersion === null || number > matchedVersion) {
        matchedVersion = number;
      }
    }
    return matchedVersion !== null ? String(matchedVersion) : null;
  } catch {
    return null;
  }
}

export async function registerFlashAppHttp(
  publisherRoot,
  { artifactId, title, type, backupUrl, entryUrl },
  { maxAttempts = 3, retryDelayMs = 1000 } = {}
) {
  const urlHelperPath = resolve(publisherRoot, "scripts/asap-service-url.cjs");
  if (!existsSync(urlHelperPath)) throw new Error(`Missing ${urlHelperPath}`);
  const { asapServiceUrl } = require(urlHelperPath);
  const endpoint = asapServiceUrl("/api/flash-app/register");
  const payload = JSON.stringify({
    artifact_id: artifactId,
    title,
    type,
    backup_url: backupUrl,
    entry_url: entryUrl
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    let bodyText = "";
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        signal: AbortSignal.timeout(30000)
      });
      bodyText = await response.text();
    } catch (error) {
      const recovered = await findOnlineVersionByEntryUrl(publisherRoot, artifactId, entryUrl);
      if (recovered) return { versionNumber: recovered };
      if (attempt < maxAttempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs * attempt));
        continue;
      }
      throw new Error(`HTTP /api/flash-app/register request failed for ${artifactId}: ${error.message}`, {
        cause: error
      });
    }

    if (response.status >= 502 && response.status <= 504) {
      const recovered = await findOnlineVersionByEntryUrl(publisherRoot, artifactId, entryUrl);
      if (recovered) return { versionNumber: recovered };
      if (attempt < maxAttempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs * attempt));
        continue;
      }
      throw new Error(`ASAP HTTP register failed with HTTP ${response.status} for ${artifactId}`);
    }

    let json;
    try {
      json = JSON.parse(bodyText);
    } catch (error) {
      const recovered = await findOnlineVersionByEntryUrl(publisherRoot, artifactId, entryUrl);
      if (recovered) return { versionNumber: recovered };
      if (attempt < maxAttempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, retryDelayMs * attempt));
        continue;
      }
      throw new Error(
        `HTTP /api/flash-app/register returned non-JSON (HTTP ${response.status}) for ${artifactId}`,
        { cause: error }
      );
    }

    if (!response.ok || json?.success !== true) {
      const message = json?.message || `HTTP ${response.status}`;
      throw new Error(`ASAP HTTP register rejected ${artifactId}: ${message}`);
    }

    const versionNumber = String(json?.data?.version_number ?? "");
    if (!/^[1-9][0-9]*$/u.test(versionNumber) || !Number.isSafeInteger(Number(versionNumber))) {
      throw new Error(`ASAP HTTP register returned an invalid version for ${artifactId}: ${versionNumber}`);
    }
    return { versionNumber };
  }

  throw new Error(`ASAP HTTP register exhausted retries for ${artifactId}`);
}

function receiptPath(stateDir, releaseId) {
  return resolve(stateDir, "pending-releases", `${releaseId}.json`);
}

function releaseRegistry(options) {
  if (!options.asapServiceDir) {
    throw new Error("Missing --asap-service-dir (or env ASAP_SERVICE_DIR)");
  }
  const python = options.asapPython || resolve(options.asapServiceDir, ".venv/bin/python");
  if (!existsSync(python)) throw new Error(`ASAP Python interpreter not found: ${python}`);
  return {
    python,
    call: (request) => callFlashRegistry(python, options.asapServiceDir, request)
  };
}

async function verifyRegistry(publisherRoot, catalog, registry) {
  const original = catalog.apps.find((app) => app.reuseExisting && app.artifactId);
  if (!original || !publisherRoot) {
    throw new Error("Registry verification requires the original Artifact and --publisher-root");
  }
  const { latestVersion, entryUrl } = await queryOnlineArtifactInfo(publisherRoot, original.artifactId);
  if (!entryUrl || !registry.call({
    operation: "verify", artifactId: original.artifactId, version: String(latestVersion), entryUrl
  }).matches) {
    throw new Error("ASAP registry does not match the original Artifact in the configured HTTP service");
  }
}

function completeRelease(options, registry, path, receipt) {
  const { request, item, dbInitialized } = receipt;
  const confirmed = registry.call(request).version;
  if (confirmed !== request.version) throw new Error("ASAP confirmed a different version from the reservation");

  saveLocalState(options.stateDir, item, {
    artifactVersion: String(Number(confirmed) + 1),
    dbInitialized,
    lastPublishedVersion: confirmed,
    lastEntryUrl: request.entryUrl,
    lastBackupOss: request.backupOss
  });
  rmSync(path, { force: true });
}

function writeCatalogArtifactIds(catalogPath, updatesByTemplate) {
  if (Object.keys(updatesByTemplate).length === 0) return;
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  let changed = false;
  for (const app of raw.apps || []) {
    const minted = updatesByTemplate[app.templateId];
    if (minted && !app.artifactId) {
      app.artifactId = minted;
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(catalogPath, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  }
}

function printHelp() {
  console.log(`Usage:
  node world/scripts/publish-seed-world-flash-apps.mjs [options]

Default mode is --dry-run (shows the 6-app plan and estimated versions without remote writes).
Pass --execute to reserve ASAP versions, deploy and publish the builds.

Options:
  --engine-root <dir>         Release worktree root (default: repo root)
  --publisher-root <dir>      PUGC checkout containing scripts/asap-publish.cjs (or env PUBLISHER_ROOT)
  --asap-service-dir <dir>    ASAP checkout containing .venv/bin/python (or env ASAP_SERVICE_DIR)
  --asap-python <path>        Override ASAP Python path (default: <asap-service-dir>/.venv/bin/python)
  --registry-mode <mode>      Registry mode: "http" (default, via /api/flash-app/register) or "direct-db" (requires Layotto/OceanBase access)
  --verify-registry           Check read-only access to the configured release registry
  --resume-release <id>       Complete a deployed release using its saved receipt
  --templates <all|csv>       Templates to publish (default: all)
  --type <game|miniapp>       Explicit PUGC artifact type (otherwise auto-detected from original online record)
  --title-override <id=name>  Override title for a template (repeatable)
  --state-dir <path>          Per-Artifact state directory (default: ~/.config/galacean-flash-app/apps)
  --init-missing              Explicitly mint new Artifact IDs for templates with artifactId=null
  --sync-catalog              Write newly minted Artifact IDs back to world/demos/seed-world/flash-apps.json
  --skip-db-init              Require an existing, compatible world_save table
  --skip-online-check        Preview the plan offline (requires --dry-run)
  --allow-context-mismatch    Allow publisher app-context.local.json artifactId to differ from original catalog
  --timeout <seconds>         Per-app deploy timeout in seconds (default: 300)
  --dry-run                   Preview plan only (default)
  --execute                   Reserve versions and publish via ASAP
`);
}

function printSummaryTable(rows, newlyMinted) {
  console.log("\n=== Seed World 6-App Flash Publish Summary ===");
  console.log("| Template | Title | Artifact ID | Version | Type | DB Init | Status | Entry URL |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    console.log(
      `| ${r.templateId} | ${r.title} | ${r.artifactId} | ${r.version} | ${r.type || "<auto>"} | ${r.dbStatus} | ${r.status} | ${r.entryUrl || "-"} |`
    );
  }
  if (newlyMinted.length > 0) {
    console.log("\nNewly minted Artifact IDs (add to ASAP dsv41flash whitelist & Lingguang formal listing):");
    for (const item of newlyMinted) {
      console.log(`  - ${item.templateId}: ${item.artifactId}`);
    }
  }
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const catalog = loadFlashAppsCatalog(options.catalogPath);
  if (options.verifyRegistry || options.resumeRelease) {
    const registry = releaseRegistry(options);
    await verifyRegistry(options.publisherRoot, catalog, registry);
    if (options.verifyRegistry) {
      console.log("ASAP release registry matches the configured HTTP service.");
      return;
    }

    const path = receiptPath(options.stateDir, options.resumeRelease);
    const receipt = JSON.parse(readFileSync(path, "utf8"));
    if (receipt.request.operation !== "publish" || receipt.request.releaseId !== options.resumeRelease ||
        receipt.request.artifactId !== receipt.item.artifactId) {
      throw new Error("Release receipt does not match the requested release");
    }
    completeRelease(options, registry, path, receipt);
    console.log(`Completed ${receipt.item.templateId} v${receipt.request.version}: ${receipt.request.entryUrl}`);
    return;
  }

  const targetApps = selectTargetApps(catalog, options.templates);
  const publisherContext = readPublisherContext(options.publisherRoot);
  const state = loadLocalState(options.stateDir, catalog, publisherContext);

  const onlineInfoByTemplate = {};
  if (options.publisherRoot && !options.skipOnlineCheck) {
    for (const app of targetApps) {
      const artifactId = app.artifactId || state.apps[app.templateId]?.artifactId ||
        (app.reuseExisting ? publisherContext?.artifactId : null);
      if (!artifactId) continue;
      try {
        onlineInfoByTemplate[app.templateId] = await queryOnlineArtifactInfo(options.publisherRoot, artifactId);
      } catch (error) {
        if (options.execute) throw error;
        console.warn(`[dry-run] ${error.message}; showing the local estimate for ${app.templateId}`);
      }
    }
  }

  const plan = resolveAppReleasePlan({
    catalog,
    state,
    publisherContext,
    targetApps,
    options,
    onlineInfoByTemplate
  });

  if (!options.execute) {
    console.log(`[dry-run] Engine root: ${options.engineRoot}`);
    console.log(`[dry-run] Catalog: ${options.catalogPath}`);
    console.log(`[dry-run] Local state directory: ${options.stateDir}`);
    console.log(`[dry-run] Publisher root: ${options.publisherRoot || "<not set>"}`);
    console.log(`[dry-run] Registry mode: ${options.registryMode}`);
    console.log(`[dry-run] Resolved default --type: ${plan.defaultType || "<requires --type or online check>"}`);
    printSummaryTable(
      plan.items.map((item) => ({
        templateId: item.templateId,
        title: item.title,
        artifactId: item.artifactId,
        version: `~${item.targetVersion}`,
        type: item.type,
        dbStatus: options.skipDbInit ? "will-verify" : "will-verify/init",
        status: existsSync(join(item.projectDir, "index.html")) ? "dry-run (build ready)" : "dry-run (build missing)",
        entryUrl: state.apps[item.templateId]?.lastEntryUrl || "-"
      })),
      plan.newlyMinted
    );
    console.log("\nDry run complete. Re-run with --execute (and --init-missing on first creation of the 5 new apps).");
    return;
  }

  if (!options.publisherRoot || !existsSync(resolve(options.publisherRoot, "scripts/asap-publish.cjs"))) {
    throw new Error("Missing valid --publisher-root containing scripts/asap-publish.cjs");
  }
  const asapRuntime = releaseRegistry(options);
  const registry = options.registryMode === "direct-db" ? asapRuntime : null;
  const ddlPath = resolve(options.engineRoot, WORLD_SAVE_DDL_RELATIVE);

  // Validate pre-conditions for every selected app BEFORE making any remote calls.
  for (const item of plan.items) {
    artifactStateFileName(item.artifactId);
    if (!existsSync(join(item.projectDir, "index.html"))) {
      throw new Error(
        `Missing derived Flash App directory for "${item.templateId}": ${item.projectDir}. Run build:seed-world-flash-app first.`
      );
    }
    if (!item.type) {
      throw new Error(
        `Could not determine PUGC --type for "${item.templateId}". Pass --type game or --type miniapp explicitly.`
      );
    }
    if (!isValidAlipayUidForDb(item.alipayUid)) {
      throw new Error(
        `Template "${item.templateId}" requires a 2099... alipayUid to verify world_save ` +
          `in publisher app-context.local.json or in the Artifact state file under ${options.stateDir}.`
      );
    }
    if (options.registryMode === "http" && item.reuseExisting && item.onlineLatestVersion === null) {
      throw new Error(
        `Template "${item.templateId}" (${item.artifactId}) has reuseExisting=true, but no online version was found via ASAP HTTP.`
      );
    }
  }

  const ddlSql = options.skipDbInit ? undefined : readFileSync(ddlPath, "utf8").trim();
  if (registry) {
    await verifyRegistry(options.publisherRoot, catalog, registry);
  }

  const { callAsap } = require(resolve(options.publisherRoot, "scripts/asap-publish.cjs"));
  const { asapServiceUrl } = require(resolve(options.publisherRoot, "scripts/asap-service-url.cjs"));
  const { callRemoteSkill, REMOTE_SKILL_API } = require(resolve(options.publisherRoot, "scripts/asap-remote-skill.cjs"));
  if (REMOTE_SKILL_API !== asapServiceUrl("/api/remote_skill")) {
    throw new Error("PUGC world_save and version endpoints must use the same ASAP environment");
  }
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_SECRET_ACCESS_KEY;
  process.env.ASAP_SERVICE_DIR = options.asapServiceDir;
  process.env.ASAP_PYTHON = asapRuntime.python;

  // Persist newly minted IDs before publishing so a retry can resolve the same Artifact.
  if (plan.newlyMinted.length > 0) {
    for (const item of plan.items) {
      if (item.mintedNow) {
        saveLocalState(options.stateDir, item, { dbInitialized: false });
      }
    }
    if (options.syncCatalog) {
      writeCatalogArtifactIds(
        options.catalogPath,
        Object.fromEntries(plan.newlyMinted.map((m) => [m.templateId, m.artifactId]))
      );
    }
  }

  const summaryRows = [];
  const failedTemplates = [];
  const pendingCompletions = [];
  for (const item of plan.items) {
    const row = {
      templateId: item.templateId,
      title: item.title,
      artifactId: item.artifactId,
      version: "-",
      type: item.type,
      dbStatus: "unverified",
      status: "OK",
      entryUrl: "-"
    };
    summaryRows.push(row);
    let pendingReleaseId;
    try {
      if (registry) {
        const releaseId = randomUUID();
        const { version } = registry.call({
          operation: "reserve", artifactId: item.artifactId, title: item.title, releaseId,
          type: item.type, reuseExisting: item.reuseExisting
        });
        if (typeof version !== "string" || !/^[1-9][0-9]*$/u.test(version) || !Number.isSafeInteger(Number(version))) {
          throw new Error("ASAP registry returned an invalid version");
        }
        row.version = version;
        console.log(`\n========== [${item.templateId}] ${item.title} (${item.artifactId} v${version}, type=${item.type}, mode=direct-db) ==========`);
        row.dbStatus = await ensureWorldSaveTable(callRemoteSkill, item, version, ddlSql);

        const { entryUrl, backupOss } = deploySeedWorldFlashApp(item, version, {
          callAsap, appKey: options.appKey, timeout: options.timeout
        });
        row.entryUrl = entryUrl;

        const path = receiptPath(options.stateDir, releaseId);
        const receipt = {
          item: { artifactId: item.artifactId, templateId: item.templateId, sessionId: item.sessionId, type: item.type },
          dbInitialized: true,
          request: { operation: "publish", artifactId: item.artifactId, releaseId, version, entryUrl, backupOss }
        };
        writeFileAtomic(path, JSON.stringify(receipt));
        pendingReleaseId = releaseId;
        completeRelease(options, registry, path, receipt);
      } else {
        const version = item.targetVersion;
        row.version = version;
        console.log(`\n========== [${item.templateId}] ${item.title} (${item.artifactId} v${version}, type=${item.type}, mode=http) ==========`);
        row.dbStatus = await ensureWorldSaveTable(callRemoteSkill, item, version, ddlSql);

        const { entryUrl, backupOss } = deploySeedWorldFlashApp(item, version, {
          callAsap, appKey: options.appKey, timeout: options.timeout
        });
        row.entryUrl = entryUrl;

        const { versionNumber: publishedVersion } = await registerFlashAppHttp(options.publisherRoot, {
          artifactId: item.artifactId,
          title: item.title,
          type: item.type,
          backupUrl: backupOss,
          entryUrl
        });
        row.version = publishedVersion;
        saveLocalState(options.stateDir, item, {
          artifactVersion: String(Number(publishedVersion) + 1),
          dbInitialized: true,
          lastPublishedVersion: publishedVersion,
          lastEntryUrl: entryUrl,
          lastBackupOss: backupOss
        });
        if (publishedVersion !== version) {
          throw new Error(
            `ASAP HTTP register allocated v${publishedVersion} instead of injected v${version} (concurrent version drift); ` +
              `local state updated to v${Number(publishedVersion) + 1}, re-run "${item.templateId}" to align`
          );
        }
      }
    } catch (error) {
      if (pendingReleaseId) pendingCompletions.push(pendingReleaseId);
      else failedTemplates.push(item.templateId);
      console.error(`[${item.templateId}] Error: ${error.message}`);
      row.status = `FAILED (${error.message})`;
    }
  }

  printSummaryTable(summaryRows, plan.newlyMinted);

  if (failedTemplates.length > 0) {
    console.error(
      `\nFailed templates (${failedTemplates.length}): ${failedTemplates.join(", ")}\n` +
        `Retry only failed templates with:\n` +
        `  node world/scripts/publish-seed-world-flash-apps.mjs --execute --registry-mode ${options.registryMode} --templates ${failedTemplates.join(",")} ` +
        `--publisher-root "${options.publisherRoot}" --asap-service-dir "${options.asapServiceDir}" --state-dir "${options.stateDir}"`
    );
  }
  for (const releaseId of pendingCompletions) {
    console.error(
      `Retry completion: node world/scripts/publish-seed-world-flash-apps.mjs --execute --resume-release ${releaseId} ` +
      `--publisher-root "${options.publisherRoot}" --asap-service-dir "${options.asapServiceDir}" --asap-python "${asapRuntime.python}" --state-dir "${options.stateDir}"`
    );
  }
  if (failedTemplates.length || pendingCompletions.length) process.exitCode = 1;
}

const isDirectEntry = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectEntry) {
  main().catch((error) => {
    console.error(`[publish-seed-world-flash-apps] ${error.message}`);
    process.exit(1);
  });
}
