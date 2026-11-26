import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { seedWorldPlantTextureDownloads } from "../seed-world-plant-texture-downloads.mjs";

const manifestName = "packages/terrain/src/data/seed-world/project.json";
const root = "packages/vegetation/src/asset-assembly/generated/procedural-trees/";
const relative = (name) => path.posix.relative(path.posix.dirname(manifestName), name);
const asset = (fileName, source) => ({ type: "asset", fileName, source });

test("identical vegetation PNGs share a download across both URLs while preserving their material declarations", () => {
  const png = root + "normal.png";
  const distinct = root + "other/normal.png";
  const hashed = "assets/normal-12345678.png";
  const terrain = "packages/terrain/public/normal.png";
  const project = {
    files: [png, distinct, terrain].map((file) => ({
      virtualPath: "World/" + file,
      path: relative(file),
      type: "Texture",
      params: { isSRGBColorSpace: false, wrapModeU: 1 }
    }))
  };
  const entries = [
    asset(manifestName, JSON.stringify(project)),
    asset(png, Buffer.from([1, 2])),
    asset(distinct, Buffer.from([2, 1])),
    asset(terrain, Buffer.from([1, 2])),
    asset(hashed, Buffer.from([1, 2]))
  ];
  const bundle = Object.fromEntries(entries.map((entry) => [entry.fileName, entry]));
  seedWorldPlantTextureDownloads().generateBundle({}, bundle);
  const result = JSON.parse(bundle[manifestName].source);
  assert.deepEqual(result.files, project.files);
  assert.deepEqual(result.textureDownloadPaths, { [relative(png)]: relative(hashed) });
  const base = new URL(manifestName, "https://example.test/builds/1/");
  assert.equal(new URL(result.textureDownloadPaths[relative(png)], base).href, "https://example.test/builds/1/" + hashed);
});

test("a build with no matching PNG keeps its manifest unchanged", () => {
  const source = Buffer.from('{"files":[]}\n');
  const bundle = { [manifestName]: asset(manifestName, source) };
  seedWorldPlantTextureDownloads().generateBundle({}, bundle);
  assert.equal(bundle[manifestName].source, source);
});
