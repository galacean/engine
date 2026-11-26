import { bindBuildingWall } from "./BuildingWallBakeBinding";
import type { BuildingLampMaterials } from "./BuildingLampShaderBinding";
import { isWallBakeSurface, type BuildingWallBakeBindings } from "./BuildingWallBakeBinding";
import { withBuildingWallUVs } from "./BuildingWallGeometryUV";
import { buildingPartKey, buildingGroupKey } from "./BuildingObjectIdentity";
import type { PrefabResource } from "@galacean/engine";
import { constructionStoneFloorGLSL } from "./ConstructionStoneFloorShader";
import { leaseStoneFloorTextures } from "./ConstructionStoneFloorTextures";
import { createConstructionLodTexture } from "./ConstructionLodTexture";
import type { ConstructionLodAppearance } from "./ConstructionLodAppearance";
import {
  constructionEntranceGLSL,
  constructionEntranceCoverageGLSL,
  entranceBinding
} from "./ConstructionEntranceShader";
import { constructionEntranceRanges, type ConstructionEntranceState } from "./ConstructionEntrance";
import entranceShadow from "./ConstructionEntranceShadow.shader?raw";
import { subscribeDistanceAppearance } from "./MasonryDistanceAppearance";
import { mergePlannedMasonryVertexData } from "./MasonryDistanceVertexData";
import { constructionDecorationGLSL } from "./ConstructionDecorationShader";
import { leaseDecorationTextures } from "./ConstructionDecorationTextures";
import { registerConstructionSceneLighting } from "./ConstructionSceneLighting";
import { leasePlasterTextures } from "./ConstructionPlasterTextures";
import { constructionPlasterGLSL, constructionPlasterFinishGLSL } from "./ConstructionPlasterShader";
import {
  destroyOwnedModelMesh,
  uploadRestorableModelMesh
} from "@galacean/engine-project/rendering/RestorableResources";
import {
  masonryAppearance,
  masonryTintGLSL,
  masonryTintRoles,
  masonryTintUniforms,
  restoreMasonryTextureSamples,
  srgbToLinear
} from "./MasonryAppearance";
import { masonryColorSeed } from "./MasonryColorRules";
import lodDither from "./MasonryLodDither.glsl?raw";
import {
  BoundingBox,
  Color,
  CompareFunction,
  Vector3,
  Vector4,
  Buffer,
  BufferBindFlag,
  BufferUsage,
  VertexAttribute,
  VertexElement,
  VertexElementFormat,
  ModelMesh,
  MeshRenderer,
  PBRMaterial,
  Material,
  RenderFace,
  Shader,
  ShaderLanguage,
  ShaderFactory,
  ShaderMacro,
  ShaderProperty,
  type Engine,
  type Entity
} from "@galacean/engine";
import shader from "./MasonryDistanceSurface.shader?raw";
import {
  addV2Surface,
  destroyV2ViewResources,
  type V2ViewResources
} from "@galacean/engine-project/rendering/V2ViewGeometry";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-project/rendering/SeedWorldPickBatch";
import { plasterPalette } from "./ConstructionPlasterPalette";
import {
  type ConstructionPreview,
  type PackedUv2,
  constructionBrickLayer,
  uvU,
  uvV,
  woodPalette,
  wallPalette
} from "./ConstructionPreview";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { createDecorationNativeView } from "./DecorationNativeView";
import { collapsePositionsToBox, createBuildingFarProxy } from "./BuildingFarProxy";
import { BuildingGlobalProxy, type GlobalProxySlotHandle } from "./BuildingGlobalProxy";

const OPAQUE_BUCKET_STRIDE = 32;
const OPAQUE_F32_STRIDE = OPAQUE_BUCKET_STRIDE / Float32Array.BYTES_PER_ELEMENT;
const OPAQUE_I8_STRIDE = OPAQUE_BUCKET_STRIDE;
const OPAQUE_U16_STRIDE = OPAQUE_BUCKET_STRIDE / Uint16Array.BYTES_PER_ELEMENT;
const OPAQUE_BUCKET_VERTEX_ELEMENTS = [
  new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.NormalizedByte4, 0),
  new VertexElement(VertexAttribute.Color, 16, VertexElementFormat.NormalizedUShort4, 0),
  new VertexElement(VertexAttribute.UV, 24, VertexElementFormat.Vector2, 0)
];
const SHADOW_BUCKET_STRIDE = 16;
const SHADOW_F32_STRIDE = SHADOW_BUCKET_STRIDE / Float32Array.BYTES_PER_ELEMENT;
const SHADOW_BUCKET_VERTEX_ELEMENTS = [
  new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
  new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.NormalizedByte4, 0)
];
const MACRO_SURFACE_DITHER =
  ShaderMacro?.getByName?.("MASONRY_SURFACE_DITHER") ?? ("MASONRY_SURFACE_DITHER" as unknown as ShaderMacro);
const MACRO_PLASTER = ShaderMacro?.getByName?.("MASONRY_PLASTER") ?? ("MASONRY_PLASTER" as unknown as ShaderMacro);
const PROP_MASONRY_LOD_FADE =
  ShaderProperty?.getByName?.("renderer_MasonryLodFade") ?? ("renderer_MasonryLodFade" as unknown as ShaderProperty);
const PROP_MASONRY_LOD_DEBUG_COLOR =
  ShaderProperty?.getByName?.("renderer_MasonryLodDebugColor") ??
  ("renderer_MasonryLodDebugColor" as unknown as ShaderProperty);

interface DistanceWallUVs {
  lightmapUVs?: Float32Array;
}
function setDistanceVertexLayout(
  engine: Engine,
  mesh: ModelMesh,
  elements: VertexElement[],
  parts: readonly DistanceWallUVs[],
  count: number
): Buffer | undefined {
  if (!parts[0]?.lightmapUVs) {
    mesh.setVertexElements(elements);
    return;
  }
  const coords = new Float32Array(count * 2);
  let offset = 0;
  for (const part of parts) {
    coords.set(part.lightmapUVs!, offset);
    offset += part.lightmapUVs!.length;
  }
  const buffer = new Buffer(engine, BufferBindFlag.VertexBuffer, coords, BufferUsage.Static, true);
  mesh.setVertexElements([...elements, new VertexElement(VertexAttribute.UV2, 0, VertexElementFormat.Vector2, 1)]);
  mesh.setVertexBufferBinding(buffer, 8, 1);
  return buffer;
}

function packSignedByteDist(v: number): number {
  return Math.round(v < -1 ? -127 : v > 1 ? 127 : v * 127);
}
function packNormalizedU16Dist(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 65535 : Math.round(v * 65535);
}
function computeFlatNormalsDist(rawPositions: ArrayLike<number>, indices: ArrayLike<number>): Float32Array {
  const normals = new Float32Array(rawPositions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i]! * 3;
    const ib = indices[i + 1]! * 3;
    const ic = indices[i + 2]! * 3;
    const abX = rawPositions[ib]! - rawPositions[ia]!;
    const abY = rawPositions[ib + 1]! - rawPositions[ia + 1]!;
    const abZ = rawPositions[ib + 2]! - rawPositions[ia + 2]!;
    const acX = rawPositions[ic]! - rawPositions[ia]!;
    const acY = rawPositions[ic + 1]! - rawPositions[ia + 1]!;
    const acZ = rawPositions[ic + 2]! - rawPositions[ia + 2]!;
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
  for (let o = 0; o < normals.length; o += 3) {
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

function buildCompactShadowMesh(
  engine: Engine,
  resources: V2ViewResources,
  owner: string,
  chunks: readonly { positions: ArrayLike<number>; indices: ArrayLike<number> }[],
  vertexCount: number,
  indexCount: number
): ModelMesh {
  const sBytes = new Uint8Array(vertexCount * SHADOW_BUCKET_STRIDE);
  const sF32 = new Float32Array(sBytes.buffer);
  const sI8 = new Int8Array(sBytes.buffer);
  const sIndices = vertexCount > 65535 ? new Uint32Array(indexCount) : new Uint16Array(indexCount);
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  let vCursor = 0;
  let iCursor = 0;
  for (const chunk of chunks) {
    const count = chunk.positions.length / 3;
    const normals = computeFlatNormalsDist(chunk.positions, chunk.indices);
    for (let v = 0; v < count; v++) {
      const v3 = v * 3;
      const x = chunk.positions[v3]!;
      const y = chunk.positions[v3 + 1]!;
      const z = chunk.positions[v3 + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
      const gv = vCursor + v;
      const fOff = gv * SHADOW_F32_STRIDE;
      sF32[fOff] = x;
      sF32[fOff + 1] = y;
      sF32[fOff + 2] = z;
      const nOff = gv * SHADOW_BUCKET_STRIDE + 12;
      sI8[nOff] = packSignedByteDist(normals[v3]!);
      sI8[nOff + 1] = packSignedByteDist(normals[v3 + 1]!);
      sI8[nOff + 2] = packSignedByteDist(normals[v3 + 2]!);
      sI8[nOff + 3] = 0;
    }
    for (let i = 0; i < chunk.indices.length; i++) sIndices[iCursor++] = vCursor + chunk.indices[i]!;
    vCursor += count;
  }
  const shadowMesh = new ModelMesh(engine, owner + " shadow");
  resources.meshes.push(shadowMesh);
  shadowMesh.setVertexElements(SHADOW_BUCKET_VERTEX_ELEMENTS);
  const shadowVb = new Buffer(engine, BufferBindFlag.VertexBuffer, sBytes, BufferUsage.Static, true);
  shadowMesh.setVertexBufferBinding(shadowVb, SHADOW_BUCKET_STRIDE);
  shadowMesh.setIndices(sIndices);
  shadowMesh.addSubMesh(0, sIndices.length);
  shadowMesh.bounds.min.set(minX, minY, minZ);
  shadowMesh.bounds.max.set(maxX, maxY, maxZ);
  uploadRestorableModelMesh(shadowMesh);
  shadowVb.markAsUnreadable();
  return shadowMesh;
}

function makeOpaqueMaterialUpdater(
  sharedMat: PBRMaterial,
  appearance: ReturnType<typeof masonryAppearance>
): () => void {
  return () => {
    masonryTintRoles.forEach((role, i) =>
      sharedMat.shaderData.setVector4(masonryTintUniforms[i], new Vector4(...appearance.tint(role)))
    );
  };
}

function makeOpaqueBucketVertexRefresher(
  colorSpans: Array<{
    count: number;
    role: "brick" | "roof_tile" | "wooden_plank";
    srcColor: readonly [number, number, number];
    layer: number;
  }>,
  retainedData: Uint8Array,
  vertexBuffer: Buffer,
  appearance: ReturnType<typeof masonryAppearance>
): () => void {
  const retainedU16 = new Uint16Array(retainedData.buffer, retainedData.byteOffset, retainedData.byteLength >> 1);
  return () => {
    let vOffset = 0;
    for (const span of colorSpans) {
      const rgb = appearance.previewColor(span.role, span.layer, span.srcColor) as [number, number, number];
      const r = packNormalizedU16Dist(rgb[0]!);
      const g = packNormalizedU16Dist(rgb[1]!);
      const b = packNormalizedU16Dist(rgb[2]!);
      for (let i = 0; i < span.count; i++) {
        const cOff = (vOffset + i) * OPAQUE_U16_STRIDE + 8;
        retainedU16[cOff] = r;
        retainedU16[cOff + 1] = g;
        retainedU16[cOff + 2] = b;
        retainedU16[cOff + 3] = 65535;
      }
      vOffset += span.count;
    }
    vertexBuffer.setData(retainedData);
  };
}
export interface BuildingDistanceInput {
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[];
  paletteSlots: readonly BuildingPaletteSlot[];
  rigidDecorations?: { poses: ReadonlyMap<string, readonly number[]>; resolve(id: string): Entity | undefined };
}
/** Lightweight actual roof/wall geometry, with per-owner picking and frustum bounds. */
export async function createBuildingDistanceView(
  engine: Engine,
  parent: Entity,
  group: BuildingDistanceInput,
  geometry: ConstructionPreview,
  assets: PrefabResource,
  camera?: import("@galacean/engine").Camera,
  signal: AbortSignal = new AbortController().signal,
  options?: {
    unifiedGlobalProxy?: boolean;
    wallBakes?: BuildingWallBakeBindings;
    lampMaterials?: BuildingLampMaterials;
    loadPreview?: (signal: AbortSignal) => Promise<ConstructionPreview>;
  }
) {
  registerConstructionSceneLighting();
  if (!ShaderFactory.includeMap["Masonry/Entrance.glsl"])
    ShaderFactory.registerInclude("Masonry/Entrance.glsl", constructionEntranceGLSL);
  if (!ShaderFactory.includeMap["Masonry/EntranceCoverage.glsl"])
    ShaderFactory.registerInclude("Masonry/EntranceCoverage.glsl", constructionEntranceCoverageGLSL);
  const entranceBindings: { owner: string; apply: ReturnType<typeof entranceBinding> }[] = [];
  signal.throwIfAborted();

  if (group.rigidDecorations && geometry.parts.some((part) => part.decoration && !part.roofSpire))
    throw Error("Scene-bound distance geometry must retain native decoration parts");
  const entranceRanges = constructionEntranceRanges(geometry.parts);
  if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"])
    ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
  if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"])
    ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
  if (!ShaderFactory.includeMap["Masonry/PlasterFinish.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/PlasterFinish.glsl",
      restoreMasonryTextureSamples(constructionPlasterFinishGLSL, [
        { sampler: "material_PlasterColors", layers: plasterPalette.length, array: true },
        { sampler: "material_PlasterMortar", layers: 1, array: false }
      ]).replace(/\buniform\s+/g, "")
    );
  if (!ShaderFactory.includeMap["Masonry/Decoration.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/Decoration.glsl",
      restoreMasonryTextureSamples(constructionDecorationGLSL, [
        { sampler: "material_WindowTimber", layers: woodPalette.length, array: true }
      ]).replace(/\buniform\s+/g, "")
    );
  if (!ShaderFactory.includeMap["Masonry/StoneFloor.glsl"])
    ShaderFactory.registerInclude(
      "Masonry/StoneFloor.glsl",
      restoreMasonryTextureSamples(constructionStoneFloorGLSL, [
        { sampler: "material_StoneFloorPalette", layers: wallPalette.length, array: true }
      ]).replace(/\buniform\s+/g, "")
    );
  const resources: V2ViewResources = {
    root: parent.createChild("Building surfaces"),
    meshes: [],
    materials: []
  };
  // Stable shadow silhouette shares existing meshes, independent of visual LOD.
  // No forward/depth/picking pass, no extra vertex buffers or detailed tile draws.
  const visualRoot = resources.root.createChild("Visual surfaces");
  const visualResources: V2ViewResources = { root: visualRoot, meshes: [], materials: [] };
  const unifiedGlobalProxy = Boolean(options?.unifiedGlobalProxy || (options?.wallBakes?.size && parent.scene));
  const loadPreview = options?.loadPreview;
  const shadowRoot = unifiedGlobalProxy ? undefined : resources.root.createChild("Shadow surfaces");
  const shadowMaterial = unifiedGlobalProxy
    ? undefined
    : new Material(
        engine,
        Shader.find("Masonry/ShadowSurface") ?? Shader.create(entranceShadow, ShaderLanguage.GLSLES300)
      );
  if (shadowMaterial) resources.materials.push(shadowMaterial);
  if (!ShaderFactory.includeMap["Masonry/Tint.glsl"])
    ShaderFactory.registerInclude("Masonry/Tint.glsl", masonryTintGLSL.replace(/\buniform\s+/g, ""));
  const appearance = masonryAppearance(engine),
    tintSubscriptions: Array<{ destroy(): void }> = [],
    visualTintSubscriptions: Array<{ destroy(): void }> = [];
  const colorOwnerById = new Map(group.colorOwners.map((b) => [b.id, b] as const));
  const colorSeeds = new Map(
    group.colorOwners.map((b) => {
      const seed = masonryColorSeed(b);
      appearance.registerSourceReference(seed, {
        brick: constructionBrickLayer(b.wallColor),
        roof_tile: b.roofColor,
        wooden_plank: b.woodColor
      });
      return [b.id, seed] as const;
    })
  );
  const materials = new Map<string, PBRMaterial>(),
    batches: SeedWorldArrayPickBatch[] = [],
    residencyProbes: MeshRenderer[] = [];
  const lodAppearanceIds = new Map<ConstructionLodAppearance, number>();
  const lodTextures = new Map<ConstructionLodAppearance, ReturnType<typeof createConstructionLodTexture>>();
  const lodMaterialBindings: Array<{
    material: PBRMaterial;
    appearance: ConstructionLodAppearance;
    uvTransform: readonly [number, number, number, number];
  }> = [];
  const ownerEntities = new Map<string, Entity[]>();
  const visualOwnerEntities = new Map<string, Entity[]>();
  const visualEntranceBindings: { owner: string; apply: ReturnType<typeof entranceBinding> }[] = [];
  let disposed = false;
  let detailedInitialized = false;
  let detailedVisualReady = false;
  let detailedReady: Promise<void> | undefined;
  let detailedGeneration = 0;
  let detailedRetryAt = 0;
  let detailedRetryTimer: ReturnType<typeof setTimeout> | undefined;
  let deviceRestoreCleanup: (() => void) | undefined;
  let pendingGeometry: ConstructionPreview | undefined;
  let pendingGroup: BuildingDistanceInput | undefined;
  let previewAbort: AbortController | undefined;
  let warmupInFlight = 0;
  let lastEntranceStates: ReadonlyMap<string, ConstructionEntranceState> | undefined;
  let lastFade = 1;
  let ditherEnabled = false;
  let lastLodDebugEnabled = false;
  let textureLease: ReturnType<typeof leasePlasterTextures> | undefined;
  const plasterMaterials: PBRMaterial[] = [];
  const stoneFloorMaterials: PBRMaterial[] = [];
  let stoneFloorLease: ReturnType<typeof leaseStoneFloorTextures> | undefined;
  const decorationMaterials: PBRMaterial[] = [];
  let decorationTextureLease: ReturnType<typeof leaseDecorationTextures> | undefined;
  let nativeDecorationView: ReturnType<typeof createDecorationNativeView> | undefined;
  let farProxy: ReturnType<typeof createBuildingFarProxy> | undefined;
  let globalProxySlot: GlobalProxySlotHandle | undefined;
  const boundsFlag = resources.root.transform.registerWorldChangeFlag();
  const nativeDecorationPicks: SeedWorldPickBatch[] = [];
  const clearDetailedRetryHooks = () => {
    if (detailedRetryTimer !== undefined) {
      clearTimeout(detailedRetryTimer);
      detailedRetryTimer = undefined;
    }
    deviceRestoreCleanup?.();
    deviceRestoreCleanup = undefined;
  };
  const disposeView = () => {
    if (disposed) return;
    disposed = true;
    boundsFlag.destroy();
    detailedGeneration++;
    clearDetailedRetryHooks();
    previewAbort?.abort();
    previewAbort = undefined;
    pendingGeometry = undefined;
    pendingGroup = undefined;
    nativeDecorationView?.destroy();
    tintSubscriptions.forEach((subscription) => subscription.destroy());
    visualTintSubscriptions.forEach((subscription) => subscription.destroy());
    destroyV2ViewResources(visualResources);
    destroyV2ViewResources(resources);
    farProxy?.destroy();
    globalProxySlot?.destroy();
    const releaseTextures = () => {
      for (const texture of lodTextures.values()) texture.destroy();
      lodTextures.clear();
      textureLease?.destroy();
      stoneFloorLease?.destroy();
      decorationTextureLease?.destroy();
    };
    // Frame-time entity retirement defers material destruction. A texture's
    // destroy() is refused while those materials still reference it. Queue
    // after destroyV2ViewResources' material release, retaining ownership until then.
    queueMicrotask(releaseTextures);
  };
  try {
    interface ShadowChunk {
      positions: ArrayLike<number>;
      indices: ArrayLike<number>;
      mesh?: ModelMesh;
    }
    interface ShadowBucket {
      owner: string;
      decoration: boolean;
      chunks: ShadowChunk[];
      vertexCount: number;
      indexCount: number;
    }

    const attachShadowCaster = (owner: string, mesh: ModelMesh, decoration: boolean) => {
      if (!shadowRoot || !shadowMaterial) return;
      const caster = shadowRoot.createChild(owner).addComponent(MeshRenderer);
      caster.mesh = mesh;
      caster.setMaterial(shadowMaterial);
      caster.receiveShadows = false;
      caster.shaderData.setFloat("renderer_MasonryEntranceDecoration", decoration ? 1 : 0);
      residencyProbes.push(caster);
      entranceBindings.push({ owner, apply: entranceBinding(caster.shaderData) });
      const list = ownerEntities.get(owner) ?? [];
      list.push(caster.entity);
      ownerEntities.set(owner, list);
    };

    const buildLod1Visuals = (
      srcGeometry: ConstructionPreview,
      srcGroup: BuildingDistanceInput,
      includeShadows: boolean
    ) => {
      const shadowBuckets = includeShadows ? new Map<string, ShadowBucket>() : undefined;
      const appendShadowChunk = (
        owner: string,
        decoration: boolean,
        positions: ArrayLike<number>,
        indices: ArrayLike<number>,
        mesh?: ModelMesh
      ) => {
        if (!shadowBuckets) return;
        const key = `${owner}\0${decoration ? 1 : 0}`;
        let bucket = shadowBuckets.get(key);
        if (!bucket) {
          bucket = { owner, decoration, chunks: [], vertexCount: 0, indexCount: 0 };
          shadowBuckets.set(key, bucket);
        }
        bucket.chunks.push({ positions, indices, mesh });
        bucket.vertexCount += positions.length / 3;
        bucket.indexCount += indices.length;
      };

      interface OpaqueBucketPart extends DistanceWallUVs {
        positions: readonly number[];
        uvs?: PackedUv2;
        indices: readonly number[];
        role: "brick" | "roof_tile" | "wooden_plank";
        srcColor: readonly [number, number, number];
        layer: number;
      }
      interface OpaqueBucket {
        receivesWallBake: boolean;
        owner: string;
        material: PBRMaterial;
        parts: OpaqueBucketPart[];
        vertexCount: number;
        indexCount: number;
      }
      interface PlannedBatchBucket {
        owner: string;
        material: PBRMaterial;
        isPlaster: boolean;
        isDecoration: boolean;
        hasAppearance: boolean;
        entries: Array<{ part: (typeof srcGeometry.parts)[number] & DistanceWallUVs; pickIndex: number }>;
        pickIds: string[];
      }
      const opaqueMaterials = new Map<string, PBRMaterial>();
      const opaqueBuckets = new Map<string, OpaqueBucket>();
      const plannedBuckets = new Map<string, PlannedBatchBucket>();
      const sharedOpaqueRefreshers: Array<() => void> = [];

      for (const source of srcGeometry.parts) {
        if (!source.indices.length) continue;
        const wall = isWallBakeSurface(source) && options?.wallBakes?.get(source.owner);
        const p: typeof source & DistanceWallUVs = wall ? withBuildingWallUVs(source, wall) : source;
        let lodAppearanceId: number | undefined;
        if (p.lodAppearance) {
          lodAppearanceId = lodAppearanceIds.get(p.lodAppearance);
          if (lodAppearanceId === undefined) {
            lodAppearanceId = lodAppearanceIds.size;
            lodAppearanceIds.set(p.lodAppearance, lodAppearanceId);
          }
        }

        const owner = colorOwnerById.get(p.owner);
        const isOpaqueMerged =
          owner !== undefined &&
          !p.plaster &&
          !p.decoration &&
          !p.stonePaving &&
          p.pickId === undefined &&
          !((p.decoration || p.plaster) && p.colors && p.normals && p.emission);

        if (isOpaqueMerged) {
          const opaqueMatKey = JSON.stringify([lodAppearanceId, p.placement, p.emissive ?? 0]);
          let mat = opaqueMaterials.get(opaqueMatKey);
          if (!mat) {
            mat = new PBRMaterial(engine);
            mat.shader = Shader.find("Masonry/SupportSurface") ?? Shader.create(shader, ShaderLanguage.GLSLES300);
            mat.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
            if (ditherEnabled) mat.shaderData?.enableMacro?.(MACRO_SURFACE_DITHER);
            mat.baseColor = new Color(1, 1, 1, 1);
            mat.shaderData.setFloat("material_MasonryPattern", 0);
            mat.shaderData.setFloat("material_MasonryUnit", p.placement === "unit" ? 1 : 0);
            if (p.lodAppearance) {
              lodMaterialBindings.push({
                material: mat,
                appearance: p.lodAppearance,
                uvTransform: p.lodAppearance.uvTransform
              });
            }
            mat.shaderData.setVector4("material_MasonryPlaster", new Vector4(0, 1, 0, 0));
            mat.roughness = 0.9;
            mat.screenSpaceReflectionIntensity = 0;
            mat.screenSpaceReflectionBilateral = false;
            mat.renderFace = RenderFace.Front;
            mat.shaderData.setFloat("material_MasonryEmission", p.emissive ?? 0);
            const applyTintUniforms = makeOpaqueMaterialUpdater(mat, appearance);
            applyTintUniforms();
            sharedOpaqueRefreshers.push(applyTintUniforms);
            visualResources.materials.push(mat);
            opaqueMaterials.set(opaqueMatKey, mat);
          }

          const receivesWallBake = !!wall;
          const bucketKey = `${p.owner}\0${opaqueMatKey}\0${receivesWallBake}`;
          let bucket = opaqueBuckets.get(bucketKey);
          if (!bucket) {
            bucket = { owner: p.owner, receivesWallBake, material: mat, parts: [], vertexCount: 0, indexCount: 0 };
            opaqueBuckets.set(bucketKey, bucket);
          }
          const role = p.material === "wall" ? "brick" : p.material;
          const c = p.color ?? [1, 1, 1];
          const layer =
            role === "roof_tile"
              ? owner.roofColor
              : role === "wooden_plank"
                ? owner.woodColor
                : constructionBrickLayer(owner.wallColor);
          bucket.parts.push({
            positions: p.positions,
            uvs: p.uvs,
            lightmapUVs: p.lightmapUVs,
            indices: p.indices,
            role,
            srcColor: [srgbToLinear(c[0] ?? 1), srgbToLinear(c[1] ?? 1), srgbToLinear(c[2] ?? 1)],
            layer
          });
          bucket.vertexCount += p.positions.length / 3;
          bucket.indexCount += p.indices.length;
          continue;
        }

        const materialKey = JSON.stringify([
          p.placement,
          lodAppearanceId,
          p.plaster && [p.plaster.wear, p.plaster.wallLength, p.plaster.color],
          p.stonePaving,
          colorSeeds.get(p.owner),
          p.material,
          p.color,
          p.decoration,
          p.emissive
        ]);
        let material = materials.get(materialKey);
        if (!material) {
          material = new PBRMaterial(engine);
          material.shader = Shader.find("Masonry/SupportSurface") ?? Shader.create(shader, ShaderLanguage.GLSLES300);
          material.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.LessEqual);
          if (ditherEnabled) material.shaderData?.enableMacro?.(MACRO_SURFACE_DITHER);
          if (p.plaster) material.shaderData?.enableMacro?.(MACRO_PLASTER);
          const ownerEntry = colorOwnerById.get(p.owner)!;
          visualTintSubscriptions.push(
            subscribeDistanceAppearance(appearance, material, {
              role: p.material === "wall" ? "brick" : p.material,
              plaster: !!p.plaster,
              decoration: !!p.decoration,
              color: p.color!,
              owner: ownerEntry
            })
          );
          material.shaderData.setFloat(
            "material_MasonryPattern",
            p.plaster ? -2 : p.decoration ? -1 : p.material === "wooden_plank" ? 2 : p.material === "roof_tile" ? 1 : 0
          );
          material.shaderData.setFloat("material_MasonryUnit", p.placement === "unit" ? 1 : 0);
          if (p.lodAppearance) {
            lodMaterialBindings.push({
              material,
              appearance: p.lodAppearance,
              uvTransform: p.lodAppearance.uvTransform
            });
          }
          material.shaderData.setVector4(
            "material_MasonryPlaster",
            new Vector4(p.plaster?.wear ?? 0, p.plaster?.wallLength ?? 1, p.plaster?.color ?? 0, 0)
          );
          if (p.stonePaving) {
            material.shaderData.enableMacro("MASONRY_STONE_FLOOR");
            material.shaderData.setVector4("material_StoneFloorMapping", new Vector4(...p.stonePaving.uvTransform));
            material.shaderData.setFloat("material_StoneFloorColor", p.stonePaving.color);
            stoneFloorMaterials.push(material);
          }
          material.roughness = 0.9;
          material.screenSpaceReflectionIntensity = 0;
          material.screenSpaceReflectionBilateral = false;
          material.renderFace = p.stonePaving ? RenderFace.Front : RenderFace.Double;
          materials.set(materialKey, material);
          material.shaderData.setFloat("material_MasonryEmission", p.emissive ?? 0);
          visualResources.materials.push(material);
          if (p.plaster) plasterMaterials.push(material);
          if (p.decoration) decorationMaterials.push(material);
        }
        if ((p.decoration || p.plaster) && p.colors && p.normals && p.emission) {
          const plannedKey = `${p.owner}\0${materialKey}\0${p.appearance ? 1 : 0}\0${p.plaster ? 1 : 0}\0${wall ? 1 : 0}`;
          let pb = plannedBuckets.get(plannedKey);
          if (!pb) {
            pb = {
              owner: p.owner,
              material: material!,
              isPlaster: !!p.plaster,
              isDecoration: !!p.decoration,
              hasAppearance: !!p.appearance,
              entries: [],
              pickIds: []
            };
            plannedBuckets.set(plannedKey, pb);
          }
          const pickIndex = pb.pickIds.length;
          pb.pickIds.push(p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId));
          pb.entries.push({ part: p, pickIndex });
          continue;
        }
        const entity = addV2Surface(engine, visualResources, p.owner, p, material, { upward: false, shadows: true });
        if (includeShadows && !p.plaster) {
          appendShadowChunk(
            p.owner,
            !!p.decoration,
            p.positions,
            p.indices,
            entity.getComponent(MeshRenderer)!.mesh as ModelMesh
          );
        }
        const entities = visualOwnerEntities.get(p.owner) ?? [];
        entities.push(entity);
        visualOwnerEntities.set(p.owner, entities);
        const renderer = entity.getComponent(MeshRenderer)!;
        if (wall) bindBuildingWall(renderer.shaderData, wall);
        renderer.priority = p.stonePaving || p.plaster ? -98 : p.decoration ? -102 : -105;
        renderer.castShadows = false;
        renderer.shaderData.setFloat(PROP_MASONRY_LOD_FADE, lastFade);
        visualEntranceBindings.push({ owner: p.owner, apply: entranceBinding(renderer.shaderData) });
        const batch = new SeedWorldArrayPickBatch(renderer);
        batch.count = 1;
        batch.id = p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId);
        batches.push(batch);
      }

      for (const pb of plannedBuckets.values()) {
        const merged = mergePlannedMasonryVertexData(pb.entries);
        const mesh = new ModelMesh(engine, pb.owner + " decorations");
        visualResources.meshes.push(mesh);
        const elements = [
          new VertexElement(VertexAttribute.Position, 0, VertexElementFormat.Vector3, 0),
          new VertexElement(VertexAttribute.Normal, 12, VertexElementFormat.Vector3, 0),
          new VertexElement(VertexAttribute.Color, 24, VertexElementFormat.Vector4, 0),
          new VertexElement(VertexAttribute.UV, 40, VertexElementFormat.Vector2, 0),
          new VertexElement(VertexAttribute.UV1, 48, VertexElementFormat.Vector2, 0)
        ];
        if (merged.hasAppearance)
          elements.push(new VertexElement(VertexAttribute.Tangent, 56, VertexElementFormat.Vector4, 0));
        const uvBuffer = setDistanceVertexLayout(
          engine,
          mesh,
          elements,
          pb.entries.map((entry) => entry.part),
          merged.count
        );
        const vb = new Buffer(engine, BufferBindFlag.VertexBuffer, merged.data, BufferUsage.Static, true);
        mesh.setVertexBufferBinding(vb, merged.stride);
        mesh.setIndices(merged.indices);
        mesh.addSubMesh(0, merged.indices.length);
        mesh.bounds.min.set(merged.bounds[0], merged.bounds[1], merged.bounds[2]);
        mesh.bounds.max.set(merged.bounds[3], merged.bounds[4], merged.bounds[5]);
        uploadRestorableModelMesh(mesh);
        vb.markAsUnreadable();
        uvBuffer?.markAsUnreadable();
        const entity = visualRoot.createChild(pb.owner);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(pb.material);
        const wall = pb.entries[0].part.lightmapUVs && options?.wallBakes?.get(pb.owner);
        if (wall) bindBuildingWall(renderer.shaderData, wall);
        renderer.enableVertexColor = true;
        renderer.castShadows = false;
        renderer.receiveShadows = true;
        renderer.priority = pb.isPlaster ? -98 : -102;
        renderer.shaderData.setFloat(PROP_MASONRY_LOD_FADE, lastFade);
        if (includeShadows && !pb.isPlaster) attachShadowCaster(pb.owner, mesh, pb.isDecoration);
        const entities = visualOwnerEntities.get(pb.owner) ?? [];
        entities.push(entity);
        visualOwnerEntities.set(pb.owner, entities);
        visualEntranceBindings.push({ owner: pb.owner, apply: entranceBinding(renderer.shaderData) });
        const batch = new SeedWorldArrayPickBatch(renderer);
        if (pb.pickIds.length === 1) {
          batch.count = 1;
          batch.id = pb.pickIds[0];
        } else {
          batch.count = pb.pickIds.length;
          batch.ids = pb.pickIds;
        }
        batches.push(batch);
      }

      for (const bucket of opaqueBuckets.values()) {
        const vertexBytes = new Uint8Array(bucket.vertexCount * OPAQUE_BUCKET_STRIDE);
        const f32 = new Float32Array(vertexBytes.buffer);
        const i8 = new Int8Array(vertexBytes.buffer);
        const u16 = new Uint16Array(vertexBytes.buffer);
        const indicesArray =
          bucket.vertexCount > 65535 ? new Uint32Array(bucket.indexCount) : new Uint16Array(bucket.indexCount);

        let minX = Infinity,
          minY = Infinity,
          minZ = Infinity,
          maxX = -Infinity,
          maxY = -Infinity,
          maxZ = -Infinity;
        const colorSpans: Array<{
          count: number;
          role: "brick" | "roof_tile" | "wooden_plank";
          srcColor: readonly [number, number, number];
          layer: number;
        }> = [];

        let vertexCursor = 0;
        let indexCursor = 0;
        for (const item of bucket.parts) {
          const partVertexCount = item.positions.length / 3;
          const normals = computeFlatNormalsDist(item.positions, item.indices);
          const rgb = appearance.previewColor(item.role, item.layer, item.srcColor) as [number, number, number];
          const rU16 = packNormalizedU16Dist(rgb[0]!);
          const gU16 = packNormalizedU16Dist(rgb[1]!);
          const bU16 = packNormalizedU16Dist(rgb[2]!);
          colorSpans.push({ count: partVertexCount, role: item.role, srcColor: item.srcColor, layer: item.layer });

          for (let v = 0; v < partVertexCount; v++) {
            const v3 = v * 3;
            const x = item.positions[v3]!;
            const y = item.positions[v3 + 1]!;
            const z = item.positions[v3 + 2]!;
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;

            const gv = vertexCursor + v;
            const fOff = gv * OPAQUE_F32_STRIDE;
            f32[fOff] = x;
            f32[fOff + 1] = y;
            f32[fOff + 2] = z;
            const itemUvs = item.uvs;
            f32[fOff + 6] = uvU(itemUvs, v, x / 16);
            f32[fOff + 7] = uvV(itemUvs, v, z / 16);

            const nOff = gv * OPAQUE_I8_STRIDE + 12;
            i8[nOff] = packSignedByteDist(normals[v3]!);
            i8[nOff + 1] = packSignedByteDist(normals[v3 + 1]!);
            i8[nOff + 2] = packSignedByteDist(normals[v3 + 2]!);
            i8[nOff + 3] = 0;

            const cOff = gv * OPAQUE_U16_STRIDE + 8;
            u16[cOff] = rU16;
            u16[cOff + 1] = gU16;
            u16[cOff + 2] = bU16;
            u16[cOff + 3] = 65535;
          }
          for (let i = 0; i < item.indices.length; i++) {
            indicesArray[indexCursor++] = vertexCursor + item.indices[i]!;
          }
          vertexCursor += partVertexCount;
        }

        const mesh = new ModelMesh(engine, bucket.owner + " batched");
        visualResources.meshes.push(mesh);
        const uvBuffer = setDistanceVertexLayout(
          engine,
          mesh,
          OPAQUE_BUCKET_VERTEX_ELEMENTS,
          bucket.parts,
          bucket.vertexCount
        );
        const vertexBuffer = new Buffer(engine, BufferBindFlag.VertexBuffer, vertexBytes, BufferUsage.Static, true);
        mesh.setVertexBufferBinding(vertexBuffer, OPAQUE_BUCKET_STRIDE);
        mesh.setIndices(indicesArray);
        mesh.addSubMesh(0, indicesArray.length);
        mesh.bounds.min.set(minX, minY, minZ);
        mesh.bounds.max.set(maxX, maxY, maxZ);
        const packed = uploadRestorableModelMesh(mesh);
        const retainedData = packed[0]?.data;
        vertexBuffer.markAsUnreadable();
        uvBuffer?.markAsUnreadable();

        if (retainedData) {
          sharedOpaqueRefreshers.push(
            makeOpaqueBucketVertexRefresher(colorSpans, retainedData, vertexBuffer, appearance)
          );
        }

        const entity = visualRoot.createChild(bucket.owner);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setMaterial(bucket.material);
        const wall = bucket.receivesWallBake && options?.wallBakes?.get(bucket.owner);
        if (wall) bindBuildingWall(renderer.shaderData, wall);
        renderer.enableVertexColor = true;
        renderer.priority = -105;
        renderer.castShadows = false;
        renderer.receiveShadows = true;
        renderer.shaderData.setFloat(PROP_MASONRY_LOD_FADE, lastFade);
        visualEntranceBindings.push({ owner: bucket.owner, apply: entranceBinding(renderer.shaderData) });

        const entities = visualOwnerEntities.get(bucket.owner) ?? [];
        entities.push(entity);
        visualOwnerEntities.set(bucket.owner, entities);

        const batch = new SeedWorldArrayPickBatch(renderer);
        batch.count = 1;
        batch.id = buildingGroupKey(bucket.owner);
        batches.push(batch);

        if (includeShadows) {
          if (bucket.parts.length === 1) {
            appendShadowChunk(bucket.owner, false, bucket.parts[0]!.positions, bucket.parts[0]!.indices, mesh);
          } else {
            for (const part of bucket.parts) {
              appendShadowChunk(bucket.owner, false, part.positions, part.indices, mesh);
            }
          }
        }
      }

      if (shadowBuckets) {
        for (const bucket of shadowBuckets.values()) {
          const firstMesh = bucket.chunks[0]?.mesh;
          const shadowMesh =
            firstMesh && bucket.chunks.every((c) => c.mesh === firstMesh)
              ? firstMesh
              : buildCompactShadowMesh(
                  engine,
                  resources,
                  bucket.owner,
                  bucket.chunks,
                  bucket.vertexCount,
                  bucket.indexCount
                );
          attachShadowCaster(bucket.owner, shadowMesh, bucket.decoration);
        }
      }

      if (sharedOpaqueRefreshers.length) {
        let initialized = false;
        visualTintSubscriptions.push(
          appearance.subscribe(() => {
            if (!initialized) {
              initialized = true;
              return;
            }
            if (disposed) return;
            for (const refresh of sharedOpaqueRefreshers) refresh();
          })
        );
      }
    };

    const buildLazyShadowCasters = (srcGeometry: ConstructionPreview) => {
      const shadowBuckets = new Map<string, ShadowBucket>();
      for (const p of srcGeometry.parts) {
        if (!p.indices.length || p.plaster) continue;
        const decoration = !!p.decoration;
        const key = `${p.owner}\0${decoration ? 1 : 0}`;
        let bucket = shadowBuckets.get(key);
        if (!bucket) {
          bucket = { owner: p.owner, decoration, chunks: [], vertexCount: 0, indexCount: 0 };
          shadowBuckets.set(key, bucket);
        }
        if (decoration && !p.roofSpire && p.indices.length > 72) {
          const box = collapsePositionsToBox(p.positions);
          bucket.chunks.push({ positions: box.positions, indices: box.indices });
          bucket.vertexCount += box.positions.length / 3;
          bucket.indexCount += box.indices.length;
        } else {
          bucket.chunks.push({ positions: p.positions, indices: p.indices });
          bucket.vertexCount += p.positions.length / 3;
          bucket.indexCount += p.indices.length;
        }
      }
      for (const bucket of shadowBuckets.values()) {
        const shadowMesh = buildCompactShadowMesh(
          engine,
          resources,
          bucket.owner,
          bucket.chunks,
          bucket.vertexCount,
          bucket.indexCount
        );
        attachShadowCaster(bucket.owner, shadowMesh, bucket.decoration);
      }
    };

    const surfaceTriangles = geometry.parts.reduce((n, p) => n + p.indices.length / 3, 0);
    const boundsSnapshot = geometry.bounds;
    const hasNativeDecorations = Boolean(
      geometry.decorationParts.length ||
        geometry.retainedWallUnits?.length ||
        geometry.stones.length ||
        geometry.frames.length ||
        geometry.woodArchFrames.length ||
        geometry.woodArchPillars.length
    );

    const hiddenOwners = new Set<string>();
    const localBounds = new BoundingBox(
      new Vector3(boundsSnapshot.min[0] ?? 0, boundsSnapshot.min[1] ?? 0, boundsSnapshot.min[2] ?? 0),
      new Vector3(boundsSnapshot.max[0] ?? 0, boundsSnapshot.max[1] ?? 0, boundsSnapshot.max[2] ?? 0)
    );
    const worldBounds = new BoundingBox();
    const currentBounds = () => {
      if (boundsFlag.flag) {
        BoundingBox.transform(localBounds, resources.root.transform.worldMatrix, worldBounds);
        boundsFlag.flag = false;
      }
      return worldBounds;
    };

    if (unifiedGlobalProxy && parent.scene) {
      globalProxySlot = BuildingGlobalProxy.forScene(parent.scene).register({
        root: resources.root,
        frame: parent,
        parts: geometry.parts,
        colorOwners: group.colorOwners,
        appearance,
        decorationParts: geometry.decorationParts,
        wallBakes: options?.wallBakes,
        lampMaterials: options?.lampMaterials,
        hiddenOwners
      });
    } else {
      farProxy = createBuildingFarProxy(
        engine,
        resources.root,
        geometry.parts,
        group.colorOwners,
        appearance,
        geometry.decorationParts,
        options?.lampMaterials
      );
    }

    const hasFarProxy = Boolean(farProxy || globalProxySlot);
    let lod1GeometryBuilt = false;
    pendingGeometry = geometry;
    pendingGroup = group;

    if (hasFarProxy) {
      if (!unifiedGlobalProxy) buildLazyShadowCasters(geometry);
    } else {
      buildLod1Visuals(geometry, group, !unifiedGlobalProxy);
      lod1GeometryBuilt = true;
    }
    geometry = undefined as unknown as ConstructionPreview;

    const teardownDetailedVisual = () => {
      detailedGeneration++;
      previewAbort?.abort();
      previewAbort = undefined;
      detailedInitialized = false;
      detailedVisualReady = false;
      detailedReady = undefined;
      lod1GeometryBuilt = false;
      if (loadPreview) pendingGeometry = undefined;
      visualTintSubscriptions.forEach((subscription) => subscription.destroy());
      visualTintSubscriptions.length = 0;
      nativeDecorationView?.destroy();
      nativeDecorationView = undefined;
      nativeDecorationPicks.length = 0;
      batches.length = 0;
      visualEntranceBindings.length = 0;
      visualOwnerEntities.clear();
      materials.clear();
      lodAppearanceIds.clear();
      lodMaterialBindings.length = 0;
      plasterMaterials.length = 0;
      stoneFloorMaterials.length = 0;
      decorationMaterials.length = 0;
      const staleTextures = lodTextures.size ? [...lodTextures.values()] : [];
      lodTextures.clear();
      const staleLeases = [textureLease, stoneFloorLease, decorationTextureLease];
      textureLease = undefined;
      stoneFloorLease = undefined;
      decorationTextureLease = undefined;
      const staleMaterials = visualResources.materials.splice(0);
      const staleMeshes = visualResources.meshes.splice(0);
      const children = [...visualRoot.children];
      let anyPending = false;
      for (const child of children) {
        child.isActive = false;
        child.destroy();
        if (child.pendingDestroy) anyPending = true;
      }
      const release = () => {
        for (const material of staleMaterials) material.destroy();
        for (const mesh of staleMeshes) destroyOwnedModelMesh(mesh);
        for (const tex of staleTextures) tex.destroy();
        for (const lease of staleLeases) lease?.destroy();
      };
      // Child entity destruction is deferred until end-of-frame while Engine._frameInProcess is true;
      // destroying materials/meshes/textures synchronously would fail refCount === 0 and leak them.
      if (anyPending) queueMicrotask(release);
      else release();
    };

    const scheduleDetailedRetry = () => {
      if (disposed) return;
      detailedRetryAt = performance.now() + 2000;
      if (detailedRetryTimer === undefined) {
        detailedRetryTimer = setTimeout(() => {
          detailedRetryTimer = undefined;
          if (disposed || detailedInitialized) return;
          detailedRetryAt = 0;
          syncVisualRoots();
        }, 2000);
      }
      if (!deviceRestoreCleanup && typeof engine.on === "function") {
        const onRestored = () => {
          clearDetailedRetryHooks();
          if (disposed) return;
          detailedRetryAt = 0;
          syncVisualRoots();
        };
        engine.on("devicerestored", onRestored);
        deviceRestoreCleanup = () => {
          engine.off?.("devicerestored", onRestored);
        };
      }
    };

    const hydrateDetailedVisual = (
      gen: number,
      activeGeom: ConstructionPreview,
      activeGroup: BuildingDistanceInput
    ): Promise<void> => {
      try {
        if (!lod1GeometryBuilt) {
          buildLod1Visuals(activeGeom, activeGroup, false);
          lod1GeometryBuilt = true;
          if (lastEntranceStates) {
            for (const binding of visualEntranceBindings) binding.apply(lastEntranceStates.get(binding.owner));
          }
          if (lastLodDebugEnabled) {
            const lod1Color = new Vector4(0.95, 0.78, 0.08, 0.82);
            for (const batch of batches) batch.renderer.shaderData.setVector4(PROP_MASONRY_LOD_DEBUG_COLOR, lod1Color);
          }
        }
        for (const binding of lodMaterialBindings) {
          if (disposed) break;
          let appearanceTexture = lodTextures.get(binding.appearance);
          if (!appearanceTexture) {
            appearanceTexture = createConstructionLodTexture(engine, binding.appearance);
            lodTextures.set(binding.appearance, appearanceTexture);
          }
          binding.material.shaderData.enableMacro("MASONRY_LAYOUT_APPEARANCE");
          binding.material.shaderData.setTexture("material_MasonryLayout", appearanceTexture);
          binding.material.shaderData.setVector4("material_MasonryLayoutUV", new Vector4(...binding.uvTransform));
        }
        stoneFloorLease = stoneFloorMaterials.length ? leaseStoneFloorTextures(engine, assets) : undefined;
        textureLease = plasterMaterials.length ? leasePlasterTextures(engine, assets) : undefined;
        decorationTextureLease = decorationMaterials.length ? leaseDecorationTextures(engine, assets) : undefined;
        if (hasNativeDecorations) {
          nativeDecorationView = createDecorationNativeView(
            engine,
            visualRoot,
            activeGeom.stones,
            activeGroup.paletteSlots,
            {
              assets,
              retainedWallUnits: activeGeom.retainedWallUnits,
              wallBakes: options?.wallBakes,
              lampMaterials: options?.lampMaterials,
              parts: activeGeom.decorationParts,
              rigidDecorations: activeGroup.rigidDecorations,
              frames: activeGeom.frames,
              woodArchFrames: activeGeom.woodArchFrames,
              woodArchPillars: activeGeom.woodArchPillars,
              camera,
              bounds: boundsSnapshot
            }
          );
          if (lastEntranceStates) nativeDecorationView.setEntrance(lastEntranceStates);
          for (const hiddenOwner of hiddenOwners) nativeDecorationView.setOwnerVisible(hiddenOwner, false);
          if (lastFade !== 1) nativeDecorationView.setFade(lastFade);
          if (lastLodDebugEnabled) nativeDecorationView.setLodDebugEnabled(true);
        }
        for (const hiddenOwner of hiddenOwners) {
          for (const entity of ownerEntities.get(hiddenOwner) ?? []) entity.isActive = false;
          for (const entity of visualOwnerEntities.get(hiddenOwner) ?? []) entity.isActive = false;
        }
        // Once LOD1 geometry & native decorations are constructed, release CPU preview buffers when reloadable.
        if (loadPreview) pendingGeometry = undefined;
      } catch (error) {
        if (!disposed && gen === detailedGeneration) {
          teardownDetailedVisual();
          scheduleDetailedRetry();
        }
        return Promise.reject(error);
      }
      const currentNativeDecorationView = nativeDecorationView;
      const pendingTasks: Promise<unknown>[] = [];
      if (stoneFloorLease) {
        pendingTasks.push(
          stoneFloorLease.ready.then((bind) => {
            if (disposed || gen !== detailedGeneration) return;
            if (bind) for (const m of stoneFloorMaterials) bind(m);
          })
        );
      }
      if (textureLease) {
        pendingTasks.push(
          textureLease.ready.then((bind) => {
            if (disposed || gen !== detailedGeneration) return;
            if (bind) for (const m of plasterMaterials) bind(m);
          })
        );
      }
      if (decorationTextureLease) {
        pendingTasks.push(
          decorationTextureLease.ready.then((bind) => {
            if (disposed || gen !== detailedGeneration) return;
            if (bind) for (const m of decorationMaterials) bind(m);
          })
        );
      }
      if (currentNativeDecorationView) {
        pendingTasks.push(
          currentNativeDecorationView.ready.then(() => {
            if (disposed || gen !== detailedGeneration || nativeDecorationView !== currentNativeDecorationView) return;
            currentNativeDecorationView.visitRenderers((renderer, ownerId, draw) => {
              const ids = draw.pickIds ?? [
                draw.objectBinding?.id ??
                  (draw.pickId === undefined ? buildingGroupKey(ownerId) : buildingPartKey(draw.pickId))
              ];
              nativeDecorationPicks.push({
                renderer,
                count: ids.length,
                resolve: (index) => ids[index],
                prepare: () => {
                  if (draw.pickIds) renderer.shaderData.setFloat("renderer_MasonryPickObjects", 1);
                },
                restore: () => renderer.shaderData.setFloat("renderer_MasonryPickObjects", 0)
              });
            });
          })
        );
      }
      if (pendingTasks.length === 0) {
        clearDetailedRetryHooks();
        detailedRetryAt = 0;
        detailedVisualReady = true;
        syncVisualRoots();
        return Promise.resolve();
      }
      return Promise.all(pendingTasks).then(
        () => {
          if (disposed || gen !== detailedGeneration) return;
          clearDetailedRetryHooks();
          detailedRetryAt = 0;
          detailedVisualReady = true;
          syncVisualRoots();
        },
        (error) => {
          if (!disposed && gen === detailedGeneration) {
            teardownDetailedVisual();
            scheduleDetailedRetry();
          }
          throw error;
        }
      );
    };

    const ensureDetailedVisual = (): Promise<void> => {
      if (detailedReady) return detailedReady;
      if (!pendingGroup || (!pendingGeometry && !loadPreview)) return Promise.resolve();
      const gen = ++detailedGeneration;
      detailedInitialized = true;
      detailedRetryAt = 0;
      if (detailedRetryTimer !== undefined) {
        clearTimeout(detailedRetryTimer);
        detailedRetryTimer = undefined;
      }
      const activeGroup = pendingGroup;
      if (pendingGeometry) {
        const task = hydrateDetailedVisual(gen, pendingGeometry, activeGroup);
        if (!disposed && gen === detailedGeneration) detailedReady = task;
        return task;
      }
      const controller = (previewAbort = new AbortController());
      detailedReady = loadPreview!(controller.signal).then(
        (reloadedGeom) => {
          if (previewAbort === controller) previewAbort = undefined;
          if (disposed || gen !== detailedGeneration) return;
          return hydrateDetailedVisual(gen, reloadedGeom, activeGroup);
        },
        (error) => {
          if (previewAbort === controller) previewAbort = undefined;
          if (!disposed && gen === detailedGeneration) {
            teardownDetailedVisual();
            scheduleDetailedRetry();
          }
          throw error;
        }
      );
      return detailedReady;
    };
    if (globalProxySlot) {
      let proxyPaletteInitialized = false;
      const slotRef = globalProxySlot;
      tintSubscriptions.push(
        appearance.subscribe(() => {
          if (!proxyPaletteInitialized) {
            proxyPaletteInitialized = true;
            return;
          }
          if (!disposed) slotRef.refreshColors();
        })
      );
    } else if (farProxy) {
      let proxyPaletteInitialized = false;
      const proxyRef = farProxy;
      tintSubscriptions.push(
        appearance.subscribe(() => {
          if (!proxyPaletteInitialized) {
            proxyPaletteInitialized = true;
            return;
          }
          if (!disposed) proxyRef.refreshColors();
        })
      );
    }
    let visualVisible = false;
    let farProxyMode = hasFarProxy;
    let entranceSettled = true;
    let entranceDissolving = false;
    let proxyEntranceEligible = true;
    let detailedCheckQueued = false;
    let lastUseFar = false;
    let lastShadowVisible = false;
    const syncVisualRoots = () => {
      const hasVisualSource = detailedInitialized || Boolean(pendingGeometry) || Boolean(loadPreview);
      const proxyHandlesEntrance = entranceSettled || (Boolean(globalProxySlot) && proxyEntranceEligible);
      const wantDetailed =
        visualVisible &&
        hasVisualSource &&
        (!hasFarProxy || hiddenOwners.size > 0 || !proxyHandlesEntrance || !farProxyMode);
      const canFallbackToFar = hasFarProxy && visualVisible && hiddenOwners.size === 0 && proxyHandlesEntrance;
      // Never hide Far/Global Proxy before visualRoot is built and ready; otherwise the building
      // vanishes for 1+ frames while ensureDetailedVisual() runs asynchronously after render.
      const useFar = canFallbackToFar && (farProxyMode || !detailedVisualReady || !hasVisualSource);
      const shadowVisible = !entranceDissolving || !hasVisualSource;
      lastUseFar = useFar;
      lastShadowVisible = shadowVisible;
      if (farProxy) farProxy.root.isActive = useFar;
      globalProxySlot?.updateState(useFar, shadowVisible, lastFade, lastLodDebugEnabled);
      visualRoot.isActive = visualVisible && !useFar;
      if (wantDetailed && !detailedInitialized && performance.now() >= detailedRetryAt) {
        if (!canFallbackToFar) {
          void ensureDetailedVisual().catch(() => {});
        } else if (!detailedCheckQueued) {
          detailedCheckQueued = true;
          queueMicrotask(() => {
            detailedCheckQueued = false;
            if (disposed || detailedInitialized || performance.now() < detailedRetryAt) return;
            const stillProxyHandlesEntrance = entranceSettled || (Boolean(globalProxySlot) && proxyEntranceEligible);
            const stillWantDetailed =
              visualVisible &&
              (Boolean(pendingGeometry) || Boolean(loadPreview)) &&
              (!hasFarProxy || hiddenOwners.size > 0 || !stillProxyHandlesEntrance || !farProxyMode);
            if (stillWantDetailed) void ensureDetailedVisual().catch(() => {});
          });
        }
      }
    };
    const releaseDetailedVisual = () => {
      const proxyHandlesEntrance = entranceSettled || (Boolean(globalProxySlot) && proxyEntranceEligible);
      if (
        disposed ||
        warmupInFlight > 0 ||
        !hasFarProxy ||
        !proxyHandlesEntrance ||
        hiddenOwners.size > 0 ||
        (visualVisible && !farProxyMode)
      )
        return;
      if (loadPreview && visualVisible) pendingGeometry = undefined;
      if (!detailedInitialized) return;
      teardownDetailedVisual();
      syncVisualRoots();
    };
    const releasePendingGeometry = () => {
      if (loadPreview && warmupInFlight === 0) pendingGeometry = undefined;
    };
    const warmupDetailedVisual = (): Promise<void> => {
      warmupInFlight++;
      return ensureDetailedVisual().finally(() => {
        warmupInFlight = Math.max(0, warmupInFlight - 1);
      });
    };
    const ready = hasFarProxy ? Promise.resolve() : ensureDetailedVisual();
    syncVisualRoots();
    return {
      ready,
      entranceRanges,
      setEntrance(states: ReadonlyMap<string, ConstructionEntranceState>) {
        lastEntranceStates = states;
        for (const binding of entranceBindings) binding.apply(states.get(binding.owner));
        for (const binding of visualEntranceBindings) binding.apply(states.get(binding.owner));
        nativeDecorationView?.setEntrance(states);
        let settled = true;
        let dissolving = false;
        let commonProgress = 1;
        let hasProgress = false;
        let uniformProgress = true;
        let localMinY = Infinity;
        let localMaxY = -Infinity;
        const recordOwnerState = (progress: number, minY?: number, maxY?: number) => {
          if (Math.abs(progress - 1) > 1e-4) settled = false;
          if (progress < 1 - 1e-4) dissolving = true;
          if (!hasProgress) {
            commonProgress = progress;
            hasProgress = true;
          } else if (Math.abs(progress - commonProgress) > 1e-4) {
            uniformProgress = false;
          }
          if (minY !== undefined && minY < localMinY) localMinY = minY;
          if (maxY !== undefined && maxY > localMaxY) localMaxY = maxY;
        };
        if (entranceRanges.size > 0) {
          // Owners omitted from `states` are treated as settled (progress = 1), matching entranceBinding().
          for (const [owner, range] of entranceRanges) {
            const s = states.get(owner);
            if (s) recordOwnerState(s.progress, s.minimumY, s.minimumY + s.height);
            else recordOwnerState(1, range.min, range.max);
          }
        } else {
          for (const s of states.values()) {
            recordOwnerState(s.progress, s.minimumY, s.minimumY + s.height);
          }
        }
        if (globalProxySlot) {
          if (settled || !hasProgress) {
            globalProxySlot.updateEntrance(1, 0, 1);
          } else if (uniformProgress) {
            // Read from surviving resources.root (identity child of parent while live, reparented to anchor when exiting).
            const bounds = currentBounds();
            const wm = (resources.root.destroyed ? parent : resources.root).transform.worldMatrix.elements;
            const yScale = Math.hypot(wm[4] ?? 0, wm[5] ?? 1, wm[6] ?? 0) || 1;
            const yOrigin = wm[13] ?? 0;
            const worldMinY = Number.isFinite(localMinY) ? yOrigin + localMinY * yScale : bounds.min.y;
            const worldHeight =
              Number.isFinite(localMinY) && Number.isFinite(localMaxY)
                ? Math.max(0.001, (localMaxY - localMinY) * yScale)
                : Math.max(0.001, bounds.max.y - bounds.min.y);
            globalProxySlot.updateEntrance(commonProgress, worldMinY, worldHeight);
          } else {
            globalProxySlot.updateEntrance(1, 0, 1);
          }
        }
        const nextProxyEntranceEligible = settled || uniformProgress;
        if (
          settled !== entranceSettled ||
          dissolving !== entranceDissolving ||
          nextProxyEntranceEligible !== proxyEntranceEligible
        ) {
          entranceSettled = settled;
          entranceDissolving = dissolving;
          proxyEntranceEligible = nextProxyEntranceEligible;
          syncVisualRoots();
        }
      },
      root: resources.root,
      bounds: boundsSnapshot,
      get triangles() {
        return surfaceTriangles + (nativeDecorationView?.triangles ?? 0);
      },
      // Always-enabled coarse shadow renderers avoid feedback from disabled LODs.
      // This engine feedback may include shadows/other cameras; use ONLY for load priority.
      get recentlyRendered() {
        if (globalProxySlot) {
          const frustum = (camera as { _frustum?: { intersectsBox(box: BoundingBox): boolean } } | undefined)?._frustum;
          return frustum ? frustum.intersectsBox(currentBounds()) : true;
        }
        return (
          (farProxy?.root.isActiveInHierarchy && !farProxy.renderer.isCulled) ||
          residencyProbes.some((renderer) => !renderer.isCulled)
        );
      },
      get isVisualVisible() {
        return visualRoot.isActiveInHierarchy || (farProxy?.root.isActiveInHierarchy ?? false) || lastUseFar;
      },
      setOwnerVisible(owner: string, visible: boolean) {
        if (visible) hiddenOwners.delete(owner);
        else hiddenOwners.add(owner);
        for (const entity of ownerEntities.get(owner) ?? []) entity.isActive = visible;
        for (const entity of visualOwnerEntities.get(owner) ?? []) entity.isActive = visible;
        nativeDecorationView?.setOwnerVisible(owner, visible);
        globalProxySlot?.markTopologyDirty();
        syncVisualRoots();
      },
      setVisualVisible(visible: boolean) {
        if (visualVisible === visible) return;
        visualVisible = visible;
        syncVisualRoots();
      },
      setPickable(pickable: boolean) {
        globalProxySlot?.setPickable(pickable);
      },
      setFarProxyActive(active: boolean) {
        if (farProxyMode === active) return;
        farProxyMode = active;
        syncVisualRoots();
      },
      warmupDetailedVisual,
      releaseDetailedVisual,
      releasePendingGeometry,
      setFade(fade: number) {
        lastFade = fade;
        const needDither = fade < 0.999;
        if (needDither !== ditherEnabled) {
          ditherEnabled = needDither;
          for (let i = 0, n = visualResources.materials.length; i < n; i++) {
            const sd = visualResources.materials[i]!.shaderData;
            if (needDither) sd?.enableMacro?.(MACRO_SURFACE_DITHER);
            else sd?.disableMacro?.(MACRO_SURFACE_DITHER);
          }
        }
        for (const batch of batches) batch.renderer.shaderData.setFloat(PROP_MASONRY_LOD_FADE, fade);
        nativeDecorationView?.setFade(fade);
        farProxy?.setFade(fade);
        globalProxySlot?.updateState(lastUseFar, lastShadowVisible, fade, lastLodDebugEnabled);
      },
      setLodDebugEnabled(enabled: boolean) {
        lastLodDebugEnabled = enabled;
        const lod1Color = enabled ? new Vector4(0.95, 0.78, 0.08, 0.82) : new Vector4(0, 0, 0, 0);
        for (const batch of batches) batch.renderer.shaderData.setVector4(PROP_MASONRY_LOD_DEBUG_COLOR, lod1Color);
        nativeDecorationView?.setLodDebugEnabled(enabled);
        if (enabled) farProxy?.setLodDebugColor(0.95, 0.2, 0.18, 0.82);
        else farProxy?.setLodDebugColor(0, 0, 0, 0);
        globalProxySlot?.updateState(lastUseFar, lastShadowVisible, lastFade, enabled);
      },
      visitPickBatches(visitor: SeedWorldPickVisitor & { __fromRuntime?: boolean }) {
        if (globalProxySlot) {
          if (!visitor.__fromRuntime && parent.scene)
            BuildingGlobalProxy.existing(parent.scene)?.visitPickBatches(visitor, parent);
          if (lastUseFar || !visualRoot.isActiveInHierarchy) return;
        }
        if (farProxy?.root.isActiveInHierarchy && farProxy.renderer.enabled) {
          visitor(farProxy.pickBatch);
          return;
        }
        if (!visualRoot.isActiveInHierarchy) return;
        for (const b of batches) if (b.renderer.enabled && b.renderer.entity.isActiveInHierarchy) visitor(b);
        for (const b of nativeDecorationPicks)
          if (b.renderer.enabled && b.renderer.entity.isActiveInHierarchy) visitor(b);
      },
      destroy: disposeView
    };
  } catch (e) {
    disposeView();
    throw e;
  }
}
