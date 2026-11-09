import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { engineModify } from "../../../packages/modify/build/vite.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = process.env.WATER_ASSET_TEST_OUTPUT ?? await mkdtemp(path.join(tmpdir(), "water-assets-test-"));
const json = async name => JSON.parse(await readFile(path.join(output, name), "utf8"));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let server, manifest, prefab, authoring;
before(async () => {
  execFileSync(process.execPath, [path.join(root, "world/scripts/generate-water-assets.mjs")], {
    cwd: root, env: { ...process.env, WATER_ASSET_OUTPUT: output }, stdio: "pipe"
  });
  manifest = await json("project.json");
  prefab = await json("Water/Presets/lake.prefab");
  authoring = prefab.components[0].props.authoring;
  server = await createServer({ root, configFile: false, cacheDir: `${output}-vite-cache`, plugins: [
    { name: "water-generator-test-source-paths", enforce: "pre", resolveId(source) {
      if (source.startsWith("/packages/")) return path.join(root, source);
    } }, engineModify()],
    server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, entries: [] } });
});
after(async () => server?.close());

test("complete generated project uses native types and closes every author asset reference", async () => {
  const entries = new Map(manifest.files.map(file => [file.virtualPath, file]));
  assert.equal(entries.size, manifest.files.length);
  assert.ok(entries.has(manifest.scene));
  const references = value => {
    if (!value || typeof value !== "object") return [];
    return Object.entries(value).flatMap(([key, child]) =>
      (key === "$ref" || key === "url") && typeof child === "string" ? [child] : references(child));
  };
  for (const file of manifest.files) {
    assert.notEqual(file.type, "WaterResource");
    assert.ok(!file.path.endsWith(".water"));
    const bytes = await readFile(path.join(output, file.path));
    if (["Scene", "Prefab", "Material", "JSON"].includes(file.type))
      for (const ref of references(JSON.parse(bytes))) assert.ok(entries.has(ref), `${file.path} -> ${ref}`);
  }
  assert.equal(entries.get(authoring.terrain.description.$ref).type, "JSON");
  assert.equal(entries.get(authoring.terrain.heights.$ref).type, "Buffer");
});

test("native CPU decoder accepts unchanged lake/bed semantics and rejects corrupt bytes", async () => {
  const { decodeWaterTerrainAssets, encodeWaterTerrainAssets } = await server.ssrLoadModule("/packages/water/src/water/native/WaterTerrainAssets.ts");
  const { validateWaterAuthoringSettings, compileWaterShape } = await server.ssrLoadModule("/packages/water/src/water/native/WaterAuthoring.ts");
  validateWaterAuthoringSettings(authoring);
  assert.equal(authoring.terrain.mode, "asset");
  const description = await json(authoring.terrain.description.$ref);
  const bytes = new Uint8Array(await readFile(path.join(output, authoring.terrain.heights.$ref)));
  assert.equal(description.sha256, sha(bytes));
  assert.equal(description.byteLength, bytes.byteLength);
  const expected = { id: "manual-bed", revision: 1, origin: [0, 0], spacing: 1, columns: 9, rows: 9, heights: Array(81).fill(-1) };
  const decoded = decodeWaterTerrainAssets(description, bytes);
  assert.deepEqual(decoded.snapshot, expected);
  assert.deepEqual(description, encodeWaterTerrainAssets(expected).description);
  assert.deepEqual(bytes, encodeWaterTerrainAssets(expected).heights);
  assert.equal(authoring.shape.referenceLevel, 0.5);
  assert.equal(authoring.shape.levelOffsetM, 0);
  assert.deepEqual(authoring.shape.shoreline.map(({ x, z }) => [x, z]), [[1, 1], [7, 1], [7, 7], [1, 7]]);
  assert.doesNotThrow(() => compileWaterShape(authoring.shape, decoded.snapshot, "generated-lake"));
  const corrupt = bytes.slice(); corrupt[0] ^= 1;
  assert.throws(() => decodeWaterTerrainAssets(description, corrupt), /checksum/);
});

test("copied texture and Shader bytes retain their source hashes", async () => {
  for (const entry of await json("conversion.json")) {
    const bytes = await readFile(path.join(output, entry.target));
    assert.equal(sha(bytes), entry.sha256, entry.target);
    assert.equal(bytes.length, entry.byteLength, entry.target);
  }
});
