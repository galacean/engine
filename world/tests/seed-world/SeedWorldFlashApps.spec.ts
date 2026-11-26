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
    let sakuraTableCreated = false;
    let schemaUnavailable = false;
    const schema = {
      tableName: "world_save", tableKind: "user", primaryKeys: ["id"], columns: [
        { name: "id", dataType: "VARCHAR", length: 128, nullable: false },
        { name: "generation", dataType: "VARCHAR", length: 100000, nullable: false },
        { name: "part_no", dataType: "INT", length: null, nullable: false },
        { name: "payload", dataType: "VARCHAR", length: 100000, nullable: false }
      ]
    };
    const server = http.createServer((req, res) => {
      if (req.url === "/api/remote_skill") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          const { action, artifactId } = JSON.parse(body);
          if (action === "lingguang.db.getTableSchema") {
            if (schemaUnavailable) return res.destroy();
            return res.end(JSON.stringify({ success: true, data: JSON.stringify({ success: true, data: schema }) }));
          }
          if (simulateLostReply && artifactId === artifacts["sakura-pearl"]) {
            if (sakuraTableCreated) {
              return res.end(JSON.stringify({ success: true, data: "执行DDL失败: Table 'world_save' already exists" }));
            }
            sakuraTableCreated = true;
            return res.destroy();
          }
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
      for (const template of Object.keys(artifacts)) {
        write(path.join(engineRoot, "world/dist/seed-world-flash-apps", template, "index.html"), `<html><head><meta name="seed-world-default-template" content="${template}" /></head></html>`);
      }
      const publisherContext = path.join(publisher, "scripts/app-context.local.json");
      const context = JSON.stringify({ artifactId: "flashapp-a3c0e021cb8cadb0", alipayUid: "2099123456789" });
      write(publisherContext, context);
      write(path.join(engineRoot, "world/demos/seed-world/storage/world_save.sql"), "CREATE TABLE world_save ...");
      write(path.join(publisher, "scripts/asap-remote-skill.cjs"), String.raw`
        exports.callRemoteSkill = async request => {
          const operation = request.action === "lingguang.db.getTableSchema" ? "read-schema" : "ddl";
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
      expect(attempted.map((call) => call.operation)).toEqual(["verify", "reserve", "ddl", "read-schema"]);
      expect(fs.existsSync(stateDir)).toBe(false);
      fs.rmSync(logPath);

      simulateLostReply = true;
      schemaUnavailable = true;
      await expect(run("--execute")).rejects.toMatchObject({ stderr: expect.stringContaining("fetch failed") });
      expect(sakuraTableCreated).toBe(true);
      expect(fs.existsSync(stateDir)).toBe(false);
      fs.rmSync(logPath);

      schemaUnavailable = false;
      schema.tableKind = "share";
      ddlResponse = { success: true, code: "0", data: "创建表成功！\n\n**表类型**: share" };
      const results = await Promise.all(Object.keys(artifacts).map((template) => run("--execute", template)));
      const calls = fs.readFileSync(logPath, "utf8").trim().split("\n").map((line) => JSON.parse(line));
      for (const [index, [template, artifactId]] of Object.entries(artifacts).entries()) {
        const prefix = `leopard/sandbox/workspace/${artifactId}-3/`;
        const backupOss = prefix + "backup_3.tar.gz";
        const appCalls = calls.filter((call) => call.artifactId === artifactId || call.object_name?.startsWith(prefix));
        const databaseCalls = template === "sakura-pearl" ? ["ddl", "read-schema"] : ["ddl"];
        expect(appCalls.map((call) => call.operation)).toEqual([
          "verify", "reserve", ...databaseCalls, "upload", "upload", "deploy", "publish"
        ]);
        expect(appCalls.find((call) => call.operation === "ddl"))
          .toMatchObject({ artifactVersion: "3", params: { table_kind: "share" } });
        const [backup, release] = appCalls.filter((call) => call.operation === "upload");
        expect(backup).toMatchObject({ object_name: backupOss });
        expect(backup.html).toContain(`content="${template}"`);
        expect(backup.html).not.toContain("window.artifactId");
        expect(path.basename(path.dirname(backup.local_file))).toContain(artifactId);
        expect(release.html).toContain(`window.artifactId = "${artifactId}"`);
        expect(release.html).toContain('window.artifactVersion = "3"');
        expect(appCalls.at(-1)).toMatchObject({ version: "3", backupOss, entryUrl: "https://render.example.com/v3/index.html" });
        expect(JSON.parse(fs.readFileSync(path.join(stateDir, artifactId + ".local.json"), "utf8"))).toMatchObject({
          templateId: template, artifactId, artifactVersion: "4", lastPublishedVersion: "3", lastBackupOss: backupOss
        });
        expect(results[index].stdout).toContain(`| ${artifactId} | 3 | miniapp | initialized | OK |`);
      }
      expect(fs.readFileSync(publisherContext, "utf8")).toBe(context);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("publishes via ASAP HTTP /api/flash-app/register by default without direct DB access and detects version drift", async () => {
    const engineRoot = makeTempDir("sw-http-register-");
    const publishScript = path.join(repoRoot, "world/scripts/publish-seed-world-flash-apps.mjs");
    const catalog = path.join(repoRoot, DEFAULT_FLASH_APPS_CATALOG_RELATIVE);
    const publisher = path.join(engineRoot, "publisher");
    const stateDir = path.join(engineRoot, "state");
    const artifactId = "flashapp-aa964a26bde230fb";
    const logPath = path.join(engineRoot, "operations.jsonl");
    const registerCalls: Array<Record<string, unknown>> = [];
    let registerStatus = 200;
    let registerResponse: Record<string, unknown> = {
      success: true,
      message: "新版本发布成功",
      data: { artifact_id: artifactId, version_number: "2" }
    };

    const server = http.createServer((req, res) => {
      if (req.url?.startsWith("/api/trace/versions_by_artifact")) {
        res.writeHead(200, { "Content-Type": "application/json" }).end(
          JSON.stringify({
            versions: [{ artifact_version: "1", html_url: "https://render.example.com/v1/index.html" }],
            type: "miniapp"
          })
        );
        return;
      }
      if (req.url === "/api/flash-app/register") {
        let body = "";
        req.setEncoding("utf8");
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          registerCalls.push(JSON.parse(body));
          res.writeHead(registerStatus, { "Content-Type": "application/json" }).end(JSON.stringify(registerResponse));
        });
        return;
      }
      res.writeHead(404).end(JSON.stringify({ success: false, message: "not found" }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const { port } = server.address() as { port: number };
      write(path.join(publisher, "scripts/asap-service-url.cjs"),
        `exports.asapServiceUrl = p => 'http://127.0.0.1:${port}' + p`);
      write(path.join(publisher, "scripts/asap-publish.cjs"), String.raw`
        const fs = require("node:fs");
        exports.callAsap = request => {
          fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify(request) + "\n");
          return { entry_url: "https://render.example.com/v2/index.html" };
        };
      `);
      // Stub Python executable that fails if seed-world-flash-registry.py is ever invoked in default HTTP mode.
      const dummyPython = path.join(engineRoot, ".venv/bin/python");
      write(dummyPython, `#!/bin/sh\necho "direct-db registry should not be called in http mode" >&2\nexit 99\n`);
      fs.chmodSync(dummyPython, 0o755);
      write(
        path.join(engineRoot, "world/dist/seed-world-flash-apps/oil-paint/index.html"),
        '<html><head><meta name="seed-world-default-template" content="oil-paint" /></head></html>'
      );
      write(
        path.join(publisher, "scripts/app-context.local.json"),
        JSON.stringify({ artifactId: "flashapp-a3c0e021cb8cadb0", alipayUid: "2099123456789" })
      );

      const run = (...extra: string[]) => promisify(execFile)(process.execPath, [
        publishScript, "--execute", "--skip-db-init",
        "--engine-root", engineRoot, "--catalog", catalog, "--publisher-root", publisher,
        "--asap-service-dir", engineRoot, "--state-dir", stateDir,
        "--templates", "oil-paint", ...extra
      ]);

      // 1. Default HTTP mode succeeds without direct-db registry access.
      const ok = await run();
      expect(ok.stdout).toContain(`| ${artifactId} | 2 | miniapp | skipped | OK |`);
      expect(registerCalls).toHaveLength(1);
      expect(registerCalls[0]).toEqual({
        artifact_id: artifactId,
        title: "Seed World · 秋林油画",
        type: "miniapp",
        backup_url: `leopard/sandbox/workspace/${artifactId}-2/backup_2.tar.gz`,
        entry_url: "https://render.example.com/v2/index.html"
      });
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, `${artifactId}.local.json`), "utf8"))).toMatchObject({
        artifactId,
        artifactVersion: "3",
        lastPublishedVersion: "2"
      });

      // 2. Concurrent version drift (HTTP register allocates v4 while release targeted v3) fails loudly and advances local version.
      registerResponse = {
        success: true,
        message: "新版本发布成功",
        data: { artifact_id: artifactId, version_number: "4" }
      };
      await expect(run()).rejects.toMatchObject({
        stderr: expect.stringContaining("ASAP allocated version 4 while release HTML/backup targeted 3")
      });
      expect(JSON.parse(fs.readFileSync(path.join(stateDir, `${artifactId}.local.json`), "utf8"))).toMatchObject({
        artifactVersion: "5",
        lastPublishedVersion: "4"
      });

      // 3. HTTP 409 type mismatch fails without retry.
      registerStatus = 409;
      registerResponse = { success: false, message: "type 不匹配" };
      await expect(run()).rejects.toMatchObject({
        stderr: expect.stringContaining("ASAP HTTP register rejected")
      });
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
      importLegacyPreview: true
    });
    expect(resolveLocalWorldDbScope(fakeDoc({ "seed-world-default-template": "oil-paint" }), {})).toEqual({
      name: "oil-paint",
      importLegacyPreview: true
    });
    expect(
      resolveLocalWorldDbScope(fakeDoc({ "seed-world-default-template": "original" }), {
        artifactId: "flashapp-clone-a"
      })
    ).toEqual({
      name: "flashapp-clone-a:original",
      importLegacyPreview: false
    });
    expect(
      resolveLocalWorldDbScope(
        fakeDoc({ "seed-world-default-template": "original", "lingguang-local-db": "custom-slot" }),
        { artifactId: "flashapp-clone-a" }
      )
    ).toEqual({
      name: "custom-slot:original",
      importLegacyPreview: false
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
    expect(origPlan.needsDbInit).toBe(false);

    const oilPlan = plan.items.find((i) => i.templateId === "oil-paint")!;
    expect(oilPlan.artifactId).toBe("flashapp-0000000000000005");
    expect(oilPlan.targetVersion).toBe("1");
    expect(oilPlan.type).toBe("miniapp");
    expect(oilPlan.needsDbInit).toBe(true);

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
