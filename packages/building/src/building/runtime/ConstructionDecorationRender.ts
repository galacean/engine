import type { BuildingLampMaterials } from "./BuildingLampShaderBinding";
import { buildingPartKey, buildingGroupKey } from "./BuildingObjectIdentity";
const decorationBindingKey = (part: { decorationId?: string; ownerId: string }) =>
  part.decorationId !== undefined ? buildingPartKey(part.decorationId) : buildingGroupKey(part.ownerId);
import {
  packDecorationMaterial,
  validDecorationMaterial,
  decorationMaterialStride
} from "./ConstructionDecorationMaterial";
import { materialProgram } from "../resources/BuildingAssetKit";

import type { ConstructionAssetLoader } from "./ConstructionBindings";
import type { ResidentPackage } from "./EngineResidentScene";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import { areUvsFinite, uvCount, uvU, uvV, type PackedUv2 } from "./ConstructionPreview";
import { masonryTintGLSL, masonryTintRoles, masonrySourceColorAt, whiteMasonryVertexColors } from "./MasonryAppearance";

export interface ConstructionRenderResult {
  package: ResidentPackage;
  asset: ConstructionAssetLoader;
  dynamicFiles: readonly string[];
}
/** Original window geometry, UVs, timber texture and glass material calculations
 * plus the original door/lantern material calculations, with host scene lighting.
 * The common resident adapter supplies the
 * camera, signed LOD coverage, picking and resource lifetime without GPU readback.
 */
/** Add one merged, camera-independent draw per owner. The same vertices remain
 * resident for near/mid transitions and camera turns. Authoring edits build a
 * replacement package through the world's serialized publication transaction. */
export function appendDecorationRenderPackage(
  base: ConstructionRenderResult,
  parts: readonly ConstructionDecorationPart[],
  rigidPoses?: ReadonlyMap<string, readonly number[]>,
  lampMaterials?: BuildingLampMaterials
): ConstructionRenderResult {
  if (!parts.length) return base;
  const vertexFloats = 20,
    stride = vertexFloats * Float32Array.BYTES_PER_ELEMENT;
  const assets = base.package.nativeAssets!;
  const groups = new Map<string, ConstructionDecorationPart[]>();
  for (const part of parts) {
    const count = part.positions.length / 3;
    if (
      !Number.isInteger(count) ||
      part.normals.length !== count * 3 ||
      part.colors.length !== count * 3 ||
      part.emission.length !== count ||
      (part.wallBakeReceiver && part.lightmapUVs?.length !== count * 2) ||
      (part.tintMask !== undefined && part.tintMask.length !== count) ||
      part.indices.length % 3 ||
      !part.indices.every((i) => Number.isInteger(i) && i >= 0 && i < count)
    )
      throw Error("Invalid decoration geometry " + part.id);
    for (const values of [part.positions, part.normals, part.colors, part.emission])
      if (!values.every(Number.isFinite)) throw Error("Nonfinite decoration geometry " + part.id);
    if (
      part.appearance &&
      (uvCount(part.appearance.materialUVs as unknown as PackedUv2) !== count ||
        part.appearance.kinds.length !== count ||
        part.appearance.colorIds.length !== count ||
        part.appearance.centers.length !== count * 3 ||
        !areUvsFinite(part.appearance.materialUVs as unknown as PackedUv2) ||
        !part.appearance.kinds.every((v, i) => validDecorationMaterial(v, part.appearance!.colorIds[i])) ||
        !part.appearance.centers.every(Number.isFinite))
    )
      throw Error("Invalid decoration appearance " + part.id);
    const material = part.assetUnit ? assets.decorations[part.assetUnit]?.material : assets.decorationMaterial;
    if (!material) throw Error("Missing native decoration Material: " + part.assetUnit);
    const key = JSON.stringify([
      part.ownerId,
      material.instanceId,
      Boolean(part.wallBakeReceiver),
      lampMaterials?.has(part.id) ? part.id : undefined
    ]);
    const group = groups.get(key) ?? [];
    group.push(part);
    groups.set(key, group);
  }
  const files = new Map<string, ArrayBuffer>(),
    draws = base.package.draws.slice(),
    programs = { ...base.package.programs };
  for (const [groupKey, group] of groups) {
    const ownerId = group[0].ownerId;
    const lampId = lampMaterials?.has(group[0].id) ? group[0].id : undefined;
    const nativeMaterial = group[0].assetUnit
      ? assets.decorations[group[0].assetUnit]!.material!
      : assets.decorationMaterial;
    const program = materialProgram(nativeMaterial);
    const define = (source: string) =>
      source.replace(
        "#version 300 es",
        // The native decoration shader keeps its palette tint behind this macro.
        "#version 300 es\n#define BUILDING_WHITE_BASE\n" + (rigidPoses ? "#define BUILDING_RIGID\n" : "")
      );
    const programId = "host-decoration/" + nativeMaterial.instanceId;
    programs[programId] = {
      vert: { source: define(program.vert.source) },
      frag: { source: define(program.frag.source) }
    };
    const count = group.reduce((n, p) => n + p.positions.length / 3, 0),
      vertices = new Float32Array(count * vertexFloats),
      lightmapUVs = group[0].wallBakeReceiver ? new Float32Array(count * 2) : undefined,
      useU16Indices = count <= 65535,
      indices = useU16Indices
        ? new Uint16Array(group.reduce((n, p) => n + p.indices.length, 0))
        : new Uint32Array(group.reduce((n, p) => n + p.indices.length, 0)),
      pickIndices = new Float32Array(count),
      pickIds = [...new Set(group.map((part) => decorationBindingKey(part)))];
    const pickSlots = new Map(pickIds.map((id, index) => [id, index]));
    let vertexOffset = 0,
      indexOffset = 0;
    for (const part of group) {
      if (lightmapUVs) lightmapUVs.set(part.lightmapUVs!, vertexOffset * 2);
      pickIndices.fill(
        pickSlots.get(decorationBindingKey(part))!,
        vertexOffset,
        vertexOffset + part.positions.length / 3
      );
      const colors = part.tintRole ? whiteMasonryVertexColors(part.colors, part.tintMask) : part.colors;
      const matUVs = part.appearance?.materialUVs as unknown as PackedUv2 | undefined;
      const centers = part.appearance?.centers;
      const vCount = part.positions.length / 3;
      const tintRoleIdx = part.tintRole ? masonryTintRoles.indexOf(part.tintRole) : -1;
      for (let i = 0; i < vCount; i++) {
        const offset = (vertexOffset + i) * vertexFloats;
        const i3 = i * 3;
        vertices[offset] = part.positions[i3]!;
        vertices[offset + 1] = part.positions[i3 + 1]!;
        vertices[offset + 2] = part.positions[i3 + 2]!;
        vertices[offset + 3] = part.normals[i3]!;
        vertices[offset + 4] = part.normals[i3 + 1]!;
        vertices[offset + 5] = part.normals[i3 + 2]!;
        vertices[offset + 6] = colors[i3]!;
        vertices[offset + 7] = colors[i3 + 1]!;
        vertices[offset + 8] = colors[i3 + 2]!;
        vertices[offset + 9] = part.emission[i]!;
        vertices[offset + 10] = uvU(matUVs, i, 0);
        vertices[offset + 11] = uvV(matUVs, i, 0);
        vertices[offset + 12] = packDecorationMaterial(
          part.appearance?.kinds[i] ?? 0,
          part.appearance?.colorIds[i] ?? 0
        );
        vertices[offset + 13] = centers ? centers[i3]! : 0;
        vertices[offset + 14] = centers ? centers[i3 + 1]! : 0;
        vertices[offset + 15] = centers ? centers[i3 + 2]! : 0;
        const tinted = tintRoleIdx >= 0 && part.tintMask?.[i] !== false;
        vertices[offset + 16] = tinted ? tintRoleIdx : -1;
        if (tinted) {
          const gray = colors[i3]!;
          vertices[offset + 17] = gray > 0 ? part.colors[i3]! / gray : 1;
          vertices[offset + 18] = gray > 0 ? part.colors[i3 + 1]! / gray : 1;
          vertices[offset + 19] = gray > 0 ? part.colors[i3 + 2]! / gray : 1;
        } else {
          vertices[offset + 17] = 1;
          vertices[offset + 18] = 1;
          vertices[offset + 19] = 1;
        }
      }
      for (const i of part.indices) indices[indexOffset++] = vertexOffset + i;
      vertexOffset += part.positions.length / 3;
    }
    const id =
        "decorations/" +
        encodeURIComponent(ownerId) +
        (nativeMaterial === assets.decorationMaterial ? "" : "/" + nativeMaterial.instanceId) +
        (group[0].wallBakeReceiver ? "/wall-backing" : "") +
        (lampId === undefined ? "" : "/lamp/" + encodeURIComponent(lampId)),
      vertexFile = "dynamic/" + id + "/vertices.bin",
      indexFile = "dynamic/" + id + "/indices.bin";
    if (draws.some((d) => d.id === id)) throw Error("Duplicate decoration owner " + ownerId);
    files.set(vertexFile, vertices.buffer);
    const lightmapFile = "dynamic/" + id + "/lightmap-uv.bin";
    if (lightmapUVs) files.set(lightmapFile, lightmapUVs.buffer);
    const pickFile = "dynamic/" + id + "/pick.bin";
    files.set(pickFile, pickIndices.buffer);
    files.set(indexFile, indices.buffer);
    draws.push({
      id,
      ownerId,
      lampId,
      wallBakeReceiver: group[0].wallBakeReceiver,
      pickIds,
      ...(rigidPoses
        ? {
            rigidBindings: pickIds.map((id) => {
              const inverseBind = rigidPoses.get(id);
              if (!inverseBind) throw Error("Missing rigid decoration binding " + id);
              const min = [Infinity, Infinity, Infinity],
                max = [-Infinity, -Infinity, -Infinity];
              for (const part of group)
                if (decorationBindingKey(part) === id)
                  for (let i = 0; i < part.positions.length; i++) {
                    const axis = i % 3,
                      value = part.positions[i];
                    // The native correlated plaster warp is bounded by .03m in X/Z.
                    const padding = axis === 1 ? 0 : 0.03;
                    min[axis] = Math.min(min[axis], value - padding);
                    max[axis] = Math.max(max[axis], value + padding);
                  }
              return { id, inverseBind: [...inverseBind], min, max };
            })
          }
        : {}),
      family: "decoration",
      program: programId,
      nativeMaterial,
      count: 1,
      indexCount: indices.length,
      indices: indexFile,
      attributes: [
        ...(lightmapUVs ? [{ location: 13, size: 2, stride: 8, offset: 0, file: lightmapFile }] : []),
        { location: 9, size: 1, stride: 4, offset: 0, file: pickFile },
        { location: 0, size: 3, stride, offset: 0, file: vertexFile },
        { location: 1, size: 3, stride, offset: 12, file: vertexFile },
        { location: 2, size: 3, stride, offset: 24, file: vertexFile },
        { location: 3, size: 1, stride, offset: 36, file: vertexFile },
        { location: 4, size: 2, stride, offset: 40, file: vertexFile },
        { location: 5, size: 1, stride, offset: 48, file: vertexFile },
        { location: 6, size: 3, stride, offset: 52, file: vertexFile },
        { location: 7, size: 1, stride, offset: 64, file: vertexFile },
        { location: 8, size: 3, stride, offset: 68, file: vertexFile }
      ],
      resources: {
        material_WindowTimber: { kind: "texture", texture: "timberframe", array: true },
        material_WindowCurtains: { kind: "texture", texture: "menu/feedback/think", array: false },
        material_WindowIndoors: { kind: "texture", texture: "menu/feedback/aww", array: false },
        material_WindowGlass: { kind: "texture", texture: "window_glass", array: false }
      },
      instance_buffer: null,
      variant: null,
      group: null
    });
  }
  return {
    package: {
      ...base.package,
      programs,
      draws
    },
    dynamicFiles: [...base.dynamicFiles, ...files.keys()],
    asset: async (name) => files.get(name)?.slice(0) ?? base.asset(name)
  };
}
