import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { brotliCompressSync, brotliDecompressSync } from "node:zlib";
import { build, preview } from "vite";
import { meshBrotliPlugin } from "../mesh-brotli.mjs";
import { projectAssets } from "../project-assets.mjs";

function request(port, url, headers = {}, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path: url, headers, method }, async (res) => {
      try {
        const chunks = [];
        for await (const chunk of res) chunks.push(chunk);
        resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) });
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
    req.end();
  });
}

test("negotiates precompressed mesh bytes and preserves application-decoded Brotli assets", async (t) => {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "world-mesh-brotli-")));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const source = Buffer.from("glTF0123456789".repeat(512));
  const applicationBrotli = brotliCompressSync(Buffer.from("application-owned payload"));
  const mesh = "packages/models/rock 1.glb";
  const url = "/demo/packages/models/rock%201.glb?lod=1";
  const options = {
    root,
    base: "/demo/",
    configFile: false,
    logLevel: "silent",
    plugins: [projectAssets(root), meshBrotliPlugin()]
  };
  await fs.writeFile(path.join(root, "index.html"), "<!doctype html><title>mesh</title>");
  await build({
    ...options,
    plugins: [...options.plugins, {
      name: "mesh-fixtures",
      generateBundle() {
        for (const [fileName, data] of [
          [mesh, source], ["tiny.glb", source.subarray(0, 300)], ["noise.glb", randomBytes(8192)],
          ["texture.ktx2", source], ["app-data.br", applicationBrotli]
        ]) this.emitFile({ type: "asset", fileName, source: data });
      }
    }]
  });
  const dist = path.join(root, "dist");
  const sidecar = await fs.readFile(path.join(dist, mesh + ".br"));
  assert.deepEqual(brotliDecompressSync(sidecar), source);
  for (const file of ["tiny.glb.br", "noise.glb.br", "texture.ktx2.br", "app-data.br.br"]) {
    await assert.rejects(fs.access(path.join(dist, file)), { code: "ENOENT" });
  }

  const server = await preview({ ...options, preview: { host: "127.0.0.1", port: 0, open: false } });
  t.after(() => new Promise((resolve) => server.httpServer.close(resolve)));
  const { port } = server.httpServer.address();
  const encoded = await request(port, url, { "Accept-Encoding": "gzip, br" });
  assert.equal(encoded.status, 200);
  assert.equal(encoded.headers["content-encoding"], "br");
  assert.equal(encoded.headers["content-type"], "model/gltf-binary");
  assert.match(encoded.headers.vary, /Accept-Encoding/i);
  assert.deepEqual(encoded.body, sidecar);
  const head = await request(port, url, { "Accept-Encoding": "*" }, "HEAD");
  assert.equal(head.headers["content-encoding"], "br");
  assert.equal(Number(head.headers["content-length"]), sidecar.length);
  assert.equal(head.body.length, 0);
  const validated = await request(port, url, { "Accept-Encoding": "br", "If-None-Match": encoded.headers.etag });
  assert.equal(validated.status, 304);
  assert.match(validated.headers.vary, /Accept-Encoding/i);

  for (const value of ["", "gzip", "br;q=0, *;q=1", "identity;q=1, br;q=0.2"]) {
    const original = await request(port, url, { "Accept-Encoding": value, "If-None-Match": encoded.headers.etag });
    assert.equal(original.status, 200);
    assert.equal(original.headers["content-encoding"], undefined);
    assert.notEqual(original.headers.etag, encoded.headers.etag);
    assert.match(original.headers.vary, /Accept-Encoding/i);
    assert.deepEqual(original.body, source);
  }
  const partial = await request(port, url, { "Accept-Encoding": "br", Range: "bytes=4-15" });
  assert.equal(partial.status, 206);
  assert.equal(partial.headers["content-range"], `bytes 4-15/${source.length}`);
  assert.deepEqual(partial.body, source.subarray(4, 16));
  const unavailable = await request(port, "/demo/tiny.glb", { "Accept-Encoding": "br, identity;q=0" });
  assert.equal(unavailable.status, 406);
  const appOwned = await request(port, "/demo/app-data.br", { "Accept-Encoding": "gzip, br" });
  assert.equal(appOwned.headers["content-encoding"], undefined);
  assert.deepEqual(appOwned.body, applicationBrotli);
});
