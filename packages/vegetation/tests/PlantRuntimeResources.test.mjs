import { build, createServer } from "vite";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import os from "node:os";

const directory = fileURLToPath(new URL("../src/asset-assembly/generated/procedural-trees/", import.meta.url));
const vite = await createServer({ root: fileURLToPath(new URL("../../../", import.meta.url)), configFile: false,
  server: { middlewareMode: true, hmr: false }, logLevel: "silent" });
let decodePlantParameters;
try {
  ({ decodePlantParameters } = await vite.ssrLoadModule("/packages/vegetation/src/asset-assembly/PlantParameterEncoding.ts"));
} finally { await vite.close(); }
const read = file => decodePlantParameters(JSON.parse(readFileSync(path.join(directory, file), "utf8")));

test("final plant resources contain every dependency without unused Meadow files", () => {
  const catalog = read("plant-species.json"), manifest = read("meadow-plant-materials.json");
  const sources = new Map([...catalog.assets, ...(catalog.prototypes ?? [])].map(entry => [entry.id, entry]));
  const files = new Set(["plant-species.json", "meadow-plant-materials.json"]);
  const textures = new Set(), usedPrototypes = new Set();
  for (const entry of catalog.assets) {
    const prototype = sources.get(entry.prototypeId ?? entry.id);
    assert.ok(prototype, `${entry.id}: missing prototype`);
    if (entry.prototypeId) usedPrototypes.add(entry.prototypeId);
    assert.equal(entry.parameterFile, prototype.parameterFile);
    assert.equal(path.basename(entry.parameterFile), entry.parameterFile);
    const geometry = read(entry.parameterFile);
    assert.equal(geometry.id, prototype.id);
    assert.equal(geometry.category, entry.category);
    files.add(entry.parameterFile);
    const components = entry.geometryInstances ? new Set(entry.geometryInstances.map(part => part.materialId)) :
      new Set(Object.keys(geometry.materialSlots));
    const slots = new Set();
    for (const component of components) {
      assert.ok(component in geometry.materialSlots, `${entry.id}: missing geometry component ${component}`);
      const slot = entry.materialAliases?.[component] ?? component;
      slots.add(slot);
      const binding = manifest.assets[entry.id]?.[slot];
      assert.ok(binding, `${entry.id}: missing appearance ${slot}`);
      if (binding.albedo !== null) {
        assert.ok(manifest.textures[binding.albedo], `${entry.id}: missing texture ${binding.albedo}`);
        textures.add(binding.albedo);
      }
    }
    assert.deepEqual(Object.keys(manifest.assets[entry.id]).sort(), [...slots].sort());
  }
  assert.ok((catalog.prototypes ?? []).every(entry => usedPrototypes.has(entry.id)));
  assert.deepEqual(Object.keys(manifest.assets).sort(), catalog.assets.map(entry => entry.id).sort());
  assert.deepEqual(Object.keys(manifest.textures).sort(), [...textures].sort());
  for (const texture of Object.values(manifest.textures)) {
    const file = decodeURIComponent(texture.url.split(/[?#]/, 1)[0]);
    assert.equal(path.basename(file), file);
    assert.ok(existsSync(path.join(directory, file)), `Missing texture: ${file}`);
    files.add(file);
  }
  assert.deepEqual(readdirSync(directory).filter(file => file === "plant-species.json" || file.startsWith("meadow-")).sort(), [...files].sort());
});


test("production preserves the catalog URL graph under a nested deployment base", async () => {
  const temporary = realpathSync(mkdtempSync(path.join(os.tmpdir(), "plant-publication-")));
  const gallery = fileURLToPath(new URL("../../../", import.meta.url));
  try {
    writeFileSync(path.join(temporary, "index.html"), `<script type="module">
      import { plantSpeciesResourceUrl } from ${JSON.stringify(path.join(gallery, "packages/vegetation/src/asset-assembly/PlantSpeciesResources.ts"))};
      window.plantIndex = plantSpeciesResourceUrl("plant-species.json");
    </script>`);
    const result = await build({ configFile: false, plugins: (await import(path.resolve(gallery, "world/vite.config.mjs"))).default.plugins, root: temporary,
      base: "/preview/world/", logLevel: "error", build: { write: false, minify: false, rollupOptions: { input: path.join(temporary, "index.html") } } });
    const output = result.output;
    const index = output.find(entry => entry.fileName.endsWith("/plant-species.json"));
    assert.ok(index, "runtime index keeps a named location for its relative URL graph");
    const emitted = new Map(output.filter(entry => entry.type === "asset").map(entry => [entry.fileName, entry.source]));
    const origin = "https://example.test/preview/world/";
    const indexUrl = new URL(index.fileName, origin);
    const readResource = (reference, base = indexUrl) => {
      const url = new URL(reference, base);
      assert.ok(url.href.startsWith(origin), `escaped deployment: ${url}`);
      const name = decodeURIComponent(url.pathname.slice(new URL(origin).pathname.length));
      assert.ok(emitted.has(name), `missing production resource: ${url}`);
      return emitted.get(name);
    };
    const json = value => JSON.parse(typeof value === "string" ? value : Buffer.from(value).toString("utf8"));
    const catalog = json(readResource("plant-species.json"));
    const manifestUrl = new URL(catalog.materialFile, indexUrl);
    const manifest = json(readResource(catalog.materialFile));
    for (const descriptor of Object.values(manifest.textures)) readResource(descriptor.url, manifestUrl);
    for (const entry of [...catalog.assets, ...catalog.prototypes]) readResource(entry.parameterFile);
    for (const tree of catalog.treeRecipes)
      for (const key of ["parameterFile", "leafMaskFile", "barkAlbedoFile", "barkNormalFile", "trunkMaterialFile", "leafMaterialFile"])
        readResource(tree[key]);
    for (const shrub of catalog.shrubRecipes) {
      readResource(shrub.parameterFile);
      for (const texture of shrub.textures) readResource(texture.file);
      for (const material of Object.values(shrub.materialFiles)) readResource(material);
    }
    const published = [...emitted.keys()].filter(name => name.startsWith("packages/"));
    assert.equal(published.length, 47);
    assert.ok(published.every(name => !name.includes("measured-white-birch")), "offline measurement reports are not runtime dependencies");
    const entryChunk = output.find(entry => entry.type === "chunk" && entry.isEntry);
    const browserWindow = {};
    const browserDocument = { createElement: () => ({ relList: { supports: () => true } }) };
    new Function("window", "document", entryChunk.code.replaceAll("import.meta.url", JSON.stringify(new URL(entryChunk.fileName, origin).href)))(browserWindow, browserDocument);
    assert.equal(browserWindow.plantIndex, indexUrl.href, "the actual browser resolver points at the published catalog");
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});
