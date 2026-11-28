import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build, preview } from "vite";
import { chromium } from "@playwright/test";
import { projectAssets } from "../project-assets.mjs";

for (const base of ["./", "/nested/world/"]) {
  test(`main and classic Worker publish the same resource URL under ${base}`, async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "world-worker-resource-")));
    let server, browser;
    try {
      await fs.writeFile(path.join(root, "index.html"), '<script type="module" src="./main.js"></script>');
      await fs.writeFile(path.join(root, "profile.json"), JSON.stringify({ version: 1, texture: "texture.bin" }));
      await fs.writeFile(path.join(root, "texture.bin"), new Uint8Array([1, 2, 3]));
      await fs.writeFile(
        path.join(root, "shared.js"),
        'export const url = new URL("./profile.json", import.meta.url).href;'
      );
      await fs.writeFile(path.join(root, "worker.js"), 'import { url } from "./shared.js"; postMessage(url);');
      await fs.writeFile(
        path.join(root, "main.js"),
        `
        import { url } from "./shared.js";
        const worker = new Worker(new URL("./worker.js", import.meta.url));
        worker.onmessage = async ({data}) => {
          const profile = await (await fetch(data)).json();
          const bytes = [...new Uint8Array(await (await fetch(new URL(profile.texture, data))).arrayBuffer())];
          window.result = { main: url, worker: data, profile, bytes };
          worker.terminate();
        };
        worker.onerror = event => window.failure = event.message;
      `
      );
      const config = {
        configFile: false,
        root,
        base,
        logLevel: "error",
        plugins: [projectAssets(root)],
        worker: { format: "iife", plugins: [projectAssets(root)] },
        build: { minify: true }
      };
      await build(config);
      server = await preview({ ...config, preview: { host: "127.0.0.1", port: 0 } });
      browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForFunction(() => window.result || window.failure, {}, { timeout: 10000 });
      assert.equal(await page.evaluate(() => window.failure), undefined);
      const result = await page.evaluate(() => window.result);
      assert.equal(result.main, result.worker);
      assert.equal(new URL(result.main).pathname, (base === "./" ? "/" : base) + "profile.json");
      assert.equal(result.profile.version, 1);
      assert.deepEqual(result.bytes, [1, 2, 3]);
    } finally {
      await browser?.close();
      await new Promise((resolve) => (server ? server.httpServer.close(resolve) : resolve()));
      await fs.rm(root, { recursive: true, force: true });
    }
  });
}
