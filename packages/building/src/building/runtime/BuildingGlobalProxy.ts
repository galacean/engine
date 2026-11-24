import {
  BoundingBox,
  Buffer,
  BufferBindFlag,
  BufferMesh,
  BufferUsage,
  CompareFunction,
  CullMode,
  Entity,
  IndexBufferBinding,
  IndexFormat,
  Material,
  MeshRenderer,
  MeshTopology,
  Script,
  Shader,
  ShaderFactory,
  ShaderLanguage,
  ShaderMacro,
  ShaderProperty,
  Vector3,
  VertexElement,
  VertexElementFormat,
  type BoolUpdateFlag,
  type Engine,
  type Scene
} from "@galacean/engine";
import globalProxyShaderSource from "./MasonryGlobalProxy.shader?raw";
import globalProxyShadowOnlyShaderSource from "./MasonryGlobalProxyShadowOnly.shader?raw";
import globalProxyShadowCasterGlsl from "./MasonryGlobalProxyShadowCaster.glsl?raw";
import lodDither from "./MasonryLodDither.glsl?raw";
import { registerConstructionSceneLighting } from "./ConstructionSceneLighting";
import { constructionPlasterGLSL } from "./ConstructionPlasterShader";
import type { BuildingPaletteSlot } from "./BuildingGlobals";
import { uvU, uvV, type ConstructionPreviewPart, type PackedUv2 } from "./ConstructionPreview";
import type { ConstructionDecorationPart } from "./ConstructionDecorations";
import { DecorationMaterial } from "./ConstructionDecorationMaterial";
import { buildingGroupKey, buildingInstanceKey, buildingPartKey } from "./BuildingObjectIdentity";
import type { masonryAppearance } from "./MasonryAppearance";
import type { SeedWorldPickBatch } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import {
  SURFACE_KIND_DECORATION,
  SURFACE_KIND_DECORATION_GLASS,
  SURFACE_KIND_PLASTER,
  buildCompactColorSpans,
  collapseDecorationToBoxes,
  collapsePreviewPartToBox,
  computeGeometricNormals,
  packSignedByte,
  packU16Scaled,
  packU8Scaled,
  previewPartSurfaceKind,
  proxyDecorationNormalBias,
  proxyPartNormalBias,
  writeCompactFarProxyColors
} from "./BuildingFarProxy";

const MAX_SLOTS_PER_BUCKET = 64;
const PROXY_CELL_SIZE_METRES = 64;
const BOX_INST_STRIDE_BYTES = 76;
const STRUCT_GEOM_STRIDE_BYTES = 32;
const STRUCT_META_STRIDE_BYTES = 4;
const PROP_RASTER_STATE_CULL_MODE =
  ShaderProperty?.getByName?.("rasterStateCullMode") ?? ("rasterStateCullMode" as unknown as ShaderProperty);
const MACRO_GLOBAL_PROXY_DITHER =
  ShaderMacro?.getByName?.("GLOBAL_PROXY_DITHER") ?? ("GLOBAL_PROXY_DITHER" as unknown as ShaderMacro);
const MACRO_GLOBAL_PROXY_ENTRANCE =
  ShaderMacro?.getByName?.("GLOBAL_PROXY_ENTRANCE") ?? ("GLOBAL_PROXY_ENTRANCE" as unknown as ShaderMacro);
const MACRO_GLOBAL_PROXY_PLASTER =
  ShaderMacro?.getByName?.("GLOBAL_PROXY_PLASTER") ?? ("GLOBAL_PROXY_PLASTER" as unknown as ShaderMacro);

const UNIT_BOX_VERT_STRIDE = 24; // vec3 pos (12) + i8x4 norm (4) + vec2 uv (8)

function createUnitBoxMeshGeometry(engine: Engine): {
  vb: Buffer;
  ib: Buffer;
  vertexCount: number;
  indexCount: number;
} {
  // 24 vertices, [-0.5..0.5]^3 with face normals and [0..1] UVs
  const faces: readonly { n: [number, number, number]; corners: [number, number, number][] }[] = [
    {
      n: [1, 0, 0],
      corners: [
        [0.5, -0.5, -0.5],
        [0.5, 0.5, -0.5],
        [0.5, 0.5, 0.5],
        [0.5, -0.5, 0.5]
      ]
    },
    {
      n: [-1, 0, 0],
      corners: [
        [-0.5, -0.5, 0.5],
        [-0.5, 0.5, 0.5],
        [-0.5, 0.5, -0.5],
        [-0.5, -0.5, -0.5]
      ]
    },
    {
      n: [0, 1, 0],
      corners: [
        [-0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, -0.5],
        [-0.5, 0.5, -0.5]
      ]
    },
    {
      n: [0, -1, 0],
      corners: [
        [-0.5, -0.5, -0.5],
        [0.5, -0.5, -0.5],
        [0.5, -0.5, 0.5],
        [-0.5, -0.5, 0.5]
      ]
    },
    {
      n: [0, 0, 1],
      corners: [
        [-0.5, -0.5, 0.5],
        [0.5, -0.5, 0.5],
        [0.5, 0.5, 0.5],
        [-0.5, 0.5, 0.5]
      ]
    },
    {
      n: [0, 0, -1],
      corners: [
        [0.5, -0.5, -0.5],
        [-0.5, -0.5, -0.5],
        [-0.5, 0.5, -0.5],
        [0.5, 0.5, -0.5]
      ]
    }
  ];
  const uvs = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1]
  ] as const;
  const bytes = new Uint8Array(24 * UNIT_BOX_VERT_STRIDE);
  const f32 = new Float32Array(bytes.buffer);
  const i8 = new Int8Array(bytes.buffer);
  for (let f = 0; f < 6; f++) {
    const face = faces[f]!;
    for (let c = 0; c < 4; c++) {
      const vi = f * 4 + c;
      const fb = vi * (UNIT_BOX_VERT_STRIDE / 4);
      const bb = vi * UNIT_BOX_VERT_STRIDE;
      const p = face.corners[c]!;
      f32[fb] = p[0];
      f32[fb + 1] = p[1];
      f32[fb + 2] = p[2];
      i8[bb + 12] = packSignedByte(face.n[0]);
      i8[bb + 13] = packSignedByte(face.n[1]);
      i8[bb + 14] = packSignedByte(face.n[2]);
      i8[bb + 15] = 0;
      f32[fb + 4] = uvs[c]![0];
      f32[fb + 5] = uvs[c]![1];
    }
  }
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14, 15, 16, 17, 18, 16, 18, 19, 20, 21, 22,
    20, 22, 23
  ]);
  return {
    vb: new Buffer(engine, BufferBindFlag.VertexBuffer, bytes, BufferUsage.Static, false),
    ib: new Buffer(engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static, false),
    vertexCount: 24,
    indexCount: 36
  };
}

const BOX_ELEMENTS: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.NormalizedByte4, 0, 0),
  new VertexElement("TEXCOORD_0", 16, VertexElementFormat.Vector2, 0, 0),
  new VertexElement("TEXCOORD_1", 0, VertexElementFormat.Vector4, 1, 1),
  new VertexElement("TEXCOORD_2", 16, VertexElementFormat.Vector4, 1, 1),
  new VertexElement("TEXCOORD_3", 32, VertexElementFormat.Vector4, 1, 1),
  new VertexElement("COLOR_0", 48, VertexElementFormat.NormalizedUByte4, 1, 1),
  new VertexElement("TANGENT", 52, VertexElementFormat.NormalizedUShort4, 1, 1),
  new VertexElement("TEXCOORD_4", 60, VertexElementFormat.Vector4, 1, 1)
];

const STRUCT_ELEMENTS: VertexElement[] = [
  new VertexElement("POSITION", 0, VertexElementFormat.Vector3, 0),
  new VertexElement("NORMAL", 12, VertexElementFormat.NormalizedByte4, 0),
  new VertexElement("TEXCOORD_0", 16, VertexElementFormat.Vector2, 0),
  new VertexElement("TANGENT", 24, VertexElementFormat.NormalizedUShort4, 0),
  new VertexElement("COLOR_0", 0, VertexElementFormat.NormalizedUByte4, 1),
  new VertexElement("TEXCOORD_1", 0, VertexElementFormat.Float, 2)
];

function ensureGlobalProxyIncludes(): void {
  registerConstructionSceneLighting();
  if (!ShaderFactory.includeMap["Masonry/GlobalProxyShadowCaster.glsl"]) {
    ShaderFactory.registerInclude("Masonry/GlobalProxyShadowCaster.glsl", globalProxyShadowCasterGlsl);
  }
  if (!ShaderFactory.includeMap["Masonry/LodDither.glsl"]) {
    ShaderFactory.registerInclude("Masonry/LodDither.glsl", lodDither);
  }
  if (!ShaderFactory.includeMap["Masonry/Plaster.glsl"]) {
    ShaderFactory.registerInclude("Masonry/Plaster.glsl", constructionPlasterGLSL);
  }
}

function getGlobalProxyShader(): Shader {
  ensureGlobalProxyIncludes();
  return Shader.find("Masonry/GlobalProxy") ?? Shader.create(globalProxyShaderSource, ShaderLanguage.GLSLES300);
}

function getGlobalProxyShadowOnlyShader(): Shader {
  ensureGlobalProxyIncludes();
  return (
    Shader.find("Masonry/GlobalProxyShadowOnly") ??
    Shader.create(globalProxyShadowOnlyShaderSource, ShaderLanguage.GLSLES300)
  );
}

function spatialCellKey(worldMatrixElements: ArrayLike<number>): number {
  const cx = Math.floor((worldMatrixElements[12] ?? 0) / PROXY_CELL_SIZE_METRES);
  const cz = Math.floor((worldMatrixElements[14] ?? 0) / PROXY_CELL_SIZE_METRES);
  return (cx + 32768) * 65536 + (cz + 32768);
}

/** Check if a 24-vertex, 36-index local chunk is a strict axis-aligned box whose corners sit on [min, max]. */
function tryExtractLocalAxisBox(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>
): { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number } | undefined {
  if (positions.length !== 72 || indices.length !== 36) return undefined;
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < 72; i += 3) {
    const x = positions[i]!,
      y = positions[i + 1]!,
      z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  const sx = maxX - minX,
    sy = maxY - minY,
    sz = maxZ - minZ;
  if (!(sx > 1e-4 && sy > 1e-4 && sz > 1e-4)) return undefined;
  const epsX = sx * 1e-3 + 1e-4;
  const epsY = sy * 1e-3 + 1e-4;
  const epsZ = sz * 1e-3 + 1e-4;
  for (let i = 0; i < 72; i += 3) {
    const x = positions[i]!,
      y = positions[i + 1]!,
      z = positions[i + 2]!;
    if (Math.abs(x - minX) > epsX && Math.abs(x - maxX) > epsX) return undefined;
    if (Math.abs(y - minY) > epsY && Math.abs(y - maxY) > epsY) return undefined;
    if (Math.abs(z - minZ) > epsZ && Math.abs(z - maxZ) > epsZ) return undefined;
  }
  return {
    cx: (minX + maxX) * 0.5,
    cy: (minY + maxY) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    sx,
    sy,
    sz
  };
}

export interface GlobalProxyRegistrationInput {
  root: Entity;
  frame: Entity;
  parts: readonly ConstructionPreviewPart[];
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[];
  appearance: ReturnType<typeof masonryAppearance>;
  decorationParts?: readonly ConstructionDecorationPart[];
  hiddenOwners: ReadonlySet<string>;
}

export interface GlobalProxySlotHandle {
  updateState(farVisible: boolean, shadowVisible: boolean, fade: number, lodDebug: boolean): void;
  updateEntrance(progress: number, worldMinY: number, worldHeight: number): void;
  setPickable(pickable: boolean): void;
  refreshColors(): void;
  markTopologyDirty(): void;
  destroy(): void;
}

interface StoredChunkMeta {
  box: boolean;
  vertexStart: number; // vertex index inside struct OR instance index inside boxes
  vertexCount: number; // vertex count for struct, 1 for box
  pickId: string;
  surfaceKind: number;
  wear: number;
  wallLength: number;
  edgeDist: number;
  castShadow: number;
  localBox?: { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number };
}

type CachedAxisBox = ReturnType<typeof tryExtractLocalAxisBox>;

interface CachedProxyPart {
  readonly part: ConstructionPreviewPart;
  readonly localBox: CachedAxisBox;
  readonly normals: readonly number[] | Float32Array | undefined;
}

interface CachedProxyDecoration {
  readonly decoration: ConstructionDecorationPart;
  readonly localBox: CachedAxisBox;
  readonly normals: readonly number[] | Float32Array | undefined;
}

interface SlotColorBinding {
  readonly partSpans: ReturnType<typeof buildCompactColorSpans>["partSpans"];
  readonly decoSpans: ReturnType<typeof buildCompactColorSpans>["decoSpans"];
  readonly totalV: number;
  readonly boxPatches: Array<{ byteOffset: number; vOff: number; eU8: number }>;
  readonly structPatches: Array<{
    chunk: StructChunkRender;
    dstVertexOffset: number;
    srcVertexOffset: number;
    count: number;
  }>;
}

interface SlotRecord {
  id: number;
  bucket: BucketRenderState;
  localSlot: number;
  root: Entity;
  frame: Entity;
  farVisible: boolean;
  shadowVisible: boolean;
  pickable: boolean;
  fade: number;
  lodDebug: boolean;
  entranceProgress: number;
  entranceMinY: number;
  entranceHeight: number;
  // Built intermediate geometry per building (disposed or rebuilt on demand)
  parts: readonly CachedProxyPart[];
  decorationParts: readonly CachedProxyDecoration[];
  colorOwners: readonly ({ id: string } & BuildingPaletteSlot)[];
  appearance: ReturnType<typeof masonryAppearance>;
  hiddenOwners: ReadonlySet<string>;
  lastWorldMatrix: Float64Array;
  worldFlag?: BoolUpdateFlag;
}

interface StructChunkRender {
  entity: Entity;
  renderer: MeshRenderer;
  mesh: BufferMesh;
  geomBuf: Buffer;
  colorBuf: Buffer;
  colorBytes: Uint8Array;
  metaBuf: Buffer;
  idxBuf: Buffer;
  castsShadow: boolean;
  pickEntries: Array<{ slot: SlotRecord; frame: Entity; id: string }>;
}

interface BucketRenderState {
  id: number;
  cellKey: number;
  slots: SlotRecord[];
  statesUniform: Float32Array;
  entranceUniform: Float32Array;
  boxMat: Material;
  boxShadowOnlyMat: Material;
  structMat: Material;
  structShadowOnlyMat: Material;
  boxEntity: Entity;
  boxRenderer: MeshRenderer;
  boxMesh?: BufferMesh;
  boxInstanceBuf?: Buffer;
  boxHasShadowCasters: boolean;
  boxPickEntries: Array<{ slot: SlotRecord; frame: Entity; id: string }>;
  structChunks: StructChunkRender[];
  slotColorCaches: Map<number, SlotColorBinding>;
  colorDirtySlots: Set<SlotRecord>;
  ditherEnabled: boolean;
  entranceEnabled: boolean;
  hasPlaster: boolean;
  dirty: boolean;
}

class GlobalProxyFlushScript extends Script {
  owner!: BuildingGlobalProxy;
  override onLateUpdate(): void {
    this.owner.flushOnLateUpdate();
  }
  override onDestroy(): void {
    this.owner?.destroy();
  }
}

const GLOBAL_PROXIES = new WeakMap<Scene, BuildingGlobalProxy>();
const SCENE_BATCH_DEPTH = new WeakMap<Scene, number>();

/** Detach a mesh from its MeshRenderer before destroying so ReferResource._refCount drops to 0 synchronously. */
function detachAndDestroyMesh(renderer: MeshRenderer, mesh: BufferMesh | undefined): void {
  if (!renderer.destroyed) {
    renderer.enabled = false;
    if (renderer.mesh === mesh || mesh) {
      renderer.mesh = null as unknown as BufferMesh;
    }
  }
  mesh?.destroy();
}

/** Detach any attached material from a MeshRenderer before destroying owned bucket materials. */
function detachAndDestroyMaterials(renderer: MeshRenderer, materials: readonly Material[]): void {
  if (!renderer.destroyed) {
    renderer.setMaterial(null as unknown as Material);
  }
  for (let i = 0; i < materials.length; i++) {
    materials[i]!.destroy();
  }
}

export class BuildingGlobalProxy {
  static forScene(scene: Scene): BuildingGlobalProxy {
    let proxy = GLOBAL_PROXIES.get(scene);
    if (!proxy || proxy.destroyed) {
      proxy = new BuildingGlobalProxy(scene);
      GLOBAL_PROXIES.set(scene, proxy);
    }
    return proxy;
  }

  static existing(scene: Scene): BuildingGlobalProxy | undefined {
    const p = GLOBAL_PROXIES.get(scene);
    return p && !p.destroyed ? p : undefined;
  }

  /** Suspend automatic GPU bucket rebuilds for a scene while multiple buildings prepare together.
   * Safe to call before any BuildingGlobalProxy instance exists on the scene. */
  static beginSceneBatch(scene: Scene): void {
    SCENE_BATCH_DEPTH.set(scene, (SCENE_BATCH_DEPTH.get(scene) ?? 0) + 1);
  }

  /** Resume automatic flushes for a scene; when the outermost batch completes, flushes any dirty buckets once. */
  static endSceneBatch(scene: Scene, flushNow = true): void {
    const depth = SCENE_BATCH_DEPTH.get(scene) ?? 0;
    if (depth <= 1) {
      SCENE_BATCH_DEPTH.delete(scene);
      const existing = BuildingGlobalProxy.existing(scene);
      if (existing && !existing.isBatching) {
        if (flushNow) existing.flushIfDirty();
        else existing.scheduleFlush();
      }
    } else {
      SCENE_BATCH_DEPTH.set(scene, depth - 1);
    }
  }

  readonly root: Entity;
  private readonly engine: Engine;
  private readonly shader: Shader;
  private readonly shadowOnlyShader: Shader;
  private unitBox: ReturnType<typeof createUnitBoxMeshGeometry>;
  private readonly buckets: BucketRenderState[] = [];
  private readonly slotsById = new Map<number, SlotRecord>();
  private nextSlotId = 1;
  private nextBucketId = 0;
  private flushScheduled = false;
  private batchDepth = 0;
  destroyed = false;

  private get isBatching(): boolean {
    return this.batchDepth > 0 || (SCENE_BATCH_DEPTH.get(this.scene) ?? 0) > 0;
  }

  /** Suspend automatic microtask/late-update GPU bucket rebuilds until matching endBatch(). */
  beginBatch(): void {
    this.batchDepth++;
  }

  /** End a batch scope; when the outermost batch closes, builds each dirty GPU bucket once. */
  endBatch(flushNow = true): void {
    if (this.batchDepth <= 0) return;
    this.batchDepth--;
    if (!this.isBatching && !this.destroyed && !this.root.destroyed && !this.scene.destroyed) {
      if (flushNow) this.flushIfDirty();
      else this.scheduleFlush();
    }
  }

  /** @internal Called by GlobalProxyFlushScript.onLateUpdate; respects active batch scopes. */
  flushOnLateUpdate(): void {
    if (this.isBatching) return;
    this.flushIfDirty();
  }

  private readonly handleDeviceRestored = (): void => {
    if (this.destroyed) return;
    // Detach and destroy old bucket meshes before force-destroying shared unitBox GPU buffers.
    for (const bucket of this.buckets) {
      this.disposeBucketGeometry(bucket);
      bucket.dirty = true;
    }
    this.unitBox.vb.destroy(true);
    this.unitBox.ib.destroy(true);
    this.unitBox = createUnitBoxMeshGeometry(this.engine);
    this.flushIfDirty();
  };

  private constructor(private readonly scene: Scene) {
    this.engine = scene.engine;
    this.root = scene.createRootEntity("Building global proxy");
    const sync = this.root.addComponent(GlobalProxyFlushScript);
    sync.owner = this;
    this.shader = getGlobalProxyShader();
    this.shadowOnlyShader = getGlobalProxyShadowOnlyShader();
    this.unitBox = createUnitBoxMeshGeometry(this.engine);
    this.engine.on?.("devicerestored", this.handleDeviceRestored);
  }

  private createBucket(cellKey: number): BucketRenderState {
    const idx = this.nextBucketId++;
    const statesUniform = new Float32Array(MAX_SLOTS_PER_BUCKET * 4);
    const entranceUniform = new Float32Array(MAX_SLOTS_PER_BUCKET * 4);
    for (let i = 0; i < MAX_SLOTS_PER_BUCKET; i++) {
      entranceUniform[i * 4] = 1;
      entranceUniform[i * 4 + 2] = 1;
    }
    const boxMat = new Material(this.engine, this.shader);
    boxMat.shaderData.enableMacro("GLOBAL_PROXY_INSTANCED");
    boxMat.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
    boxMat.shaderData.setFloatArray("material_ProxyState", statesUniform);
    boxMat.shaderData.setFloatArray("material_ProxyEntrance", entranceUniform);
    boxMat.shaderData?.setInt?.(PROP_RASTER_STATE_CULL_MODE, CullMode?.Back ?? 2);

    const boxShadowOnlyMat = new Material(this.engine, this.shadowOnlyShader);
    boxShadowOnlyMat.shaderData.enableMacro("GLOBAL_PROXY_INSTANCED");
    boxShadowOnlyMat.shaderData.setFloatArray("material_ProxyState", statesUniform);

    const structMat = new Material(this.engine, this.shader);
    structMat.shaderData.setFloat("material_WorldPickDepthCompare", CompareFunction.Less);
    structMat.shaderData.setFloatArray("material_ProxyState", statesUniform);
    structMat.shaderData.setFloatArray("material_ProxyEntrance", entranceUniform);
    structMat.shaderData?.setInt?.(PROP_RASTER_STATE_CULL_MODE, CullMode?.Off ?? 0);

    const structShadowOnlyMat = new Material(this.engine, this.shadowOnlyShader);
    structShadowOnlyMat.shaderData.setFloatArray("material_ProxyState", statesUniform);

    const boxEntity = this.root.createChild(`GlobalProxyBoxes_${idx}`);
    boxEntity.isActive = false;
    const boxRenderer = boxEntity.addComponent(MeshRenderer);
    boxRenderer.setMaterial(boxMat);
    boxRenderer.enableVertexColor = true;
    boxRenderer.priority = -105;
    boxRenderer.castShadows = true;
    boxRenderer.receiveShadows = true;

    const bucket: BucketRenderState = {
      id: idx,
      cellKey,
      slots: [],
      statesUniform,
      entranceUniform,
      boxMat,
      boxShadowOnlyMat,
      structMat,
      structShadowOnlyMat,
      boxEntity,
      boxRenderer,
      boxHasShadowCasters: false,
      boxPickEntries: [],
      structChunks: [],
      slotColorCaches: new Map(),
      colorDirtySlots: new Set(),
      ditherEnabled: false,
      entranceEnabled: false,
      hasPlaster: false,
      dirty: true
    };
    this.buckets.push(bucket);
    return bucket;
  }

  private destroyBucket(bucket: BucketRenderState): void {
    if (!bucket.boxEntity.destroyed) bucket.boxEntity.isActive = false;
    this.disposeBucketGeometry(bucket);
    detachAndDestroyMaterials(bucket.boxRenderer, [
      bucket.boxMat,
      bucket.boxShadowOnlyMat,
      bucket.structMat,
      bucket.structShadowOnlyMat
    ]);
    if (!bucket.boxEntity.destroyed) bucket.boxEntity.destroy();
    const idx = this.buckets.indexOf(bucket);
    if (idx !== -1) this.buckets.splice(idx, 1);
  }

  private findOrCreateBucket(cellKey: number): BucketRenderState {
    let targetBucket = this.buckets.find((b) => b.cellKey === cellKey && b.slots.length < MAX_SLOTS_PER_BUCKET);
    if (!targetBucket) targetBucket = this.createBucket(cellKey);
    return targetBucket;
  }

  private scheduleFlush(): void {
    if (this.isBatching || this.flushScheduled || this.destroyed || this.root.destroyed || this.scene.destroyed) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      if (!this.isBatching && !this.destroyed && !this.root.destroyed && !this.scene.destroyed) this.flushIfDirty();
    });
  }

  register(input: GlobalProxyRegistrationInput): GlobalProxySlotHandle {
    const initialCellKey = spatialCellKey(input.frame.transform.worldMatrix.elements);
    const targetBucket = this.findOrCreateBucket(initialCellKey);

    const compactParts: CachedProxyPart[] = [];
    for (const rawPart of input.parts) {
      if (!rawPart.indices.length || !rawPart.positions.length) continue;
      if (rawPart.plaster && rawPart.plaster.wear >= 1) continue;
      const collapsed =
        rawPart.decoration && !rawPart.roofSpire && rawPart.indices.length > 72
          ? collapsePreviewPartToBox(rawPart)
          : rawPart;
      const part: ConstructionPreviewPart =
        collapsed.lodAppearance !== undefined || collapsed.regions !== undefined
          ? { ...collapsed, lodAppearance: undefined, regions: undefined }
          : collapsed;
      const localBox = part.plaster ? undefined : tryExtractLocalAxisBox(part.positions, part.indices);
      const normals = localBox
        ? undefined
        : part.normals?.length === part.positions.length
          ? part.normals
          : computeGeometricNormals(part.positions, part.indices);
      compactParts.push({ part, localBox, normals });
    }
    const compactDecorations: CachedProxyDecoration[] = [];
    const pushCompactDecoration = (decoration: ConstructionDecorationPart): void => {
      const localBox = tryExtractLocalAxisBox(decoration.positions, decoration.indices);
      const normals = localBox
        ? undefined
        : decoration.normals?.length === decoration.positions.length
          ? decoration.normals
          : computeGeometricNormals(decoration.positions, decoration.indices);
      compactDecorations.push({ decoration, localBox, normals });
    };
    for (const rawDp of input.decorationParts ?? []) {
      if (!rawDp.indices.length || !rawDp.positions.length) continue;
      if (rawDp.indices.length > 72) {
        const boxes = collapseDecorationToBoxes(rawDp);
        for (let i = 0; i < boxes.length; i++) pushCompactDecoration(boxes[i]!);
      } else {
        pushCompactDecoration(rawDp);
      }
    }

    const id = this.nextSlotId++;
    const localSlot = targetBucket.slots.length;
    const worldFlag = (
      (input.root.destroyed ? input.frame : input.root).transform as { registerWorldChangeFlag?: () => BoolUpdateFlag }
    ).registerWorldChangeFlag?.();
    if (worldFlag) worldFlag.flag = false;
    const record: SlotRecord = {
      id,
      bucket: targetBucket,
      localSlot,
      root: input.root,
      frame: input.frame,
      farVisible: false,
      shadowVisible: false,
      pickable: true,
      fade: 1,
      lodDebug: false,
      entranceProgress: 1,
      entranceMinY: 0,
      entranceHeight: 1,
      parts: compactParts,
      decorationParts: compactDecorations,
      colorOwners: input.colorOwners,
      appearance: input.appearance,
      hiddenOwners: input.hiddenOwners,
      lastWorldMatrix: new Float64Array(
        (input.root.destroyed ? input.frame : input.root).transform.worldMatrix.elements
      ),
      worldFlag
    };
    targetBucket.slots.push(record);
    this.slotsById.set(id, record);
    targetBucket.dirty = true;
    this.scheduleFlush();

    return {
      updateState: (farVisible, shadowVisible, fade, lodDebug) => {
        if (this.destroyed || !this.slotsById.has(id)) return;
        record.farVisible = farVisible;
        record.shadowVisible = shadowVisible;
        record.fade = fade;
        record.lodDebug = lodDebug;
        this.syncSlotUniform(record.bucket, record);
        if (this.reconcileSlotTransform(record)) {
          this.scheduleFlush();
        } else {
          this.syncBucketVisibility(record.bucket);
        }
      },
      updateEntrance: (progress, worldMinY, worldHeight) => {
        if (this.destroyed || !this.slotsById.has(id)) return;
        record.entranceProgress = progress;
        record.entranceMinY = worldMinY;
        record.entranceHeight = Math.max(0.001, worldHeight);
        this.syncSlotUniform(record.bucket, record);
        this.syncBucketVisibility(record.bucket);
      },
      setPickable: (pickable) => {
        if (this.destroyed || !this.slotsById.has(id)) return;
        if (record.pickable === pickable) return;
        record.pickable = pickable;
        this.syncSlotUniform(record.bucket, record);
        this.syncBucketVisibility(record.bucket);
      },
      refreshColors: () => {
        if (!this.destroyed && this.slotsById.has(id)) {
          if (this.reconcileSlotTransform(record)) {
            this.scheduleFlush();
            return;
          }
          if (!record.bucket.dirty && record.bucket.slotColorCaches.has(id)) {
            record.bucket.colorDirtySlots.add(record);
          } else {
            record.bucket.dirty = true;
          }
          this.scheduleFlush();
        }
      },
      markTopologyDirty: () => {
        if (!this.destroyed && this.slotsById.has(id)) {
          record.bucket.dirty = true;
          this.scheduleFlush();
        }
      },
      destroy: () => {
        this.unregister(id);
      }
    };
  }

  private removeSlotFromBucket(b: BucketRenderState, rec: SlotRecord): void {
    b.colorDirtySlots.delete(rec);
    const idx = b.slots.indexOf(rec);
    if (idx === -1) return;
    b.slots.splice(idx, 1);
    if (b.slots.length === 0) {
      this.destroyBucket(b);
      return;
    }
    for (let i = 0; i < b.slots.length; i++) {
      const s = b.slots[i]!;
      s.localSlot = i;
      this.syncSlotUniform(b, s);
    }
    const clearOff = b.slots.length * 4;
    b.statesUniform[clearOff] = 0;
    b.statesUniform[clearOff + 1] = 0;
    b.statesUniform[clearOff + 2] = 0;
    b.statesUniform[clearOff + 3] = 0;
    b.entranceUniform[clearOff] = 1;
    b.entranceUniform[clearOff + 1] = 0;
    b.entranceUniform[clearOff + 2] = 1;
    b.entranceUniform[clearOff + 3] = 0;
    this.syncBucketVisibility(b);
    b.dirty = true;
  }

  private unregister(id: number): void {
    const rec = this.slotsById.get(id);
    if (!rec) return;
    this.slotsById.delete(id);
    rec.worldFlag?.destroy?.();
    rec.worldFlag = undefined;
    this.removeSlotFromBucket(rec.bucket, rec);
    if (this.slotsById.size === 0 && !this.destroyed) {
      this.destroy();
    } else if (!this.destroyed) {
      this.scheduleFlush();
    }
  }

  private slotWorldMatrix(slot: SlotRecord): Float32Array | Float64Array {
    if (!slot.root.destroyed) return slot.root.transform.worldMatrix.elements;
    if (!slot.frame.destroyed) return slot.frame.transform.worldMatrix.elements;
    return slot.lastWorldMatrix;
  }

  private syncSlotUniform(bucket: BucketRenderState, s: SlotRecord): void {
    const active = !s.root.destroyed && s.root.isActiveInHierarchy;
    const pickAllowed = s.pickable && !s.frame.destroyed;
    const off = s.localSlot * 4;
    // state.x: 0 = hidden, 1 = visible & pickable, 2 = visible & non-pickable (exiting dissolve).
    bucket.statesUniform[off] = active && s.farVisible ? (pickAllowed ? 1 : 2) : 0;
    bucket.statesUniform[off + 1] = active && s.shadowVisible ? 1 : 0;
    bucket.statesUniform[off + 2] = s.fade;
    bucket.statesUniform[off + 3] = s.lodDebug ? 1 : 0;
    bucket.entranceUniform[off] = s.entranceProgress;
    bucket.entranceUniform[off + 1] = s.entranceMinY;
    bucket.entranceUniform[off + 2] = s.entranceHeight;
    bucket.entranceUniform[off + 3] = 0;
  }

  private syncBucketVisibility(bucket: BucketRenderState): void {
    let anyFar = false;
    let anyShadow = false;
    let anyDither = false;
    let anyEntrance = false;
    for (let i = 0; i < bucket.slots.length; i++) {
      const off = i * 4;
      const far = bucket.statesUniform[off]! > 0.5;
      if (far) {
        anyFar = true;
        if (bucket.statesUniform[off + 2]! < 0.999) anyDither = true;
        if (Math.abs(bucket.entranceUniform[off]! - 1) > 1e-4) anyEntrance = true;
      }
      if (bucket.statesUniform[off + 1]! > 0.5) anyShadow = true;
    }
    if (anyDither !== bucket.ditherEnabled) {
      bucket.ditherEnabled = anyDither;
      if (anyDither) {
        bucket.boxMat.shaderData?.enableMacro?.(MACRO_GLOBAL_PROXY_DITHER);
        bucket.structMat.shaderData?.enableMacro?.(MACRO_GLOBAL_PROXY_DITHER);
      } else {
        bucket.boxMat.shaderData?.disableMacro?.(MACRO_GLOBAL_PROXY_DITHER);
        bucket.structMat.shaderData?.disableMacro?.(MACRO_GLOBAL_PROXY_DITHER);
      }
    }
    if (anyEntrance !== bucket.entranceEnabled) {
      bucket.entranceEnabled = anyEntrance;
      if (anyEntrance) {
        bucket.boxMat.shaderData?.enableMacro?.(MACRO_GLOBAL_PROXY_ENTRANCE);
        bucket.structMat.shaderData?.enableMacro?.(MACRO_GLOBAL_PROXY_ENTRANCE);
      } else {
        bucket.boxMat.shaderData?.disableMacro?.(MACRO_GLOBAL_PROXY_ENTRANCE);
        bucket.structMat.shaderData?.disableMacro?.(MACRO_GLOBAL_PROXY_ENTRANCE);
      }
    }

    if (bucket.boxMesh) {
      const needBox = anyFar || (anyShadow && bucket.boxHasShadowCasters);
      bucket.boxRenderer.enabled = needBox;
      bucket.boxRenderer.castShadows = anyShadow && bucket.boxHasShadowCasters;
      const targetBoxMat = anyFar ? bucket.boxMat : bucket.boxShadowOnlyMat;
      if (bucket.boxRenderer.getMaterial() !== targetBoxMat) {
        bucket.boxRenderer.setMaterial(targetBoxMat);
      }
    }

    for (let i = 0; i < bucket.structChunks.length; i++) {
      const c = bucket.structChunks[i]!;
      const needChunk = anyFar || (anyShadow && c.castsShadow);
      c.renderer.enabled = needChunk;
      c.renderer.castShadows = anyShadow && c.castsShadow;
      const targetMat = anyFar ? bucket.structMat : bucket.structShadowOnlyMat;
      if (c.renderer.getMaterial() !== targetMat) {
        c.renderer.setMaterial(targetMat);
      }
    }
  }

  private reconcileSlotTransform(record: SlotRecord): boolean {
    if (record.root.destroyed && record.frame.destroyed) return false;
    if (record.worldFlag) {
      if (!record.worldFlag.flag) return false;
      record.worldFlag.flag = false;
    }
    const wm = this.slotWorldMatrix(record);
    let moved = false;
    for (let k = 0; k < 16; k++) {
      if (wm[k] !== record.lastWorldMatrix[k]) {
        moved = true;
        record.lastWorldMatrix[k] = wm[k]!;
      }
    }
    if (!moved) return false;
    const nextCellKey = spatialCellKey(wm);
    const currentBucket = record.bucket;
    if (nextCellKey !== currentBucket.cellKey) {
      this.removeSlotFromBucket(currentBucket, record);
      const nextBucket = this.findOrCreateBucket(nextCellKey);
      record.bucket = nextBucket;
      record.localSlot = nextBucket.slots.length;
      nextBucket.slots.push(record);
      this.syncSlotUniform(nextBucket, record);
      this.syncBucketVisibility(nextBucket);
      nextBucket.dirty = true;
      return true;
    }
    currentBucket.dirty = true;
    return true;
  }

  private refreshDirtyBucketColors(bucket: BucketRenderState): void {
    const rgba4 = new Uint8Array(4);
    const dirtyChunks = new Set<StructChunkRender>();
    for (const slot of bucket.colorDirtySlots) {
      const cache = bucket.slotColorCaches.get(slot.id);
      if (!cache) continue;
      const tmpColors = new Uint8Array(cache.totalV * 4);
      writeCompactFarProxyColors(cache.partSpans, cache.decoSpans, slot.appearance, tmpColors);
      if (bucket.boxInstanceBuf) {
        for (let i = 0; i < cache.boxPatches.length; i++) {
          const bp = cache.boxPatches[i]!;
          const c0 = bp.vOff * 4;
          rgba4[0] = tmpColors[c0]!;
          rgba4[1] = tmpColors[c0 + 1]!;
          rgba4[2] = tmpColors[c0 + 2]!;
          rgba4[3] = bp.eU8;
          bucket.boxInstanceBuf.setData(rgba4, bp.byteOffset, 0, 4);
        }
      }
      for (let i = 0; i < cache.structPatches.length; i++) {
        const sp = cache.structPatches[i]!;
        const dst = sp.chunk.colorBytes;
        const dstStart = sp.dstVertexOffset * 4;
        const srcStart = sp.srcVertexOffset * 4;
        for (let v = 0; v < sp.count; v++) {
          const dOff = dstStart + v * 4;
          const sOff = srcStart + v * 4;
          dst[dOff] = tmpColors[sOff]!;
          dst[dOff + 1] = tmpColors[sOff + 1]!;
          dst[dOff + 2] = tmpColors[sOff + 2]!;
        }
        dirtyChunks.add(sp.chunk);
      }
    }
    for (const chunk of dirtyChunks) {
      chunk.colorBuf.setData(chunk.colorBytes);
    }
    bucket.colorDirtySlots.clear();
  }

  flushIfDirty(): void {
    if (this.destroyed || this.root.destroyed || this.scene.destroyed) return;
    // Reconcile spatial bucket membership before any rebuild so transform moves never lock a slot in a stale cell.
    for (const slot of this.slotsById.values()) {
      if (!slot.worldFlag || slot.worldFlag.flag) {
        this.reconcileSlotTransform(slot);
      }
    }
    for (const bucket of this.buckets) {
      for (const s of bucket.slots) {
        this.syncSlotUniform(bucket, s);
      }
      if (bucket.dirty) {
        bucket.dirty = false;
        bucket.colorDirtySlots.clear();
        this.rebuildBucket(bucket);
      } else if (bucket.colorDirtySlots.size > 0) {
        this.refreshDirtyBucketColors(bucket);
      }
      this.syncBucketVisibility(bucket);
    }
  }

  private disposeBucketGeometry(bucket: BucketRenderState): void {
    if (!bucket.boxEntity.destroyed) bucket.boxEntity.isActive = false;
    bucket.slotColorCaches.clear();
    bucket.colorDirtySlots.clear();
    detachAndDestroyMesh(bucket.boxRenderer, bucket.boxMesh);
    bucket.boxMesh = undefined;
    bucket.boxInstanceBuf?.destroy(true);
    bucket.boxInstanceBuf = undefined;
    bucket.boxPickEntries = [];
    for (const c of bucket.structChunks) {
      if (!c.entity.destroyed) c.entity.isActive = false;
      detachAndDestroyMesh(c.renderer, c.mesh);
      if (!c.renderer.destroyed) c.renderer.setMaterial(null as unknown as Material);
      c.geomBuf.destroy(true);
      c.colorBuf.destroy(true);
      c.metaBuf.destroy(true);
      c.idxBuf.destroy(true);
      if (!c.entity.destroyed) c.entity.destroy();
    }
    bucket.structChunks = [];
  }

  private rebuildBucket(bucket: BucketRenderState): void {
    this.disposeBucketGeometry(bucket);

    if (!bucket.slots.length) {
      bucket.boxEntity.isActive = false;
      return;
    }

    interface BoxBuildItem {
      slot: number;
      slotId: number;
      vOff: number;
      frame: Entity;
      wm: Float64Array | Float32Array;
      localBox: { cx: number; cy: number; cz: number; sx: number; sy: number; sz: number };
      rU8: number;
      gU8: number;
      bU8: number;
      eU8: number;
      kind: number;
      wear: number;
      wallLength: number;
      edgeDist: number;
      castShadow: number;
      pickOffset: number;
    }
    interface StructBuildPart {
      slot: number;
      slotId: number;
      vOff: number;
      frame: Entity;
      wm: Float64Array | Float32Array;
      positions: ArrayLike<number>;
      normals: ArrayLike<number>;
      indices: ArrayLike<number>;
      uvs?: PackedUv2;
      normalBias: number;
      kind: number;
      wear: number;
      wallLength: number;
      edgeDist?: ArrayLike<number>;
      isUnit: number;
      castShadow: number;
      colorBytes: Uint8Array;
      pickKey: string;
    }

    const boxItems: BoxBuildItem[] = [];
    const structParts: StructBuildPart[] = [];
    let totalStructVerts = 0;
    let totalStructIndices = 0;

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    const expandBoxPoint = (wx: number, wy: number, wz: number) => {
      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wz < minZ) minZ = wz;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
      if (wz > maxZ) maxZ = wz;
    };

    for (let sIdx = 0; sIdx < bucket.slots.length; sIdx++) {
      const slot = bucket.slots[sIdx]!;
      const wm = this.slotWorldMatrix(slot);
      slot.lastWorldMatrix.set(wm);
      this.syncSlotUniform(bucket, slot);

      const ownerById = new Map(slot.colorOwners.map((o) => [o.id, o] as const));
      const incParts: ConstructionPreviewPart[] = [];
      const partBoxes: CachedAxisBox[] = [];
      const partNormals: (readonly number[] | Float32Array | undefined)[] = [];
      const incDecs: ConstructionDecorationPart[] = [];
      const decBoxes: CachedAxisBox[] = [];
      const decNormals: (readonly number[] | Float32Array | undefined)[] = [];
      for (const entry of slot.parts) {
        if (slot.hiddenOwners.has(entry.part.owner)) continue;
        incParts.push(entry.part);
        partBoxes.push(entry.localBox);
        partNormals.push(entry.normals);
      }
      for (const entry of slot.decorationParts) {
        if (slot.hiddenOwners.has(entry.decoration.ownerId)) continue;
        incDecs.push(entry.decoration);
        decBoxes.push(entry.localBox);
        decNormals.push(entry.normals);
      }

      if (!incParts.length && !incDecs.length) continue;
      const { partSpans, decoSpans } = buildCompactColorSpans(incParts, incDecs, ownerById, slot.appearance);
      const totalV =
        incParts.reduce((a, p) => a + p.positions.length / 3, 0) +
        incDecs.reduce((a, d) => a + d.positions.length / 3, 0);
      const tmpColors = new Uint8Array(totalV * 4);
      writeCompactFarProxyColors(partSpans, decoSpans, slot.appearance, tmpColors);
      bucket.slotColorCaches.set(slot.id, {
        partSpans,
        decoSpans,
        totalV,
        boxPatches: [],
        structPatches: []
      });

      // Write emissions into tmpColors alpha before extracting
      let vCursor = 0;
      const partStarts: number[] = [];
      for (const p of incParts) {
        const cnt = p.positions.length / 3;
        partStarts.push(vCursor);
        for (let i = 0; i < cnt; i++) {
          const e = p.emission ? p.emission[i]! : (p.emissive ?? 0);
          tmpColors[(vCursor + i) * 4 + 3] = packU8Scaled(e, 8);
        }
        vCursor += cnt;
      }
      const decStarts: number[] = [];
      for (const d of incDecs) {
        const cnt = d.positions.length / 3;
        decStarts.push(vCursor);
        for (let i = 0; i < cnt; i++) {
          tmpColors[(vCursor + i) * 4 + 3] = packU8Scaled(d.emission[i] ?? 0, 8);
        }
        vCursor += cnt;
      }

      const boxPickMap = new Map<string, number>();
      const getBoxPick = (key: string) => {
        let p = boxPickMap.get(key);
        if (p === undefined) {
          p = bucket.boxPickEntries.length;
          bucket.boxPickEntries.push({ slot, frame: slot.frame, id: key });
          boxPickMap.set(key, p);
        }
        return p;
      };

      for (let i = 0; i < incParts.length; i++) {
        const p = incParts[i]!;
        const vOff = partStarts[i]!;
        const vCnt = p.positions.length / 3;
        const pickKey = p.pickId === undefined ? buildingGroupKey(p.owner) : buildingPartKey(p.pickId);
        const kind = previewPartSurfaceKind(p);
        const lb = partBoxes[i];
        const castShadow = p.plaster || p.stonePaving ? 0 : 1;
        if (lb) {
          const c0 = vOff * 4;
          boxItems.push({
            slot: sIdx,
            slotId: slot.id,
            vOff,
            frame: slot.frame,
            wm,
            localBox: lb,
            rU8: tmpColors[c0]!,
            gU8: tmpColors[c0 + 1]!,
            bU8: tmpColors[c0 + 2]!,
            eU8: tmpColors[c0 + 3]!,
            kind,
            wear: 0,
            wallLength: p.placement === "unit" ? 1 : 0,
            edgeDist: 0,
            castShadow,
            pickOffset: getBoxPick(pickKey)
          });
        } else {
          const norms = partNormals[i]!;
          structParts.push({
            slot: sIdx,
            slotId: slot.id,
            vOff,
            frame: slot.frame,
            wm,
            positions: p.positions,
            normals: norms,
            indices: p.indices,
            uvs: p.uvs,
            normalBias: proxyPartNormalBias(p),
            kind,
            wear: p.plaster ? p.plaster.wear : 0,
            wallLength: p.plaster ? p.plaster.wallLength : p.placement === "unit" ? 1 : 0,
            edgeDist: p.plaster?.edgeDistances,
            isUnit: p.placement === "unit" ? 1 : 0,
            castShadow,
            colorBytes: tmpColors.subarray(vOff * 4, (vOff + vCnt) * 4),
            pickKey
          });
          totalStructVerts += vCnt;
          totalStructIndices += p.indices.length;
        }
      }

      for (let i = 0; i < incDecs.length; i++) {
        const d = incDecs[i]!;
        const vOff = decStarts[i]!;
        const vCnt = d.positions.length / 3;
        const pickKey = d.decorationId === undefined ? buildingGroupKey(d.ownerId) : buildingPartKey(d.decorationId);
        const appKind = d.appearance?.kinds?.[0];
        const kind =
          appKind === DecorationMaterial.glass ||
          appKind === DecorationMaterial.texturedGlass ||
          appKind === DecorationMaterial.lattice ||
          appKind === DecorationMaterial.texturedLattice
            ? SURFACE_KIND_DECORATION_GLASS
            : SURFACE_KIND_DECORATION;
        const lb = decBoxes[i];
        if (lb) {
          const c0 = vOff * 4;
          boxItems.push({
            slot: sIdx,
            slotId: slot.id,
            vOff,
            frame: slot.frame,
            wm,
            localBox: lb,
            rU8: tmpColors[c0]!,
            gU8: tmpColors[c0 + 1]!,
            bU8: tmpColors[c0 + 2]!,
            eU8: tmpColors[c0 + 3]!,
            kind,
            wear: 0,
            wallLength: 0,
            edgeDist: 0,
            castShadow: 0,
            pickOffset: getBoxPick(pickKey)
          });
        } else {
          const norms = decNormals[i]!;
          const isCollapsedBox = d.uvs === undefined && d.indices.length === 36 && d.positions.length === 72;
          structParts.push({
            slot: sIdx,
            slotId: slot.id,
            vOff,
            frame: slot.frame,
            wm,
            positions: d.positions,
            normals: norms,
            indices: d.indices,
            uvs: d.uvs ?? d.appearance?.materialUVs,
            normalBias: isCollapsedBox ? 0 : proxyDecorationNormalBias(appKind),
            kind,
            wear: 0,
            wallLength: 0,
            isUnit: 0,
            castShadow: 0,
            colorBytes: tmpColors.subarray(vOff * 4, (vOff + vCnt) * 4),
            pickKey
          });
          totalStructVerts += vCnt;
          totalStructIndices += d.indices.length;
        }
      }
    }

    // 1. Build Instanced Box Mesh
    if (boxItems.length > 0) {
      const bytes = new Uint8Array(boxItems.length * BOX_INST_STRIDE_BYTES);
      const f32 = new Float32Array(bytes.buffer);
      const u16 = new Uint16Array(bytes.buffer);
      for (let i = 0; i < boxItems.length; i++) {
        const it = boxItems[i]!;
        const { cx, cy, cz, sx, sy, sz } = it.localBox;
        const m = it.wm;
        // Row-major world transform of unit cube [-0.5..0.5]^3:
        // World(p) = wm * (localCenter + localScale * p)
        // Galacean Matrix4 elements are column-major: m[col*4 + row]
        const fb = (i * BOX_INST_STRIDE_BYTES) / 4;
        // row 0
        f32[fb + 0] = m[0]! * sx;
        f32[fb + 1] = m[4]! * sy;
        f32[fb + 2] = m[8]! * sz;
        f32[fb + 3] = m[0]! * cx + m[4]! * cy + m[8]! * cz + m[12]!;
        // row 1
        f32[fb + 4] = m[1]! * sx;
        f32[fb + 5] = m[5]! * sy;
        f32[fb + 6] = m[9]! * sz;
        f32[fb + 7] = m[1]! * cx + m[5]! * cy + m[9]! * cz + m[13]!;
        // row 2
        f32[fb + 8] = m[2]! * sx;
        f32[fb + 9] = m[6]! * sy;
        f32[fb + 10] = m[10]! * sz;
        f32[fb + 11] = m[2]! * cx + m[6]! * cy + m[10]! * cz + m[14]!;

        // Expand world AABB
        const hx = Math.abs(f32[fb + 0]!) * 0.5 + Math.abs(f32[fb + 1]!) * 0.5 + Math.abs(f32[fb + 2]!) * 0.5;
        const hy = Math.abs(f32[fb + 4]!) * 0.5 + Math.abs(f32[fb + 5]!) * 0.5 + Math.abs(f32[fb + 6]!) * 0.5;
        const hz = Math.abs(f32[fb + 8]!) * 0.5 + Math.abs(f32[fb + 9]!) * 0.5 + Math.abs(f32[fb + 10]!) * 0.5;
        expandBoxPoint(f32[fb + 3]! - hx, f32[fb + 7]! - hy, f32[fb + 11]! - hz);
        expandBoxPoint(f32[fb + 3]! + hx, f32[fb + 7]! + hy, f32[fb + 11]! + hz);

        const bb = i * BOX_INST_STRIDE_BYTES + 48;
        bytes[bb] = it.rU8;
        bytes[bb + 1] = it.gU8;
        bytes[bb + 2] = it.bU8;
        bytes[bb + 3] = it.eU8;
        bucket.slotColorCaches.get(it.slotId)?.boxPatches.push({
          byteOffset: bb,
          vOff: it.vOff,
          eU8: it.eU8
        });

        const ub = i * (BOX_INST_STRIDE_BYTES / 2) + 26;
        u16[ub] = Math.round(Math.max(0, Math.min(255, it.kind))) * 257;
        u16[ub + 1] = packU16Scaled(it.wear, 1);
        u16[ub + 2] = packU16Scaled(it.wallLength, 256);
        u16[ub + 3] = packU16Scaled(it.edgeDist, 1);

        f32[fb + 15] = it.slot;
        f32[fb + 16] = it.pickOffset;
        f32[fb + 17] = it.castShadow;
        f32[fb + 18] = 0;
      }

      const instBuf = new Buffer(this.engine, BufferBindFlag.VertexBuffer, bytes, BufferUsage.Static, false);
      const mesh = new BufferMesh(this.engine, "MasonryGlobalProxyBoxes");
      mesh.setVertexBufferBinding(this.unitBox.vb, UNIT_BOX_VERT_STRIDE, 0);
      mesh.setVertexBufferBinding(instBuf, BOX_INST_STRIDE_BYTES, 1);
      mesh.setVertexElements(BOX_ELEMENTS);
      mesh.setIndexBufferBinding(new IndexBufferBinding(this.unitBox.ib, IndexFormat.UInt16));
      mesh.addSubMesh(0, this.unitBox.indexCount, MeshTopology.Triangles);
      mesh.instanceCount = boxItems.length;
      mesh.bounds = new BoundingBox(new Vector3(minX, minY, minZ), new Vector3(maxX, maxY, maxZ));
      bucket.boxInstanceBuf = instBuf;
      bucket.boxMesh = mesh;
      bucket.boxHasShadowCasters = boxItems.some((it) => it.castShadow > 0);
      bucket.boxRenderer.castShadows = bucket.boxHasShadowCasters;
      bucket.boxRenderer.mesh = mesh;
      bucket.boxEntity.isActive = true;
    } else {
      bucket.boxHasShadowCasters = false;
      bucket.boxEntity.isActive = false;
    }

    // 2. Build Merged Structural Meshes split by shadow-casting vs non-shadow (plaster/decoration),
    // chunked <= 65535 verts so indices remain 16-bit Uint16.
    const anyPlaster = structParts.some((sp) => sp.kind === SURFACE_KIND_PLASTER);
    if (anyPlaster !== bucket.hasPlaster) {
      bucket.hasPlaster = anyPlaster;
      if (anyPlaster) bucket.structMat.shaderData?.enableMacro?.(MACRO_GLOBAL_PROXY_PLASTER);
      else bucket.structMat.shaderData?.disableMacro?.(MACRO_GLOBAL_PROXY_PLASTER);
    }
    if (totalStructVerts > 0 && totalStructIndices > 0) {
      const shadowParts: StructBuildPart[] = [];
      const noShadowParts: StructBuildPart[] = [];
      for (const sp of structParts) {
        if (sp.castShadow > 0) shadowParts.push(sp);
        else noShadowParts.push(sp);
      }

      const partGroups: Array<{ parts: StructBuildPart[]; verts: number; indices: number; castsShadow: boolean }> = [];
      for (const [partsList, castsShadow] of [
        [shadowParts, true],
        [noShadowParts, false]
      ] as const) {
        if (!partsList.length) continue;
        let curGroup = { parts: [] as StructBuildPart[], verts: 0, indices: 0, castsShadow };
        for (const sp of partsList) {
          const cnt = sp.positions.length / 3;
          if (curGroup.parts.length > 0 && curGroup.verts + cnt > 0xffff) {
            partGroups.push(curGroup);
            curGroup = { parts: [], verts: 0, indices: 0, castsShadow };
          }
          curGroup.parts.push(sp);
          curGroup.verts += cnt;
          curGroup.indices += sp.indices.length;
        }
        if (curGroup.parts.length > 0) partGroups.push(curGroup);
      }

      for (let gIdx = 0; gIdx < partGroups.length; gIdx++) {
        const grp = partGroups[gIdx]!;
        const geomBytes = new Uint8Array(grp.verts * STRUCT_GEOM_STRIDE_BYTES);
        const geomF32 = new Float32Array(geomBytes.buffer);
        const geomI8 = new Int8Array(geomBytes.buffer);
        const geomU16 = new Uint16Array(geomBytes.buffer);
        const colorBytes = new Uint8Array(grp.verts * 4);
        const pickF32 = new Float32Array(grp.verts);
        const useU32 = grp.verts > 0xffff;
        const indices = useU32 ? new Uint32Array(grp.indices) : new Uint16Array(grp.indices);
        const pickEntries: Array<{ slot: SlotRecord; frame: Entity; id: string }> = [];
        const pickMap = new Map<string, number>();

        let vBase = 0;
        let iBase = 0;
        let cMinX = Infinity,
          cMinY = Infinity,
          cMinZ = Infinity;
        let cMaxX = -Infinity,
          cMaxY = -Infinity,
          cMaxZ = -Infinity;
        for (const sp of grp.parts) {
          const mapKey = `${sp.slot}:${sp.pickKey}`;
          let pickOffset = pickMap.get(mapKey);
          if (pickOffset === undefined) {
            pickOffset = pickEntries.length;
            pickEntries.push({ slot: bucket.slots[sp.slot]!, frame: sp.frame, id: sp.pickKey });
            pickMap.set(mapKey, pickOffset);
          }
          const m = sp.wm;
          const cnt = sp.positions.length / 3;
          const metaByte = (sp.slot & 63) + (sp.castShadow ? 64 : 0);
          colorBytes.set(sp.colorBytes, vBase * 4);
          for (let i = 0; i < cnt; i++) {
            const i3 = i * 3;
            const v = vBase + i;
            const fB = v * (STRUCT_GEOM_STRIDE_BYTES / 4);
            const bB = v * STRUCT_GEOM_STRIDE_BYTES;
            const uB = v * (STRUCT_GEOM_STRIDE_BYTES / 2);

            const lnx = sp.normals[i3]!;
            const lny = sp.normals[i3 + 1]!;
            const lnz = sp.normals[i3 + 2]!;
            let wnx = m[0]! * lnx + m[4]! * lny + m[8]! * lnz;
            let wny = m[1]! * lnx + m[5]! * lny + m[9]! * lnz;
            let wnz = m[2]! * lnx + m[6]! * lny + m[10]! * lnz;
            const nLen = Math.hypot(wnx, wny, wnz) || 1;
            wnx /= nLen;
            wny /= nLen;
            wnz /= nLen;

            const lpx = sp.positions[i3]! + lnx * sp.normalBias;
            const lpy = sp.positions[i3 + 1]! + lny * sp.normalBias;
            const lpz = sp.positions[i3 + 2]! + lnz * sp.normalBias;
            const wx = m[0]! * lpx + m[4]! * lpy + m[8]! * lpz + m[12]!;
            const wy = m[1]! * lpx + m[5]! * lpy + m[9]! * lpz + m[13]!;
            const wz = m[2]! * lpx + m[6]! * lpy + m[10]! * lpz + m[14]!;

            geomF32[fB] = wx;
            geomF32[fB + 1] = wy;
            geomF32[fB + 2] = wz;
            if (wx < cMinX) cMinX = wx;
            if (wy < cMinY) cMinY = wy;
            if (wz < cMinZ) cMinZ = wz;
            if (wx > cMaxX) cMaxX = wx;
            if (wy > cMaxY) cMaxY = wy;
            if (wz > cMaxZ) cMaxZ = wz;

            geomI8[bB + 12] = packSignedByte(wnx);
            geomI8[bB + 13] = packSignedByte(wny);
            geomI8[bB + 14] = packSignedByte(wnz);
            geomI8[bB + 15] = metaByte;

            geomF32[fB + 4] = uvU(sp.uvs, i, 0);
            geomF32[fB + 5] = uvV(sp.uvs, i, 0);

            geomU16[uB + 12] = Math.round(Math.max(0, Math.min(255, sp.kind))) * 257;
            geomU16[uB + 13] = packU16Scaled(sp.wear, 1);
            geomU16[uB + 14] = packU16Scaled(sp.wallLength, 256);
            geomU16[uB + 15] = packU16Scaled(sp.edgeDist?.[i] ?? 1, 1);

            pickF32[v] = pickOffset;
          }
          for (let k = 0; k < sp.indices.length; k++) {
            indices[iBase + k] = vBase + sp.indices[k]!;
          }
          vBase += cnt;
          iBase += sp.indices.length;
        }

        const geomBuf = new Buffer(this.engine, BufferBindFlag.VertexBuffer, geomBytes, BufferUsage.Static, false);
        const colorBuf = new Buffer(this.engine, BufferBindFlag.VertexBuffer, colorBytes, BufferUsage.Static, false);
        const metaBuf = new Buffer(this.engine, BufferBindFlag.VertexBuffer, pickF32, BufferUsage.Static, false);
        const idxBuf = new Buffer(this.engine, BufferBindFlag.IndexBuffer, indices, BufferUsage.Static, false);

        const mesh = new BufferMesh(this.engine, "MasonryGlobalProxyStruct");
        mesh.setVertexBufferBinding(geomBuf, STRUCT_GEOM_STRIDE_BYTES, 0);
        mesh.setVertexBufferBinding(colorBuf, 4, 1);
        mesh.setVertexBufferBinding(metaBuf, STRUCT_META_STRIDE_BYTES, 2);
        mesh.setVertexElements(STRUCT_ELEMENTS);
        mesh.setIndexBufferBinding(new IndexBufferBinding(idxBuf, useU32 ? IndexFormat.UInt32 : IndexFormat.UInt16));
        mesh.addSubMesh(0, grp.indices, MeshTopology.Triangles);
        mesh.bounds = new BoundingBox(new Vector3(cMinX, cMinY, cMinZ), new Vector3(cMaxX, cMaxY, cMaxZ));

        const entity = this.root.createChild(`GlobalProxyStruct_${bucket.id}_${gIdx}`);
        const renderer = entity.addComponent(MeshRenderer);
        renderer.setMaterial(bucket.structMat);
        renderer.enableVertexColor = true;
        renderer.priority = grp.castsShadow ? -102 : -98;
        renderer.castShadows = grp.castsShadow;
        renderer.receiveShadows = true;
        renderer.mesh = mesh;

        const chunk: StructChunkRender = {
          entity,
          renderer,
          mesh,
          geomBuf,
          colorBuf,
          colorBytes,
          metaBuf,
          idxBuf,
          castsShadow: grp.castsShadow,
          pickEntries
        };
        let spVertCursor = 0;
        for (const sp of grp.parts) {
          const spCount = sp.positions.length / 3;
          bucket.slotColorCaches.get(sp.slotId)?.structPatches.push({
            chunk,
            dstVertexOffset: spVertCursor,
            srcVertexOffset: sp.vOff,
            count: spCount
          });
          spVertCursor += spCount;
        }
        bucket.structChunks.push(chunk);
      }
    }
  }

  visitPickBatches(
    visitor: (batch: SeedWorldPickBatch & { alreadyScoped?: boolean }) => void,
    scopeFrame?: Entity
  ): void {
    this.flushIfDirty();
    for (const bucket of this.buckets) {
      if (
        bucket.boxEntity.isActiveInHierarchy &&
        bucket.boxRenderer.enabled &&
        bucket.boxRenderer.getMaterial() === bucket.boxMat &&
        bucket.boxPickEntries.length
      ) {
        const entries = bucket.boxPickEntries;
        visitor({
          renderer: bucket.boxRenderer,
          count: entries.length,
          alreadyScoped: !scopeFrame,
          resolve: (index) => {
            const e = entries[index];
            if (!e || !e.slot.pickable || e.frame.destroyed) return undefined;
            if (scopeFrame) return e.frame === scopeFrame ? e.id : undefined;
            return buildingInstanceKey(e.frame, e.id);
          }
        });
      }
      for (const c of bucket.structChunks) {
        if (
          c.entity.isActiveInHierarchy &&
          c.renderer.enabled &&
          c.renderer.getMaterial() === bucket.structMat &&
          c.pickEntries.length
        ) {
          const entries = c.pickEntries;
          visitor({
            renderer: c.renderer,
            count: entries.length,
            alreadyScoped: !scopeFrame,
            resolve: (index) => {
              const e = entries[index];
              if (!e || !e.slot.pickable || e.frame.destroyed) return undefined;
              if (scopeFrame) return e.frame === scopeFrame ? e.id : undefined;
              return buildingInstanceKey(e.frame, e.id);
            }
          });
        }
      }
    }
  }

  /** Returns alternate materials bound at runtime when buckets transition between LOD2 and LOD1/LOD0 shadow-only state. */
  getWarmupExtraMaterials(): Map<MeshRenderer, Material[]> {
    this.flushIfDirty();
    const map = new Map<MeshRenderer, Material[]>();
    for (const bucket of this.buckets) {
      if (bucket.boxMesh) {
        const mats: Material[] = [];
        const current = bucket.boxRenderer.getMaterial();
        if (current !== bucket.boxMat) mats.push(bucket.boxMat);
        if (bucket.boxHasShadowCasters && current !== bucket.boxShadowOnlyMat) mats.push(bucket.boxShadowOnlyMat);
        if (mats.length) map.set(bucket.boxRenderer, mats);
      }
      for (const c of bucket.structChunks) {
        const mats: Material[] = [];
        const current = c.renderer.getMaterial();
        if (current !== bucket.structMat) mats.push(bucket.structMat);
        if (c.castsShadow && current !== bucket.structShadowOnlyMat) mats.push(bucket.structShadowOnlyMat);
        if (mats.length) map.set(c.renderer, mats);
      }
    }
    return map;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (!this.root.destroyed) this.root.isActive = false;
    this.engine.off?.("devicerestored", this.handleDeviceRestored);
    for (const slot of this.slotsById.values()) {
      slot.worldFlag?.destroy?.();
      slot.worldFlag = undefined;
    }
    this.slotsById.clear();
    GLOBAL_PROXIES.delete(this.scene);
    for (const b of this.buckets) {
      this.disposeBucketGeometry(b);
      detachAndDestroyMaterials(b.boxRenderer, [b.boxMat, b.boxShadowOnlyMat, b.structMat, b.structShadowOnlyMat]);
    }
    this.buckets.length = 0;
    this.unitBox.vb.destroy(true);
    this.unitBox.ib.destroy(true);
    if (!this.root.destroyed) this.root.destroy();
  }
}
