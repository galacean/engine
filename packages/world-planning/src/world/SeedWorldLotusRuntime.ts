import {
  BoundingBox,
  Camera,
  ContainmentType,
  Entity,
  Matrix,
  Quaternion,
  RenderViewType,
  Vector3,
  type RenderViewCullingContext,
  type RenderViewCullingSource,
  type RenderViewCullingSourceRegistration
} from "@galacean/engine";
import type { AtomicAssemblySourceFamily } from "@galacean/engine-vegetation/asset-assembly/AssetAssemblySourceLibrary";
import { TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS } from "@galacean/engine-vegetation/asset-assembly/TreeAssemblyInstancedMesh";
import type { TerrainProjectResolvedRenderer } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import type { SeedWorldLotusInstance } from "./SeedWorldDecorations";
import type { SeedWorldExactInstance } from "./SeedWorldExactInstanceCellRuntime";
import type { SeedWorldFields } from "../runtime/SeedWorldFields.ts";
import { resolveSeedWorldSurfaceDetailTransitionHeights } from "./SeedWorldRuntimeLodProfile";
import { SEED_WORLD_POPULATION_CELL_METRES } from "../runtime/SeedWorldPopulationPlan.ts";
import {
  appendPrefabInstance,
  capturePopulationViewCache,
  createPopulationViewCaches,
  createPrefabInstanceViewBatch,
  disposePrefabInstanceViewBatch,
  populationViewCacheMatches,
  publishPrefabInstanceViewBatch,
  POPULATION_RENDER_VIEW_COUNT,
  type PrefabInstanceViewBatch
} from "./SeedWorldInstanceBatch";
import type { SeedWorldTerrainOcclusionReadPort } from "../runtime/SeedWorldTerrainOcclusionCuller.ts";

interface LotusRuntimeInstance {
  readonly decoration: SeedWorldLotusInstance;
  readonly source: LotusRuntimeSource;
  readonly worldPosition: Vector3;
  readonly projectionPoint: Vector3;
  readonly bounds: BoundingBox;
  readonly parts: readonly LotusInstancePart[];
  projectionSize: number;
  rangeRevision: number;
  inRange: boolean;
  authoringVisible: boolean;
  cameraVisible: boolean;
}

interface LotusInstancePart {
  readonly source: TerrainProjectResolvedRenderer;
  readonly batch: LotusInstanceBatch;
  readonly recordIndex: number;
  readonly bounds: BoundingBox;
}

interface LotusInstanceBatch {
  readonly source: TerrainProjectResolvedRenderer;
  readonly records: Float32Array;
  readonly views: PrefabInstanceViewBatch[];
  readonly bounds: BoundingBox;
  count: number;
}

interface LotusInstanceCell {
  readonly key: string;
  readonly bounds: BoundingBox;
  readonly instances: LotusRuntimeInstance[];
}

interface LotusRuntimeSource {
  readonly atom: AtomicAssemblySourceFamily["primary"]["lods"][number];
  readonly range?: {
    readonly localReferencePoint: readonly [x: number, y: number, z: number];
    readonly size: number;
    readonly screenRelativeTransitionHeight: number;
  };
}

const LOTUS_PROTOTYPE_FAMILIES = Object.freeze([
  "lotus",
  "lotus-group-1",
  "lotus-group-2"
] as const satisfies readonly SeedWorldLotusInstance["prototypeFamily"][]);

/** Authored low-detail mesh used by every water-surface lotus instance. */
export const SEED_WORLD_LOTUS_AUTHORED_LOD_INDEX = 1;

const LOTUS_COMPOSITION_BY_FAMILY: Readonly<
  Record<SeedWorldLotusInstance["prototypeFamily"], Readonly<{ leafCount: number; flowerCount: number }>>
> = Object.freeze({
  lotus: Object.freeze({ leafCount: 1, flowerCount: 0 }),
  "lotus-group-1": Object.freeze({ leafCount: 11, flowerCount: 0 }),
  "lotus-group-2": Object.freeze({ leafCount: 11, flowerCount: 4 })
});

/** Read-only development evidence for Artifact-bound Lake-shore lotus. */
export interface SeedWorldLotusRuntimeDiagnostics {
  readonly placementCount: number;
  readonly patches: readonly Readonly<{
    readonly sourceFeatureId: string;
    readonly bodySourceHash: string;
    readonly instanceCount: number;
    readonly requestedAreaSquareMetres: number;
    readonly requestedAreaRatio: number;
    readonly achievedAreaSquareMetres: number;
    readonly achievedAreaRatio: number;
    readonly distributionHullAreaSquareMetres: number;
    readonly radiusMetres: number;
    readonly maximumShoreDistanceMetres: number;
    readonly maximumWaterDepthMetres: number;
  }>[];
  readonly instances: readonly Readonly<{
    readonly id: string;
    readonly prototypeFamily: SeedWorldLotusInstance["prototypeFamily"];
    readonly bodySourceHash: string;
    readonly normalizedPosition: SeedWorldLotusInstance["normalizedPosition"];
    readonly worldPosition: readonly [x: number, y: number, z: number];
    readonly scale: SeedWorldLotusInstance["scale"];
    readonly yawRadians: number;
    /** Authored pad count inside the selected licensed Prefab. */
    readonly leafCount: number;
    /** Authored flower-head count inside the selected licensed Prefab. */
    readonly flowerCount: number;
    readonly waterLevelMetres: number;
    readonly waterDepthMetres: number;
    readonly shoreDistanceMetres: number;
    readonly surfaceOffsetMetres: number;
    readonly active: boolean;
    readonly activeLods: readonly number[];
  }>[];
}

/** Runtime owner for exact, surface-anchored lotus instances compiled by the presentation Worker. */
export class SeedWorldLotusRuntime implements RenderViewCullingSource {
  readonly placementCount: number;
  readonly exactInstances: readonly SeedWorldExactInstance[];

  private readonly _instances: LotusRuntimeInstance[] = [];
  private readonly _batches: LotusInstanceBatch[] = [];
  private readonly _viewCaches = createPopulationViewCaches();
  private readonly _rootMatrix = new Matrix();
  private readonly _cameraState = new Float64Array(5).fill(NaN);
  private readonly _registration: RenderViewCullingSourceRegistration;
  private readonly _sizeMetres: number;
  private _cells: readonly LotusInstanceCell[] = [];
  private _visibilityRevision = 0;
  private _occlusionRevision = -1;
  private _occlusionConfirmationFrames = 2;
  private _destroyed = false;

  constructor(
    private readonly _root: Entity,
    private readonly _camera: Camera,
    family: AtomicAssemblySourceFamily,
    fields: Pick<SeedWorldFields, "sizeMetres">,
    decorations: readonly SeedWorldLotusInstance[],
    private readonly _terrainOcclusion?: SeedWorldTerrainOcclusionReadPort
  ) {
    this._sizeMetres = fields.sizeMetres;
    const entries: SeedWorldExactInstance[] = [];
    try {
      const runtimeSources = resolveLotusRuntimeSources(family);
      const capacities = new Map<TerrainProjectResolvedRenderer, number>();
      // Cell ownership never splits a GPU batch; identical primitives share all instance storage
      for (const decoration of decorations) {
        for (const source of runtimeSources[decoration.prototypeFamily].atom.renderers) {
          const key = [...capacities.keys()].find((candidate) => sameLotusPrimitive(candidate, source)) ?? source;
          capacities.set(key, (capacities.get(key) ?? 0) + 1);
        }
      }
      for (const [source, capacity] of capacities) {
        this._batches.push({
          source,
          records: new Float32Array(capacity * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS),
          views: [],
          bounds: emptyBounds(),
          count: 0
        });
      }
      for (const decoration of decorations) {
        const source = runtimeSources[decoration.prototypeFamily];
        const instance: LotusRuntimeInstance = {
          decoration,
          source,
          worldPosition: new Vector3(),
          projectionPoint: new Vector3(),
          bounds: emptyBounds(),
          parts: source.atom.renderers.map((renderer) => {
            const batch = this._batches.find((candidate) => sameLotusPrimitive(candidate.source, renderer))!;
            return { source: renderer, batch, recordIndex: batch.count++, bounds: emptyBounds() };
          }),
          projectionSize: 0,
          rangeRevision: -1,
          inRange: false,
          authoringVisible: true,
          cameraVisible: false
        };
        this._instances.push(instance);
        entries.push(
          Object.freeze({
            id: decoration.id,
            category: "lotus",
            bounds: instance.bounds,
            controller: Object.freeze({
              setAuthoringVisible: (visible: boolean) => {
                if (instance.authoringVisible === visible) return;
                instance.authoringVisible = visible;
                this._visibilityRevision++;
              }
            })
          })
        );
      }
      this._refreshSpatialData(true);
      for (let batchIndex = 0; batchIndex < this._batches.length; batchIndex++) {
        const batch = this._batches[batchIndex]!;
        const viewCount = batch.source.castShadows ? POPULATION_RENDER_VIEW_COUNT : 1;
        for (let view = 0; view < viewCount; view++) {
          batch.views.push(
            createPrefabInstanceViewBatch(
              _root.engine,
              _root,
              `lotus primitive ${batchIndex} view${view}`,
              batch.source,
              batch.count,
              batch.bounds,
              false
            )
          );
        }
      }
      this.placementCount = this._instances.length;
      this.exactInstances = Object.freeze(entries);
      this._registration = _camera.registerRenderViewCullingSource(this);
    } catch (error) {
      for (const batch of this._batches) {
        for (const view of batch.views) disposePrefabInstanceViewBatch(view);
      }
      _root.destroy();
      throw error;
    }
  }

  cull(context: RenderViewCullingContext): void {
    if (this._destroyed || context.camera !== this._camera || !this._root.isActiveInHierarchy) return;
    const cameraView = context.viewType === RenderViewType.Camera;
    const viewIndex = cameraView ? 0 : context.shadowCascadeIndex + 1;
    if (viewIndex < 0 || viewIndex >= POPULATION_RENDER_VIEW_COUNT) return;
    this._synchronizeVisibilityState();
    const cache = this._viewCaches[viewIndex]!;
    const occlusion = this._terrainOcclusion;
    if (cameraView && occlusion && occlusion.visibilityRevision !== this._occlusionRevision) {
      this._occlusionRevision = occlusion.visibilityRevision;
      this._occlusionConfirmationFrames = 2;
      cache.valid = false;
    }
    const cacheMatches = populationViewCacheMatches(cache, context, this._visibilityRevision);
    if (cameraView && !cacheMatches) this._occlusionConfirmationFrames = 2;
    const confirmOcclusion =
      cameraView && occlusion?.horizonQueryableThisFrame && this._occlusionConfirmationFrames > 0;
    if (!confirmOcclusion && cacheMatches) {
      this._submit(context, viewIndex);
      return;
    }
    for (const batch of this._batches) {
      const view = batch.views[viewIndex];
      if (!view) continue;
      view.count = 0;
      view.dirtyFloatStart = Infinity;
      view.dirtyFloatEnd = 0;
    }
    if (cameraView) {
      for (const instance of this._instances) instance.cameraVisible = false;
    }
    for (const cell of this._cells) {
      const containment = context.classifyBounds(cell.bounds);
      if (containment === ContainmentType.Disjoint) continue;
      if (cameraView && occlusion?.horizonQueryableThisFrame && occlusion.isBoundsOccluded(cell.key, cell.bounds))
        continue;
      const contained = containment === ContainmentType.Contains;
      for (const instance of cell.instances) {
        if (!instance.authoringVisible || !this._inRange(instance)) continue;
        for (const part of instance.parts) {
          const batch = part.batch.views[viewIndex];
          if (!batch || (!contained && !context.isVisible(part.bounds))) continue;
          appendPrefabInstance(batch, part.batch.records, part.recordIndex, 1);
          if (cameraView) instance.cameraVisible = true;
        }
      }
    }
    for (const batch of this._batches) {
      const view = batch.views[viewIndex];
      if (view) publishPrefabInstanceViewBatch(view);
    }
    capturePopulationViewCache(cache, context, this._visibilityRevision);
    if (confirmOcclusion) this._occlusionConfirmationFrames--;
    this._submit(context, viewIndex);
  }

  /** Returns immutable placement, water anchoring, and current authored-LOD evidence for local QA. */
  getDiagnostics(): Readonly<SeedWorldLotusRuntimeDiagnostics> {
    const patches = new Map<string, LotusRuntimeInstance[]>();
    for (const instance of this._instances) {
      const key = instance.decoration.bodySourceHash;
      const bodyInstances = patches.get(key);
      if (bodyInstances) bodyInstances.push(instance);
      else patches.set(key, [instance]);
    }
    return Object.freeze({
      placementCount: this.placementCount,
      patches: Object.freeze(
        [...patches.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([bodySourceHash, bodyInstances]) => {
            const decoration = bodyInstances[0]!.decoration;
            return Object.freeze({
              sourceFeatureId: decoration.sourceFeatureId,
              bodySourceHash,
              instanceCount: bodyInstances.length,
              requestedAreaSquareMetres: decoration.requestedPatchAreaSquareMetres,
              requestedAreaRatio: decoration.requestedPatchAreaRatio,
              achievedAreaSquareMetres: decoration.achievedPatchAreaSquareMetres,
              achievedAreaRatio: decoration.achievedPatchAreaRatio,
              distributionHullAreaSquareMetres: projectedConvexHullAreaSquareMetres(
                bodyInstances.map(({ worldPosition: position }) => {
                  return [position.x, position.z] as const;
                })
              ),
              radiusMetres: decoration.patchRadiusMetres,
              maximumShoreDistanceMetres: decoration.patchMaximumShoreDistanceMetres,
              maximumWaterDepthMetres: decoration.patchMaximumWaterDepthMetres
            });
          })
      ),
      instances: Object.freeze(
        this._instances.map(({ worldPosition: position, decoration, cameraVisible, authoringVisible }) => {
          const composition = LOTUS_COMPOSITION_BY_FAMILY[decoration.prototypeFamily];
          const active = !this._destroyed && this._root.isActiveInHierarchy && authoringVisible && cameraVisible;
          const activeLods = active ? [SEED_WORLD_LOTUS_AUTHORED_LOD_INDEX] : [];
          return Object.freeze({
            id: decoration.id,
            prototypeFamily: decoration.prototypeFamily,
            bodySourceHash: decoration.bodySourceHash,
            normalizedPosition: decoration.normalizedPosition,
            worldPosition: Object.freeze([position.x, position.y, position.z] as const),
            scale: Object.freeze([...decoration.scale] as [number, number, number]),
            yawRadians: decoration.yawRadians,
            leafCount: composition.leafCount,
            flowerCount: composition.flowerCount,
            waterLevelMetres: decoration.waterLevelMetres,
            waterDepthMetres: decoration.waterDepthMetres,
            shoreDistanceMetres: decoration.shoreDistanceMetres,
            surfaceOffsetMetres: decoration.surfaceOffsetMetres,
            active,
            activeLods: Object.freeze(activeLods)
          });
        })
      )
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._registration.unregister();
    for (const batch of this._batches) {
      for (const view of batch.views) disposePrefabInstanceViewBatch(view);
    }
    this._cells = [];
    this._root.destroy();
  }

  private _submit(context: RenderViewCullingContext, viewIndex: number): void {
    for (const batch of this._batches) {
      const view = batch.views[viewIndex];
      if (view && view.count > 0) context.submit(view.renderer);
    }
  }

  private _synchronizeVisibilityState(): void {
    const transform = this._root.transform.worldMatrix.elements;
    for (let index = 0; index < 16; index++) {
      if (!Object.is(transform[index], this._rootMatrix.elements[index])) {
        this._refreshSpatialData(false);
        this._visibilityRevision++;
        break;
      }
    }
    const camera = this._camera;
    const position = camera.entity.transform.worldPosition;
    const projectionScale = camera.isOrthographic
      ? 1 / (2 * camera.orthographicSize)
      : 1 / (2 * Math.tan((camera.fieldOfView * Math.PI) / 360));
    const state = this._cameraState;
    const orthographic = Number(camera.isOrthographic);
    if (
      state[0] !== position.x ||
      state[1] !== position.y ||
      state[2] !== position.z ||
      state[3] !== projectionScale ||
      state[4] !== orthographic
    ) {
      state[0] = position.x;
      state[1] = position.y;
      state[2] = position.z;
      state[3] = projectionScale;
      state[4] = orthographic;
      this._visibilityRevision++;
    }
  }

  private _inRange(instance: LotusRuntimeInstance): boolean {
    if (instance.rangeRevision === this._visibilityRevision) return instance.inRange;
    instance.rangeRevision = this._visibilityRevision;
    const range = instance.source.range;
    if (!range || range.screenRelativeTransitionHeight <= 0) return (instance.inRange = true);
    const projectedSize = instance.projectionSize * this._cameraState[3]!;
    const distance = this._camera.isOrthographic
      ? 1
      : Math.hypot(
          instance.projectionPoint.x - this._cameraState[0]!,
          instance.projectionPoint.y - this._cameraState[1]!,
          instance.projectionPoint.z - this._cameraState[2]!
        );
    // Preserve the old fixed-LOD1 projected-size cutoff, including the near-zero distance case
    return (instance.inRange =
      distance <= Number.EPSILON || projectedSize / distance >= range.screenRelativeTransitionHeight);
  }

  private _refreshSpatialData(writeRecords: boolean): void {
    const position = new Vector3();
    const rotation = new Quaternion();
    const scale = new Vector3();
    const placement = new Matrix();
    const worldPlacement = new Matrix();
    const primitive = new Matrix();
    const worldPrimitive = new Matrix();
    const reconstructed = new Matrix();
    const cells = new Map<string, LotusInstanceCell>();
    this._rootMatrix.copyFrom(this._root.transform.worldMatrix);
    for (const instance of this._instances) {
      const decoration = instance.decoration;
      position.set(
        (decoration.normalizedPosition.x - 0.5) * this._sizeMetres,
        decoration.waterLevelMetres + decoration.surfaceOffsetMetres,
        (decoration.normalizedPosition.y - 0.5) * this._sizeMetres
      );
      scale.set(...decoration.scale);
      Quaternion.rotationYawPitchRoll(decoration.yawRadians, 0, 0, rotation);
      Matrix.affineTransformation(scale, rotation, position, placement);
      Matrix.multiply(this._rootMatrix, placement, worldPlacement);
      Vector3.transformCoordinate(position, this._rootMatrix, instance.worldPosition);
      const range = instance.source.range;
      if (range) {
        position.set(...range.localReferencePoint);
        Vector3.transformCoordinate(position, worldPlacement, instance.projectionPoint);
        const m = worldPlacement.elements;
        instance.projectionSize =
          range.size *
          Math.max(Math.hypot(m[0]!, m[1]!, m[2]!), Math.hypot(m[4]!, m[5]!, m[6]!), Math.hypot(m[8]!, m[9]!, m[10]!));
      }
      resetBounds(instance.bounds);
      for (const part of instance.parts) {
        Matrix.multiply(placement, part.source.localMatrix, primitive);
        Matrix.multiply(this._rootMatrix, primitive, worldPrimitive);
        part.bounds.copyFrom(part.source.mesh.bounds).transform(worldPrimitive);
        BoundingBox.merge(instance.bounds, part.bounds, instance.bounds);
        if (writeRecords) {
          writeLotusPrimitiveRecord(
            part.batch.records,
            part.recordIndex,
            primitive,
            position,
            rotation,
            scale,
            reconstructed
          );
          const localBounds = part.source.mesh.bounds.clone().transform(primitive);
          BoundingBox.merge(part.batch.bounds, localBounds, part.batch.bounds);
        }
      }
      const cellX = Math.floor(
        (instance.bounds.min.x + instance.bounds.max.x) / (2 * SEED_WORLD_POPULATION_CELL_METRES)
      );
      const cellZ = Math.floor(
        (instance.bounds.min.z + instance.bounds.max.z) / (2 * SEED_WORLD_POPULATION_CELL_METRES)
      );
      const key = `lotus:${cellX}:${cellZ}`;
      let cell = cells.get(key);
      if (!cell) {
        cell = { key, bounds: emptyBounds(), instances: [] };
        cells.set(key, cell);
      }
      cell.instances.push(instance);
      BoundingBox.merge(cell.bounds, instance.bounds, cell.bounds);
    }
    this._cells = [...cells.values()];
  }
}

function emptyBounds(): BoundingBox {
  return new BoundingBox(new Vector3(Infinity, Infinity, Infinity), new Vector3(-Infinity, -Infinity, -Infinity));
}

function resetBounds(bounds: BoundingBox): void {
  bounds.min.set(Infinity, Infinity, Infinity);
  bounds.max.set(-Infinity, -Infinity, -Infinity);
}

function sameLotusPrimitive(left: TerrainProjectResolvedRenderer, right: TerrainProjectResolvedRenderer): boolean {
  return (
    left.mesh === right.mesh &&
    left.material === right.material &&
    left.castShadows === right.castShadows &&
    left.receiveShadows === right.receiveShadows &&
    left.enableVertexColor === right.enableVertexColor
  );
}

function writeLotusPrimitiveRecord(
  records: Float32Array,
  index: number,
  matrix: Matrix,
  position: Vector3,
  rotation: Quaternion,
  scale: Vector3,
  reconstructed: Matrix
): void {
  if (!matrix.decompose(position, rotation, scale)) {
    throw new Error("Seed World lotus requires a non-degenerate static Prefab transform");
  }
  // Validate the compact TRS boundary once while loading, never silently approximate authored shear
  Matrix.affineTransformation(scale, rotation, position, reconstructed);
  for (let element = 0; element < 16; element++) {
    const expected = matrix.elements[element]!;
    if (Math.abs(expected - reconstructed.elements[element]!) > 0.00001 * Math.max(1, Math.abs(expected))) {
      throw new Error("Seed World lotus compact instancing does not support sheared Prefab transforms");
    }
  }
  const offset = index * TREE_ASSEMBLY_COMPACT_INSTANCE_FLOATS;
  records[offset] = position.x;
  records[offset + 1] = position.y;
  records[offset + 2] = position.z;
  records[offset + 3] = 1;
  records[offset + 4] = rotation.x;
  records[offset + 5] = rotation.y;
  records[offset + 6] = rotation.z;
  records[offset + 7] = rotation.w;
  records[offset + 8] = scale.x;
  records[offset + 9] = scale.y;
  records[offset + 10] = scale.z;
  records[offset + 11] = 1;
}

function resolveLotusRuntimeSources(
  family: AtomicAssemblySourceFamily
): Readonly<Record<SeedWorldLotusInstance["prototypeFamily"], LotusRuntimeSource>> {
  const sources = {} as Record<SeedWorldLotusInstance["prototypeFamily"], LotusRuntimeSource>;
  for (const prototypeFamily of LOTUS_PROTOTYPE_FAMILIES) {
    const source = family.variants.find((candidate) => candidate.id.includes(`/lotus/${prototypeFamily}/`));
    if (!source) {
      throw new Error(`Seed World accepted lotus source is missing '${prototypeFamily}'.`);
    }
    const atom = source.lods[SEED_WORLD_LOTUS_AUTHORED_LOD_INDEX];
    if (!atom) throw new Error(`Seed World accepted lotus source is missing '${prototypeFamily}' LOD1.`);
    const profile = source.lodGroup;
    if (profile && source.lods.length !== profile.screenRelativeTransitionHeights.length) {
      throw new Error(`Seed World accepted lotus source has invalid '${prototypeFamily}' LOD metadata.`);
    }
    sources[prototypeFamily] = Object.freeze({
      atom,
      ...(profile
        ? {
            range: Object.freeze({
              localReferencePoint: [...profile.localReferencePoint] as [number, number, number],
              size: profile.size,
              screenRelativeTransitionHeight: resolveSeedWorldLotusRuntimeTransitionHeight(
                profile.screenRelativeTransitionHeights
              )
            })
          }
        : {})
    });
  }
  return Object.freeze(sources);
}

function projectedConvexHullAreaSquareMetres(points: readonly (readonly [x: number, z: number])[]): number {
  if (points.length < 3) return 0;
  const sorted = [...points].sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  const lower: (readonly [number, number])[] = [];
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper: (readonly [number, number])[] = [];
  for (let index = sorted.length - 1; index >= 0; index--) {
    const point = sorted[index]!;
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, point) <= 0) upper.pop();
    upper.push(point);
  }
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  let twiceArea = 0;
  for (let index = 0; index < hull.length; index++) {
    const current = hull[index]!;
    const next = hull[(index + 1) % hull.length]!;
    twiceArea += current[0] * next[1] - current[1] * next[0];
  }
  return Math.abs(twiceArea) * 0.5;
}

function cross(
  origin: readonly [number, number],
  left: readonly [number, number],
  right: readonly [number, number]
): number {
  return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0]);
}

/**
 * Keeps the authored LOD1 terminal visibility distance after removing the near LOD0 mesh.
 * @param authoredTransitionHeights Source-authored LOD0 and LOD1 screen-relative thresholds.
 * @returns Runtime terminal threshold for the fixed LOD1 mesh.
 */
export function resolveSeedWorldLotusRuntimeTransitionHeight(authoredTransitionHeights: readonly number[]): number {
  const resolved = resolveSeedWorldSurfaceDetailTransitionHeights(authoredTransitionHeights);
  const transitionHeight = resolved[SEED_WORLD_LOTUS_AUTHORED_LOD_INDEX];
  if (transitionHeight === undefined) throw new Error("Seed World lotus runtime requires authored LOD1 metadata.");
  return transitionHeight;
}
