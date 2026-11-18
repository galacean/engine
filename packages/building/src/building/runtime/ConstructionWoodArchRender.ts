import { createWoodArchAtlasMesh, woodArchAtlasLevel } from "./RecoveredWoodArchAtlas";
import { validateWoodArchFrame, type WoodArchFrameParams } from "./RecoveredWoodArchFrame";
import type { ConstructionRenderResult } from "./ConstructionDecorationRender";
import type { ConstructionPackageBuilder, ConstructionBindings } from "./ConstructionPackage";

export interface ConstructionWoodArchPart {
  id: string;
  ownerId: string;
  decorationId?: string;
  frame: WoodArchFrameParams;
  /** Resolved building wood palette. Identity and seeded UVs do not use colour. */
  colorId: number;
}

export interface ConstructionWoodArchPillar {
  id: string;
  ownerId: string;
  decorationId?: string;
  bytes: ArrayBuffer;
  colorId: number;
}

/** Keep native slot addressing, overriding only the attachment's palette.
 * Both the full and persistent render paths use these same owned bindings. */
export function addWoodArchPillarDraws(
  builder: ConstructionPackageBuilder,
  pillars: readonly ConstructionWoodArchPillar[],
  globals: ConstructionBindings
) {
  const batches = new Map<string, ConstructionWoodArchPillar[]>();
  for (const pillar of pillars) {
    const key = JSON.stringify([pillar.ownerId, pillar.colorId, pillar.decorationId]);
    const batch = batches.get(key) ?? [];
    batch.push(pillar);
    batches.set(key, batch);
  }
  for (const [key, batch] of batches) {
    const colors = globals.woodenColors?.slice();
    if (!colors || colors.byteLength % 4) throw Error("Wood arch pillars require a palette binding");
    const palette = new DataView(colors.buffer, colors.byteOffset, colors.byteLength);
    const instances = new Uint8Array(batch.length * 80);
    for (let i = 0; i < batch.length; i++) {
      const pillar = batch[i];
      if (pillar.bytes.byteLength !== 80) throw Error("Invalid wood arch pillar record");
      const slot = new DataView(pillar.bytes).getUint32(56, true);
      if (slot >= colors.byteLength / 4) throw Error("Wood arch pillar slot has no palette");
      palette.setUint32(slot * 4, pillar.colorId, true);
      instances.set(new Uint8Array(pillar.bytes), i * 80);
    }
    const draw = builder.addDraw({
      id: "decoration-wood-pillars/" + key,
      ownerId: batch[0].ownerId,
      template: "wood",
      instances,
      bindings: { woodenColors: colors }
    });
    draw.pickId = batch[0].decorationId;
  }
}

const textures = {
  material_data_wood_edge_damage: "wood_detail/edge_damage",
  material_data_wood_normal: "wood_detail/normal",
  material_data_wood_roughness: "wood_detail/roughness",
  material_data_dirtpath_heightmap: "dirtpath_heightmap",
  halftimber_colors_tex: "timberframe"
} as const;

/** Native record layout remains 56 bytes. Only the physical GPU pointer is
 * relocated: offset16 stores a uvec4 index into the owned 48-byte sample arena,
 * offset20 is reserved zero. No process address survives publication. */
export function packWoodArchFrames(parts: readonly ConstructionWoodArchPart[]) {
  let samplesLength = 0;
  const counts: number[] = [],
    levels: number[] = [];
  for (const part of parts) {
    const { frame, colorId } = part;
    const count = frame.records.length / 12;
    const level = woodArchAtlasLevel(count, frame.ends);
    validateWoodArchFrame(frame);
    if (!Number.isInteger(colorId) || colorId < 0 || colorId > 0xffffffff)
      throw Error("Invalid wood arch render frame");
    samplesLength += frame.records.length;
    if (!Number.isSafeInteger(samplesLength) || samplesLength > 0xffffffff)
      throw Error("Wood arch sample arena exceeds u32 address domain");
    counts.push(count);
    levels.push(level);
  }
  const instances = new Uint8Array(parts.length * 56),
    samples = new Float32Array(samplesLength);
  const data = new DataView(instances.buffer);
  let sampleOffset = 0;
  for (let index = 0; index < parts.length; index++) {
    const { frame, colorId } = parts[index],
      offset = index * 56;
    frame.centerRadius.forEach((v, i) => data.setFloat32(offset + i * 4, v, true));
    data.setUint32(offset + 16, sampleOffset / 4, true);
    data.setUint32(offset + 24, counts[index], true);
    data.setUint32(offset + 28, colorId, true);
    data.setUint32(offset + 32, levels[index], true);
    data.setUint32(offset + 36, frame.ends, true);
    frame.section.forEach((v, i) => data.setFloat32(offset + 40 + i * 4, v, true));
    data.setFloat32(offset + 52, frame.records[frame.records.length - 9], true);
    samples.set(frame.records, sampleOffset);
    sampleOffset += frame.records.length;
  }
  return { instances, samples, levels };
}

/** One draw per owner/curve resolution, immutable geometry shared within the
 * package. Existing resident ownership supplies camera, lighting, entrance,
 * transitions and context restoration. Curves stay on GPU; no vertex readback. */
export function appendWoodArchRenderPackage(
  base: ConstructionRenderResult,
  parts: readonly ConstructionWoodArchPart[],
  globals: ConstructionBindings
): ConstructionRenderResult {
  if (!parts.length) return base;
  if (!base.package.programs["wooden-arch-frame"]) throw Error("Missing wood arch program in construction library");
  const view = globals.view,
    frameConstants = globals.frame;
  if (
    !view ||
    view.byteLength < 1024 ||
    view.byteLength % 4 ||
    !frameConstants ||
    frameConstants.byteLength < 352 ||
    frameConstants.byteLength % 4
  )
    throw Error("Wood arches require view and frame bindings");
  for (const name of Object.values(textures))
    if (!base.package.textures[name]) throw Error("Wood arches require original texture " + name);
  const layers = (base.package.textures.timberframe.texture as import("@galacean/engine-core").Texture2DArray).length;
  const identities = new Set<string>(),
    groups = new Map<string, ConstructionWoodArchPart[]>();
  for (const part of parts) {
    if (!part.id || !part.ownerId || identities.has(part.id)) throw Error("Duplicate/empty wood arch identity");
    if (part.colorId >= layers) throw Error("Wood arch palette does not exist");
    identities.add(part.id);
    const level = woodArchAtlasLevel(part.frame.records.length / 12, part.frame.ends);
    const key = JSON.stringify([part.ownerId, level, part.decorationId]),
      group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }
  const files = new Map<string, ArrayBuffer>(),
    draws = base.package.draws.slice();
  const put = (name: string, bytes: Uint8Array) => {
    files.set(name, bytes.slice().buffer);
    return name;
  };
  for (const [key, group] of groups) {
    const packed = packWoodArchFrames(group),
      level = packed.levels[0],
      ownerId = group[0].ownerId;
    const id = "wood-arches/" + encodeURIComponent(key),
      prefix = "dynamic/" + id;
    if (draws.some((d) => d.id === id)) throw Error("Duplicate wood arch draw");
    const viewFile = put(prefix + "/view.bin", view);
    const frameFile = put(prefix + "/frame.bin", frameConstants);
    const instanceFile = put(prefix + "/instances.bin", packed.instances);
    const samplesFile = put(prefix + "/samples.bin", new Uint8Array(packed.samples.buffer));
    const indirection = Uint32Array.from(group, (_, i) => i);
    const listFile = put(prefix + "/list.bin", new Uint8Array(indirection.buffer));
    const vertexFile = `dynamic/wood-arches/atlas-${level}-vertices.bin`;
    const indexFile = `dynamic/wood-arches/atlas-${level}-indices.bin`;
    if (!files.has(vertexFile)) {
      const mesh = createWoodArchAtlasMesh(level);
      files.set(vertexFile, mesh.positions.buffer as ArrayBuffer);
      files.set(indexFile, new Uint32Array(mesh.indices).buffer);
    }
    draws.push({
      id,
      ownerId,
      pickId: group[0].decorationId,
      family: "wood-arch",
      program: "wooden-arch-frame",
      nativeMaterial: base.package.nativeAssets?.woodArchMaterial,
      count: group.length,
      indexCount: (1 << level) * 8 * 6,
      indices: indexFile,
      attributes: [{ location: 0, size: 3, stride: 12, offset: 0, file: vertexFile }],
      resources: {
        storage_0_0: { kind: "storage", file: instanceFile },
        storage_6_0: { kind: "storage", file: listFile },
        woodArchSamples: { kind: "storage", file: samplesFile },
        ViewConstants_natural: { kind: "uniform", file: viewFile },
        FrameConstants_natural: { kind: "uniform", file: frameFile },
        ...Object.fromEntries(
          Object.entries(textures).map(([uniform, texture]) => [
            uniform,
            { kind: "texture" as const, texture, array: texture === "timberframe" }
          ])
        )
      },
      indirection: "storage_6_0",
      instance_buffer: null,
      variant: null,
      group: null
    });
  }
  return {
    ...base,
    package: { ...base.package, draws },
    dynamicFiles: [...base.dynamicFiles, ...files.keys()],
    asset: async (name) => files.get(name)?.slice(0) ?? base.asset(name)
  };
}
