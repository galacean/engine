import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  CompareFunction,
  type Engine,
  type Entity,
  IndexBufferBinding,
  IndexFormat,
  Material,
  MeshRenderer,
  MeshTopology,
  Shader,
  ShaderFactory,
  ShaderLanguage,
  Vector3,
  Vector4,
  VertexElement,
  VertexElementFormat
} from "@galacean/engine";
import farProxyShaderSource from "./MasonryFarProxy.shader?raw";
import lodDither from "./MasonryLodDither.glsl?raw";
import { registerConstructionSceneLighting } from "./ConstructionSceneLighting";
import { constructionPlasterGLSL } from "./ConstructionPlasterShader";
import { plasterLinearColor } from "./ConstructionPlasterPalette";
import { constructionBrickLayer, type ConstructionPreviewPart } from "./ConstructionPreview";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { masonryAppearance, srgbToLinear } from "./MasonryAppearance";
import { buildingGroupKey, buildingPartKey } from "./BuildingObjectIdentity";
import type { SeedWorldPickBatch } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { restoreBuffer } from "@galacean/engine-modify/rendering/RestorableResources";

const FAR_PROXY_STRIDE_FLOATS = 16;
const FAR_PROXY_STRIDE_BYTES = FAR_PROXY_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
const PLASTER_NORMAL_BIAS_METRES = 0.06;
const STONE_PAVING_NORMAL_BIAS_METRES = 0.02;

const SURFACE_KIND_WALL = 0;
const SURFACE_KIND_ROOF_TILE = 1;
const SURFACE_KIND_WOODEN_PLANK = 2;
const SURFACE_KIND_PLASTER = 3;
const SURFACE_KIND_STONE_PAVING = 4;
const SURFACE_KIND_DECORATION = 5;
const SURFACE_KIND_DECORATION_GLASS = 6;

const FAR_PROXY_VERTEX_ELEMENTS: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.Vector3, 0),
  new VertexElement("COLOR_0", 24, VertexElementFormat.Vector4, 0),
  new VertexElement("TEXCOORD_0", 40, VertexElementFormat.Vector2, 0),
  new VertexElement("TANGENT", 48, VertexElementFormat.Vector4, 0),
  new VertexElement("TEXCOORD_1", 0, VertexElementFormat.Float, 1)
];

const SHARED_MATERIALS = new WeakMap<Engine, Material>();

function getSharedFarProxyMaterial(engine: Engine): Material {
  let material = SHARED_MATERIALS.get(engine);
  if (!material || material.destroyed) {
    registerConstructionSceneLighting();
    if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
      ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
    }
    if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
      ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
    }
    const shader = Shader.find("Masonry/FarProxy") ?? Shader.create(farProxyShaderSource, ShaderLanguage.GLSLES300);
    material = new Material(engine, shader);
    material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
    SHARED_MATERIALS.set(engine, material);
  }
  return material;
}

function computeGeometricNormals(positions: readonly number[], indices: readonly number[]): Float32Array {
  const vertexCount = positions.length / 3;
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const abX = positions[ib]! - positions[ia]!;
    const abY = positions[ib + 1]! - positions[ia + 1]!;
    const abZ = positions[ib + 2]! - positions[ia + 2]!;
    const acX = positions[ic]! - positions[ia]!;
    const acY = positions[ic + 1]! - positions[ia + 1]!;
    const acZ = positions[ic + 2]! - positions[ia + 2]!;
    const nx = abY * acZ - abZ * acY;
    const ny = abZ * acX - abX * acZ;
    const nz = abX * acY - abY * acX;
    normals[ia]! += nx;
    normals[ia + 1]! += ny;
    normals[ia + 2]! += nz;
    normals[ib]! += nx;
    normals[ib + 1]! += ny;
    normals[ib + 2]! += nz;
    normals[ic]! += nx;
    normals[ic + 1]! += ny;
    normals[ic + 2]! += nz;
  }
  for (let v = 0; v < vertexCount; v++) {
    const o = v * 3;
    const nx = normals[o]!;
    const ny = normals[o + 1]!;
    const nz = normals[o + 2]!;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      normals[o] = nx / len;
      normals[o + 1] = ny / len;
      normals[o + 2] = nz / len;
    } else {
      normals[o] = 0;
      normals[o + 1] = 1;
      normals[o + 2] = 0;
    }
  }
  return normals;
}

function partBaseLinearColor(
  part: ConstructionPreviewPart,
  owner: BuildingPaletteSlot,
  appearance: ReturnType<typeof masonryAppearance>
): readonly [number, number, number] {
  if (part.plaster) {
    const base = plasterLinearColor(part.color ?? [1, 1, 1]) as [number, number, number];
    if (appearance.isOverridden("brick")) {
      const lum = base[0] * 0.2126 + base[1] * 0.7152 + base[2] * 0.0722;
      const tint = appearance.linearColor("brick");
      return [lum * tint[0], lum * tint[1], lum * tint[2]];
    }
    return base;
  }
  if (part.decoration) {
    return [1, 1, 1];
  }
  const role = part.material === "wall" ? "brick" : part.material;
  const fallback = (part.color ?? [0.7, 0.7, 0.7]).map(srgbToLinear);
  return appearance.previewColor(
    role,
    role === "roof_tile"
      ? owner.roofColor
      : role === "wooden_plank"
        ? owner.woodColor
        : constructionBrickLayer(owner.wallColor),
    fallback
  ) as [number, number, number];
}

function previewPartSurfaceKind(part: ConstructionPreviewPart): number {
  if (part.plaster) return SURFACE_KIND_PLASTER;
  if (part.stonePaving) return SURFACE_KIND_STONE_PAVING;
  if (part.decoration) return SURFACE_KIND_DECORATION;
  if (part.material === "roof_tile") return SURFACE_KIND_ROOF_TILE;
  if (part.material === "wooden_plank") return SURFACE_KIND_WOODEN_PLANK;
  return SURFACE_KIND_WALL;
}

function writeFarProxyColors(
  includedParts: readonly ConstructionPreviewPart[],
  includedDecorations: readonly ConstructionDecorationPart[],
  ownerById: ReadonlyMap<string, BuildingPaletteSlot>,
  appearance: ReturnType<typeof masonryAppearance>,
  vertices: Float32Array
): void {
  const defaultOwner: BuildingPaletteSlot = { seed: 0, wallColor: 0, roofColor: 0, woodColor: 0 };
  let floatOffset = 0;
  for (let pIdx = 0; pIdx < includedParts.length; pIdx++) {
    const p = includedParts[pIdx]!;
    const count = p.positions.length / 3;
    const owner = ownerById.get(p.owner) ?? defaultOwner;
    const [baseR, baseG, baseB] = partBaseLinearColor(p, owner, appearance);
    for (let i = 0; i < count; i++) {
      const xyz = i * 3;
      const dst = floatOffset + i * FAR_PROXY_STRIDE_FLOATS;
      vertices[dst + 6] = p.colors ? p.colors[xyz]! * baseR : baseR;
      vertices[dst + 7] = p.colors ? p.colors[xyz + 1]! * baseG : baseG;
      vertices[dst + 8] = p.colors ? p.colors[xyz + 2]! * baseB : baseB;
    }
    floatOffset += count * FAR_PROXY_STRIDE_FLOATS;
  }

  for (let dIdx = 0; dIdx < includedDecorations.length; dIdx++) {
    const dp = includedDecorations[dIdx]!;
    const count = dp.positions.length / 3;
    const tintActive = dp.tintRole !== undefined && appearance.isOverridden(dp.tintRole);
    const tint = tintActive ? appearance.linearColor(dp.tintRole!) : undefined;
    let maxTintLuminance = 0;
    if (tintActive) {
      for (let i = 0; i < count; i++) {
        if (dp.tintMask?.[i] === false) continue;
        const xyz = i * 3;
        const lum = dp.colors[xyz]! * 0.2126 + dp.colors[xyz + 1]! * 0.7152 + dp.colors[xyz + 2]! * 0.0722;
        if (lum > maxTintLuminance) maxTintLuminance = lum;
      }
    }
    for (let i = 0; i < count; i++) {
      const xyz = i * 3;
      const dst = floatOffset + i * FAR_PROXY_STRIDE_FLOATS;
      const r = dp.colors[xyz]!;
      const g = dp.colors[xyz + 1]!;
      const b = dp.colors[xyz + 2]!;
      if (tint && dp.tintMask?.[i] !== false) {
        const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
        const scale = maxTintLuminance > 0 ? lum / maxTintLuminance : lum;
        vertices[dst + 6] = scale * tint[0];
        vertices[dst + 7] = scale * tint[1];
        vertices[dst + 8] = scale * tint[2];
      } else {
        vertices[dst + 6] = r;
        vertices[dst + 7] = g;
        vertices[dst + 8] = b;
      }
    }
    floatOffset += count * FAR_PROXY_STRIDE_FLOATS;
  }
}

export interface BuildingFarProxyHandle {
  readonly root: Entity;
  readonly renderer: MeshRenderer;
  readonly pickBatch: SeedWorldPickBatch;
  refreshColors(): void;
  setFade(fade: number): void;
  setLodDebugColor(r: number, g: number, b: number, a: number): void;
  destroy(): void;
}

/**
 * Builds one merged far-proxy mesh and renderer for LOD 2 display, sharing a
 * single global shader/material across all buildings with zero texture binds.
 */
export function createBuildingFarProxy(
  engine: Engine,
  parent: Entity,
  parts: readonly ConstructionPreviewPart[],
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[],
  appearance: ReturnType<typeof masonryAppearance>,
  decorationParts: readonly ConstructionDecorationPart[] = []
): BuildingFarProxyHandle | undefined {
  const includedParts: ConstructionPreviewPart[] = [];
  const includedDecorations: ConstructionDecorationPart[] = [];
  let totalVertices = 0;
  let totalIndices = 0;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (!p.indices.length || !p.positions.length) continue;
    if (p.plaster && p.plaster.wear >= 1) continue;
    includedParts.push(p);
    totalVertices += p.positions.length / 3;
    totalIndices += p.indices.length;
  }
  for (let i = 0; i < decorationParts.length; i++) {
    const dp = decorationParts[i]!;
    if (!dp.indices.length || !dp.positions.length) continue;
    includedDecorations.push(dp);
    totalVertices += dp.positions.length / 3;
    totalIndices += dp.indices.length;
  }
  if (totalVertices === 0 || totalIndices === 0) return undefined;

  const ownerById = new Map(colorOwners.map((owner) => [owner.id, owner] as const));
  const vertices = new Float32Array(totalVertices * FAR_PROXY_STRIDE_FLOATS);
  const vertexPickIds = new Float32Array(totalVertices);
  const pickIds: string[] = [];
  const pickIndexById = new Map<string, number>();
  const useUInt32 = totalVertices > 0xffff;
  const indices = useUInt32 ? new Uint32Array(totalIndices) : new Uint16Array(totalIndices);

  let minX = Number.POSITIVE_INFINITY,
    minY = Number.POSITIVE_INFINITY,
    minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY,
    maxY = Number.NEGATIVE_INFINITY,
    maxZ = Number.NEGATIVE_INFINITY;

  let vertexBase = 0;
  let vertexFloatOffset = 0;
  let indexOffset = 0;

  const appendGeometry = (
    pickId: string,
    positions: readonly number[],
    sourceNormals: readonly number[] | undefined,
    partIndices: readonly number[],
    normalBias: number,
    uvs: readonly number[][] | undefined,
    readEmission: (index: number) => number,
    readSurfaceTag: (index: number) => readonly [number, number, number, number]
  ) => {
    const count = positions.length / 3;
    let pickIndex = pickIndexById.get(pickId);
    if (pickIndex === undefined) {
      pickIndex = pickIds.length;
      pickIds.push(pickId);
      pickIndexById.set(pickId, pickIndex);
    }
    vertexPickIds.fill(pickIndex, vertexBase, vertexBase + count);
    const normals =
      sourceNormals?.length === positions.length ? sourceNormals : computeGeometricNormals(positions, partIndices);
    for (let i = 0; i < count; i++) {
      const xyz = i * 3;
      const dst = vertexFloatOffset + i * FAR_PROXY_STRIDE_FLOATS;
      const nx = normals[xyz]!;
      const ny = normals[xyz + 1]!;
      const nz = normals[xyz + 2]!;
      const px = positions[xyz]! + nx * normalBias;
      const py = positions[xyz + 1]! + ny * normalBias;
      const pz = positions[xyz + 2]! + nz * normalBias;
      vertices[dst] = px;
      vertices[dst + 1] = py;
      vertices[dst + 2] = pz;
      if (px < minX) minX = px;
      if (py < minY) minY = py;
      if (pz < minZ) minZ = pz;
      if (px > maxX) maxX = px;
      if (py > maxY) maxY = py;
      if (pz > maxZ) maxZ = pz;

      vertices[dst + 3] = nx;
      vertices[dst + 4] = ny;
      vertices[dst + 5] = nz;
      vertices[dst + 9] = readEmission(i);
      const uv = uvs?.[i];
      vertices[dst + 10] = uv?.[0] ?? 0;
      vertices[dst + 11] = uv?.[1] ?? 0;
      const [tagX, tagY, tagZ, tagW] = readSurfaceTag(i);
      vertices[dst + 12] = tagX;
      vertices[dst + 13] = tagY;
      vertices[dst + 14] = tagZ;
      vertices[dst + 15] = tagW;
    }

    for (let k = 0; k < partIndices.length; k++) {
      indices[indexOffset + k] = vertexBase + partIndices[k]!;
    }
    vertexBase += count;
    vertexFloatOffset += count * FAR_PROXY_STRIDE_FLOATS;
    indexOffset += partIndices.length;
  };

  for (let pIdx = 0; pIdx < includedParts.length; pIdx++) {
    const p = includedParts[pIdx]!;
    const normalBias = p.plaster ? PLASTER_NORMAL_BIAS_METRES : p.stonePaving ? STONE_PAVING_NORMAL_BIAS_METRES : 0;
    const kind = previewPartSurfaceKind(p);
    const plaster = p.plaster;
    const isUnit = p.placement === "unit" ? 1 : 0;
    appendGeometry(
      p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId),
      p.positions,
      p.normals,
      p.indices,
      normalBias,
      p.uvs,
      (i) => (p.emission ? p.emission[i]! : (p.emissive ?? 0)),
      (i) => (plaster ? [kind, plaster.wear, plaster.wallLength, plaster.edgeDistances[i] ?? 1] : [kind, 0, isUnit, 0])
    );
  }

  for (let dIdx = 0; dIdx < includedDecorations.length; dIdx++) {
    const dp = includedDecorations[dIdx]!;
    const uvs = dp.uvs ?? dp.appearance?.materialUVs;
    const appKinds = dp.appearance?.kinds;
    appendGeometry(
      dp.decorationId === undefined ? buildingGroupKey(dp.ownerId) : buildingPartKey(dp.decorationId),
      dp.positions,
      dp.normals,
      dp.indices,
      0,
      uvs,
      (i) => dp.emission[i] ?? 0,
      (i) => {
        const appKind = appKinds?.[i];
        const surfaceKind =
          appKind === DecorationMaterial.glass || appKind === DecorationMaterial.texturedGlass
            ? SURFACE_KIND_DECORATION_GLASS
            : SURFACE_KIND_DECORATION;
        return [surfaceKind, 0, 0, 0];
      }
    );
  }

  writeFarProxyColors(includedParts, includedDecorations, ownerById, appearance, vertices);

  const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertices, BufferUsage.Static);
  const pickBuffer = restoreBuffer(
    new Buffer(engine, BufferBindFlag.VertexBuffer, vertexPickIds, BufferUsage.Static),
    vertexPickIds
  );
  const indexBuffer = new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static);
  const mesh = new BufferMesh(engine, "MasonryFarProxyMesh");
  mesh.setVertexBufferBinding(vertexBuffer, FAR_PROXY_STRIDE_BYTES, 0);
  mesh.setVertexBufferBinding(pickBuffer, Float32Array.BYTES_PER_ELEMENT, 1);
  mesh.setVertexElements(FAR_PROXY_VERTEX_ELEMENTS);
  mesh.setIndexBufferBinding(new IndexBufferBinding(indexBuffer, useUInt32 ? IndexFormat.UInt32 : IndexFormat.UInt16));
  mesh.addSubMesh(0, totalIndices, MeshTopology.Triangles);
  mesh.bounds = new BoundingBox(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));

  const root = parent.createChild("Far proxy surfaces");
  root.isActive = false;
  const renderer = root.addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.setMaterial(getSharedFarProxyMaterial(engine));
  renderer.enableVertexColor = true;
  renderer.priority = -100;
  renderer.castShadows = false;
  renderer.receiveShadows = true;
  renderer.shaderData.setFloat("renderer_MasonryLodFade", 1);
  const debugColor = new Vector4(0, 0, 0, 0);
  renderer.shaderData.setVector4("renderer_MasonryLodDebugColor", debugColor);

  return {
    root,
    renderer,
    pickBatch: { renderer, count: pickIds.length, resolve: (index) => pickIds[index] },
    refreshColors() {
      writeFarProxyColors(includedParts, includedDecorations, ownerById, appearance, vertices);
      vertexBuffer.setData(vertices);
    },
    setFade(fade: number) {
      renderer.shaderData.setFloat("renderer_MasonryLodFade", fade);
    },
    setLodDebugColor(r: number, g: number, b: number, a: number) {
      debugColor.set(r, g, b, a);
      renderer.shaderData.setVector4("renderer_MasonryLodDebugColor", debugColor);
    },
    destroy() {
      const release = () => {
        mesh.destroy();
        vertexBuffer.destroy(true);
        pickBuffer.destroy(true);
        indexBuffer.destroy(true);
      };
      if (!root.destroyed) root.destroy();
      if (root.pendingDestroy) queueMicrotask(release);
      else release();
    }
  };
}
