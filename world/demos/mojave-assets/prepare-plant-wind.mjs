/** Offline adapter for generic vertex-pivot foliage wind. Uses the same npm prefix as prepare-rock-geometry.mjs. */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const require = createRequire(path.resolve(process.argv[2], "package.json"));
const { NodeIO } = require("@gltf-transform/core");
const { ALL_EXTENSIONS } = require("@gltf-transform/extensions");
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(fileURLToPath(new URL("./assets/J03.glb", import.meta.url)));
const buffer = document.getRoot().listBuffers()[0];
const report = [];
for (const mesh of document.getRoot().listMeshes()) {
  const trunk = mesh.listPrimitives().find(p => p.getMaterial().getName().includes("Trunk"));
  const trunkPositions = trunk.getAttribute("POSITION");
  for (const primitive of mesh.listPrimitives()) {
    if (!primitive.getMaterial().getName().includes("Leaves")) continue;
    const positions = primitive.getAttribute("POSITION"), count = positions.getCount();
    const indices = primitive.getIndices().getArray();
    const parents = Array.from({ length: count }, (_, i) => i);
    const root = i => parents[i] === i ? i : (parents[i] = root(parents[i]));
    const connect = (a, b) => { parents[root(a)] = root(b); };
    const seen = new Map();
    // Join coincident UV seam vertices for mechanical connectivity only.
    for (let i = 0; i < count; i++) {
      const key = positions.getElement(i, []).join(",");
      if (seen.has(key)) connect(i, seen.get(key)); else seen.set(key, i);
    }
    for (let i = 0; i < indices.length; i += 3) {
      connect(indices[i], indices[i + 1]); connect(indices[i], indices[i + 2]);
    }
    const components = new Map();
    for (let i = 0; i < count; i++) {
      const id = root(i); if (!components.has(id)) components.set(id, []); components.get(id).push(i);
    }
    const pivotXZ = new Float32Array(count * 2), pivotYPhase = new Float32Array(count * 2);
    let componentIndex = 0;
    for (const vertices of components.values()) {
      let distance = Infinity, pivot;
      for (const index of vertices) {
        const point = positions.getElement(index, []);
        for (let i = 0; i < trunkPositions.getCount(); i++) {
          const candidate = trunkPositions.getElement(i, []);
          const d = point.reduce((sum, value, axis) => sum + (value - candidate[axis]) ** 2, 0);
          if (d < distance) { distance = d; pivot = point; }
        }
      }
      assert(pivot);
      const phase = (componentIndex++ * 0.61803398875) % 1;
      for (const index of vertices) {
        pivotXZ.set([pivot[0], pivot[2]], index * 2);
        pivotYPhase.set([pivot[1], phase], index * 2);
      }
    }
    primitive.setAttribute("TEXCOORD_1", document.createAccessor().setType("VEC2").setArray(pivotXZ).setBuffer(buffer));
    primitive.setAttribute("TEXCOORD_2", document.createAccessor().setType("VEC2").setArray(pivotYPhase).setBuffer(buffer));
    report.push({ mesh: mesh.getName(), vertices: count, triangles: indices.length / 3, leafComponents: components.size });
  }
}
const directory = fileURLToPath(new URL("./assets/wind/", import.meta.url));
await fs.mkdir(directory, { recursive: true });
await io.write(path.join(directory, "J03.glb"), document);
await fs.writeFile(path.join(directory, "catalog.json"), JSON.stringify(report, null, 2) + "\n");
console.table(report);
