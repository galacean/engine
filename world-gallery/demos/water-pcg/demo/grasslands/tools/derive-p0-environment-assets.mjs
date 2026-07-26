#!/usr/bin/env node

import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const SOURCE_ASSETS = Object.freeze([
  {
    kind: "albedo-smoothness",
    source: "Textures/Terrain/MudStones_AlbedoSmoothness.png",
    sourceSha256: "1aeb54b4087958d7edf9e0b81d865f0ad968897bdd0f990d6b183ece5ac7f65e",
    output: "terrain/mud-stones-albedo-smoothness-1024.png",
    sourceSize: 2048,
    alphaIsData: true
  },
  {
    kind: "normal",
    source: "Textures/Terrain/MudStones_Normal.png",
    sourceSha256: "88fd08c24ca17f0f8b4e1e96096e8c15bdd4598db69c2f9effe6cfc91e357001",
    output: "terrain/mud-stones-normal-1024.png",
    sourceSize: 2048,
    alphaIsData: false
  },
  {
    kind: "albedo-smoothness",
    source: "Textures/Terrain/Sand_AlbedoSmoothness.png",
    sourceSha256: "28b579b007f81225a338749d42ad2c68e4389310520623ab0ca8076e780b8a33",
    output: "terrain/sand-albedo-smoothness-1024.png",
    sourceSize: 2048,
    alphaIsData: true
  },
  {
    kind: "normal",
    source: "Textures/Terrain/Sand_Normal.png",
    sourceSha256: "8d61bd0730e28a702b6a828a65bb67fe5ca85b560b3dc91005b1eec91a2d4ef7",
    output: "terrain/sand-normal-1024.png",
    sourceSize: 2048,
    alphaIsData: false
  },
  {
    kind: "albedo-smoothness",
    source: "Textures/Terrain/GrassMud_AlbedoSmoothness.png",
    sourceSha256: "bc9d9dc83af2093b195222ea202257db444e8fe88cbf932d01a0cd031cf3e25b",
    output: "terrain/grass-mud-albedo-smoothness-1024.png",
    sourceSize: 2048,
    alphaIsData: true
  },
  {
    kind: "normal",
    source: "Textures/Terrain/GrassMud_Normal.png",
    sourceSha256: "458d6d32dc7a954bff363db205786f3c443b280364efc3c9854b29474394c5ba",
    output: "terrain/grass-mud-normal-1024.png",
    sourceSize: 2048,
    alphaIsData: false
  },
  {
    kind: "albedo",
    source: "Textures/Rocks/Stone_1,2_Albedo.png",
    sourceSha256: "d87ddbc1d3e22f41f68aa9a85559cad9535150f107e06734907e266face28590",
    output: "rocks/stone-1-2-albedo-1024.png",
    sourceSize: 2048,
    alphaIsData: false
  },
  {
    kind: "normal",
    source: "Textures/Rocks/Stone_1,2_Normal.png",
    sourceSha256: "894488a2be1c719b76e5d058fdd63de4d5a40de29e6f0ef84d18cc52359b5a5c",
    output: "rocks/stone-1-2-normal-1024.png",
    sourceSize: 2048,
    alphaIsData: false
  },
  {
    kind: "same-byte-copy",
    source: "Textures/Rocks/Small_Stones_Albedo.png",
    sourceSha256: "73098d9d1cc0005d148d6f191216e8fe34d962fa207752e00dc197ba11d990b9",
    output: "rocks/small-stones-albedo-1024.png",
    sourceSize: 1024,
    alphaIsData: false
  },
  {
    kind: "same-byte-copy",
    source: "Textures/Rocks/Small_Stones_Normal.png",
    sourceSha256: "09b9fb8dafac135976192b86e7be4e09e570dbbee32ee0dc421dbdcc6804a906",
    output: "rocks/small-stones-normal-1024.png",
    sourceSize: 1024,
    alphaIsData: false
  },
  {
    kind: "glb",
    source: "Models/Rocks/Stone_1.fbx",
    sourceSha256: "d7c476c417f76c6c63a8d819e593d11421c0e0f91de6953b0a630b5f2221d56f",
    output: "models/stone-1.glb",
    baseMeshName: "Stone_1"
  },
  {
    kind: "glb",
    source: "Models/Rocks/Stone_2.fbx",
    sourceSha256: "1a478672201d49a4e7b8b1544bad900034a802bdac93854f55578f5aceba6c89",
    output: "models/stone-2.glb",
    baseMeshName: "Stone_2"
  },
  {
    kind: "glb",
    source: "Models/Rocks/Small_Stone_1.fbx",
    sourceSha256: "2b0dca0cf6a8b54a49402916cfe1b4b6b8168510574a1b57f8bd2eed3c4e44a4",
    output: "models/small-stone-1.glb",
    baseMeshName: "Small_Stone_1"
  },
  {
    kind: "glb",
    source: "Models/Rocks/Small_Stone_2.fbx",
    sourceSha256: "6249650b67d82aa8c99de7c8ec5387e90066a927eb1b413ca73355b33aec53ee",
    output: "models/small-stone-2.glb",
    baseMeshName: "Small_Stone_2"
  },
  {
    kind: "glb",
    source: "Models/Rocks/Small_Stone_3.fbx",
    sourceSha256: "1a0112e5a986263258d3813ab45d7a51c0b7168b69f50ce91a1115aefe6bd75d",
    output: "models/small-stone-3.glb",
    baseMeshName: "Small_Stone_3"
  }
]);

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(
        "Usage: derive-p0-environment-assets.mjs --source-root <Assets> --output-root <environment> --raw-glb-root <FBX2glTF output> --pngjs-module <pngjs package directory>"
      );
    }
    values.set(key.slice(2), value);
  }
  for (const key of ["source-root", "output-root", "raw-glb-root", "pngjs-module"]) {
    if (!values.has(key)) throw new Error(`Missing required --${key} argument.`);
  }
  return Object.freeze({
    sourceRoot: resolve(values.get("source-root")),
    outputRoot: resolve(values.get("output-root")),
    rawGlbRoot: resolve(values.get("raw-glb-root")),
    pngjsModule: resolve(values.get("pngjs-module"))
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireSourceHash(path, bytes, expected) {
  const actual = sha256(bytes);
  if (actual !== expected) {
    throw new Error(`Source SHA-256 mismatch for ${path}: expected ${expected}, received ${actual}.`);
  }
}

function decodeSrgb(value) {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function encodeSrgb(value) {
  const clamped = Math.min(1, Math.max(0, value));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

function downsampleAlbedo(source, alphaIsData) {
  const width = source.width / 2;
  const height = source.height / 2;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outputOffset = (y * width + x) * 4;
      const samples = [
        (y * 2 * source.width + x * 2) * 4,
        (y * 2 * source.width + x * 2 + 1) * 4,
        ((y * 2 + 1) * source.width + x * 2) * 4,
        ((y * 2 + 1) * source.width + x * 2 + 1) * 4
      ];
      for (let channel = 0; channel < 3; channel++) {
        let linear = 0;
        for (const sample of samples) linear += decodeSrgb(source.data[sample + channel]);
        data[outputOffset + channel] = encodeSrgb(linear / samples.length);
      }
      let alpha = 0;
      for (const sample of samples) alpha += source.data[sample + 3];
      data[outputOffset + 3] = alphaIsData ? Math.round(alpha / samples.length) : 255;
    }
  }
  return { width, height, data };
}

function downsampleNormal(source) {
  const width = source.width / 2;
  const height = source.height / 2;
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const outputOffset = (y * width + x) * 4;
      const samples = [
        (y * 2 * source.width + x * 2) * 4,
        (y * 2 * source.width + x * 2 + 1) * 4,
        ((y * 2 + 1) * source.width + x * 2) * 4,
        ((y * 2 + 1) * source.width + x * 2 + 1) * 4
      ];
      let normalX = 0;
      let normalY = 0;
      let normalZ = 0;
      for (const sample of samples) {
        normalX += source.data[sample] / 127.5 - 1;
        normalY += source.data[sample + 1] / 127.5 - 1;
        normalZ += source.data[sample + 2] / 127.5 - 1;
      }
      const inverseLength = 1 / (Math.hypot(normalX, normalY, normalZ) || 1);
      data[outputOffset] = Math.round((normalX * inverseLength * 0.5 + 0.5) * 255);
      data[outputOffset + 1] = Math.round((normalY * inverseLength * 0.5 + 0.5) * 255);
      data[outputOffset + 2] = Math.round((normalZ * inverseLength * 0.5 + 0.5) * 255);
      data[outputOffset + 3] = 255;
    }
  }
  return { width, height, data };
}

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    throw new Error("FBX2glTF output is not a glTF 2.0 binary.");
  }
  const declaredLength = bytes.readUInt32LE(8);
  if (declaredLength !== bytes.byteLength) {
    throw new Error(`GLB length mismatch: header ${declaredLength}, actual ${bytes.byteLength}.`);
  }
  let offset = 12;
  let json;
  let binary;
  while (offset < bytes.byteLength) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8").trimEnd());
    if (chunkType === 0x004e4942) binary = chunk;
    offset += 8 + chunkLength;
  }
  if (!json || !binary) throw new Error("GLB must contain JSON and BIN chunks.");
  return { json, binary };
}

function align4(value) {
  return (value + 3) & ~3;
}

function writeGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.byteLength);
  const binaryLength = align4(binary.byteLength);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binaryLength, 0);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.byteLength, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(0x4e4f534a, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonLength);
  const binaryHeader = 20 + jsonLength;
  output.writeUInt32LE(binaryLength, binaryHeader);
  output.writeUInt32LE(0x004e4942, binaryHeader + 4);
  binary.copy(output, binaryHeader + 8);
  return output;
}

function readAccessorValues(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  const bufferView = json.bufferViews[accessor.bufferView];
  const componentCount = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const componentSize = { 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType];
  if (!componentCount || !componentSize || accessor.normalized) {
    throw new Error(`Unsupported accessor ${accessorIndex} layout.`);
  }
  const stride = bufferView.byteStride ?? componentCount * componentSize;
  const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const values = Array.from({ length: accessor.count }, () => new Array(componentCount));
  for (let element = 0; element < accessor.count; element++) {
    for (let component = 0; component < componentCount; component++) {
      const offset = start + element * stride + component * componentSize;
      values[element][component] =
        accessor.componentType === 5126
          ? binary.readFloatLE(offset)
          : accessor.componentType === 5125
            ? binary.readUInt32LE(offset)
            : binary.readUInt16LE(offset);
    }
  }
  return values;
}

function createTangents(positions, normals, uvs, indices) {
  const accumulatedS = Array.from({ length: positions.length }, () => [0, 0, 0]);
  const accumulatedT = Array.from({ length: positions.length }, () => [0, 0, 0]);
  for (let triangle = 0; triangle < indices.length; triangle += 3) {
    const i0 = indices[triangle][0];
    const i1 = indices[triangle + 1][0];
    const i2 = indices[triangle + 2][0];
    const p0 = positions[i0];
    const p1 = positions[i1];
    const p2 = positions[i2];
    const uv0 = uvs[i0];
    const uv1 = uvs[i1];
    const uv2 = uvs[i2];
    const x1 = p1[0] - p0[0];
    const x2 = p2[0] - p0[0];
    const y1 = p1[1] - p0[1];
    const y2 = p2[1] - p0[1];
    const z1 = p1[2] - p0[2];
    const z2 = p2[2] - p0[2];
    const s1 = uv1[0] - uv0[0];
    const s2 = uv2[0] - uv0[0];
    const t1 = uv1[1] - uv0[1];
    const t2 = uv2[1] - uv0[1];
    const determinant = s1 * t2 - s2 * t1;
    if (Math.abs(determinant) <= 1e-12) continue;
    const inverse = 1 / determinant;
    const sDirection = [(t2 * x1 - t1 * x2) * inverse, (t2 * y1 - t1 * y2) * inverse, (t2 * z1 - t1 * z2) * inverse];
    const tDirection = [(s1 * x2 - s2 * x1) * inverse, (s1 * y2 - s2 * y1) * inverse, (s1 * z2 - s2 * z1) * inverse];
    for (const index of [i0, i1, i2]) {
      for (let axis = 0; axis < 3; axis++) {
        accumulatedS[index][axis] += sDirection[axis];
        accumulatedT[index][axis] += tDirection[axis];
      }
    }
  }
  return normals.map((normal, index) => {
    const tangent = accumulatedS[index];
    const normalDotTangent = normal[0] * tangent[0] + normal[1] * tangent[1] + normal[2] * tangent[2];
    let tangentX = tangent[0] - normal[0] * normalDotTangent;
    let tangentY = tangent[1] - normal[1] * normalDotTangent;
    let tangentZ = tangent[2] - normal[2] * normalDotTangent;
    const inverseLength = 1 / (Math.hypot(tangentX, tangentY, tangentZ) || 1);
    tangentX *= inverseLength;
    tangentY *= inverseLength;
    tangentZ *= inverseLength;
    const crossX = normal[1] * tangentZ - normal[2] * tangentY;
    const crossY = normal[2] * tangentX - normal[0] * tangentZ;
    const crossZ = normal[0] * tangentY - normal[1] * tangentX;
    const bitangent = accumulatedT[index];
    const handedness = crossX * bitangent[0] + crossY * bitangent[1] + crossZ * bitangent[2] < 0 ? -1 : 1;
    return [tangentX, tangentY, tangentZ, handedness];
  });
}

function createGeometryOnlyGlb(bytes, baseMeshName) {
  const { json, binary } = parseGlb(bytes);
  const sourceMeshIndex = json.meshes?.findIndex(({ name }) => name === baseMeshName) ?? -1;
  if (sourceMeshIndex < 0) throw new Error(`FBX2glTF output does not contain base mesh "${baseMeshName}".`);
  const sourceMesh = json.meshes[sourceMeshIndex];
  if (sourceMesh.primitives?.length !== 1) {
    throw new Error(`Base mesh "${baseMeshName}" must contain exactly one primitive.`);
  }
  const sourcePrimitive = sourceMesh.primitives[0];
  const attributeEntries = Object.entries(sourcePrimitive.attributes ?? {});
  const requiredAttributes = ["POSITION", "NORMAL", "TEXCOORD_0"];
  if (
    sourcePrimitive.indices === undefined ||
    requiredAttributes.some((attribute) => !attributeEntries.some(([name]) => name === attribute))
  ) {
    throw new Error(`Base mesh "${baseMeshName}" must contain indices, POSITION, NORMAL, and TEXCOORD_0.`);
  }

  const sourceAccessorIndices = [...attributeEntries.map(([, index]) => index), sourcePrimitive.indices];
  const sourceAttributeMap = Object.fromEntries(attributeEntries);
  const tangents = createTangents(
    readAccessorValues(json, binary, sourceAttributeMap.POSITION),
    readAccessorValues(json, binary, sourceAttributeMap.NORMAL),
    readAccessorValues(json, binary, sourceAttributeMap.TEXCOORD_0),
    readAccessorValues(json, binary, sourcePrimitive.indices)
  );
  const sourceBufferViewIndices = [];
  for (const accessorIndex of sourceAccessorIndices) {
    const accessor = json.accessors[accessorIndex];
    if (!accessor || accessor.bufferView === undefined || accessor.sparse) {
      throw new Error(`Base mesh "${baseMeshName}" uses an unsupported accessor layout.`);
    }
    if (!sourceBufferViewIndices.includes(accessor.bufferView)) sourceBufferViewIndices.push(accessor.bufferView);
  }

  const bufferViewMap = new Map();
  const nextBufferViews = [];
  const binaryParts = [];
  let binaryByteLength = 0;
  for (const sourceBufferViewIndex of sourceBufferViewIndices) {
    const sourceBufferView = json.bufferViews[sourceBufferViewIndex];
    if (sourceBufferView.buffer !== 0) throw new Error("Only one FBX2glTF binary buffer is supported.");
    const alignedOffset = align4(binaryByteLength);
    if (alignedOffset > binaryByteLength) binaryParts.push(Buffer.alloc(alignedOffset - binaryByteLength));
    const start = sourceBufferView.byteOffset ?? 0;
    const part = binary.subarray(start, start + sourceBufferView.byteLength);
    binaryParts.push(part);
    binaryByteLength = alignedOffset + part.byteLength;
    bufferViewMap.set(sourceBufferViewIndex, nextBufferViews.length);
    nextBufferViews.push({
      ...sourceBufferView,
      buffer: 0,
      byteOffset: alignedOffset
    });
  }

  const accessorMap = new Map();
  const nextAccessors = sourceAccessorIndices.map((sourceAccessorIndex, nextAccessorIndex) => {
    accessorMap.set(sourceAccessorIndex, nextAccessorIndex);
    const sourceAccessor = json.accessors[sourceAccessorIndex];
    return {
      ...sourceAccessor,
      bufferView: bufferViewMap.get(sourceAccessor.bufferView)
    };
  });
  const nextAttributes = Object.fromEntries(
    attributeEntries.map(([name, accessorIndex]) => [name, accessorMap.get(accessorIndex)])
  );
  const tangentByteOffset = align4(binaryByteLength);
  if (tangentByteOffset > binaryByteLength) binaryParts.push(Buffer.alloc(tangentByteOffset - binaryByteLength));
  const tangentBytes = Buffer.alloc(tangents.length * 16);
  tangents.forEach((tangent, index) => {
    tangent.forEach((component, componentIndex) => {
      tangentBytes.writeFloatLE(component, index * 16 + componentIndex * 4);
    });
  });
  binaryParts.push(tangentBytes);
  binaryByteLength = tangentByteOffset + tangentBytes.byteLength;
  const tangentBufferViewIndex = nextBufferViews.length;
  nextBufferViews.push({
    buffer: 0,
    byteOffset: tangentByteOffset,
    byteLength: tangentBytes.byteLength,
    target: 34962
  });
  const tangentAccessorIndex = nextAccessors.length;
  nextAccessors.push({
    bufferView: tangentBufferViewIndex,
    componentType: 5126,
    count: tangents.length,
    type: "VEC4"
  });
  nextAttributes.TANGENT = tangentAccessorIndex;
  const positionAccessor = nextAccessors[nextAttributes.POSITION];
  const nextBinary = Buffer.concat(binaryParts);
  const nextJson = {
    asset: {
      generator: `${json.asset?.generator ?? "FBX2glTF"}; Grasslands P0 geometry-only base-mesh prune`,
      version: "2.0"
    },
    scene: 0,
    scenes: [{ name: "Root Scene", nodes: [0] }],
    nodes: [{ name: baseMeshName, mesh: 0 }],
    meshes: [
      {
        name: baseMeshName,
        primitives: [
          {
            attributes: nextAttributes,
            indices: accessorMap.get(sourcePrimitive.indices),
            mode: sourcePrimitive.mode ?? 4
          }
        ]
      }
    ],
    accessors: nextAccessors,
    bufferViews: nextBufferViews,
    buffers: [{ byteLength: align4(nextBinary.byteLength) }]
  };
  const output = writeGlb(nextJson, nextBinary);
  return {
    output,
    metadata: {
      meshCount: 1,
      primitiveCount: 1,
      vertexCount: positionAccessor.count,
      triangleCount: nextAccessors[accessorMap.get(sourcePrimitive.indices)].count / 3,
      attributes: Object.keys(nextAttributes).sort(),
      bounds: {
        minimum: positionAccessor.min,
        maximum: positionAccessor.max
      }
    }
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const require = createRequire(import.meta.url);
  const { PNG } = require(args.pngjsModule);

  await mkdir(args.outputRoot, { recursive: true });
  const receipt = [];
  for (const asset of SOURCE_ASSETS) {
    const sourcePath = join(args.sourceRoot, asset.source);
    const sourceBytes = await readFile(sourcePath);
    requireSourceHash(sourcePath, sourceBytes, asset.sourceSha256);
    const outputPath = join(args.outputRoot, asset.output);
    await mkdir(resolve(outputPath, ".."), { recursive: true });

    let conversion;
    if (asset.kind === "same-byte-copy") {
      await copyFile(sourcePath, outputPath);
      conversion = { kind: "same-byte-copy" };
    } else if (asset.kind === "glb") {
      const rawGlbPath = join(args.rawGlbRoot, `${asset.baseMeshName}.glb`);
      const rawGlb = await readFile(rawGlbPath);
      const rawGlbDocument = parseGlb(rawGlb).json;
      if (rawGlbDocument.asset?.generator !== "FBX2glTF v0.13.1") {
        throw new Error(
          `Expected FBX2glTF v0.13.1 output for ${rawGlbPath}, received ${String(rawGlbDocument.asset?.generator)}.`
        );
      }
      const pruned = createGeometryOnlyGlb(rawGlb, asset.baseMeshName);
      await writeFile(outputPath, pruned.output);
      conversion = {
        kind: "fbx2gltf-v0.13.1-base-mesh-geometry-only",
        command: [
          "FBX2glTF",
          "--binary",
          "--compute-normals",
          "missing",
          "--keep-attribute",
          "position",
          "--keep-attribute",
          "normal",
          "--keep-attribute",
          "uv0"
        ],
        rawConverterOutputPath: rawGlbPath,
        rawConverterOutputSha256: sha256(rawGlb),
        ...pruned.metadata
      };
    } else {
      const source = PNG.sync.read(sourceBytes, { checkCRC: true });
      if (
        source.width !== asset.sourceSize ||
        source.height !== asset.sourceSize ||
        source.width % 2 !== 0 ||
        source.height % 2 !== 0
      ) {
        throw new Error(`Unexpected source dimensions for ${sourcePath}: ${source.width}x${source.height}.`);
      }
      const downsampled =
        asset.kind === "normal" ? downsampleNormal(source) : downsampleAlbedo(source, asset.alphaIsData);
      const output = PNG.sync.write(downsampled, {
        colorType: asset.alphaIsData ? 6 : 2,
        inputHasAlpha: true,
        bitDepth: 8,
        deflateLevel: 9,
        deflateStrategy: 3
      });
      await writeFile(outputPath, output);
      conversion = {
        kind:
          asset.kind === "normal"
            ? "2x2-vector-average-renormalize"
            : "2x2-linear-light-rgb-and-independent-scalar-alpha",
        tool: "pngjs@7.0.0",
        width: downsampled.width,
        height: downsampled.height,
        alphaIsData: asset.alphaIsData
      };
    }

    const outputBytes = await readFile(outputPath);
    receipt.push({
      sourcePath,
      sourceSha256: asset.sourceSha256,
      outputPath,
      outputSha256: sha256(outputBytes),
      outputByteLength: outputBytes.byteLength,
      conversion
    });
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        schemaVersion: 1,
        converterVersion: "FBX2glTF version 0.13.1",
        pngTool: "pngjs@7.0.0",
        sourceRoot: args.sourceRoot,
        outputRoot: args.outputRoot,
        assets: receipt
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
