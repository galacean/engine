/**
 * Offline, lossless rock export. Original gallery GLBs remain untouched.
 * Install @gltf-transform/{core,extensions,functions}@4.5.1 and meshoptimizer@0.22.0
 * into a temporary npm prefix, then pass that prefix as the first argument.
 * Example: node world/demos/mojave-assets/prepare-rock-geometry.mjs /tmp/mojave-tools
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const require = createRequire(path.resolve(process.argv[2], "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS, EXTMeshoptCompression } = require("@gltf-transform/extensions");
const { prune, weld, reorder } = require("@gltf-transform/functions");
const { MeshoptEncoder, MeshoptDecoder } = require("meshoptimizer");
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "meshopt.encoder": MeshoptEncoder,
  "meshopt.decoder": MeshoptDecoder
});
const sourceDir = fileURLToPath(new URL("./assets/", import.meta.url));
const outputDir = path.join(sourceDir, "geometry");
await fs.mkdir(outputDir, { recursive: true });

// Compare every triangle's positions AND normals, allowing only cyclic vertex
// rotation and triangle order changes caused by the index compressor/reorder.
function geometry(document) {
  return document.getRoot().listNodes().filter(node => node.getMesh()).map(node => {
    assert.deepEqual(node.getTranslation(), [0, 0, 0]);
    assert.deepEqual(node.getRotation(), [0, 0, 0, 1]);
    assert.deepEqual(node.getScale(), [1, 1, 1]);
    const signatures = [];
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const primitive of node.getMesh().listPrimitives()) {
      assert.equal(primitive.getMode(), 4);
      const positions = primitive.getAttribute("POSITION");
      const normals = primitive.getAttribute("NORMAL");
      const indices = primitive.getIndices().getArray();
      for (let i = 0; i < positions.getCount(); i++) {
        const point = positions.getElement(i, []);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis], point[axis]);
          max[axis] = Math.max(max[axis], point[axis]);
        }
      }
      for (let i = 0; i < indices.length; i += 3) {
        const vertices = Array.from(indices.slice(i, i + 3), index =>
          JSON.stringify([...positions.getElement(index, []), ...normals.getElement(index, [])]));
        signatures.push([0, 1, 2].map(start => [0, 1, 2].map(j => vertices[(start + j) % 3]).join(";")).sort()[0]);
      }
    }
    return { name: node.getName(), triangles: signatures.length, min, max,
      hash: createHash("sha256").update(signatures.sort().join("\n")).digest("hex") };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

const report = [];
for (const family of ["A", "R"]) for (let index = 1; index <= 6; index++) {
  const id = `${family}0${index}`;
  const source = path.join(sourceDir, `${id}.glb`);
  const document = await io.read(source);
  const before = geometry(document);
  const material = document.createMaterial(`${id} geometry`).setRoughnessFactor(1).setMetallicFactor(0);
  for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    for (const semantic of primitive.listSemantics()) {
      if (semantic !== "POSITION" && semantic !== "NORMAL") primitive.setAttribute(semantic, null);
    }
    primitive.setMaterial(material);
  }
  for (const old of document.getRoot().listMaterials()) if (old !== material) old.dispose();
  for (const texture of document.getRoot().listTextures()) texture.dispose();
  for (const extension of document.getRoot().listExtensionsUsed()) extension.dispose();
  await document.transform(weld(), prune(), reorder({ encoder: MeshoptEncoder }));
  const strippedBytes = (await io.writeBinary(document)).byteLength;
  // QUANTIZE is the encoder mode, but NO quantize transform is applied: input
  // float positions/normals remain bit-exact. No lossy normal filters are used.
  document.createExtension(EXTMeshoptCompression).setRequired(true)
    .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
  const output = path.join(outputDir, `${id}.glb`);
  await io.write(output, document);
  const decoded = await io.read(output);
  assert.deepEqual(geometry(decoded), before, `${id}: geometry changed`);
  assert.equal(decoded.getRoot().listTextures().length, 0);
  for (const mesh of decoded.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives())
    assert.deepEqual(primitive.listSemantics().sort(), ["NORMAL", "POSITION"]);
  const min = [0, 1, 2].map(axis => Math.min(...before.map(lod => lod.min[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...before.map(lod => lod.max[axis])));
  report.push({ id, sourceBytes: (await fs.stat(source)).size, strippedBytes,
    compressedBytes: (await fs.stat(output)).size, min, max,
    size: max.map((value, axis) => value - min[axis]), lods: before });
}
await fs.writeFile(path.join(outputDir, "catalog.json"), JSON.stringify(report, null, 2) + "\n");
console.table(report.map(({ id, sourceBytes, strippedBytes, compressedBytes }) => ({ id, sourceBytes, strippedBytes, compressedBytes })));
