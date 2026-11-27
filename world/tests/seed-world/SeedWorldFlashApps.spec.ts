import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  FLASH_APP_DEFAULT_TEMPLATE_META,
  readBoundFlashAppTemplate,
  resolveAppTemplate
} from "../../demos/seed-world/src/planning/spatial/FlashAppTemplateBinding";
import {
  DEFAULT_FLASH_APPS_CATALOG_RELATIVE,
  deriveFlashAppVariants,
  injectFlashAppTemplateIntoHtml,
  loadFlashAppsCatalog
} from "../../scripts/flash-app-variants.mjs";
import {
  isValidAlipayUidForDb,
  loadLocalState,
  resolveAppReleasePlan,
  saveLocalState,
  selectTargetApps
} from "../../scripts/publish-seed-world-flash-apps.mjs";
import { SEED_WORLD_TEMPLATE_IDS } from "../../scripts/seed-world-template-bundles.mjs";

const repoRoot = path.resolve(__dirname, "../../..");
const tempDirs: string[] = [];
const worldSaveSchema = {
  tableName: "world_save", tableKind: "share", primaryKeys: ["id"], columns: [
    { name: "id", dataType: "VARCHAR", length: 128, nullable: false },
    { name: "generation", dataType: "VARCHAR", length: 100000, nullable: false },
    { name: "part_no", dataType: "INT", length: null, nullable: false },
    { name: "payload", dataType: "VARCHAR", length: 100000, nullable: false }
  ]
};

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function write(file: string, text: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("Seed World 6-app Flash publishing", () => {
  it("publishes the service-allocated version and isolates concurrent Artifacts", async () => {
    const engineRoot = makeTempDir("sw-version-check-");
    const publishScript = path.join(repoRoot, "world/scripts/publish-seed-world-flash-apps.mjs");
    const catalog = path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE);
    const publisher = path.join(engineRoot, "publisher");
    const stateDir = path.join(engineRoot, "state");
    const artifacts = { "sakura-pearl": "flashapp-35f3d2be4fb20307", "oil-paint": "flashapp-aa964a26bde230fb" };
    const logPath = path.join(engineRoot, "operations.jsonl");
    const entryUrl = "https://render.example.com/v1/index.html";
    let responseStatus = 503;
    let responseBody: unknown = { error: "Unavailable" };
    let ddlResponse = { success: true, code: "0", data: "执行DDL失败: 创建世界存档被拒绝" };
    let simulateLostReply = false;
    let schemaUnavailable = false;
    const originalId = "flashapp-a3c0e021cb8cadb0";
    const createdTables = new Set<string>();
    const schema = { ...worldSaveSchema };
    const server = http.createServer((req, res) => {
      if (req.url === "/api/remote_skill") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          const { action, artifactId } = JSON.parse(body);
          if (action === "lingguang.db.listTables") {
            const tables = createdTables.has(artifactId) ? ["world_save"] : [];
            return res.end(JSON.stringify({ success: true, data: JSON.stringify({ success: true, data: tables }) }));
          }
          if (action === "lingguang.db.getTableSchema") {
            if (schemaUnavailable) return res.destroy();
            const present = createdTables.has(artifactId);
            return res.end(JSON.stringify({ success: true, data: JSON.stringify({
              success: present, data: present ? schema : null
            }) }));
          }
          if (simulateLostReply && artifactId === artifacts["sakura-pearl"]) {
            createdTables.add(artifactId);
            return res.destroy();
          }
          if (ddlResponse.data.startsWith("创建表成功！")) createdTables.add(artifactId);
          res.end(JSON.stringify(ddlResponse));
        });
        return;
      }
      res.writeHead(responseStatus).end(JSON.stringify(responseBody));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      write(path.join(publisher, "scripts/asap-service-url.cjs"),
        `exports.asapServiceUrl = path => 'http://127.0.0.1:${port}' + path`);
      write(path.join(publisher, "scripts/asap-publish.cjs"), String.raw`
        const fs = require("node:fs");
        const { execFileSync } = require("node:child_process");
        exports.callAsap = request => {
          const html = request.local_file && (request.local_file.includes("release_") || request.local_file.includes("backup_"))
            ? execFileSync("tar", ["-xOzf", request.local_file, "index.html"], { encoding: "utf8" })
            : undefined;
          fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ ...request, html }) + "\n");
          return { entry_url: "https://render.example.com/v3/index.html" };
        };
      `);
      const registry = path.join(engineRoot, "registry");
      write(registry, String.raw`#!${process.execPath}
        const fs = require("node:fs");
        const request = JSON.parse(fs.readFileSync(0, "utf8"));
        fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(request) + "\n");
        const result = request.operation === "verify"
          ? { matches: request.version === "1" && request.entryUrl === ${JSON.stringify(entryUrl)} }
          : { version: "3" };
        console.log("SEED_WORLD_REGISTRY " + JSON.stringify(result));
      `);
      fs.chmodSync(registry, 0o755);
      for (const template of ["original", ...Object.keys(artifacts)]) {
        write(path.join(engineRoot, "world/dist/seed-world-flash-apps", template, "index.html"), `<html><head><meta name="seed-world-default-template" content="${template}" /></head></html>`);
      }
      const publisherContext = path.join(publisher, "scripts/app-context.local.json");
      const context = JSON.stringify({ artifactId: "flashapp-a3c0e021cb8cadb0", alipayUid: "2099123456789" });
      write(publisherContext, context);
      write(path.join(engineRoot, "world/demos/seed-world/storage/world_save.sql"), "CREATE TABLE world_save ...");
      write(path.join(publisher, "scripts/asap-remote-skill.cjs"), String.raw`
        exports.REMOTE_SKILL_API = require("./asap-service-url.cjs").asapServiceUrl("/api/remote_skill");
        exports.callRemoteSkill = async request => {
          const operation = {
            "lingguang.db.listTables": "list-tables",
            "lingguang.db.getTableSchema": "read-schema",
            "lingguang.db.updateTableSchema": "ddl"
          }[request.action];
          require("node:fs").appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ operation, ...request.payload }) + "\n");
          const endpoint = require("./asap-service-url.cjs").asapServiceUrl("/api/remote_skill");
          return (await fetch(endpoint, { method: "POST", body: JSON.stringify(request.payload) })).json();
        };
      `);
      const run = (mode: string, template = "sakura-pearl", ...flags: string[]) => promisify(execFile)(process.execPath, [
        publishScript, mode, "--registry-mode", "direct-db", "--engine-root", engineRoot, "--catalog", catalog, "--publisher-root", publisher,
        "--asap-service-dir", engineRoot, "--asap-python", registry, "--state-dir", stateDir,
        "--templates", template, ...flags
      ]);

      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("HTTP 503") });
      expect((await run("--dry-run")).stderr).toContain("showing the local estimate");
      responseStatus = 200;
      responseBody = { versions: [{ artifact_version: "unknown" }] };
      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("Invalid Artifact version") });
      await expect(run("--execute", "sakura-pearl", "--skip-online-check")).rejects.toMatchObject({
        stderr: expect.stringContaining("only supported with --dry-run")
      });
      expect(fs.existsSync(stateDir)).toBe(false);
      expect(fs.existsSync(logPath)).toBe(false);

      responseBody = { versions: [{ artifact_version: "1", html_url: "https://wrong.example.com/" }] };
      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("ASAP registry does not match") });
      expect(fs.existsSync(stateDir)).toBe(false);
      expect(fs.readFileSync(logPath, "utf8").trim().split("\n").length).toBe(1);
      fs.rmSync(logPath);

      // The HTTP endpoint shows v1, while v2 already exists as a draft in the registry.
      responseBody = { versions: [{ artifact_version: "1", html_url: entryUrl }] };
      await expect(run("--execute")).rejects.toMatchObject({
        stderr: expect.stringContaining("执行DDL失败: 创建世界存档被拒绝")
      });
      const attempted = fs.readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      expect(attempted.map((call) => call.operation)).toEqual(["verify", "reserve", "list-tables", "ddl", "read-schema"]);
      expect(fs.existsSync(stateDir)).toBe(false);
      fs.rmSync(logPath);

      simulateLostReply = true;
      schemaUnavailable = true;
      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("fetch failed") });
      expect(createdTables.has(artifacts["sakura-pearl"])).toBe(true);
      expect(fs.existsSync(stateDir)).toBe(false);
      fs.rmSync(logPath);

      schemaUnavailable = false;
      ddlResponse = { success: true, code: "0", data: "创建表成功！\n\n**表类型**: share" };
      const results = await Promise.all(Object.keys(artifacts).map((template) => run("--execute", template)));
      const calls = fs.readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      const checks = calls.filter(call => call.operation === "verify");
      expect(checks).toHaveLength(Object.keys(artifacts).length);
      expect(checks.every(call => call.artifactId === "flashapp-a3c0e021cb8cadb0")).toBe(true);
      for (const [index, [template, artifactId]] of Object.entries(artifacts).entries()) {
        const prefix = `leopard/sandbox/workspace/${artifactId}-3/`;
        const backupOss = prefix + "backup_3.tar.gz";
        const appCalls = calls.filter((call) => call.artifactId === artifactId || call.object_name?.startsWith(prefix));
        const databaseCalls = template === "sakura-pearl"
          ? ["list-tables", "read-schema"] : ["list-tables", "ddl", "read-schema"];
        expect(appCalls.map((call) => call.operation)).toEqual([
          "reserve", ...databaseCalls, "upload", "upload", "deploy", "publish"
        ]);
        if (template === "oil-paint") {
          expect(appCalls.find((call) => call.operation === "ddl"))
            .toMatchObject({ artifactVersion: "3", params: { table_kind: "share" } });
        }
        const [backup, release] = appCalls.filter((call) => call.operation === "upload");
        expect(backup).toMatchObject({ object_name: backupOss });
        expect(backup.html).toContain(`content="${template}"`);
        expect(backup.html).not.toContain("window.artifactId");
        expect(path.basename(path.dirname(backup.local_file))).toContain(artifactId);
        expect(release.html).toContain(`window.artifactId = "${artifactId}"`);
        expect(release.html).toContain('window.artifactVersion = "3"');
        const deployCall = appCalls.find((call) => call.operation === "deploy");
        expect(deployCall?.app_key).toMatch(/^flash-app-\d{14}-[0-9a-f]{4}$/);
        expect(appCalls.at(-1)).toMatchObject({ version: "3", backupOss, entryUrl: "https://render.example.com/v3/index.html" });
        expect(JSON.parse(fs.readFileSync(path.join(stateDir, artifactId + ".local.json"), "utf8"))).toMatchObject({
          templateId: template, artifactId, artifactVersion: "4", lastPublishedVersion: "3", lastBackupOss: backupOss
        });
        const dbStatus = template === "sakura-pearl" ? "ready" : "initialized";
        expect(results[index].stdout).toContain(`| ${artifactId} | 3 | miniapp | ${dbStatus} | OK |`);
      }
      write(path.join(stateDir, originalId + ".local.json"), JSON.stringify({ artifactId: originalId, dbInitialized: true }));
      const operations = () => fs.readFileSync(logPath, "utf8").trim().split("\n")
        .map((line) => JSON.parse(line).operation);
      fs.rmSync(logPath);
      await expect(run("--execute", "original", "--skip-db-init")).rejects.toMatchObject({
        stderr: expect.stringContaining("world_save is missing")
      });
      expect(operations()).toEqual(["verify", "reserve", "list-tables"]);

      fs.rmSync(logPath);
      await expect(run("--execute", "original")).resolves.toMatchObject({
        stdout: expect.stringContaining(`| ${originalId} | 3 | game | initialized | OK |`)
      });
      expect(operations()).toEqual(["verify", "reserve", "list-tables", "ddl", "read-schema", "upload", "upload", "deploy", "publish"]);

      fs.rmSync(logPath);
      schema.tableKind = "user";
      await expect(run("--execute", "original")).rejects.toMatchObject({
        stderr: expect.stringContaining("world_save does not match the required Share table schema")
      });
      expect(operations()).toEqual(["verify", "reserve", "list-tables", "read-schema"]);
      expect(fs.readFileSync(publisherContext, "utf8")).toBe(context);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("retries lost registry replies with one release ID and resumes completion without redeploying", async () => {
    const engineRoot = makeTempDir("sw-release-retry-");
    const publisher = path.join(engineRoot, "publisher");
    const stateDir = path.join(engineRoot, "state");
    const callsPath = path.join(engineRoot, "registry.jsonl");
    const logPath = path.join(engineRoot, "deploy.jsonl");
    const blockedPath = path.join(engineRoot, "block-completion");
    const server = http.createServer((req, res) => {
      if (!req.url?.startsWith("/api/trace/versions_by_artifact")) return res.writeHead(404).end();
      res.end(JSON.stringify({ versions: [{ artifact_version: "1", html_url: "https://render.example.com/v1" }] }));
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      write(path.join(publisher, "scripts/asap-service-url.cjs"),
        `exports.asapServiceUrl = p => 'http://127.0.0.1:${port}' + p`);
      write(path.join(publisher, "scripts/asap-publish.cjs"), String.raw`
        const fs = require("node:fs");
        exports.callAsap = request => {
          fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(request) + "\n");
          return { entry_url: "https://render.example.com/index.html" };
        };
      `);
      write(path.join(publisher, "scripts/app-context.local.json"), JSON.stringify({ alipayUid: "2099123456789" }));
      write(path.join(publisher, "scripts/asap-remote-skill.cjs"), `
        exports.REMOTE_SKILL_API = require("./asap-service-url.cjs").asapServiceUrl("/api/remote_skill");
        exports.callRemoteSkill = async ({ action }) => ({
          success: true,
          data: { success: true, data: action === "lingguang.db.listTables" ? ["world_save"] : ${JSON.stringify(worldSaveSchema)} }
        });
      `);
      const python = path.join(engineRoot, "registry");
      write(python, String.raw`#!${process.execPath}
        const fs = require("node:fs");
        const file = ${JSON.stringify(callsPath)};
        const req = JSON.parse(fs.readFileSync(0, "utf8"));
        const prior = fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim().split("\n").map(JSON.parse) : [];
        fs.appendFileSync(file, JSON.stringify(req) + "\n");
        const op = req.operation;
        if (op !== "verify" && !prior.some(call => call.operation === op && call.releaseId === req.releaseId)) {
          process.exit(0); // The registry wrote the change before its reply was lost.
        }
        const result = op === "verify" ? { matches: true } :
          op === "publish" && fs.existsSync(${JSON.stringify(blockedPath)}) ? { error: "completion unavailable" } :
          {version: op === "reserve" ? "3" : req.version};
        console.log("SEED_WORLD_REGISTRY " + JSON.stringify(result));
      `);
      fs.chmodSync(python, 0o755);
      write(path.join(engineRoot, "world/dist/seed-world-flash-apps/oil-paint/index.html"),
        '<html><head><meta name="seed-world-default-template" content="oil-paint" /></head></html>');
      const run = (...extra: string[]) => promisify(execFile)(process.execPath, [
        path.join(repoRoot, "world/scripts/publish-seed-world-flash-apps.mjs"), "--registry-mode", "direct-db", "--skip-db-init",
        "--engine-root", engineRoot, "--catalog", path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE),
        "--publisher-root", publisher, "--asap-service-dir", engineRoot, "--asap-python", python,
        "--state-dir", stateDir, "--templates", "oil-paint", ...extra
      ]);
      const calls = () => fs.readFileSync(callsPath, "utf8").trim().split("\n").map(line => JSON.parse(line));

      await run("--verify-registry");
      expect(calls().map(call => call.operation)).toEqual(["verify"]);
      expect(fs.existsSync(logPath)).toBe(false);
      fs.rmSync(callsPath);

      write(blockedPath, "");
      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("--resume-release") });
      const [verify, reserve, reserveReplay, publish, publishReplay] = calls();
      expect(verify.operation).toBe("verify");
      expect(reserve.operation).toBe("reserve");
      expect(reserveReplay).toEqual(reserve);
      expect(publishReplay).toEqual(publish);
      expect(publish).toMatchObject({ operation: "publish", releaseId: reserve.releaseId, version: "3" });
      const deployed = fs.readFileSync(logPath, "utf8");
      expect(deployed.trim().split("\n")).toHaveLength(3);

      fs.rmSync(blockedPath);
      await expect(run("--execute", "--resume-release", reserve.releaseId)).resolves.toMatchObject({
        stdout: expect.stringContaining("Completed oil-paint v3")
      });
      expect(calls().at(-1)).toEqual(publish);
      expect(fs.readFileSync(logPath, "utf8")).toBe(deployed);
      expect(fs.readdirSync(path.join(stateDir, "pending-releases"))).toEqual([]);
    } finally {
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("defaults to HTTP registry mode without direct DB access, guards reuseExisting, avoids double-increment on post-commit failure, and detects version drift", async () => {
    const engineRoot = makeTempDir("sw-http-registry-");
    const publishScript = path.join(repoRoot, "world/scripts/publish-seed-world-flash-apps.mjs");
    const catalog = path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE);
    const publisher = path.join(engineRoot, "publisher");
    const stateDir = path.join(engineRoot, "state");
    const logPath = path.join(engineRoot, "http-ops.jsonl");
    const registryMarker = path.join(engineRoot, "registry-should-not-run");

    const versionsByArtifact: Record<string, Array<{ version_number: string; html_url: string; type?: string }>> = {
      "flashapp-a3c0e021cb8cadb0": [],
      "flashapp-35f3d2be4fb20307": [{ version_number: "3", html_url: "https://render.example.com/sakura/v3/index.html", type: "miniapp" }],
      "flashapp-aa964a26bde230fb": [{ version_number: "3", html_url: "https://render.example.com/oil/v3/index.html", type: "miniapp" }]
    };
    let registerCalls = 0;
    let registerBehavior: "ok" | "commit-then-504" | "transient-503-then-ok" | "drift" = "ok";
    const deployedEntryByArtifact: Record<string, string> = {
      "flashapp-a3c0e021cb8cadb0": "https://render.example.com/orig/v56/index.html",
      "flashapp-35f3d2be4fb20307": "https://render.example.com/sakura/v4/index.html",
      "flashapp-aa964a26bde230fb": "https://render.example.com/oil/v4/index.html"
    };

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (url.pathname === "/api/trace/versions_by_artifact") {
        const artifactId = url.searchParams.get("artifact_id") || "";
        const versions = versionsByArtifact[artifactId] || [];
        return res.end(JSON.stringify({ success: true, data: { versions } }));
      }
      if (url.pathname === "/api/remote_skill") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          const { action } = JSON.parse(body);
          const data = action === "lingguang.db.listTables" ? ["world_save"] : worldSaveSchema;
          res.end(JSON.stringify({ success: true, data: JSON.stringify({ success: true, data }) }));
        });
        return;
      }
      if (url.pathname === "/api/flash-app/register") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          registerCalls += 1;
          const payload = JSON.parse(body);
          fs.appendFileSync(logPath, JSON.stringify({ operation: "http-register", ...payload }) + "\n");
          const current = versionsByArtifact[payload.artifact_id] || [];
          const nextNum = String(current.reduce((max, v) => Math.max(max, Number(v.version_number)), 0) + 1);
          if (registerBehavior === "commit-then-504") {
            // Simulate server committing the release, then gateway returning 504.
            versionsByArtifact[payload.artifact_id] = [
              ...current,
              { version_number: nextNum, html_url: payload.entry_url, type: payload.type }
            ];
            return res.writeHead(504).end("<html>504 Gateway Timeout</html>");
          }
          if (registerBehavior === "transient-503-then-ok" && registerCalls === 1) {
            return res.writeHead(502).end("Bad Gateway");
          }
          const allocated = registerBehavior === "drift" ? String(Number(nextNum) + 1) : nextNum;
          versionsByArtifact[payload.artifact_id] = [
            ...current,
            { version_number: allocated, html_url: payload.entry_url, type: payload.type }
          ];
          res.end(JSON.stringify({ success: true, data: { version_number: allocated } }));
        });
        return;
      }
      res.writeHead(404).end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      write(path.join(publisher, "scripts/asap-service-url.cjs"),
        `exports.asapServiceUrl = p => 'http://127.0.0.1:${port}' + p`);
      write(path.join(publisher, "scripts/asap-publish.cjs"), String.raw`
        const fs = require("node:fs");
        const entries = ${JSON.stringify(deployedEntryByArtifact)};
        exports.callAsap = request => {
          fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(request) + "\n");
          const match = /workspace\/(flashapp-[a-z0-9]+)-/.exec(request.object_name || "");
          return { entry_url: (match && entries[match[1]]) || "https://render.example.com/default/index.html" };
        };
      `);
      write(path.join(publisher, "scripts/app-context.local.json"),
        JSON.stringify({ artifactId: "flashapp-a3c0e021cb8cadb0", alipayUid: "2099123456789" }));
      write(path.join(publisher, "scripts/asap-remote-skill.cjs"), String.raw`
        exports.REMOTE_SKILL_API = require("./asap-service-url.cjs").asapServiceUrl("/api/remote_skill");
        exports.callRemoteSkill = async request => {
          const endpoint = require("./asap-service-url.cjs").asapServiceUrl("/api/remote_skill");
          return (await fetch(endpoint, { method: "POST", body: JSON.stringify(request.payload) })).json();
        };
      `);
      const fakePython = path.join(engineRoot, "fake-python");
      write(fakePython, `#!${process.execPath}\nrequire("node:fs").writeFileSync(${JSON.stringify(registryMarker)}, "called"); process.exit(1);\n`);
      fs.chmodSync(fakePython, 0o755);
      write(path.join(engineRoot, "world/demos/seed-world/storage/world_save.sql"), "CREATE TABLE world_save ...");
      for (const template of ["original", "sakura-pearl", "oil-paint"]) {
        write(path.join(engineRoot, "world/dist/seed-world-flash-apps", template, "index.html"),
          `<html><head><meta name="seed-world-default-template" content="${template}" /></head></html>`);
      }

      const runHttp = (template: string, ...flags: string[]) => promisify(execFile)(process.execPath, [
        publishScript, "--execute", "--engine-root", engineRoot, "--catalog", catalog, "--publisher-root", publisher,
        "--asap-service-dir", engineRoot, "--asap-python", fakePython, "--state-dir", stateDir,
        "--templates", template, ...flags
      ]);

      // 1. Pre-flight guard: reuseExisting=true with no online versions fails before any remote write.
      await expect(runHttp("original")).rejects.toMatchObject({
        stderr: expect.stringContaining("reuseExisting=true, but no online version was found")
      });
      expect(fs.existsSync(logPath)).toBe(false);
      expect(fs.existsSync(registryMarker)).toBe(false);

      // 2. Post-commit 504: recovers committed version via /api/trace/versions_by_artifact without re-posting!
      registerCalls = 0;
      registerBehavior = "commit-then-504";
      const recoveredResult = await runHttp("sakura-pearl");
      expect(recoveredResult.stdout).toContain("| flashapp-35f3d2be4fb20307 | 4 | miniapp | ready | OK |");
      expect(registerCalls).toBe(1);
      expect(fs.existsSync(registryMarker)).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, "flashapp-35f3d2be4fb20307.local.json"), "utf8"))).toMatchObject({
        artifactVersion: "5",
        lastPublishedVersion: "4",
        lastEntryUrl: deployedEntryByArtifact["flashapp-35f3d2be4fb20307"]
      });

      // 3. Transient 502 (not committed online) retries POST and succeeds.
      registerCalls = 0;
      registerBehavior = "transient-503-then-ok";
      const retriedResult = await runHttp("oil-paint");
      expect(retriedResult.stdout).toContain("| flashapp-aa964a26bde230fb | 4 | miniapp | ready | OK |");
      expect(registerCalls).toBe(2);

      // 4. Concurrent version drift saves publishedVersion to local state and fails with clear retry message.
      versionsByArtifact["flashapp-a3c0e021cb8cadb0"] = [
        { version_number: "55", html_url: "https://render.example.com/orig/v55/index.html", type: "game" }
      ];
      registerCalls = 0;
      registerBehavior = "drift";
      await expect(runHttp("original")).rejects.toMatchObject({
        stderr: expect.stringContaining("allocated v57 instead of injected v56")
      });
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, "flashapp-a3c0e021cb8cadb0.local.json"), "utf8"))).toMatchObject({
        artifactVersion: "58",
        lastPublishedVersion: "57",
        lastEntryUrl: deployedEntryByArtifact["flashapp-a3c0e021cb8cadb0"]
      });
      expect(fs.existsSync(registryMarker)).toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("isolates local browser IndexedDB by explicit artifactId when present and by template otherwise", async () => {
    const { resolveLocalWorldDbScope } = await import("../../demos/seed-world/base.js");
    const fakeDoc = (meta: Record<string, string>) => ({
      querySelector: (selector: string) => {
        const match = /^meta\[name="([^"]+)"\]$/.exec(selector);
        const content = match ? meta[match[1]] : undefined;
        return content !== undefined ? { content } : null;
      }
    });

    expect(resolveLocalWorldDbScope(fakeDoc({ "seed-world-default-template": "original" }), {})).toEqual({
      name: "original",
      legacyLocalDbName: null
    });
    expect(resolveLocalWorldDbScope(fakeDoc({ "seed-world-default-template": "oil-paint" }), {})).toEqual({
      name: "oil-paint",
      legacyLocalDbName: null
    });
    expect(
      resolveLocalWorldDbScope(fakeDoc({ "seed-world-default-template": "original" }), {
        artifactId: "flashapp-clone-a"
      })
    ).toEqual({
      name: "flashapp-clone-a:original",
      legacyLocalDbName: "flashapp-clone-a"
    });
    expect(
      resolveLocalWorldDbScope(
        fakeDoc({ "seed-world-default-template": "original", "lingguang-local-db": "custom-slot" }),
        { artifactId: "flashapp-clone-a" }
      )
    ).toEqual({
      name: "custom-slot:original",
      legacyLocalDbName: "custom-slot"
    });
  });

  it("resolves each standalone demo/Flash App strictly from its bound <meta> tag without URL ?template=", async () => {
    const fakeDoc = (content?: string) => ({
      querySelector: (selector: string) =>
        selector === `meta[name="${FLASH_APP_DEFAULT_TEMPLATE_META}"]` && content !== undefined
          ? ({ content } as HTMLMetaElement)
          : null
    });

    expect(readBoundFlashAppTemplate(fakeDoc(undefined))).toBeUndefined();
    expect(readBoundFlashAppTemplate(fakeDoc("unknown-style"))).toBeUndefined();
    expect(readBoundFlashAppTemplate(fakeDoc("original"))).toBe("original");
    expect(readBoundFlashAppTemplate(fakeDoc("oil-paint"))).toBe("oil-paint");

    expect(resolveAppTemplate(fakeDoc(undefined))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("unknown-style"))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("original"))).toBe("original");
    expect(resolveAppTemplate(fakeDoc("sakura-pearl"))).toBe("sakura-pearl");
    expect(resolveAppTemplate(fakeDoc("oil-paint"))).toBe("oil-paint");

    // Verify all 6 standalone demo HTML entries exist, match demos.json, and are built by default vite.config.mjs.
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const demosJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "world/demos.json"), "utf8")) as Array<{
      entry: string;
      title: string;
    }>;
    for (const app of catalog.apps) {
      const htmlFile = app.templateId === "original" ? "index.html" : `${app.templateId}.html`;
      const htmlPath = path.join(repoRoot, "world/demos/seed-world", htmlFile);
      expect(fs.existsSync(htmlPath), htmlFile).toBe(true);
      const html = fs.readFileSync(htmlPath, "utf8");
      expect(html).toContain(`<meta name="${FLASH_APP_DEFAULT_TEMPLATE_META}" content="${app.templateId}" />`);
      expect(html).toContain(`<title>${app.title}</title>`);
      expect(demosJson.some((d) => d.entry === `demos/seed-world/${htmlFile}` && d.title === app.title)).toBe(true);
    }

    const viteConfig = (await import("../../vite.config.mjs")).default;
    expect(viteConfig.build.rollupOptions.input).toEqual(
      SEED_WORLD_TEMPLATE_IDS.map((id) =>
        path.join(repoRoot, "world/demos/seed-world", id === "original" ? "index.html" : `${id}.html`)
      )
    );
  });

  it("loads and validates the 6-template flash-apps.json catalog", () => {
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    expect(catalog.apps.map((a) => a.templateId)).toEqual([...SEED_WORLD_TEMPLATE_IDS]);

    const original = catalog.apps.find((a) => a.templateId === "original")!;
    expect(original.artifactId).toBe("flashapp-a3c0e021cb8cadb0");
    expect(original.reuseExisting).toBe(true);
    expect(original.title).toBe("Seed World AIChat");

    const others = catalog.apps.filter((a) => a.templateId !== "original");
    expect(others).toHaveLength(5);
    for (const app of others) {
      expect(app.reuseExisting).toBe(false);
      expect(app.title.startsWith("Seed World · ")).toBe(true);
    }
  });

  it("injects default-template meta and title and derives all 6 lightweight variant directories", () => {
    const baseDir = makeTempDir("sw-flash-base-");
    const variantsRoot = makeTempDir("sw-flash-variants-");
    fs.mkdirSync(path.join(baseDir, "assets"), { recursive: true });
    fs.writeFileSync(path.join(baseDir, "assets/index-abc12345.js"), "console.log('ok');\n", "utf8");
    const baseHtml = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>Seed World</title>
    <script type="module" src="./assets/index-abc12345.js"></script>
  </head>
  <body></body>
</html>
`;
    fs.writeFileSync(path.join(baseDir, "index.html"), baseHtml, "utf8");

    const injected = injectFlashAppTemplateIntoHtml(baseHtml, {
      templateId: "oil-paint",
      title: "Seed World · 秋林油画"
    });
    expect(injected).toContain('<meta name="seed-world-default-template" content="oil-paint" />');
    expect(injected).toContain("<title>Seed World · 秋林油画</title>");
    expect(injected).toContain('src="./assets/index-abc12345.js"');

    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const derived = deriveFlashAppVariants({ baseOutputDir: baseDir, variantsRoot, catalog });
    expect(derived).toHaveLength(6);

    for (const item of derived) {
      const html = fs.readFileSync(path.join(item.dir, "index.html"), "utf8");
      expect(html).toContain(`<meta name="seed-world-default-template" content="${item.templateId}" />`);
      expect(html).toContain(`<title>${item.title}</title>`);
      expect(fs.existsSync(path.join(item.dir, "assets/index-abc12345.js"))).toBe(true);
    }
  });

  it("builds 6-app publish plans, guards original ID mismatch, mints 5 IDs only with --init-missing, and keeps local state per Artifact", async () => {
    const catalog = loadFlashAppsCatalog(path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE));
    const subset = selectTargetApps(catalog, "original,oil-paint");
    expect(subset.map((a) => a.templateId)).toEqual(["original", "oil-paint"]);

    // Guard: mismatched publisher context for `original` must fail
    expect(() =>
      resolveAppReleasePlan({
        catalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-wrong00000000000", artifactVersion: "4" },
        targetApps: catalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: false,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: null,
          titleOverrides: {}
        }
      })
    ).toThrow(/does not match catalog "original"/);

    // Guard: --execute without --init-missing fails when new templates lack artifactId
    const unmintedCatalog = {
      ...catalog,
      apps: catalog.apps.map((app) =>
        app.templateId === "original" ? { ...app, type: null } : { ...app, artifactId: null, type: null }
      )
    };
    expect(() =>
      resolveAppReleasePlan({
        catalog: unmintedCatalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "52" },
        targetApps: unmintedCatalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: true,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: "game",
          titleOverrides: {}
        }
      })
    ).toThrow(/has no artifactId yet/);

    // Mint 5 new IDs + align original online version + inherit online type
    let seq = 1;
    const plan = resolveAppReleasePlan({
      catalog: unmintedCatalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "52" },
      targetApps: unmintedCatalog.apps,
      options: {
        engineRoot: repoRoot,
        execute: true,
        initMissing: true,
        skipDbInit: false,
        allowContextMismatch: false,
        type: null,
        titleOverrides: {}
      },
      mintId: () => `flashapp-000000000000000${seq++}`,
      onlineInfoByTemplate: {
        original: { latestVersion: 55, type: "miniapp" }
      }
    });

    expect(plan.newlyMinted).toHaveLength(5);
    const origPlan = plan.items.find((i) => i.templateId === "original")!;
    expect(origPlan.artifactId).toBe("flashapp-a3c0e021cb8cadb0");
    expect(origPlan.targetVersion).toBe("56");
    expect(origPlan.type).toBe("miniapp");

    const oilPlan = plan.items.find((i) => i.templateId === "oil-paint")!;
    expect(oilPlan.artifactId).toBe("flashapp-0000000000000005");
    expect(oilPlan.targetVersion).toBe("1");
    expect(oilPlan.type).toBe("miniapp");

    expect(isValidAlipayUidForDb("2099123456789")).toBe(true);
    expect(isValidAlipayUidForDb("2088123456789")).toBe(false);

    const stateDir = path.join(makeTempDir("sw-state-"), "apps");

    // Heterogeneous catalog types (`original`=game, 5 new=miniapp) resolve cleanly without --type,
    // reject conflicting global --type on multi-app runs, and allow --type on single-template runs.
    const heteroPlan = resolveAppReleasePlan({
      catalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
      targetApps: catalog.apps,
      options: {
        engineRoot: repoRoot,
        execute: false,
        initMissing: false,
        skipDbInit: false,
        allowContextMismatch: false,
        type: null,
        titleOverrides: {}
      }
    });
    expect(heteroPlan.items.find((i) => i.templateId === "original")?.type).toBe("game");
    expect(heteroPlan.items.find((i) => i.templateId === "oil-paint")?.type).toBe("miniapp");

    expect(() =>
      resolveAppReleasePlan({
        catalog,
        state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
        publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
        targetApps: catalog.apps,
        options: {
          engineRoot: repoRoot,
          execute: false,
          initMissing: false,
          skipDbInit: false,
          allowContextMismatch: false,
          type: "miniapp",
          titleOverrides: {}
        }
      })
    ).toThrow(/Global --type miniapp conflicts with per-app declared type/);

    const singleOverridePlan = resolveAppReleasePlan({
      catalog,
      state: { schemaVersion: 1, alipayUid: "2099123456789", apps: {} },
      publisherContext: { artifactId: "flashapp-a3c0e021cb8cadb0", artifactVersion: "53" },
      targetApps: selectTargetApps(catalog, "oil-paint"),
      options: {
        engineRoot: repoRoot,
        execute: false,
        initMissing: false,
        skipDbInit: false,
        allowContextMismatch: false,
        type: "game",
        titleOverrides: {}
      }
    });
    expect(singleOverridePlan.items[0].type).toBe("game");

    // Separate Artifact state files retain their own results and can recover an ID minted before updating the catalog.
    saveLocalState(stateDir, origPlan, { artifactVersion: "57", dbInitialized: true });
    saveLocalState(stateDir, oilPlan, { artifactVersion: "2", dbInitialized: true });
    expect(fs.statSync(path.join(stateDir, `${origPlan.artifactId}.local.json`)).mode & 0o777).toBe(0o600);
    expect(loadLocalState(stateDir, unmintedCatalog).apps).toMatchObject({
      original: { artifactId: origPlan.artifactId, artifactVersion: "57" },
      "oil-paint": { artifactId: oilPlan.artifactId, artifactVersion: "2" }
    });
    expect(loadLocalState(stateDir, catalog).apps["oil-paint"]).toBeUndefined();
  });
});
