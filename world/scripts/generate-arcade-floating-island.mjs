import fs from "node:fs/promises";
import { buildRock, DEFAULT_ROCK } from "../../packages/terrain/src/rock-formation/generator/rock-body.js";
import { simplifyRock, simplifierReady } from "../../packages/terrain/src/rock-formation/generator/simplify-rock.js";
import {
  templateBaseSeed,
  templateLinearColor
} from "../../packages/world-planning/src/spatial/WorldTemplateCatalog.ts";
import {
  ARCADE_FLOATING_ISLAND_SOURCE,
  WORLD_TEMPLATE_ART
} from "../../packages/world-planning/src/spatial/WorldTemplateArtDirection.ts";

// A reusable distant landmark, baked with the same closed-body generator as native rocks.
// Its roof plane and lower apex are in source metres; instances retain uniform scale.
await simplifierReady;
const islandSource = ARCADE_FLOATING_ISLAND_SOURCE;
const source = simplifyRock(
  buildRock({
    ...DEFAULT_ROCK,
    seed: templateBaseSeed("voxel-arcade:floating-island"),
    obbWidth: islandSource.size[0],
    obbHeight: islandSource.size[1],
    obbDepth: islandSource.size[2],
    topScale: 1,
    bottomScale: 0,
    shoulderScale: 1,
    shoulderHeight: 0.9,
    topRoughness: 0,
    topSlope: islandSource.roofSlopeDegrees,
    topDirection: 90,
    outlineIrregularity: 0.35,
    wallCount: 18
  }),
  { targetTriangles: 2000 }
);
const art = WORLD_TEMPLATE_ART["voxel-arcade"];
const stone = templateLinearColor(art.stone),
  grass = templateLinearColor(art.foliage);
const colors = new Float32Array(source.positions.length);
for (let vertex = 0; vertex < source.positions.length / 3; vertex++) {
  const roof = source.surfaceRoles[vertex];
  for (let axis = 0; axis < 3; axis++) colors[vertex * 3 + axis] = stone[axis] * (1 - roof) + grass[axis] * roof;
}

const json = {
  asset: { version: "2.0", generator: "Seed World native rock generator / grass-topped floating island" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ name: "Grass-topped floating rock island", mesh: 0 }],
  meshes: [],
  materials: [
    {
      name: "Floating island stone and grass",
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: 1
      }
    }
  ],
  accessors: [],
  bufferViews: [],
  buffers: []
};
const chunks = [];
let byteLength = 0;
function attribute(array, width, type, componentType, target) {
  const bytes = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
  const bufferView = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length, target });
  chunks.push(bytes);
  const padding = (4 - (bytes.length % 4)) % 4;
  if (padding) chunks.push(Buffer.alloc(padding));
  byteLength += bytes.length + padding;
  const min = Array(width).fill(Infinity),
    max = Array(width).fill(-Infinity);
  for (let i = 0; i < array.length; i++) {
    if (!Number.isFinite(array[i])) throw new Error("Non-finite floating island attribute");
    min[i % width] = Math.min(min[i % width], array[i]);
    max[i % width] = Math.max(max[i % width], array[i]);
  }
  const accessor = json.accessors.length;
  json.accessors.push({ bufferView, componentType, count: array.length / width, type, min, max });
  return accessor;
}
const position = attribute(source.positions, 3, "VEC3", 5126, 34962);
const normal = attribute(source.normals, 3, "VEC3", 5126, 34962);
const color = attribute(colors, 3, "VEC3", 5126, 34962);
const indices = attribute(source.indices, 1, "SCALAR", 5125, 34963);
json.meshes.push({
  primitives: [{ attributes: { POSITION: position, NORMAL: normal, COLOR_0: color }, indices, material: 0 }]
});
json.buffers.push({ byteLength });
const binary = Buffer.concat(chunks);
const text = Buffer.from(JSON.stringify(json));
const jsonSize = Math.ceil(text.length / 4) * 4;
const output = Buffer.alloc(12 + 8 + jsonSize + 8 + binary.length);
output.write("glTF");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(jsonSize, 12);
output.writeUInt32LE(0x4e4f534a, 16);
text.copy(output, 20);
output.fill(0x20, 20 + text.length, 20 + jsonSize);
const binaryHeader = 20 + jsonSize;
output.writeUInt32LE(binary.length, binaryHeader);
output.writeUInt32LE(0x004e4942, binaryHeader + 4);
binary.copy(output, binaryHeader + 8);
const target = new URL("../../packages/world-planning/src/assets/arcade-floating-island.glb", import.meta.url);
if (process.argv.includes("--check")) {
  if (!output.equals(await fs.readFile(target)))
    throw new Error("Floating island asset differs from its native source bake");
} else await fs.writeFile(target, output);
console.log(
  JSON.stringify({
    asset: target.pathname,
    triangles: source.indices.length / 3,
    bytes: output.length,
    bounds: source.bounds
  })
);
