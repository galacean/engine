import {
  BoundingBox,
  BoundingFrustum,
  BoundingSphere,
  Matrix,
  MeshRenderer,
  Quaternion,
  Vector3,
  type Camera,
  type Entity,
  type Material,
  type ModelMesh,
  type Texture2D,
  Vector4
} from "@galacean/engine";
import {
  createTreeAssemblyInstancedMesh,
  createTreeAssemblyInstanceStorage,
  TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS,
  TREE_ASSEMBLY_INSTANCE_FLOATS,
  uploadTreeAssemblyInstances,
  type TreeAssemblyInstancedMesh,
  type TreeAssemblyInstanceStorage
} from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import type { LandscapePlantInstance } from "@galacean/engine-vegetation/world/VegetationLandscapePlan";
import {
  SeedWorldArrayPickBatch,
  type SeedWorldPickVisitor
} from "@galacean/engine-modify/rendering/SeedWorldPickBatch";

const SUBCELL_SIZE_M = 16;
const CAMERA_MATRIX_EPSILON = 1e-5;
const LOD_HYSTERESIS_RATIO = 0.06;

const DISALLOWED_RENDERER_MACROS = new Set([
  "RENDERER_PROCEDURAL_TREE_VARIATION_CATALOG",
  "RENDERER_PROCEDURAL_TREE_LEAF_MASK_LIBRARY",
  "RENDERER_PROCEDURAL_TREE_BARK_UV_SCALE",
  "RENDERER_PROCEDURAL_TREE_GPU_BRANCH_VARIATION"
]);

const SKIPPED_BUCKET_MACROS = new Set([
  "RENDERER_ASSET_ASSEMBLY_RENDERER_INSTANCE",
  "RENDERER_LOD_DITHER",
  "RENDERER_HAS_UV",
  "RENDERER_HAS_UV1",
  "RENDERER_HAS_NORMAL",
  "RENDERER_HAS_TANGENT",
  "RENDERER_ENABLE_VERTEXCOLOR",
  "RENDERER_IS_RECEIVE_SHADOWS",
  "RENDERER_PLANT_COLOR_OVERRIDE_R",
  "RENDERER_PLANT_COLOR_OVERRIDE_G",
  "RENDERER_PLANT_COLOR_OVERRIDE_B"
]);

/** Shared per-species GPU leaf frame uniforms copied from the source tree renderer onto the bucket. */
export interface InstancedGpuLeafFrameBinding {
  readonly texture: Texture2D;
  readonly normalField: Vector4;
  readonly frameScale: Vector4;
}

/** Bucket rendering state shared across all instances submitted in one draw call. */
export interface InstancedUnderstoryBucketSpec {
  readonly key: string;
  readonly mesh: ModelMesh;
  readonly material: Material;
  readonly macros: readonly string[];
  readonly castShadows: boolean;
  readonly receiveShadows: boolean;
  readonly enableVertexColor: boolean;
  readonly usesGpuVariation: boolean;
  readonly interactionOccluder: boolean;
  readonly grassColorOverrideMask?: readonly [number, number, number];
  readonly gpuLeafFrame?: InstancedGpuLeafFrameBinding;
}

/** One mesh/material sub-part of a plant LOD level with precomputed world TRS and per-instance shading fields. */
export interface InstancedUnderstoryPart {
  bucketKey: string;
  bucketSpec: InstancedUnderstoryBucketSpec;
  readonly materialId: string;
  readonly posX: number;
  posY: number;
  readonly posZ: number;
  readonly quatX: number;
  readonly quatY: number;
  readonly quatZ: number;
  readonly quatW: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZ: number;
  colorR: number;
  colorG: number;
  colorB: number;
  readonly varX: number;
  readonly varY: number;
  readonly varZ: number;
  readonly varW: number;
  readonly branchX: number;
  readonly branchY: number;
}

/** One collapsed LOD tier of a single instanced understory plant. */
export interface InstancedUnderstoryLod {
  readonly screenRelativeTransitionHeight: number;
  readonly parts: readonly InstancedUnderstoryPart[];
}

/** Lightweight numeric record owned by a Cell in place of per-plant Entities and MeshRenderers. */
export interface InstancedUnderstoryRecord {
  readonly instance: LandscapePlantInstance;
  groundHeight: number;
  readonly refYOffset: number;
  worldCenterY: number;
  readonly worldSize: number;
  readonly boundingRadius: number;
  readonly terminalCutoff: number;
  readonly pickId: string | undefined;
  excluded: boolean;
  assignedLod: number;
  readonly lods: readonly InstancedUnderstoryLod[];
}

interface InstancedUnderstorySubCell {
  readonly bounds: BoundingBox;
  readonly records: InstancedUnderstoryRecord[];
}

interface InstancedUnderstoryCellData {
  readonly records: InstancedUnderstoryRecord[];
  readonly subCells: InstancedUnderstorySubCell[];
}

interface InstancedBucket {
  readonly spec: InstancedUnderstoryBucketSpec;
  readonly entity: Entity;
  readonly renderer: MeshRenderer;
  readonly pickBatch: SeedWorldArrayPickBatch;
  storage?: TreeAssemblyInstanceStorage;
  view?: TreeAssemblyInstancedMesh;
  capacity: number;
  nextCount: number;
  writeCursor: number;
  readonly pickIds: (string | undefined)[];
  readonly visibleBounds: BoundingBox;
}

export interface UnderstoryRendererBindingLike {
  readonly renderer: MeshRenderer;
  readonly materialId: string;
  readonly authoredColorScale?: readonly [number, number, number];
}

export interface UnderstorySourceLike {
  readonly kind?: "stone";
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  readonly rendererBindings: readonly UnderstoryRendererBindingLike[];
}

export interface CollapsedUnderstoryLevel {
  readonly screenRelativeTransitionHeight: number;
  readonly level: number;
  readonly specimen: UnderstorySourceLike;
  readonly castShadows: boolean;
}

const _scratchScale = new Vector3();
const _scratchPos = new Vector3();
const _scratchQuat = new Quaternion();
const _scratchRootMat = new Matrix();
const _scratchLocalMat = new Matrix();
const _scratchWorldMat = new Matrix();

function nextPow2(value: number): number {
  let cap = 32;
  while (cap < value) cap <<= 1;
  return cap;
}

function distancePointToBoxSq(px: number, py: number, pz: number, box: BoundingBox): number {
  const dx = px < box.min.x ? box.min.x - px : px > box.max.x ? px - box.max.x : 0;
  const dy = py < box.min.y ? box.min.y - py : py > box.max.y ? py - box.max.y : 0;
  const dz = pz < box.min.z ? box.min.z - pz : pz > box.max.z ? pz - box.max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

function resolveLodTier(screenHeight: number, prevTier: number, lods: readonly InstancedUnderstoryLod[]): number {
  const count = lods.length;
  if (count === 0) return -1;
  const terminal = lods[count - 1]!.screenRelativeTransitionHeight;
  const cullThreshold = prevTier >= 0 ? terminal * (1 - LOD_HYSTERESIS_RATIO) : terminal;
  if (screenHeight < cullThreshold) return -1;
  for (let tier = 0; tier < count - 1; tier++) {
    const threshold = lods[tier]!.screenRelativeTransitionHeight;
    const effective =
      prevTier === tier
        ? threshold * (1 - LOD_HYSTERESIS_RATIO)
        : prevTier > tier
          ? threshold * (1 + LOD_HYSTERESIS_RATIO)
          : threshold;
    if (screenHeight >= effective) return tier;
  }
  return count - 1;
}

const SUPPORTED_INSTANCED_SHADERS = new Set(["Terrain/Vegetation", "Terrain/Surface"]);

/**
 * Checks whether all collapsed LOD bindings of a plant or companion-stone source can be rendered
 * through the unified `TreeAssemblyInstancedMesh` (`RENDERER_ASSET_ASSEMBLY_INSTANCE`) GPU instancing path.
 */
export function canInstanceUnderstoryLevels(
  _source: UnderstorySourceLike,
  levels: readonly CollapsedUnderstoryLevel[]
): boolean {
  if (levels.length === 0) return false;
  for (let i = 0; i < levels.length; i++) {
    const bindings = levels[i]!.specimen.rendererBindings;
    if (bindings.length === 0) continue;
    for (let j = 0; j < bindings.length; j++) {
      const original = bindings[j]!.renderer;
      const mesh = original.mesh as ModelMesh | null | undefined;
      if (!mesh || mesh.destroyed || mesh.blendShapeCount !== 0 || mesh.subMeshes.length !== 1) return false;
      const materials = original.getMaterials();
      if (materials.length !== 1) return false;
      const material = materials[0];
      if (!material || material.destroyed || !SUPPORTED_INSTANCED_SHADERS.has(material.shader?.name ?? "")) {
        return false;
      }
      const matMacros = material.shaderData.getMacros();
      for (let m = 0; m < matMacros.length; m++) {
        if (matMacros[m]!.name === "MATERIAL_VEGETATION_SHARED_GRASS_APPEARANCE") return false;
      }
      const renMacros = original.shaderData.getMacros();
      for (let m = 0; m < renMacros.length; m++) {
        if (DISALLOWED_RENDERER_MACROS.has(renMacros[m]!.name)) return false;
      }
    }
  }
  return true;
}

/** Builds a stable bucket specification for one source binding under explicit GPU instancing. */
export function buildUnderstoryBucketSpec(
  original: MeshRenderer,
  castShadows: boolean,
  receiveShadows: boolean,
  colorOverrideMask: readonly [number, number, number],
  interactionOccluder: boolean,
  isGrassMaterial: boolean
): InstancedUnderstoryBucketSpec {
  const mesh = original.mesh as ModelMesh;
  const material = original.getMaterial()!;
  const macroNames: string[] = ["RENDERER_ASSET_ASSEMBLY_INSTANCE"];
  let usesGpuVariation = false;
  let usesGpuLeafFrame = false;
  const origMacros = original.shaderData.getMacros();
  for (let i = 0; i < origMacros.length; i++) {
    const name = origMacros[i]!.name;
    if (name === "RENDERER_PROCEDURAL_TREE_GPU_VARIATION") usesGpuVariation = true;
    if (name === "RENDERER_PROCEDURAL_TREE_GPU_LEAF_FRAME") usesGpuLeafFrame = true;
    if (SKIPPED_BUCKET_MACROS.has(name) || name === "RENDERER_ASSET_ASSEMBLY_INSTANCE") continue;
    macroNames.push(name);
  }
  if (colorOverrideMask[0]) macroNames.push("RENDERER_PLANT_COLOR_OVERRIDE_R");
  if (colorOverrideMask[1]) macroNames.push("RENDERER_PLANT_COLOR_OVERRIDE_G");
  if (colorOverrideMask[2]) macroNames.push("RENDERER_PLANT_COLOR_OVERRIDE_B");
  macroNames.sort();

  let gpuLeafFrame: InstancedGpuLeafFrameBinding | undefined;
  let leafFrameKey = "";
  if (usesGpuLeafFrame) {
    const texture = original.shaderData.getTexture("renderer_ProceduralTreeLeafFrames") as Texture2D | undefined;
    const normalField = original.shaderData.getVector4("renderer_ProceduralTreeLeafNormalField");
    const frameScale = original.shaderData.getVector4("renderer_ProceduralTreeLeafFrameScale");
    if (texture && normalField && frameScale) {
      gpuLeafFrame = {
        texture,
        normalField: normalField.clone(),
        frameScale: frameScale.clone()
      };
      const texId = (texture as unknown as { instanceId?: number }).instanceId ?? 0;
      leafFrameKey = `${texId}@${frameScale.x.toFixed(3)},${frameScale.y.toFixed(3)},${frameScale.z.toFixed(3)},${frameScale.w}`;
    }
  }

  const meshId = (mesh as unknown as { instanceId?: number }).instanceId ?? 0;
  const matId = (material as unknown as { instanceId?: number }).instanceId ?? 0;
  const grassMaskKey = isGrassMaterial ? `${colorOverrideMask[0]},${colorOverrideMask[1]},${colorOverrideMask[2]}` : "";
  const key = [
    meshId,
    matId,
    castShadows ? 1 : 0,
    receiveShadows ? 1 : 0,
    original.enableVertexColor ? 1 : 0,
    usesGpuVariation ? 1 : 0,
    interactionOccluder ? 1 : 0,
    grassMaskKey,
    leafFrameKey,
    macroNames.join("|")
  ].join(":");

  return {
    key,
    mesh,
    material,
    macros: macroNames,
    castShadows,
    receiveShadows,
    enableVertexColor: original.enableVertexColor,
    usesGpuVariation,
    interactionOccluder,
    ...(isGrassMaterial ? { grassColorOverrideMask: colorOverrideMask } : {}),
    ...(gpuLeafFrame ? { gpuLeafFrame } : {})
  };
}

/**
 * Compiles one understory plant placement into a lightweight numeric `InstancedUnderstoryRecord`
 * matching the exact world transform, LOD thresholds, and per-instance colors of `plant()`.
 */
export function buildInstancedUnderstoryRecord(params: {
  readonly instance: LandscapePlantInstance;
  readonly groundHeight: number;
  readonly refYOffset: number;
  readonly worldSize: number;
  readonly origin: Matrix;
  readonly appliedScale: readonly [number, number, number];
  readonly levels: readonly CollapsedUnderstoryLevel[];
  readonly receiveShadows: boolean;
  readonly interactionOccluder: boolean;
  readonly pickId: string | undefined;
  readonly excluded: boolean;
  readonly resolveColor: (binding: UnderstoryRendererBindingLike) => Vector4;
  readonly resolveOverrideMask: (materialId: string) => readonly [number, number, number];
  readonly isGrassMaterial: (material: Material) => boolean;
}): InstancedUnderstoryRecord {
  const {
    instance,
    groundHeight,
    refYOffset,
    worldSize,
    origin,
    appliedScale,
    levels,
    receiveShadows,
    interactionOccluder,
    pickId,
    excluded,
    resolveColor,
    resolveOverrideMask,
    isGrassMaterial
  } = params;

  _scratchPos.set(instance.position[0], groundHeight, instance.position[2]);
  Quaternion.rotationYawPitchRoll((instance.yaw * Math.PI) / 180, 0, 0, _scratchQuat);
  _scratchScale.set(appliedScale[0], appliedScale[1], appliedScale[2]);
  Matrix.affineTransformation(_scratchScale, _scratchQuat, _scratchPos, _scratchRootMat);

  const lods: InstancedUnderstoryLod[] = [];
  for (let i = 0; i < levels.length; i++) {
    const levelInfo = levels[i]!;
    const bindings = levelInfo.specimen.rendererBindings;
    const parts: InstancedUnderstoryPart[] = [];
    for (let j = 0; j < bindings.length; j++) {
      const binding = bindings[j]!;
      const original = binding.renderer;
      Matrix.multiply(origin, original.entity.transform.worldMatrix, _scratchLocalMat);
      Matrix.multiply(_scratchRootMat, _scratchLocalMat, _scratchWorldMat);
      _scratchWorldMat.decompose(_scratchPos, _scratchQuat, _scratchScale);

      const overrideMask = resolveOverrideMask(binding.materialId);
      const material = original.getMaterial()!;
      const bucketSpec = buildUnderstoryBucketSpec(
        original,
        levelInfo.castShadows,
        receiveShadows,
        overrideMask,
        interactionOccluder,
        isGrassMaterial(material)
      );
      const color = resolveColor(binding);
      const gpuVar = bucketSpec.usesGpuVariation
        ? original.shaderData.getVector4("renderer_ProceduralTreeVariation")
        : undefined;
      const branchShape = bucketSpec.usesGpuVariation
        ? original.shaderData.getVector4("renderer_ProceduralTreeBranchShape")
        : undefined;

      parts.push({
        bucketKey: bucketSpec.key,
        bucketSpec,
        materialId: binding.materialId,
        posX: _scratchPos.x,
        posY: _scratchPos.y,
        posZ: _scratchPos.z,
        quatX: _scratchQuat.x,
        quatY: _scratchQuat.y,
        quatZ: _scratchQuat.z,
        quatW: _scratchQuat.w,
        scaleX: _scratchScale.x,
        scaleY: _scratchScale.y,
        scaleZ: _scratchScale.z,
        colorR: color.x,
        colorG: color.y,
        colorB: color.z,
        varX: gpuVar?.x ?? 1,
        varY: gpuVar?.y ?? 1,
        varZ: gpuVar?.z ?? 1,
        varW: gpuVar?.w ?? 0,
        branchX: branchShape?.x ?? 0,
        branchY: branchShape?.y ?? 1
      });
    }
    lods.push({
      screenRelativeTransitionHeight: levelInfo.screenRelativeTransitionHeight,
      parts
    });
  }

  const terminalCutoff = lods[lods.length - 1]?.screenRelativeTransitionHeight ?? 0;
  return {
    instance,
    groundHeight,
    refYOffset,
    worldCenterY: groundHeight + refYOffset,
    worldSize,
    boundingRadius: Math.max(0.25, worldSize * 0.75),
    terminalCutoff,
    pickId,
    excluded,
    assignedLod: -1,
    lods
  };
}

/**
 * Unified GPU-instanced cell-culled LOD pool for natural understory vegetation.
 * Shares the exact `TreeAssemblyInstancedMesh` + `RENDERER_ASSET_ASSEMBLY_INSTANCE` contract
 * used by `TemplateProceduralPlants` and `SeedWorldPopulationRuntime` without modifying engine core.
 */
/** Applies shared material, macros, and optional leaf-frame / grass-override uniforms onto an instanced renderer. */
export function applyUnderstoryBucketSpecToRenderer(renderer: MeshRenderer, spec: InstancedUnderstoryBucketSpec): void {
  renderer.setMaterial(spec.material);
  renderer.castShadows = spec.castShadows;
  renderer.receiveShadows = spec.receiveShadows;
  renderer.enableVertexColor = spec.enableVertexColor;
  for (let i = 0; i < spec.macros.length; i++) {
    renderer.shaderData.enableMacro(spec.macros[i]!);
  }
  if (spec.grassColorOverrideMask) {
    renderer.shaderData.setVector3(
      "renderer_GrassColorOverrideMask",
      new Vector3(spec.grassColorOverrideMask[0], spec.grassColorOverrideMask[1], spec.grassColorOverrideMask[2])
    );
  }
  if (spec.gpuLeafFrame) {
    renderer.shaderData.setTexture("renderer_ProceduralTreeLeafFrames", spec.gpuLeafFrame.texture);
    renderer.shaderData.setVector4("renderer_ProceduralTreeLeafNormalField", spec.gpuLeafFrame.normalField);
    renderer.shaderData.setVector4("renderer_ProceduralTreeLeafFrameScale", spec.gpuLeafFrame.frameScale);
  }
}

export class NaturalUnderstoryInstancedPool {
  private readonly poolRoot: Entity;
  private readonly cells = new Map<string, InstancedUnderstoryCellData>();
  private readonly buckets = new Map<string, InstancedBucket>();
  private readonly frustum = new BoundingFrustum();
  private readonly vpMatrix = new Matrix();
  private readonly lastVpElements = new Float32Array(16);
  private readonly scratchSphere = new BoundingSphere(new Vector3(), 1);
  private lastCamValid = false;
  private lastFovKey = NaN;
  private lastMaxDist = NaN;
  private lastShadowDist = NaN;
  private membershipDirty = false;
  private dataDirty = false;
  private disposed = false;

  constructor(
    parent: Entity,
    private readonly camera: Camera,
    poolName = "Natural understory instanced pool"
  ) {
    this.poolRoot = parent.createChild(poolName);
  }

  get bucketCount(): number {
    return this.buckets.size;
  }

  get cellCount(): number {
    return this.cells.size;
  }

  /** Replaces or inserts all instanced understory records owned by one 64m Cell. */
  setCell(cellKey: string, records: InstancedUnderstoryRecord[]): void {
    if (this.disposed) return;
    if (records.length === 0) {
      if (this.cells.delete(cellKey)) {
        this.membershipDirty = true;
      }
      return;
    }

    const subCellMap = new Map<string, InstancedUnderstorySubCell>();
    for (let i = 0; i < records.length; i++) {
      const rec = records[i]!;
      rec.assignedLod = -1;
      const sx = Math.floor(rec.instance.position[0] / SUBCELL_SIZE_M);
      const sz = Math.floor(rec.instance.position[2] / SUBCELL_SIZE_M);
      const subKey = `${sx}/${sz}`;
      let sub = subCellMap.get(subKey);
      if (!sub) {
        sub = {
          bounds: new BoundingBox(
            new Vector3(Infinity, Infinity, Infinity),
            new Vector3(-Infinity, -Infinity, -Infinity)
          ),
          records: []
        };
        subCellMap.set(subKey, sub);
      }
      sub.records.push(rec);
      const r = rec.boundingRadius;
      const x = rec.instance.position[0];
      const y = rec.worldCenterY;
      const z = rec.instance.position[2];
      sub.bounds.min.set(
        Math.min(sub.bounds.min.x, x - r),
        Math.min(sub.bounds.min.y, y - r),
        Math.min(sub.bounds.min.z, z - r)
      );
      sub.bounds.max.set(
        Math.max(sub.bounds.max.x, x + r),
        Math.max(sub.bounds.max.y, y + r),
        Math.max(sub.bounds.max.z, z + r)
      );
    }

    this.cells.set(cellKey, {
      records,
      subCells: [...subCellMap.values()]
    });
    this.membershipDirty = true;
  }

  /** Removes a streamed-out Cell and schedules a clean buffer compaction on the next update. */
  removeCell(cellKey: string): void {
    if (this.disposed) return;
    if (this.cells.delete(cellKey)) {
      this.membershipDirty = true;
    }
  }

  /** Updates cached Y positions in-place after terrain/rock grounding commits without rebuilding Entities. */
  updateCellGroundHeights(cellKey: string, resolveHeight: (record: InstancedUnderstoryRecord) => number): void {
    if (this.disposed) return;
    const cell = this.cells.get(cellKey);
    if (!cell) return;
    let changed = false;
    for (let s = 0; s < cell.subCells.length; s++) {
      const sub = cell.subCells[s]!;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < sub.records.length; i++) {
        const rec = sub.records[i]!;
        const nextGround = resolveHeight(rec);
        const deltaY = nextGround - rec.groundHeight;
        if (Math.abs(deltaY) > 1e-6) {
          rec.groundHeight = nextGround;
          rec.worldCenterY = nextGround + rec.refYOffset;
          for (let l = 0; l < rec.lods.length; l++) {
            const parts = rec.lods[l]!.parts;
            for (let p = 0; p < parts.length; p++) {
              parts[p]!.posY += deltaY;
            }
          }
          changed = true;
        }
        minY = Math.min(minY, rec.worldCenterY - rec.boundingRadius);
        maxY = Math.max(maxY, rec.worldCenterY + rec.boundingRadius);
      }
      if (sub.records.length > 0) {
        sub.bounds.min.y = minY;
        sub.bounds.max.y = maxY;
      }
    }
    if (changed) this.dataDirty = true;
  }

  /** Updates authoring ground exclusion masks in-place for affected instances. */
  updateGroundExclusions(
    boundsList: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[],
    isExcluded: (instance: LandscapePlantInstance) => boolean
  ): void {
    if (this.disposed || boundsList.length === 0) return;
    let changed = false;
    for (const cell of this.cells.values()) {
      for (let s = 0; s < cell.subCells.length; s++) {
        const sub = cell.subCells[s]!;
        const sb = sub.bounds;
        let subOverlaps = false;
        for (let b = 0; b < boundsList.length; b++) {
          const area = boundsList[b]!;
          if (sb.max.x >= area.minX && sb.min.x <= area.maxX && sb.max.z >= area.minZ && sb.min.z <= area.maxZ) {
            subOverlaps = true;
            break;
          }
        }
        if (!subOverlaps) continue;
        for (let i = 0; i < sub.records.length; i++) {
          const rec = sub.records[i]!;
          const x = rec.instance.position[0];
          const z = rec.instance.position[2];
          const r = rec.boundingRadius + 0.01;
          let recOverlaps = false;
          for (let b = 0; b < boundsList.length; b++) {
            const area = boundsList[b]!;
            if (x + r >= area.minX && x - r <= area.maxX && z + r >= area.minZ && z - r <= area.maxZ) {
              recOverlaps = true;
              break;
            }
          }
          if (!recOverlaps) continue;
          const next = isExcluded(rec.instance);
          if (next !== rec.excluded) {
            rec.excluded = next;
            changed = true;
          }
        }
      }
    }
    if (changed) this.membershipDirty = true;
  }

  /** Synchronously updates per-instance colors (and bucket override macros if needed) for previewAppearance. */
  refreshAppearanceColors(
    assetId: string,
    materialId: string,
    resolveColor: (instance: LandscapePlantInstance, materialId: string) => Vector4 | undefined,
    resolveOverrideMask: (assetId: string, materialId: string) => readonly [number, number, number],
    enableAllOverrideChannels: boolean
  ): void {
    if (this.disposed) return;
    let changed = false;
    const overrideMask: readonly [number, number, number] = enableAllOverrideChannels
      ? [1, 1, 1]
      : resolveOverrideMask(assetId, materialId);

    for (const cell of this.cells.values()) {
      for (let i = 0; i < cell.records.length; i++) {
        const rec = cell.records[i]!;
        if (rec.instance.assetId !== assetId) continue;
        const nextColor = resolveColor(rec.instance, materialId);
        if (!nextColor) continue;
        for (let l = 0; l < rec.lods.length; l++) {
          const parts = rec.lods[l]!.parts;
          for (let p = 0; p < parts.length; p++) {
            const part = parts[p]!;
            if (part.materialId !== materialId) continue;
            part.colorR = nextColor.x;
            part.colorG = nextColor.y;
            part.colorB = nextColor.z;
            const prevSpec = part.bucketSpec;
            const wantR = enableAllOverrideChannels || overrideMask[0] !== 0;
            const wantG = enableAllOverrideChannels || overrideMask[1] !== 0;
            const wantB = enableAllOverrideChannels || overrideMask[2] !== 0;
            const hasR = prevSpec.macros.includes("RENDERER_PLANT_COLOR_OVERRIDE_R");
            const hasG = prevSpec.macros.includes("RENDERER_PLANT_COLOR_OVERRIDE_G");
            const hasB = prevSpec.macros.includes("RENDERER_PLANT_COLOR_OVERRIDE_B");
            const grassMaskChanged =
              !!prevSpec.grassColorOverrideMask &&
              (prevSpec.grassColorOverrideMask[0] !== overrideMask[0] ||
                prevSpec.grassColorOverrideMask[1] !== overrideMask[1] ||
                prevSpec.grassColorOverrideMask[2] !== overrideMask[2]);
            if (wantR !== hasR || wantG !== hasG || wantB !== hasB || grassMaskChanged) {
              const nextMacros = prevSpec.macros.filter(
                (m) =>
                  m !== "RENDERER_PLANT_COLOR_OVERRIDE_R" &&
                  m !== "RENDERER_PLANT_COLOR_OVERRIDE_G" &&
                  m !== "RENDERER_PLANT_COLOR_OVERRIDE_B"
              );
              if (wantR) nextMacros.push("RENDERER_PLANT_COLOR_OVERRIDE_R");
              if (wantG) nextMacros.push("RENDERER_PLANT_COLOR_OVERRIDE_G");
              if (wantB) nextMacros.push("RENDERER_PLANT_COLOR_OVERRIDE_B");
              nextMacros.sort();
              const meshId = (prevSpec.mesh as unknown as { instanceId?: number }).instanceId ?? 0;
              const matId = (prevSpec.material as unknown as { instanceId?: number }).instanceId ?? 0;
              const grassMaskKey = prevSpec.grassColorOverrideMask
                ? `${overrideMask[0]},${overrideMask[1]},${overrideMask[2]}`
                : "";
              const leafFrameKey = prevSpec.gpuLeafFrame
                ? `${(prevSpec.gpuLeafFrame.texture as unknown as { instanceId?: number }).instanceId ?? 0}@${prevSpec.gpuLeafFrame.frameScale.x.toFixed(3)},${prevSpec.gpuLeafFrame.frameScale.y.toFixed(3)},${prevSpec.gpuLeafFrame.frameScale.z.toFixed(3)},${prevSpec.gpuLeafFrame.frameScale.w}`
                : "";
              const nextKey = [
                meshId,
                matId,
                prevSpec.castShadows ? 1 : 0,
                prevSpec.receiveShadows ? 1 : 0,
                prevSpec.enableVertexColor ? 1 : 0,
                prevSpec.usesGpuVariation ? 1 : 0,
                prevSpec.interactionOccluder ? 1 : 0,
                grassMaskKey,
                leafFrameKey,
                nextMacros.join("|")
              ].join(":");
              part.bucketSpec = {
                ...prevSpec,
                key: nextKey,
                macros: nextMacros,
                ...(prevSpec.grassColorOverrideMask ? { grassColorOverrideMask: overrideMask } : {})
              };
              part.bucketKey = nextKey;
            }
            changed = true;
          }
        }
      }
    }
    if (changed) this.dataDirty = true;
  }

  /** Visits active instanced pick batches so picking still resolves flower-field and understory hits. */
  visitPickBatches(visitor: SeedWorldPickVisitor): void {
    if (this.disposed) return;
    for (const bucket of this.buckets.values()) {
      if (bucket.pickBatch.count > 0 && bucket.entity.isActiveInHierarchy && bucket.renderer.enabled) {
        visitor(bucket.pickBatch);
      }
    }
  }

  /** Returns live bucket renderers for shader warmup without creating synthetic duplicates. */
  getWarmupRenderers(): MeshRenderer[] {
    const out: MeshRenderer[] = [];
    for (const bucket of this.buckets.values()) {
      if (!bucket.renderer.destroyed) out.push(bucket.renderer);
    }
    return out;
  }

  /**
   * Performs cell frustum/distance culling and LOD bucketing.
   * When `shadowCullDistanceMetres > 0`, shadow-casting instances within that radius remain included
   * even outside the camera frustum so off-camera trees continue casting accurate shadows.
   * Early-returns with zero allocations and zero GPU uploads when the camera and cell set are unchanged.
   */
  update(maxDetailDistanceMetres: number, force = false, shadowCullDistanceMetres = 0): void {
    if (this.disposed) return;
    if (!this.poolRoot.isActiveInHierarchy && !force) return;

    const camera = this.camera;
    const camPos = camera?.entity?.transform?.worldPosition;
    if (!camPos) return;

    const isOrtho = !!camera.isOrthographic;
    const orthoSize = camera.orthographicSize ?? 10;
    const fov = camera.fieldOfView ?? 45;
    const fovKey = isOrtho ? -orthoSize : fov;

    let cameraChanged =
      force ||
      !this.lastCamValid ||
      fovKey !== this.lastFovKey ||
      maxDetailDistanceMetres !== this.lastMaxDist ||
      shadowCullDistanceMetres !== this.lastShadowDist;
    let frustumValid = false;
    const viewMatrix = camera.viewMatrix;
    const projectionMatrix = camera.projectionMatrix;
    if (viewMatrix && projectionMatrix) {
      Matrix.multiply(projectionMatrix, viewMatrix, this.vpMatrix);
      const elems = this.vpMatrix.elements;
      if (!cameraChanged) {
        for (let i = 0; i < 16; i++) {
          if (Math.abs(elems[i]! - this.lastVpElements[i]!) > CAMERA_MATRIX_EPSILON) {
            cameraChanged = true;
            break;
          }
        }
      }
      frustumValid = Number.isFinite(elems[0]) && Number.isFinite(elems[15]);
      if (cameraChanged && frustumValid) {
        this.lastVpElements.set(elems);
        this.lastCamValid = true;
        this.lastFovKey = fovKey;
        this.lastMaxDist = maxDetailDistanceMetres;
        this.lastShadowDist = shadowCullDistanceMetres;
      }
    } else if (cameraChanged) {
      this.lastCamValid = true;
      this.lastFovKey = fovKey;
      this.lastMaxDist = maxDetailDistanceMetres;
      this.lastShadowDist = shadowCullDistanceMetres;
    }

    if (!cameraChanged && !this.membershipDirty && !this.dataDirty) return;

    if (this.cells.size === 0) {
      for (const bucket of this.buckets.values()) {
        if (bucket.view) bucket.view.mesh.instanceCount = 0;
        bucket.entity.isActive = false;
        bucket.pickBatch.count = 0;
      }
      this.membershipDirty = false;
      this.dataDirty = false;
      return;
    }

    if (frustumValid) {
      this.frustum.calculateFromMatrix(this.vpMatrix);
    }

    const camX = camPos.x;
    const camY = camPos.y;
    const camZ = camPos.z;
    const tanHalfFov = Math.tan((fov * Math.PI) / 360);
    const invTwoTanHalfFov = 1 / Math.max(1e-6, 2 * tanHalfFov);
    const invTwoOrthoSize = 1 / Math.max(1e-6, 2 * orthoSize);
    const maxDist = maxDetailDistanceMetres;
    const maxDistHysteresis = maxDist + 2;
    const maxDistSq = maxDist * maxDist;
    const maxDistHystSq = maxDistHysteresis * maxDistHysteresis;
    const maxCellDistSq = (maxDistHysteresis + 4) * (maxDistHysteresis + 4);
    const shadowDistSq = shadowCullDistanceMetres > 0 ? shadowCullDistanceMetres * shadowCullDistanceMetres : 0;
    const shadowCellDistSq =
      shadowCullDistanceMetres > 0 ? (shadowCullDistanceMetres + 16) * (shadowCullDistanceMetres + 16) : 0;

    let anyChanged = this.membershipDirty || this.dataDirty;

    // Pass 1: Cell frustum/distance cull & LOD assignment.
    for (const cell of this.cells.values()) {
      for (let s = 0; s < cell.subCells.length; s++) {
        const sub = cell.subCells[s]!;
        const subDistSq = distancePointToBoxSq(camX, camY, camZ, sub.bounds);
        const subInFrustum = subDistSq <= maxCellDistSq && (!frustumValid || this.frustum.intersectsBox(sub.bounds));
        const subInShadowRadius = shadowCellDistSq > 0 && subDistSq <= shadowCellDistSq;

        const recs = sub.records;
        if (!subInFrustum && !subInShadowRadius) {
          for (let i = 0; i < recs.length; i++) {
            const rec = recs[i]!;
            if (rec.assignedLod !== -1) {
              rec.assignedLod = -1;
              anyChanged = true;
            }
          }
          continue;
        }

        for (let i = 0; i < recs.length; i++) {
          const rec = recs[i]!;
          const prev = rec.assignedLod;
          let next = -1;
          if (!rec.excluded) {
            const dx = rec.instance.position[0] - camX;
            const dz = rec.instance.position[2] - camZ;
            const horizDistSq = dx * dx + dz * dz;
            const limitSq = prev >= 0 ? maxDistHystSq : maxDistSq;
            if (horizDistSq <= limitSq) {
              let inFrustum = true;
              if (frustumValid) {
                if (subInFrustum) {
                  this.scratchSphere.center.set(rec.instance.position[0], rec.worldCenterY, rec.instance.position[2]);
                  this.scratchSphere.radius = rec.boundingRadius;
                  inFrustum = this.frustum.intersectsSphere(this.scratchSphere);
                } else {
                  inFrustum = false;
                }
              }
              const shadowEligible = !inFrustum && shadowDistSq > 0 && horizDistSq <= shadowDistSq;
              if (inFrustum || shadowEligible) {
                let screenHeight: number;
                if (isOrtho) {
                  screenHeight = rec.worldSize * invTwoOrthoSize;
                } else {
                  const dy = rec.worldCenterY - camY;
                  const dist = Math.sqrt(horizDistSq + dy * dy);
                  screenHeight = dist <= 1e-4 ? Infinity : (rec.worldSize * invTwoTanHalfFov) / dist;
                }
                const candidate = resolveLodTier(screenHeight, prev, rec.lods);
                if (candidate >= 0) {
                  if (inFrustum) {
                    next = candidate;
                  } else {
                    // Only keep off-frustum records if the selected tier actually casts shadows.
                    const parts = rec.lods[candidate]!.parts;
                    for (let p = 0; p < parts.length; p++) {
                      if (parts[p]!.bucketSpec.castShadows) {
                        next = candidate;
                        break;
                      }
                    }
                  }
                }
              }
            }
          }
          if (next !== prev) {
            rec.assignedLod = next;
            anyChanged = true;
          }
        }
      }
    }

    this.membershipDirty = false;
    this.dataDirty = false;
    if (!anyChanged) return;

    // Pass 2: Count visible parts per bucket.
    for (const bucket of this.buckets.values()) {
      bucket.nextCount = 0;
      bucket.writeCursor = 0;
      bucket.visibleBounds.min.set(Infinity, Infinity, Infinity);
      bucket.visibleBounds.max.set(-Infinity, -Infinity, -Infinity);
    }

    for (const cell of this.cells.values()) {
      const recs = cell.records;
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i]!;
        const tier = rec.assignedLod;
        if (tier < 0) continue;
        const parts = rec.lods[tier]!.parts;
        for (let p = 0; p < parts.length; p++) {
          const part = parts[p]!;
          const bucket = this.ensureBucket(part.bucketSpec);
          bucket.nextCount++;
        }
      }
    }

    // Ensure GPU storage capacity for non-empty buckets.
    for (const bucket of this.buckets.values()) {
      if (bucket.nextCount > 0) {
        this.ensureBucketCapacity(bucket, bucket.nextCount);
      }
    }

    // Pass 3: Pack visible instance records into contiguous staging buffers.
    for (const cell of this.cells.values()) {
      const recs = cell.records;
      for (let i = 0; i < recs.length; i++) {
        const rec = recs[i]!;
        const tier = rec.assignedLod;
        if (tier < 0) continue;
        const parts = rec.lods[tier]!.parts;
        const r = rec.boundingRadius;
        const rx = rec.instance.position[0];
        const ry = rec.worldCenterY;
        const rz = rec.instance.position[2];

        for (let p = 0; p < parts.length; p++) {
          const part = parts[p]!;
          const bucket = this.buckets.get(part.bucketKey)!;
          const slot = bucket.writeCursor++;
          const view = bucket.view!;
          const staging = view.staging;
          const offset = slot * view.recordFloats;

          if (bucket.spec.usesGpuVariation) {
            staging[offset] = part.posX;
            staging[offset + 1] = part.posY;
            staging[offset + 2] = part.posZ;
            staging[offset + 3] = part.branchX;
            staging[offset + 4] = part.quatX;
            staging[offset + 5] = part.quatY;
            staging[offset + 6] = part.quatZ;
            staging[offset + 7] = part.quatW;
            staging[offset + 8] = part.scaleX;
            staging[offset + 9] = part.scaleY;
            staging[offset + 10] = part.scaleZ;
            staging[offset + 11] = part.branchY;
            staging[offset + 12] = part.colorR;
            staging[offset + 13] = part.colorG;
            staging[offset + 14] = part.colorB;
            staging[offset + 15] = 1;
            staging[offset + 16] = part.varX;
            staging[offset + 17] = part.varY;
            staging[offset + 18] = part.varZ;
            staging[offset + 19] = part.varW;
            staging[offset + 20] = part.colorR;
            staging[offset + 21] = part.colorG;
            staging[offset + 22] = part.colorB;
            staging[offset + 23] = 1;
          } else {
            staging[offset] = part.posX;
            staging[offset + 1] = part.posY;
            staging[offset + 2] = part.posZ;
            staging[offset + 3] = 1;
            staging[offset + 4] = part.quatX;
            staging[offset + 5] = part.quatY;
            staging[offset + 6] = part.quatZ;
            staging[offset + 7] = part.quatW;
            staging[offset + 8] = part.scaleX;
            staging[offset + 9] = part.scaleY;
            staging[offset + 10] = part.scaleZ;
            staging[offset + 11] = 1;
            staging[offset + 12] = part.colorR;
            staging[offset + 13] = part.colorG;
            staging[offset + 14] = part.colorB;
            staging[offset + 15] = 1;
          }

          bucket.pickIds[slot] = rec.pickId;
          const vb = bucket.visibleBounds;
          vb.min.set(Math.min(vb.min.x, rx - r), Math.min(vb.min.y, ry - r), Math.min(vb.min.z, rz - r));
          vb.max.set(Math.max(vb.max.x, rx + r), Math.max(vb.max.y, ry + r), Math.max(vb.max.z, rz + r));
        }
      }
    }

    // Pass 4: Upload non-empty buckets and deactivate empty ones.
    for (const bucket of this.buckets.values()) {
      const count = bucket.nextCount;
      if (count > 0 && bucket.view) {
        bucket.view.mesh.bounds = bucket.visibleBounds;
        uploadTreeAssemblyInstances(bucket.view, count);
        bucket.entity.isActive = true;
        bucket.pickBatch.count = count;
        bucket.pickBatch.ids = bucket.pickIds;
      } else {
        if (bucket.view) bucket.view.mesh.instanceCount = 0;
        bucket.entity.isActive = false;
        bucket.pickBatch.count = 0;
      }
    }
  }

  /** Releases all GPU buffers, BufferMeshes, and bucket entities. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const bucket of this.buckets.values()) {
      bucket.view?.mesh.destroy();
      bucket.storage?.instanceBuffer.destroy(true);
    }
    this.buckets.clear();
    this.cells.clear();
    if (!this.poolRoot.destroyed) this.poolRoot.destroy();
  }

  private ensureBucket(spec: InstancedUnderstoryBucketSpec): InstancedBucket {
    let bucket = this.buckets.get(spec.key);
    if (bucket) return bucket;
    const entity = this.poolRoot.createChild(`InstancedBatch:${spec.mesh.name || "mesh"}`);
    entity.isActive = false;
    const renderer = entity.addComponent(MeshRenderer);
    applyUnderstoryBucketSpecToRenderer(renderer, spec);
    const pickBatch = new SeedWorldArrayPickBatch(renderer);
    pickBatch.instanced = true;
    pickBatch.count = 0;
    pickBatch.interactionOccluder = spec.interactionOccluder;

    bucket = {
      spec,
      entity,
      renderer,
      pickBatch,
      capacity: 0,
      nextCount: 0,
      writeCursor: 0,
      pickIds: [],
      visibleBounds: new BoundingBox(new Vector3(), new Vector3())
    };
    this.buckets.set(spec.key, bucket);
    return bucket;
  }

  private ensureBucketCapacity(bucket: InstancedBucket, needed: number): void {
    if (bucket.view && bucket.capacity >= needed) return;
    const nextCap = nextPow2(needed);
    const engine = this.poolRoot.engine;
    const recordFloats = bucket.spec.usesGpuVariation
      ? TREE_ASSEMBLY_GPU_VARIATION_INSTANCE_FLOATS
      : TREE_ASSEMBLY_INSTANCE_FLOATS;
    const storage = createTreeAssemblyInstanceStorage(engine, nextCap, recordFloats);
    const view = createTreeAssemblyInstancedMesh(
      engine,
      bucket.spec.mesh,
      nextCap,
      bucket.visibleBounds,
      bucket.entity.name,
      storage
    );
    const prevView = bucket.view;
    const prevStorage = bucket.storage;
    bucket.storage = storage;
    bucket.view = view;
    bucket.capacity = nextCap;
    bucket.renderer.mesh = view.mesh;
    if (prevView) prevView.mesh.destroy();
    if (prevStorage) prevStorage.instanceBuffer.destroy(true);
  }
}
