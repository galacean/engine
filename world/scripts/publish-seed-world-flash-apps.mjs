#!/usr/bin/env node
/**
 * Multi-template Seed World Flash App publish orchestrator (6 apps sharing 1 common runtime & 1 source snapshot).
 *
 * - Static app metadata (`templateId`, `title`, `artifactId`, `type`) lives in `world/demos/seed-world/flash-apps.json`.
 * - Each Artifact keeps its local publish state in its own file in `~/.config/galacean-flash-app/apps/`.
 * - ASAP reserves each version before packaging. The release and its source backup use that version.
 *
 * Defaults to `--dry-run`. Pass `--execute` to perform remote DB/OSS/Yuyan/PUGC operations.
 */

import { randomBytes } from "node:crypto";
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
import { assertFlashSourceEngine } from "./seed-world-flash-source-layout.mjs";

const require = createRequire(import.meta.url);
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultEngineRoot = resolve(scriptDirectory, "../..");
const defaultStateDir = join(homedir(), ".config/galacean-flash-app/apps");
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
  try {
    const response = await callDb("lingguang.db.updateTableSchema", {
      ddl_sql: ddlSql, table_kind: "share", data_object: "世界存档"
    });
    // ASAP returns the DDL outcome as text inside the successful remote-skill envelope.
    const outcome = typeof response?.data === "string" ? response.data.trim() : "";
    if (response?.success === true && outcome.startsWith("创建表成功！")) return;
    throw new Error(outcome.split(/\r?\n/u, 1)[0] || "ASAP did not confirm that world_save was created");
  } catch (createError) {
    // The create may have committed before the reply was lost. Verify the stored schema before proceeding.
    try {
      const response = await callDb("lingguang.db.getTableSchema", { table_name: "world_save" });
      const result = typeof response?.data === "string" ? JSON.parse(response.data) : response?.data;
      if (response?.success === true && result?.success === true && matchesWorldSaveTable(result.data)) return;
    } catch {
      // Preserve the create error when the readback is unavailable.
    }
    throw new Error(`${createError.message}. ASAP could not confirm a matching world_save Share table.`, { cause: createError });
  }
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
    const dbInitialized =
      app.reuseExisting
        ? prevState.dbInitialized !== false
        : Boolean(prevState.dbInitialized);
    const needsDbInit = !app.reuseExisting && !dbInitialized && !options.skipDbInit;

    const projectDir = resolve(options.engineRoot, "world/dist/seed-world-flash-apps", app.templateId);
    const sourceDir = resolve(options.engineRoot, "world/dist/seed-world-flash-source");

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
      needsDbInit,
      dbInitialized,
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
  --templates <all|csv>       Templates to publish (default: all)
  --type <game|miniapp>       Explicit PUGC artifact type (otherwise auto-detected from original online record)
  --title-override <id=name>  Override title for a template (repeatable)
  --state-dir <path>          Per-Artifact state directory (default: ~/.config/galacean-flash-app/apps)
  --init-missing              Explicitly mint new Artifact IDs for templates with artifactId=null
  --sync-catalog              Write newly minted Artifact IDs back to world/demos/seed-world/flash-apps.json
  --skip-db-init              Skip creating world_save tables for new templates
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
    console.log(`[dry-run] Resolved default --type: ${plan.defaultType || "<requires --type or online check>"}`);
    printSummaryTable(
      plan.items.map((item) => ({
        templateId: item.templateId,
        title: item.title,
        artifactId: item.artifactId,
        version: `~${item.targetVersion}`,
        type: item.type,
        dbStatus: item.needsDbInit ? "will-init" : item.dbInitialized ? "ready" : "skipped",
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
  if (!options.asapServiceDir) {
    throw new Error("Missing --asap-service-dir (or env ASAP_SERVICE_DIR)");
  }
  const asapPython = options.asapPython || resolve(options.asapServiceDir, ".venv/bin/python");
  if (!existsSync(asapPython)) {
    throw new Error(`ASAP Python interpreter not found: ${asapPython}`);
  }
  const ddlPath = resolve(options.engineRoot, WORLD_SAVE_DDL_RELATIVE);
  const sourceDir = resolve(options.engineRoot, "world/dist/seed-world-flash-source");
  if (!existsSync(sourceDir)) {
    throw new Error(`Missing shared source snapshot: ${sourceDir}. Run build-seed-world-npm.mjs first.`);
  }
  assertFlashSourceEngine(sourceDir);

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
    if (item.needsDbInit && !isValidAlipayUidForDb(item.alipayUid)) {
      throw new Error(
        `Template "${item.templateId}" requires first-time world_save.sql DB table creation, which needs a 2099... alipayUid ` +
          `in publisher app-context.local.json or in the Artifact state file under ${options.stateDir}. Pass --skip-db-init only if already created.`
      );
    }
    if (item.needsDbInit && !existsSync(ddlPath)) {
      throw new Error(`Missing world_save.sql DDL file: ${ddlPath}`);
    }
  }

  const registry = (request) => callFlashRegistry(asapPython, options.asapServiceDir, request);
  // Ensure that the ASAP Python environment and the PUGC HTTP settings refer to the same registry.
  let published = plan.items.find((item) => onlineInfoByTemplate[item.templateId]?.entryUrl);
  if (!published) {
    const original = catalog.apps.find((app) => app.reuseExisting && app.artifactId);
    if (original) {
      onlineInfoByTemplate[original.templateId] ??= await queryOnlineArtifactInfo(options.publisherRoot, original.artifactId);
      published = original;
    }
  }
  const reference = published && onlineInfoByTemplate[published.templateId];
  if (!reference?.entryUrl || !registry({
    operation: "verify", artifactId: published.artifactId,
    version: String(reference.latestVersion), entryUrl: reference.entryUrl
  }).matches) {
    throw new Error("ASAP registry does not match a published Artifact from the configured HTTP service");
  }

  const { callAsap } = require(resolve(options.publisherRoot, "scripts/asap-publish.cjs"));
  const callRemoteSkill = plan.items.some((item) => item.needsDbInit)
    ? require(resolve(options.publisherRoot, "scripts/asap-remote-skill.cjs")).callRemoteSkill
    : undefined;
  delete process.env.OSS_ACCESS_KEY_ID;
  delete process.env.OSS_SECRET_ACCESS_KEY;
  process.env.ASAP_SERVICE_DIR = options.asapServiceDir;
  process.env.ASAP_PYTHON = asapPython;

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
  for (const item of plan.items) {
    const row = {
      templateId: item.templateId,
      title: item.title,
      artifactId: item.artifactId,
      version: "-",
      type: item.type,
      dbStatus: item.dbInitialized ? "ready" : "skipped",
      status: "OK",
      entryUrl: "-"
    };
    summaryRows.push(row);
    try {
      const request = { artifactId: item.artifactId, title: item.title };
      const { version } = registry({ ...request, operation: "reserve", type: item.type, reuseExisting: item.reuseExisting });
      if (typeof version !== "string" || !/^[1-9][0-9]*$/u.test(version) || !Number.isSafeInteger(Number(version))) {
        throw new Error("ASAP registry returned an invalid version");
      }
      row.version = version;
      console.log(`\n========== [${item.templateId}] ${item.title} (${item.artifactId} v${version}, type=${item.type}) ==========`);
      if (item.needsDbInit) {
        await ensureWorldSaveTable(callRemoteSkill, item, version, readFileSync(ddlPath, "utf8").trim());
        row.dbStatus = "initialized";
        saveLocalState(options.stateDir, item, { dbInitialized: true });
      }

      const { entryUrl, backupOss } = deploySeedWorldFlashApp(item, version, {
        callAsap, appKey: options.appKey, timeout: options.timeout
      });
      row.entryUrl = entryUrl;
      const published = registry({ ...request, operation: "publish", version, entryUrl, backupOss });
      if (published.version !== version) throw new Error("ASAP confirmed a different version from the reservation");
      saveLocalState(options.stateDir, item, {
        artifactVersion: String(Number(version) + 1),
        dbInitialized: row.dbStatus === "ready" || row.dbStatus === "initialized",
        lastPublishedVersion: version,
        lastEntryUrl: entryUrl,
        lastBackupOss: backupOss
      });
    } catch (error) {
      failedTemplates.push(item.templateId);
      console.error(`[${item.templateId}] Error: ${error.message}`);
      row.status = `FAILED (${error.message})`;
    }
  }

  printSummaryTable(summaryRows, plan.newlyMinted);

  if (failedTemplates.length > 0) {
    console.error(
      `\nFailed templates (${failedTemplates.length}): ${failedTemplates.join(", ")}\n` +
        `Retry only failed templates with:\n` +
        `  node world/scripts/publish-seed-world-flash-apps.mjs --execute --templates ${failedTemplates.join(",")} ` +
        `--publisher-root "${options.publisherRoot}" --asap-service-dir "${options.asapServiceDir}" --state-dir "${options.stateDir}"`
    );
    process.exitCode = 1;
  }
}

const isDirectEntry = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirectEntry) {
  main().catch((error) => {
    console.error(`[publish-seed-world-flash-apps] ${error.message}`);
    process.exit(1);
  });
}
