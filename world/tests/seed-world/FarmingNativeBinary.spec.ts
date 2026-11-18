import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBufferMeshData } from "@galacean/engine-loader";
import { IndexFormat, InterpolationType, Loader, Transform, type Engine } from "@galacean/engine-core";
import { AnimationClipDecoder } from "../../../packages/loader/src/resource-deserialize/resources/animationClip/AnimationClipDecoder";
import { BufferReader } from "../../../packages/loader/src/resource-deserialize/utils/BufferReader";
import { FileHeader } from "../../../packages/loader/src/resource-deserialize/utils/FileHeader";
import manifest from "../../../packages/farming/src/farming/native/assets/manifest.json";

const farming = fileURLToPath(new URL("../../../packages/farming/src/farming/", import.meta.url));
const GLB_HEADER_BYTES = 12,
  GLB_CHUNK_HEADER_BYTES = 8,
  FLOAT_BYTES = Float32Array.BYTES_PER_ELEMENT;
interface GLBDocument {
  accessors: { count: number; bufferView: number; byteOffset?: number; componentType: number; type: "SCALAR" | "VEC3" | "VEC4"; min?: number[]; max?: number[] }[];
  bufferViews: { byteOffset?: number; byteStride?: number }[];
  nodes: { name: string; children?: number[] }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: "translation" | "rotation" | "scale" } }[]; samplers: { input: number; output: number; interpolation?: "LINEAR" | "STEP" }[] }[];
  meshes: { primitives: { attributes: Record<string, number>; indices: number }[] }[];
}
function readGLB(category: string, prop: string) {
  const source = readFileSync(path.join(farming, "assets", category.toLowerCase(), `${prop}.glb`));
  const jsonSize = source.readUInt32LE(GLB_HEADER_BYTES);
  const jsonStart = GLB_HEADER_BYTES + GLB_CHUNK_HEADER_BYTES;
  const document: GLBDocument = JSON.parse(source.subarray(jsonStart, jsonStart + jsonSize).toString("utf8"));
  return { source, document, binaryStart: jsonStart + jsonSize + GLB_CHUNK_HEADER_BYTES };
}

Loader.registerClass("Transform", Transform);
for (const file of manifest.filter((entry) => entry.type === "AnimationClip")) {
  it(`decodes ${file.file} with native animation curves matching the GLB source`, async () => {
    const [category, prop] = file.file.split("/");
    const { source, document, binaryStart } = readGLB(category, prop);
    const readFloats = (accessorIndex: number) => {
      const accessor = document.accessors[accessorIndex];
      expect(accessor.componentType).toBe(5126);
      const dimensions = { SCALAR: 1, VEC3: 3, VEC4: 4 }[accessor.type];
      const view = document.bufferViews[accessor.bufferView];
      const offset = binaryStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
      const stride = view.byteStride ?? dimensions * FLOAT_BYTES;
      return Array.from({ length: accessor.count }, (_, key) =>
        Array.from({ length: dimensions }, (_, axis) => source.readFloatLE(offset + key * stride + axis * FLOAT_BYTES))
      );
    };
    const bytes = Uint8Array.from(readFileSync(path.join(farming, "native/assets", file.file)));
    const header = FileHeader.decode(bytes.buffer);
    expect(header.type).toBe("AnimationClip");
    expect(header.totalLength).toBe(bytes.byteLength);
    const reader = new BufferReader(bytes, header.headerLength, header.dataLength, true, header);
    const clip = await AnimationClipDecoder.decode({} as Engine, reader);
    const animation = document.animations.find((entry) => entry.name === clip.name)!;
    expect(clip.curveBindings).toHaveLength(animation.channels.length);
    const parents = new Map(document.nodes.flatMap((node, parent) => (node.children ?? []).map((child) => [child, parent] as const)));
    let length = 0;
    animation.channels.forEach((channel, index) => {
      const sampler = animation.samplers[channel.sampler];
      const times = readFloats(sampler.input).flat();
      const values = readFloats(sampler.output);
      const binding = clip.curveBindings[index];
      const names = [document.nodes[channel.target.node].name];
      for (let node = channel.target.node; parents.has(node); ) names.unshift(document.nodes[(node = parents.get(node)!)].name);
      expect(binding.relativePath).toBe(names.join("/"));
      expect(binding.type).toBe(Transform);
      expect(binding.property).toBe({ translation: "position", rotation: "rotationQuaternion", scale: "scale" }[channel.target.path]);
      expect(binding.curve!.interpolation).toBe(sampler.interpolation === "STEP" ? InterpolationType.Step : InterpolationType.Linear);
      expect(binding.curve!.keys).toHaveLength(times.length);
      binding.curve!.keys.forEach((key, keyIndex) => {
        expect(key.time).toBe(times[keyIndex]);
        expect(key.value).toMatchObject(Object.fromEntries(values[keyIndex].map((value, axis) => [["x", "y", "z", "w"][axis], value])));
      });
      length = Math.max(length, ...times);
    });
    expect(clip.length).toBe(length);
    expect(reader.position).toBe(header.dataLength);
  });
}
for (const file of manifest.filter((entry) => entry.type === "Mesh")) {
  it(`decodes ${file.file} with the native loader and matches its GLB source`, () => {
    const [category, prop, mesh] = file.file.split("/");
    const { document } = readGLB(category, prop);
    const match = /^mesh-(\d+)-(\d+)\.mesh$/.exec(mesh)!;
    const primitive = document.meshes[Number(match[1])].primitives[Number(match[2])];
    const position = document.accessors[primitive.attributes.POSITION],
      indices = document.accessors[primitive.indices];
    const native = parseBufferMeshData(Uint8Array.from(readFileSync(path.join(farming, "native/assets", file.file))).buffer);
    const element = native.data.vertexElements.find((entry) => entry.attribute === "POSITION")!;
    const binding = native.data.vertexBuffers[element.bindingIndex];
    expect(native.vertices[element.bindingIndex].byteLength / binding.stride).toBe(position.count);
    const indexBytes = { [IndexFormat.UInt8]: 1, [IndexFormat.UInt16]: 2, [IndexFormat.UInt32]: 4 }[native.data.indices.format];
    expect(native.indexBytes.byteLength / indexBytes).toBe(indices.count);
    const view = new DataView(native.vertices[element.bindingIndex].buffer, native.vertices[element.bindingIndex].byteOffset);
    (["x", "y", "z"] as const).forEach((axis, index) => {
      const values = Array.from({ length: position.count }, (_, vertex) =>
        view.getFloat32(vertex * binding.stride + element.offset + index * FLOAT_BYTES, true)
      );
      expect(native.data.bounds.min[axis]).toBeCloseTo(Math.min(...values));
      expect(native.data.bounds.max[axis]).toBeCloseTo(Math.max(...values));
      if (position.min) expect(native.data.bounds.min[axis]).toBeCloseTo(position.min[index]);
      if (position.max) expect(native.data.bounds.max[axis]).toBeCloseTo(position.max[index]);
    });
  });
}
