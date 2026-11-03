import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;
const ARRAY_BUFFER_TARGET = 34962;
const UNSIGNED_SHORT = 5123;
const GROUND_WIND_MACRO = "MATERIAL_WIND_GROUND_VEGETATION";

const vegetationModels = new Map([
  ["30567eb3a6cc9260.glb", "flower"],
  ["4dc38aab723d12e3.glb", "shrub"],
  ["5072787747b3a4b7.glb", "shrub"],
  ["6c6934f5fbae9763.glb", "flower"],
  ["6f030beac004c8e7.glb", "shrub"],
  ["9a13664c54fb244a.glb", "grass"]
]);

// x: macro-wave contrast, y: turbulence-band gain, z: elastic recovery, w: response cadence.
// x: within-mesh spatial coherence, y: root-tip exponent, z: vertical phase travel,
// w: retained micro motion in a gale.
const vegetationMaterials = {
  "grass-2.mat": {
    kind: "grass",
    wave: [1.35, 0.72, 0.16, 0.42],
    shape: [0.85, 1.1, 0.18, 0.25]
  },
  "grass-3.mat": {
    kind: "grass",
    wave: [1.42, 0.76, 0.17, 0.4],
    shape: [0.88, 1.08, 0.2, 0.24]
  },
  "flowers-1.mat": {
    kind: "flower",
    wave: [1.18, 0.55, 0.14, 0.34],
    shape: [0.25, 1.18, 0.06, 0.2]
  },
  "flowers-2.mat": {
    kind: "flower",
    wave: [1.15, 0.5, 0.12, 0.32],
    shape: [0.2, 1.15, 0.04, 0.18]
  },
  "bush.mat": {
    kind: "shrub",
    wave: [0.92, 0.32, 0.1, 0.14],
    shape: [0.08, 1.35, 0.025, 0.12]
  }
};

export const seedWorldFlowerCalibration = {
  kind: "flower",
  wave: [1.18, 0.55, 0.14, 0.34],
  shape: [0.25, 1.18, 0.06, 0.2]
};

async function main() {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const terrainDirectory = resolve(scriptDirectory, "../..");
  const publicRoots = [
    resolve(terrainDirectory, "data/grasslands/source/public"),
    resolve(terrainDirectory, "data/grasslands/public")
  ];
  const seedWorldPublicRoot = resolve(terrainDirectory, "data/seed-world/public");

  for (const publicRoot of publicRoots) {
    const prettyJson = publicRoot.includes("/source/public");
    for (const [model, kind] of vegetationModels) {
      const path = join(publicRoot, "Models", model);
      const input = parseGlb(await readFile(path));
      const output = bakeGroundWindWeights(input, model, kind);
      await writeFile(path, buildGlb(output));
    }

    const prefabRoot = join(publicRoot, "Prefab");
    const prefabPaths = await collectFiles(prefabRoot, ".prefab");
    for (const path of prefabPaths) {
      const prefab = JSON.parse(await readFile(path, "utf8"));
      let ownsGroundWindModel = false;
      for (const component of prefab.components ?? []) {
        if (component.type !== "MeshRenderer" || !Number.isInteger(component.props?.mesh?.$ref)) continue;
        const meshReference = prefab.refs?.[component.props.mesh.$ref];
        if (!vegetationModels.has(basename(meshReference?.url ?? ""))) continue;
        ownsGroundWindModel = true;
        component.props.enableVertexColor = true;
      }
      if (ownsGroundWindModel) await writeFile(path, serializeJson(prefab, prettyJson));
    }

    for (const [name, calibration] of Object.entries(vegetationMaterials)) {
      const path = join(publicRoot, "Material/Vegetation", name);
      const material = JSON.parse(await readFile(path, "utf8"));
      calibrateGroundWindMaterial(material, calibration);
      await writeFile(path, serializeJson(material, prettyJson));
    }
  }

  const seedWorldFlowerMaterialPath = join(seedWorldPublicRoot, "materials/stylized-flower-1.mat");
  const seedWorldFlowerMaterial = JSON.parse(await readFile(seedWorldFlowerMaterialPath, "utf8"));
  calibrateGroundWindMaterial(seedWorldFlowerMaterial, seedWorldFlowerCalibration);
  await writeFile(seedWorldFlowerMaterialPath, serializeJson(seedWorldFlowerMaterial, false));
  for (const name of ["flowers-1.mat", "flowers-2.mat"]) {
    const path = join(seedWorldPublicRoot, "Material/Vegetation", name);
    const material = JSON.parse(await readFile(path, "utf8"));
    calibrateGroundWindMaterial(material, vegetationMaterials[name]);
    await writeFile(path, serializeJson(material, false));
  }

  process.stdout.write(
    `Baked P3 ground-wind weights into ${vegetationModels.size} ground-vegetation models and calibrated ${Object.keys(vegetationMaterials).length + 1} materials\n`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}

function vector4([x, y, z, w]) {
  return { type: "Vector4", value: { x, y, z, w } };
}

export function calibrateGroundWindMaterial(material, calibration) {
  material.shaderData.material_WindGroundWaveParams = vector4(calibration.wave);
  material.shaderData.material_WindGroundShapeParams = vector4(calibration.shape);
  delete material.shaderData.material_WindFlowerParams;
  material.shaderData.material_UVBaseLock = { type: "Float", value: 0 };
  material.macros ??= [];
  material.macros = material.macros.filter(
    (macro) => !macro.name.startsWith("MATERIAL_VEGETATION_CLIMATE_") && macro.name !== GROUND_WIND_MACRO
  );
  material.macros.push({ name: GROUND_WIND_MACRO });
  material.macros.push({ name: `MATERIAL_VEGETATION_CLIMATE_${calibration.kind.toUpperCase()}` });
}

function serializeJson(value, pretty) {
  return `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`;
}

async function collectFiles(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? collectFiles(path, extension) : entry.name.endsWith(extension) ? [path] : [];
    })
  );
  return nested.flat().sort();
}

export function bakeGroundWindWeights(input, asset, kind) {
  const json = structuredClone(input.json);
  let binary = Buffer.from(input.binary);
  const authoredAccessors = [];

  for (const [meshIndex, mesh] of (json.meshes ?? []).entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const positionAccessor = json.accessors?.[primitive.attributes?.POSITION];
      if (!positionAccessor) throw new Error(`${asset} mesh ${meshIndex} primitive ${primitiveIndex} has no POSITION`);
      const positions = readAccessor(json, binary, primitive.attributes.POSITION);
      const indices = Number.isInteger(primitive.indices)
        ? readAccessor(json, binary, primitive.indices).map((value) => value[0])
        : Array.from({ length: positionAccessor.count }, (_, index) => index);
      const { ids: components, referenced } = connectedComponents(positionAccessor.count, indices);
      const componentMinimumY = [];
      const componentMaximumY = [];
      const componentPositionSums = [];
      const componentVertexCounts = [];
      for (let vertex = 0; vertex < positionAccessor.count; vertex++) {
        if (!referenced[vertex]) continue;
        const component = components[vertex];
        const y = positions[vertex][1];
        componentMinimumY[component] = Math.min(componentMinimumY[component] ?? Number.POSITIVE_INFINITY, y);
        componentMaximumY[component] = Math.max(componentMaximumY[component] ?? Number.NEGATIVE_INFINITY, y);
        componentPositionSums[component] ??= [0, 0, 0];
        componentPositionSums[component][0] += positions[vertex][0];
        componentPositionSums[component][1] += positions[vertex][1];
        componentPositionSums[component][2] += positions[vertex][2];
        componentVertexCounts[component] = (componentVertexCounts[component] ?? 0) + 1;
      }

      const componentCenters = componentPositionSums.map((sum, component) => {
        const inverseCount = 1 / componentVertexCounts[component];
        return [sum[0] * inverseCount, sum[1] * inverseCount, sum[2] * inverseCount];
      });
      const componentBranchLengths = componentCenters.map((center) =>
        Math.hypot(center[0], Math.max(center[1], 0) * 0.78, center[2])
      );
      const maximumBranchLength = Math.max(...componentBranchLengths, 1e-5);
      for (let component = 0; component < componentMinimumY.length; component++) {
        if (componentMinimumY[component] === undefined) continue;
        if (!(componentMaximumY[component] - componentMinimumY[component] > 1e-5)) {
          throw new Error(
            `${asset} mesh ${meshIndex} primitive ${primitiveIndex} component ${component} has no root-tip height`
          );
        }
      }

      const colors = Buffer.alloc(positionAccessor.count * 8);
      let minimumWeight = 1;
      let maximumWeight = 0;
      for (let vertex = 0; vertex < positionAccessor.count; vertex++) {
        const component = components[vertex];
        const componentHeight = referenced[vertex]
          ? componentMaximumY[component] - componentMinimumY[component]
          : 0;
        // Grass and shrub cards use a component-local root-tip coordinate for differential
        // flexion. Flowers rotate as one rigid plant around the instance origin. A local zero on
        // an elevated flower component pins that vertex in world space and tears its triangles.
        const normalizedHeight = referenced[vertex]
          ? clamp01((positions[vertex][1] - componentMinimumY[component]) / componentHeight)
          : 0;
        const flexibleRootTip = referenced[vertex] ? smoothstep(0.02, 0.98, normalizedHeight) : 0;
        const structuralWeight = kind === "flower" ? (referenced[vertex] ? 1 : 0) : flexibleRootTip;
        const flutterWeight = kind === "flower" ? 0 : flexibleRootTip;
        const center = componentCenters[component];
        const shrubSector = Math.floor(
          (fract((Math.atan2(center[2], center[0]) + Math.PI) / (Math.PI * 2)) * 8)
        );
        const phase = kind === "shrub"
          ? fract((shrubSector + 1) * 0.61803398875)
          : fract((components[vertex] + 1) * 0.61803398875);
        const hierarchyWeight = kind === "shrub"
          ? smoothstep(0.08, 0.95, componentBranchLengths[component] / maximumBranchLength)
          : kind === "flower"
            ? 0
            : 1;
        const offset = vertex * 8;
        colors.writeUInt16LE(quantizeNormalized(structuralWeight), offset);
        colors.writeUInt16LE(quantizeNormalized(flutterWeight), offset + 2);
        colors.writeUInt16LE(quantizeNormalized(phase), offset + 4);
        colors.writeUInt16LE(quantizeNormalized(hierarchyWeight), offset + 6);
        minimumWeight = Math.min(minimumWeight, structuralWeight);
        maximumWeight = Math.max(maximumWeight, structuralWeight);
      }
      const validWeightRange =
        kind === "flower" ? minimumWeight === 1 && maximumWeight === 1 : minimumWeight === 0 && maximumWeight === 1;
      if (!validWeightRange) {
        throw new Error(
          kind === "flower"
            ? `${asset} mesh ${meshIndex} primitive ${primitiveIndex} must use one rigid instance-root weight`
            : `${asset} mesh ${meshIndex} primitive ${primitiveIndex} must span pinned root to moving body`
        );
      }

      const existingAccessorIndex = primitive.attributes.COLOR_0;
      if (Number.isInteger(existingAccessorIndex)) {
        const existingAccessor = json.accessors[existingAccessorIndex];
        const existingView = json.bufferViews[existingAccessor.bufferView];
        const incompatible =
          existingAccessor.componentType !== UNSIGNED_SHORT ||
          existingAccessor.type !== "VEC4" ||
          existingAccessor.normalized !== true ||
          existingAccessor.count !== positionAccessor.count ||
          existingAccessor.byteOffset ||
          existingView.byteStride ||
          existingView.byteLength !== colors.length;
        if (!incompatible) {
          colors.copy(binary, existingView.byteOffset ?? 0);
          authoredAccessors.push(existingAccessorIndex);
          continue;
        }
        const existingColors = readAccessor(json, binary, existingAccessorIndex);
        const neutralByteColor =
          existingAccessor.componentType === 5121 &&
          existingAccessor.type === "VEC4" &&
          existingAccessor.normalized === true &&
          existingColors.every((color) => color.every((channel) => channel === 255));
        if (!neutralByteColor) {
          throw new Error(`${asset} has an incompatible pre-existing COLOR_0 accessor`);
        }
        const byteOffset = align4(binary.length);
        if (byteOffset > binary.length) binary = Buffer.concat([binary, Buffer.alloc(byteOffset - binary.length)]);
        binary = Buffer.concat([binary, colors]);
        const bufferView = json.bufferViews.length;
        json.bufferViews.push({ buffer: 0, byteOffset, byteLength: colors.length, target: ARRAY_BUFFER_TARGET });
        existingAccessor.bufferView = bufferView;
        existingAccessor.componentType = UNSIGNED_SHORT;
        delete existingAccessor.byteOffset;
        authoredAccessors.push(existingAccessorIndex);
        continue;
      }

      const byteOffset = align4(binary.length);
      if (byteOffset > binary.length) binary = Buffer.concat([binary, Buffer.alloc(byteOffset - binary.length)]);
      binary = Buffer.concat([binary, colors]);
      const bufferView = json.bufferViews.length;
      json.bufferViews.push({ buffer: 0, byteOffset, byteLength: colors.length, target: ARRAY_BUFFER_TARGET });
      const accessor = json.accessors.length;
      json.accessors.push({
        bufferView,
        componentType: UNSIGNED_SHORT,
        count: positionAccessor.count,
        normalized: true,
        type: "VEC4"
      });
      primitive.attributes.COLOR_0 = accessor;
      authoredAccessors.push(accessor);
    }
  }

  json.buffers[0].byteLength = binary.length;
  json.extras ??= {};
  json.extras.terrainGroundWindWeights = {
    version: 4,
    asset,
    kind,
    weightSource: kind === "flower" ? "instance-root-rigid" : "connected-component-local-height",
    ...(kind === "flower" ? {} : { rootLock: 0.02, tipRelease: 0.98 }),
    channels: {
      red: kind === "flower" ? "rigid instance-root rotation" : "root-tip structural compliance",
      green: kind === "flower" ? "disabled rigid-stem differential motion" : "root-tip flutter compliance",
      blue: "connected-component phase",
      alpha: kind === "flower"
        ? "disabled rigid flower-head motion"
        : kind === "shrub"
          ? "implicit radial branch compliance"
          : "reserved"
    },
    accessors: authoredAccessors
  };
  return { json, binary };
}

function connectedComponents(vertexCount, indices) {
  const parent = Array.from({ length: vertexCount }, (_, index) => index);
  const referenced = new Uint8Array(vertexCount);
  const find = (vertex) => {
    let root = vertex;
    while (parent[root] !== root) root = parent[root];
    while (parent[vertex] !== vertex) {
      const next = parent[vertex];
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const unite = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };
  for (let index = 0; index + 2 < indices.length; index += 3) {
    const a = indices[index];
    const b = indices[index + 1];
    const c = indices[index + 2];
    if ([a, b, c].some((vertex) => vertex < 0 || vertex >= vertexCount)) {
      throw new Error("Ground-vegetation primitive contains an out-of-range index");
    }
    referenced[a] = referenced[b] = referenced[c] = 1;
    unite(a, b);
    unite(b, c);
  }
  const componentIds = new Map();
  const ids = Array.from({ length: vertexCount }, (_, vertex) => {
    const root = find(vertex);
    if (!componentIds.has(root)) componentIds.set(root, componentIds.size);
    return componentIds.get(root);
  });
  return { ids, referenced };
}

function readAccessor(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  if (accessor.sparse) throw new Error("Sparse ground-vegetation accessors are unsupported");
  const view = json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  if (!componentCount || !componentBytes) throw new Error(`Unsupported accessor ${accessorIndex}`);
  const stride = view.byteStride ?? componentCount * componentBytes;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, element) =>
    Array.from({ length: componentCount }, (_, component) =>
      readComponent(binary, start + element * stride + component * componentBytes, accessor.componentType)
    )
  );
}

function readComponent(buffer, offset, componentType) {
  switch (componentType) {
    case 5120:
      return buffer.readInt8(offset);
    case 5121:
      return buffer.readUInt8(offset);
    case 5122:
      return buffer.readInt16LE(offset);
    case 5123:
      return buffer.readUInt16LE(offset);
    case 5125:
      return buffer.readUInt32LE(offset);
    case 5126:
      return buffer.readFloatLE(offset);
    default:
      throw new Error(`Unsupported component type ${componentType}`);
  }
}

export function parseGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Ground-vegetation source must be a glTF 2.0 binary");
  }
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error("GLB length is invalid");
  let json = null;
  let binary = null;
  for (let offset = 12; offset < buffer.length; ) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const chunk = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === GLB_JSON_CHUNK) json = JSON.parse(chunk.toString("utf8").replace(/[\0 ]+$/u, ""));
    if (type === GLB_BIN_CHUNK) binary = chunk;
    offset += 8 + length;
  }
  if (!json || !binary) throw new Error("GLB must contain JSON and BIN chunks");
  return { json, binary };
}

export function buildGlb({ json, binary }) {
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const paddedJson = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const paddedBinary = Buffer.concat([binary, Buffer.alloc(align4(binary.length) - binary.length)]);
  const output = Buffer.alloc(12 + 8 + paddedJson.length + 8 + paddedBinary.length);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(paddedJson.length, 12);
  output.writeUInt32LE(GLB_JSON_CHUNK, 16);
  paddedJson.copy(output, 20);
  const binaryHeader = 20 + paddedJson.length;
  output.writeUInt32LE(paddedBinary.length, binaryHeader);
  output.writeUInt32LE(GLB_BIN_CHUNK, binaryHeader + 4);
  paddedBinary.copy(output, binaryHeader + 8);
  return output;
}

function align4(value) {
  return (value + 3) & ~3;
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(minimum, maximum, value) {
  const normalized = clamp01((value - minimum) / (maximum - minimum));
  return normalized * normalized * (3 - 2 * normalized);
}

function fract(value) {
  return value - Math.floor(value);
}

function quantizeNormalized(value) {
  return Math.round(clamp01(value) * 65535);
}
