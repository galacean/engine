// Run against a locally served Flash App build. Only static CDN assets may leave localhost.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";

import { editResources, checkSharedResources, externalModel } from "./shared-world-resources.mjs";

function readFile(sql, ref) {
  const blocks = sql.prepare("SELECT payload FROM world_save WHERE generation=? AND part_no>=0 ORDER BY part_no").all(ref.revision);
  return gunzipSync(Buffer.concat(blocks.map(({ payload }) => Buffer.from(payload, "base64"))));
}
function checkpoint(sql) {
  const head = JSON.parse(sql.prepare("SELECT payload FROM world_save WHERE id='world'").get().payload);
  assert.equal(head.format, 2);
  return new Map(JSON.parse(readFile(sql, head)).files);
}

async function waitForWorld(page) {
  const canvas = page.locator("#world-canvas");
  await page.waitForFunction(
    () => ["ready", "error"].includes(document.querySelector("#world-canvas")?.dataset.status),
    null,
    { timeout: 240000 }
  );
  assert.equal(await canvas.getAttribute("data-status"), "ready", await canvas.getAttribute("data-error"));
}

async function saveTime(page, timeHours) {
  await page.evaluate(async (timeHours) => {
    const hud = window.seedWorldAI;
    const project = hud._options.nativeEditor.project;
    const editor = hud.application.getEditorDocument();
    editor.settings.environment = { timeHours, transitionDuration: 0, waitForIbl: false };
    editor.revision++;
    await project.publishAsset(
      { virtualPath: "World/Editor.json", path: "runtime-world:editor", type: "SeedWorldEditor" },
      JSON.stringify(editor)
    );
    await project.flush();
  }, timeHours);
}

async function checkLocalDb(page) {
  const result = await page.evaluate(async () => {
    const db = window.lingguang.db;
    const id = crypto.randomUUID();
    const insert = (payload) => db.execute({
      sql: "INSERT INTO world_save (id, generation, part_no, payload) VALUES (?, ?, ?, ?)",
      binds: [id, id, 0, payload]
    });
    const limit = "x".repeat(100000);
    const tooLarge = await insert(limit + "x");
    const atLimit = await insert(limit);
    const duplicate = await insert("duplicate");
    const updates = await Promise.all(["B", "C"].map(payload => db.execute({
      sql: "UPDATE world_save SET payload = ? WHERE id = ? AND payload = ?",
      binds: [payload, id, limit]
    })));
    const removed = await db.execute({ sql: "DELETE FROM world_save WHERE generation = ?", binds: [id] });
    return {
      role: (await db.role()).role, tooLarge: tooLarge.success, atLimit: atLimit.success,
      duplicate: duplicate.success, changed: updates.map(update => update.data.rowsAffected).sort(),
      removed: removed.data.rowsAffected
    };
  });
  assert.deepEqual(result, { role: "MANAGER", tooLarge: false, atLimit: true, duplicate: false, changed: [0, 1], removed: 1 });
}

const origin = new URL(process.argv[2] ?? "http://127.0.0.1:4180");
assert.ok(["127.0.0.1", "localhost"].includes(origin.hostname));
const schema = readFileSync(new URL("../../demos/seed-world/storage/world_save.sql", import.meta.url), "utf8");
const instances = new Map();
function openInstance(id) {
  if (!instances.has(id)) {
    const conn = new DatabaseSync(":memory:");
    conn.exec(schema);
    conn.function("now", (_precision) => Date.now());
    conn.function("unix_timestamp", (now) => now / 1000);
    conn.exec("ALTER TABLE world_save ADD COLUMN app_version INT NOT NULL DEFAULT 1");
    instances.set(id, conn);
  }
  return instances.get(id);
}
const browser = await chromium.launch({ args: ["--ignore-gpu-blocklist", "--use-angle=metal"] });
try {
  let sourceHead;
  for (const step of [
    "empty visitor", "create", "share", "recall", "reopen", "older visitor", "planner publication race", "reconciliation failure",
    "incompatible visitor", "incompatible owner", "mismatched template visitor", "unreadable checkpoint owner", "retired template",
    "browser", "planner"
  ]) {
    const role = step === "share" || step.endsWith("visitor") ? "USER" : "MANAGER";
    const version = step === "create" || step === "older visitor" || step === "planner publication race" ? 1 : 2;
    const localDb = step === "browser" || step === "planner";
    const clone = step === "recall";
    const id = "flashapp-local-" + (clone || step === "retired template" || step === "planner" ? step : "source");
    const sql = openInstance(id);
    if (step === "incompatible visitor") {
      sourceHead = sql.prepare("SELECT payload FROM world_save WHERE id='world'").get().payload;
      sql.exec("UPDATE world_save SET payload=json_set(payload,'$.engineVersion',999) WHERE id='world'");
    }
    if (step === "mismatched template visitor") {
      sql.prepare("UPDATE world_save SET payload=json_set(?, '$.template', 'sakura-pearl') WHERE id='world'").run(sourceHead);
    }
    if (step === "unreadable checkpoint owner") {
      sql.prepare("UPDATE world_save SET payload=json_set(?, '$.digest', ?) WHERE id='world'").run(sourceHead, "0".repeat(64));
    }
    if (step === "retired template") {
      const revision = randomUUID();
      const bytes = Buffer.from(JSON.stringify({ version: 6 }));
      const digest = createHash("sha256").update(bytes).digest("hex");
      const put = sql.prepare("INSERT INTO world_save (id, generation, part_no, payload) VALUES (?,?,?,?)");
      put.run(revision + "-0", revision, 0, gzipSync(bytes).toString("base64"));
      put.run("world", "head", -1, JSON.stringify({
        seed: 123, template: "retired-template", format: 1, engineVersion: 12, appVersion: "1", revision, parts: 1, digest
      }));
    }
    const rows = sql.prepare("SELECT * FROM world_save ORDER BY id");
    const fallback = [
      "incompatible visitor", "incompatible owner", "mismatched template visitor", "unreadable checkpoint owner", "retired template"
    ].includes(step);
    const preservedSave = fallback ? rows.all() : undefined;
    const seed = step === "recall" || step === "planner" ? "124" : "123";
    const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    try {
      const page = await context.newPage();
      const errors = [];
      let writes = 0;
      let blockReads = 0;
      let rejectedReconciliation = false;
      let returnedPriorHead = false;
      const readHead = (id) => sql.prepare("SELECT payload FROM world_save WHERE id = ?").get(id)?.payload;
      const protectedHead = step === "planner publication race" ? readHead("world") : undefined;
      await context.route("**/*", (route) => {
        const url = new URL(route.request().url());
        if (url.origin === origin.origin && url.pathname === "/fixture/tree.gltf") {
          return route.fulfill({ json: externalModel });
        }
        if (url.protocol === "lingguang:") errors.push("Raw storage URL reached browser: " + url.href);
        if (
          url.origin === origin.origin ||
          (url.hostname === "mdn.alipayobjects.com" && route.request().method() === "GET")
        )
          return route.continue();
        return route.abort();
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.exposeFunction("testWorldDb", (op, req) => {
        // The platform stamps INSERTs and limits reads/updates to the active app version.
        if (req.sql.startsWith("INSERT")) {
          writes++;
          const put = sql.prepare("INSERT INTO world_save VALUES (?, ?, ?, ?, ?)");
          return { success: true, data: { rowsAffected: Number(put.run(...req.binds, version).changes) } };
        }
        const statement = sql.prepare(req.sql.replace(
          / WHERE (.+?)( ORDER BY | LIMIT |$)/,
          (_, condition, suffix) => ` WHERE (${condition}) AND app_version <= ${version}${suffix}`
        ));
        if (op === "query") {
          if (step === "planner publication race" && !returnedPriorHead && req.binds[0] === "world" &&
              req.sql.startsWith("SELECT payload")) {
            returnedPriorHead = true;
            return { success: true, data: [{ payload: readHead("archive-0000000000000001") }] };
          }
          if (req.sql.includes("WHERE generation = ?")) blockReads++;
          if (step === "reconciliation failure" && req.sql.includes("WHERE generation > ?") && !rejectedReconciliation) {
            rejectedReconciliation = true;
            return { success: false, message: "temporary reconciliation failure" };
          }
          return { success: true, data: statement.all(...req.binds) };
        }
        writes++;
        return { success: true, data: { rowsAffected: Number(statement.run(...req.binds).changes) } };
      });
      await page.addInitScript(
        ({ role, localDb, version, id }) => {
          window.storageGzipReplies = 0;
          const observedWorkers = new WeakSet();
          const post = Worker.prototype.postMessage;
          Worker.prototype.postMessage = function (message, ...rest) {
            if (message?.input instanceof Uint8Array && !observedWorkers.has(this)) {
              observedWorkers.add(this);
              this.addEventListener("message", ({ data }) => {
                if (data?.gzip?.[0] === 0x1f && data.gzip[1] === 0x8b) window.storageGzipReplies++;
              });
            }
            return post.call(this, message, ...rest);
          };
          window.__seedWorldOnDiagnosticHost = (host) => {
            window.storageTestEngine = host?.engine;
            if (host) {
              const manager = host.engine.resourceManager;
              const register = manager.registerVirtualResources.bind(manager);
              manager.registerVirtualResources = (resources) => {
                for (const file of resources) {
                  if (file.path.startsWith("lingguang:"))
                    throw Error("Storage URL registered with native loader: " + file.virtualPath);
                }
                return register(resources);
              };
            }
          };
          window.artifactId = id;
          if (localDb) return;
          window.artifactVersion = String(version);
          const db = {
            role: async () => ({ role }),
            query: (req) => window.testWorldDb("query", req),
            execute: (req) => window.testWorldDb("execute", req)
          };
          window.lingguang = { db };
        },
        { role, localDb, version, id }
      );
      const query = step === "planner" || step === "planner publication race" ? "?seed=123&debug=1" :
        step === "create" || step === "recall" || step === "retired template" || step === "browser" ? "?seed=" + seed : "?seed=999";
      await page.goto(new URL(query, origin).href);
      if (step === "empty visitor") {
        await page.getByText("作者尚未保存这个世界。").waitFor();
        const api = await page.evaluate(async () => ({
          methods: Object.keys(window.lingguang.db).sort(),
          role: (await window.lingguang.db.role()).role,
          namespace: Object.keys(window.lingguang)
        }));
        assert.deepEqual(api, { methods: ["execute", "query", "role"], role: "USER", namespace: ["db"] });
        assert.equal(writes, 0);
        console.log(step, "passed");
        continue;
      }
      if (step === "planner publication race") {
        await page.locator('button[data-tab="world"]').click({ timeout: 90000 });
        const seedInput = page.locator('input[data-component="world"][data-field="seed"]');
        await seedInput.waitFor({ timeout: 90000 });
        await seedInput.fill("124");
        await seedInput.press("Enter");
        await page.locator('[data-ui="save-warning"]').filter({ hasText: "另一会话已保存世界" }).waitFor({ timeout: 90000 });
        await page.locator('[data-ui="save-warning"]').filter({ hasText: "规划尚未保存" }).waitFor();
        assert.ok(returnedPriorHead);
        assert.equal(writes, 0);
        assert.equal(readHead("world"), protectedHead);
        assert.equal(await page.locator("#world-canvas").count(), 0);
        console.log(step, "passed");
        continue;
      }
      if (step === "planner") {
        await page.locator('button[data-tab="world"]').click({ timeout: 90_000 });
        const seedInput = page.locator('input[data-component="world"][data-field="seed"]');
        await seedInput.waitFor({ timeout: 90_000 });
        await seedInput.fill(seed);
        await seedInput.press("Enter");
        await page.waitForFunction(
          (expected) => document.querySelector("#planning-app [data-seed]")?.getAttribute("data-seed") === expected,
          seed,
          { timeout: 90_000 }
        );
        const generateBtn = page.getByRole("button", { name: "生成 3D", exact: true });
        await page.waitForFunction(() => !document.querySelector('button[data-action="generate"]')?.hasAttribute("disabled"), null, { timeout: 90_000 });
        await generateBtn.click();
      }
      await waitForWorld(page);
      assert.equal(new URL(page.url()).searchParams.get("seed"), seed);
      assert.equal(await page.evaluate(() => Boolean(window.seedWorldAI)), role === "MANAGER");
      const hasLocalProject = await page.evaluate(async () =>
        (await indexedDB.databases()).some((db) => db.name === 'lingguang-world-save:"original"')
      );
      assert.equal(hasLocalProject, localDb);
      if (step === "create" || step === "browser") {
        // Submit an authoring asset through the same project publication/flush as an editor commit.
        // The test uses the mounted editor so production needs no test-only entry point.
        const before = step === "create" ? checkpoint(sql) : undefined;
        await saveTime(page, 21);
        if (step === "browser") {
          await checkLocalDb(page);
          assert.equal(writes, 0);
          await page.reload();
          await waitForWorld(page);
          assert.equal(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 21);

          const oilPaintPreview = new URL("?seed=123", origin);
          oilPaintPreview.searchParams.set("preview-test", "oil-paint");
          await page.route(oilPaintPreview.href, async (route) => {
            const response = await route.fetch();
            const html = await response.text();
            await route.fulfill({
              response,
              body: html.replace('name="seed-world-default-template" content="original"',
                'name="seed-world-default-template" content="oil-paint"')
            });
          });
          await page.goto(oilPaintPreview.href);
          await waitForWorld(page);
          const localWorlds = await page.evaluate(async () =>
            (await indexedDB.databases()).map((db) => db.name).filter((name) => name.startsWith("lingguang-world-save:")).sort()
          );
          assert.deepEqual(localWorlds, ['lingguang-world-save:"oil-paint"', 'lingguang-world-save:"original"']);
          assert.notEqual(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 21);
        } else {
          assert.ok((await page.evaluate(() => window.storageGzipReplies)) > 0, "scene saved by gzip worker");
          assert.ok(writes > 0);
          const refs = checkpoint(sql);
          const manifest = JSON.parse(readFile(sql, refs.get("project.json")));
          for (const path of ["Material/Terrain/seed-world.mat", "Prefab/Detail/detail-00.prefab"]) {
            assert.match(manifest.files.find((file) => file.virtualPath === path).path, /^https?:/);
          }
          const editorPath = manifest.files.find((file) => file.virtualPath === "World/Editor.json").path;
          assert.equal(editorPath, "lingguang://world/files/World/Editor.json");
          assert.equal(JSON.parse(readFile(sql, refs.get(editorPath))).settings.environment.timeHours, 21);
          for (const [key, ref] of before) {
            if (key !== "project.json" && key !== editorPath) assert.deepEqual(refs.get(key), ref, key);
          }
          await editResources(page);
          console.log("incremental save and two material overrides passed");
        }
      }
      if (step === "share" || step === "reopen") {
        await checkSharedResources(page, step === "share");
        console.log(
          step,
          "cold building texture, external model buffer and material passed",
          step === "share" ? "(GPU restored)" : ""
        );
      }
      if (clone) {
        assert.ok(writes > 0);
        assert.notEqual(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 21);
        const head = JSON.parse(sql.prepare("SELECT payload FROM world_save WHERE id='world'").get().payload);
        assert.equal(head.seed, Number(seed));
      }
      if (fallback) {
        if (step === "unreadable checkpoint owner") assert.ok(blockReads > 0);
        else assert.equal(blockReads, 0);
        if (role === "MANAGER") {
          assert.equal(await page.evaluate(() => window.seedWorldAI._options.nativeEditor.project.isPersistent), false);
          assert.notEqual(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 21);
          await saveTime(page, 23);
        }
        assert.equal(writes, 0);
        assert.deepEqual(rows.all(), preservedSave);
      }
      if (step === "reopen") {
        assert.equal(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 21);
        await saveTime(page, 22);
      }
      if (step === "older visitor") {
        const oldIndex = JSON.parse(sql.prepare("SELECT payload FROM world_save WHERE id = ? AND part_no > 0").get("archive-0000000000000001").payload);
        assert.equal(oldIndex.appVersion, "1");
        await checkSharedResources(page, false);
      }
      if (step === "reconciliation failure") {
        await page.waitForFunction(() => window.seedWorldAI?._options.nativeEditor.project.persistenceStatus.state === "failed");
        assert.ok(rejectedReconciliation && blockReads > 0);
        assert.equal(await page.evaluate(() => window.seedWorldAI.application.getTime().timeHours), 22);
        await page.evaluate(() => window.seedWorldAI._options.nativeEditor.project.flush());
      }
      if (step === "planner") {
        await page.reload();
        await waitForWorld(page);
        assert.equal(new URL(page.url()).searchParams.get("seed"), seed);
      }
      await page.goto("about:blank");
      if (role === "USER") assert.equal(writes, 0);
      assert.deepEqual(errors, []);
      console.log(step, "passed");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  for (const db of instances.values()) db.close();
}
