#!/usr/bin/env node
/**
 * Multi-template Seed World Flash App publish orchestrator (6 apps sharing 1 common runtime & 1 source snapshot).
 *
 * - Static app metadata (`templateId`, `title`, `artifactId`, `type`) lives in `world/demos/seed-world/flash-apps.json`.
 * - Mutable local publish state (`alipayUid`, `artifactVersion`, `dbInitialized`, `lastEntryUrl`) lives outside git
 *   in `~/.config/galacean-flash-app/apps-state.local.json`.
 * - Each template runs `db-update-table-schema.cjs` and `deploy.cjs` with its own `FLASH_APP_CONTEXT_PATH`,
 *   so apps stay isolated without mutating or locking a shared `app-context.local.json`.
 *
 * Defaults to `--dry-run`. Pass `--execute` to perform remote DB/OSS/Yuyan/PUGC operations.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_FLASH_APPS_CATALOG_RELATIVE,
  loadFlashAppsCatalog
} from "./flash-app-variants.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultEngineRoot = resolve(scriptDirectory, "../..");
const defaultStateFile = join(homedir(), ".config/galacean-flash-app/apps-state.local.json");
const WORLD_SAVE_DDL_RELATIVE = "world/demos/seed-world/storage/world_save.sql";

export function mintArtifactId() {
  return `flashapp-${randomBytes(8).toString("hex")}`;
}

export function parseCliArgs(argv) {
  const parsed = {
    engineRoot: defaultEngineRoot,
    catalogPath: null,
    stateFile: defaultStateFile,
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
      case "--state-file":
        parsed.stateFile = resolve(argv[++i] || "");
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

export function loadLocalState(stateFile) {
  if (!existsSync(stateFile)) {
    return { schemaVersion: 1, alipayUid: "", apps: {} };
  }
  const raw = JSON.parse(readFileSync(stateFile, "utf8"));
  return {
    schemaVersion: raw?.schemaVersion ?? 1,
    alipayUid: typeof raw?.alipayUid === "string" ? raw.alipayUid.trim() : "",
    apps: raw?.apps && typeof raw.apps === "object" ? { ...raw.apps } : {}
  };
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

export function saveLocalState(stateFile, state) {
  writeFileAtomic(stateFile, `${JSON.stringify(state, null, 2)}\n`, 0o600);
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

  const sharedAlipayUid = (state.alipayUid || publisherContext?.alipayUid || "").trim();
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
      (app.reuseExisting ? publisherContext?.artifactVersion : null) ||
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
    alipayUid: sharedAlipayUid,
    defaultType: resolvedDefaultType,
    items: planItems,
    newlyMinted
  };
}

export function parseDeployStdout(output) {
  const text = String(output || "");
  const matchField = (label) => {
    const m = text.match(new RegExp(`^\\s*${label}:\\s*(.+)$`, "m"));
    return m ? m[1].trim() : null;
  };
  return {
    artifactId: matchField("Artifact ID"),
    version: matchField("Version"),
    entryUrl: matchField("Entry URL"),
    backupOss: matchField("Backup OSS"),
    failedStep: text.match(/失败步骤:\s*(.+)/)?.[1]?.trim() || null,
    errorMessage: text.match(/错误信息:\s*(.+)/)?.[1]?.trim() || null
  };
}

export function resolvePerAppContextPath(stateFile, publisherRoot, item, publisherContext) {
  if (item.reuseExisting && publisherRoot && publisherContext?.artifactId === item.artifactId) {
    return resolve(publisherRoot, "scripts/app-context.local.json");
  }
  return resolve(dirname(stateFile), "contexts", `${item.templateId}.local.json`);
}

export function assertPublisherSupportsContextPath(publisherRoot) {
  const helperPath = resolve(publisherRoot, "scripts/app-context.cjs");
  if (!existsSync(helperPath) || !readFileSync(helperPath, "utf8").includes("FLASH_APP_CONTEXT_PATH")) {
    throw new Error(
      `${helperPath} does not support FLASH_APP_CONTEXT_PATH. Update pugc-flash-app-2/scripts/app-context.cjs first.`
    );
  }
}

export async function queryOnlineArtifactInfo(publisherRoot, artifactId) {
  if (!publisherRoot || !artifactId || artifactId.startsWith("<")) return null;
  const urlHelperPath = resolve(publisherRoot, "scripts/asap-service-url.cjs");
  if (!existsSync(urlHelperPath)) return null;
  const require = createRequire(import.meta.url);
  const { asapServiceUrl } = require(urlHelperPath);
  const endpoint = asapServiceUrl(`/api/trace/versions_by_artifact?artifact_id=${encodeURIComponent(artifactId)}`);

  return new Promise((resolvePromise) => {
    const parsed = new URL(endpoint);
    const transport = parsed.protocol === "http:" ? http : https;
    const req = transport.get(parsed, { timeout: 10000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          const data = json?.data ?? json;
          const versions = Array.isArray(data?.versions)
            ? data.versions
            : Array.isArray(data)
              ? data
              : [];
          let latestVersion = 0;
          for (const v of versions) {
            const num = Number.parseInt(String(v?.version_number ?? v?.artifact_version ?? v?.version ?? "0"), 10);
            if (Number.isFinite(num) && num > latestVersion) latestVersion = num;
          }
          const rawType = data?.type ?? data?.artifact_type ?? versions[0]?.type ?? versions[0]?.artifact_type;
          const type =
            rawType === "game" || rawType === 1 || rawType === "1"
              ? "game"
              : rawType === "miniapp" || rawType === 2 || rawType === "2"
                ? "miniapp"
                : null;
          resolvePromise({ latestVersion: latestVersion || null, type });
        } catch {
          resolvePromise(null);
        }
      });
    });
    req.on("error", () => resolvePromise(null));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(null);
    });
  });
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

Default mode is --dry-run (prints the exact 6-app publish plan without touching OSS/DB/PUGC).
Pass --execute to perform remote DB schema initialization and PUGC deployments.

Options:
  --engine-root <dir>         Release worktree root (default: repo root)
  --publisher-root <dir>      PUGC checkout containing scripts/deploy.cjs (or env PUBLISHER_ROOT)
  --asap-service-dir <dir>    ASAP checkout containing .venv/bin/python (or env ASAP_SERVICE_DIR)
  --asap-python <path>        Override ASAP Python path (default: <asap-service-dir>/.venv/bin/python)
  --templates <all|csv>       Templates to publish (default: all)
  --type <game|miniapp>       Explicit PUGC artifact type (otherwise auto-detected from original online record)
  --title-override <id=name>  Override title for a template (repeatable)
  --state-file <path>         Local state JSON path (default: ~/.config/galacean-flash-app/apps-state.local.json)
  --init-missing              Explicitly mint new Artifact IDs for templates with artifactId=null
  --sync-catalog              Write newly minted Artifact IDs back to world/demos/seed-world/flash-apps.json
  --skip-db-init              Skip running db-update-table-schema.cjs for new templates
  --skip-online-check         Skip querying GET /api/trace/versions_by_artifact before deploy
  --allow-context-mismatch    Allow publisher app-context.local.json artifactId to differ from original catalog
  --timeout <seconds>         Per-app deploy timeout in seconds (default: 300)
  --dry-run                   Preview plan only (default)
  --execute                   Execute DB initialization and PUGC deployment
`);
}

function runSubprocess(command, args, { cwd, env }) {
  const res = spawnSync(command, args, { cwd, env, encoding: "utf8" });
  if (res.stdout) process.stdout.write(res.stdout);
  if (res.stderr) process.stderr.write(res.stderr);
  return {
    status: res.status ?? 1,
    stdout: res.stdout || "",
    stderr: res.stderr || "",
    error: res.error || null
  };
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
  const state = loadLocalState(options.stateFile);
  const publisherContext = readPublisherContext(options.publisherRoot);

  const onlineInfoByTemplate = {};
  if (options.publisherRoot && !options.skipOnlineCheck) {
    const queryList = new Map();
    const originalCatalog = catalog.apps.find((a) => a.templateId === "original");
    if (originalCatalog?.artifactId) {
      queryList.set("original", originalCatalog.artifactId);
    }
    for (const app of targetApps) {
      const knownId = app.artifactId || state.apps[app.templateId]?.artifactId;
      if (knownId) queryList.set(app.templateId, knownId);
    }
    for (const [templateId, artifactId] of queryList) {
      const info = await queryOnlineArtifactInfo(options.publisherRoot, artifactId);
      if (info) onlineInfoByTemplate[templateId] = info;
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
    console.log(`[dry-run] Local state: ${options.stateFile}`);
    console.log(`[dry-run] Publisher root: ${options.publisherRoot || "<not set>"}`);
    console.log(`[dry-run] Resolved default --type: ${plan.defaultType || "<requires --type or online check>"}`);
    printSummaryTable(
      plan.items.map((item) => ({
        templateId: item.templateId,
        title: item.title,
        artifactId: item.artifactId,
        version: item.targetVersion,
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

  if (!options.publisherRoot || !existsSync(resolve(options.publisherRoot, "scripts/deploy.cjs"))) {
    throw new Error("Missing valid --publisher-root containing scripts/deploy.cjs");
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

  // Validate pre-conditions for every selected app BEFORE making any remote calls.
  for (const item of plan.items) {
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
          `in ${options.stateFile} (or in publisher app-context.local.json). Pass --skip-db-init only if already created.`
      );
    }
    if (item.needsDbInit && !existsSync(ddlPath)) {
      throw new Error(`Missing world_save.sql DDL file: ${ddlPath}`);
    }
  }

  // Persist any newly minted Artifact IDs immediately BEFORE remote operations so retries never mint duplicate IDs.
  if (plan.newlyMinted.length > 0) {
    if (plan.alipayUid && !state.alipayUid) state.alipayUid = plan.alipayUid;
    for (const item of plan.items) {
      if (item.mintedNow) {
        state.apps[item.templateId] = {
          ...(state.apps[item.templateId] || {}),
          artifactId: item.artifactId,
          artifactVersion: item.targetVersion,
          sessionId: item.sessionId,
          type: item.type,
          dbInitialized: false,
          updatedAt: new Date().toISOString()
        };
      }
    }
    saveLocalState(options.stateFile, state);
    if (options.syncCatalog) {
      writeCatalogArtifactIds(
        options.catalogPath,
        Object.fromEntries(plan.newlyMinted.map((m) => [m.templateId, m.artifactId]))
      );
    }
  }

  assertPublisherSupportsContextPath(options.publisherRoot);

  const deployEnv = { ...process.env };
  delete deployEnv.OSS_ACCESS_KEY_ID;
  delete deployEnv.OSS_SECRET_ACCESS_KEY;
  deployEnv.ASAP_SERVICE_DIR = options.asapServiceDir;
  deployEnv.ASAP_PYTHON = asapPython;

  const summaryRows = [];
  const failedTemplates = [];

  for (const item of plan.items) {
    console.log(`\n========== [${item.templateId}] ${item.title} (${item.artifactId} v${item.targetVersion}, type=${item.type}) ==========`);
    const contextPath = resolvePerAppContextPath(options.stateFile, options.publisherRoot, item, publisherContext);
    const contextForApp = {
      artifactId: item.artifactId,
      artifactVersion: item.targetVersion,
      alipayUid: item.alipayUid,
      sessionId: item.sessionId
    };
    const appDeployEnv = { ...deployEnv, FLASH_APP_CONTEXT_PATH: contextPath };

    let dbStatus = item.dbInitialized ? "ready" : "skipped";
    try {
      writeFileAtomic(contextPath, `${JSON.stringify(contextForApp, null, 2)}\n`, 0o600);
      if (item.needsDbInit) {
        console.log(`[${item.templateId}] Initializing shared world_save table...`);
        const dbRes = runSubprocess(
          process.execPath,
          [
            resolve(options.publisherRoot, "scripts/db-update-table-schema.cjs"),
            "--ddl-file",
            ddlPath,
            "--table-kind",
            "share",
            "--data-object",
            "世界存档"
          ],
          { cwd: options.publisherRoot, env: appDeployEnv }
        );
        if (dbRes.status !== 0) {
          throw new Error(`db-update-table-schema.cjs failed with exit code ${dbRes.status}`);
        }
        dbStatus = "initialized";
        state.apps[item.templateId] = {
          ...(state.apps[item.templateId] || {}),
          artifactId: item.artifactId,
          artifactVersion: item.targetVersion,
          sessionId: item.sessionId,
          type: item.type,
          dbInitialized: true,
          updatedAt: new Date().toISOString()
        };
        saveLocalState(options.stateFile, state);
      }

      const result = runSubprocess(
        process.execPath,
        [
          resolve(options.publisherRoot, "scripts/deploy.cjs"),
          "--project-dir",
          item.projectDir,
          "--source-dir",
          item.sourceDir,
          "--title",
          item.title,
          "--type",
          item.type,
          "--app-key",
          options.appKey,
          "--timeout",
          String(options.timeout)
        ],
        { cwd: options.publisherRoot, env: appDeployEnv }
      );
      const afterContext = existsSync(contextPath) ? JSON.parse(readFileSync(contextPath, "utf8")) : null;

      const parsed = parseDeployStdout(result.stdout);
      if (result.status !== 0) {
        failedTemplates.push(item.templateId);
        summaryRows.push({
          templateId: item.templateId,
          title: item.title,
          artifactId: item.artifactId,
          version: item.targetVersion,
          type: item.type,
          dbStatus,
          status: `FAILED (${parsed.failedStep || `exit ${result.status}`})`,
          entryUrl: parsed.entryUrl || "-"
        });
        continue;
      }

      const publishedVersion = parsed.version || item.targetVersion;
      const nextVersion = afterContext?.artifactVersion || String(Number.parseInt(publishedVersion, 10) + 1);
      state.apps[item.templateId] = {
        ...(state.apps[item.templateId] || {}),
        artifactId: item.artifactId,
        artifactVersion: nextVersion,
        sessionId: item.sessionId,
        type: item.type,
        dbInitialized: dbStatus === "ready" || dbStatus === "initialized",
        lastPublishedVersion: publishedVersion,
        lastEntryUrl: parsed.entryUrl || "",
        lastBackupOss: parsed.backupOss || "",
        updatedAt: new Date().toISOString()
      };
      saveLocalState(options.stateFile, state);

      summaryRows.push({
        templateId: item.templateId,
        title: item.title,
        artifactId: item.artifactId,
        version: publishedVersion,
        type: item.type,
        dbStatus,
        status: "OK",
        entryUrl: parsed.entryUrl || "-"
      });
    } catch (error) {
      failedTemplates.push(item.templateId);
      console.error(`[${item.templateId}] Error: ${error.message}`);
      summaryRows.push({
        templateId: item.templateId,
        title: item.title,
        artifactId: item.artifactId,
        version: item.targetVersion,
        type: item.type,
        dbStatus,
        status: `FAILED (${error.message})`,
        entryUrl: "-"
      });
    }
  }

  printSummaryTable(summaryRows, plan.newlyMinted);

  if (failedTemplates.length > 0) {
    console.error(
      `\nFailed templates (${failedTemplates.length}): ${failedTemplates.join(", ")}\n` +
        `Retry only failed templates with:\n` +
        `  node world/scripts/publish-seed-world-flash-apps.mjs --execute --templates ${failedTemplates.join(",")} ` +
        `--publisher-root "${options.publisherRoot}" --asap-service-dir "${options.asapServiceDir}"`
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
