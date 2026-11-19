import { BoundingBox, BoundingFrustum, Camera, Entity, Matrix, MeshRenderer, Vector3 } from "@galacean/engine";
import type { TerrainLodGroupRendererRuntime } from "@galacean/engine-terrain/terrain/lod/TerrainLodGroupRendererRuntime";
import type { SeedWorldTerrainOcclusionReadPort } from "../runtime/SeedWorldTerrainOcclusionCuller.ts";

/** Semantic category label for an exact generated Prefab, independent from its render path. */
export type SeedWorldExactInstanceCategory = string;

/** Runtime A/B modes for exact generated Prefab spatial scheduling. */
export type SeedWorldExactInstanceSpatialMode = "linear" | "cell";

/** Visibility controller consumed by the shared exact-Prefab spatial scheduler. */
export interface SeedWorldExactInstanceSpatialController {
  /** Applies one Cell-visibility observation and reports whether animated work remains. */
  update(timeSeconds: number, cellVisible: boolean): boolean;
  /** Applies a persistent World Authoring visibility override. */
  setAuthoringVisible(visible: boolean): void;
}

/** Stable exact object identity shared by Authoring and either renderer submission path. */
export interface SeedWorldExactInstance {
  readonly visitRenderers?: (visitor: (renderer: MeshRenderer) => void) => void;
  /** Stable generated instance identifier. */
  readonly id: string;
  /** Semantic Prefab category, used only for diagnostics. */
  readonly category: SeedWorldExactInstanceCategory;
  /** Complete current world-space bounds across all authored renderers. */
  readonly bounds: BoundingBox;
  /** Persistent visibility override, independent from camera and shadow culling. */
  readonly controller: Pick<SeedWorldExactInstanceSpatialController, "setAuthoringVisible">;
}

/** Ordinary Renderer instance whose range and LOD visibility are scheduled by the shared Cell index. */
export interface SeedWorldExactInstanceSpatialEntry extends SeedWorldExactInstance {
  readonly controller: SeedWorldExactInstanceSpatialController;
  /** Recomputes `bounds` after a runtime-owned transform change. */
  readonly refreshBounds?: () => void;
}

/** Latest exact-Prefab spatial scheduling evidence shown by the performance panel. */
export interface SeedWorldExactInstanceSpatialSnapshot {
  /** Active A/B implementation. */
  readonly mode: SeedWorldExactInstanceSpatialMode;
  /** Configured horizontal Cell edge length in metres. */
  readonly cellSizeMetres: number;
  /** Total exact Prefab instances owned by the generated world. */
  readonly totalInstanceCount: number;
  /** Non-empty Cells built from the latest exact world-space instance bounds. */
  readonly occupiedCellCount: number;
  /** Cells tested against the camera frustum during this frame. */
  readonly testedCellCount: number;
  /** Cells intersecting the camera frustum during the latest query. */
  readonly visibleCellCount: number;
  /** Instances selected by the latest Cell query. */
  readonly candidateInstanceCount: number;
  /** Frustum-visible exact-Prefab Cells tested against the shared Terrain Horizon. */
  readonly terrainOcclusionTestedCellCount: number;
  /** Exact-Prefab Cells omitted by the shared Terrain Horizon. */
  readonly terrainOccludedCellCount: number;
  /** Exact-Prefab instances belonging to Horizon-tested Cells. */
  readonly terrainOcclusionTestedInstanceCount: number;
  /** Exact-Prefab instances omitted with their complete owning Cell. */
  readonly terrainOccludedInstanceCount: number;
  /** Per-instance visibility or authored LOD updates executed during this frame. */
  readonly instanceUpdateCount: number;
  /** Whether this frame reused a settled static-camera result without per-instance work. */
  readonly reusedStaticCamera: boolean;
  /** CPU milliseconds spent by the scheduler during this frame. */
  readonly updateMilliseconds: number;
}

type SeedWorldExactInstanceSpatialState = {
  -readonly [Property in keyof SeedWorldExactInstanceSpatialSnapshot]: SeedWorldExactInstanceSpatialSnapshot[Property];
};

interface SeedWorldExactInstanceCell {
  readonly id: string;
  readonly occlusionKey: string;
  readonly bounds: BoundingBox;
  readonly entries: SeedWorldExactInstanceSpatialEntry[];
}

const DEFAULT_CELL_SIZE_METRES = 64;

/** Planar XZ distance constraint evaluated without per-instance closures. */
export interface SeedWorldExactInstancePlanarRange {
  readonly camera: Camera;
  readonly x: number;
  readonly z: number;
  readonly maxDistance: number;
}

class ExactInstanceLodController implements SeedWorldExactInstanceSpatialController {
  private readonly _camera: Camera | undefined;
  private readonly _x: number;
  private readonly _z: number;
  private readonly _maxDistanceSq: number;
  private readonly _isInRange: (() => boolean) | undefined;

  constructor(
    private readonly _lod: TerrainLodGroupRendererRuntime,
    rangeOrCallback?: (() => boolean) | SeedWorldExactInstancePlanarRange
  ) {
    if (typeof rangeOrCallback === "function") {
      this._isInRange = rangeOrCallback;
      this._camera = undefined;
      this._x = 0;
      this._z = 0;
      this._maxDistanceSq = 0;
    } else if (rangeOrCallback !== undefined) {
      this._isInRange = undefined;
      this._camera = rangeOrCallback.camera;
      this._x = rangeOrCallback.x;
      this._z = rangeOrCallback.z;
      this._maxDistanceSq = rangeOrCallback.maxDistance * rangeOrCallback.maxDistance;
    } else {
      this._isInRange = undefined;
      this._camera = undefined;
      this._x = 0;
      this._z = 0;
      this._maxDistanceSq = 0;
    }
  }

  update(timeSeconds: number, cellVisible: boolean): boolean {
    if (!cellVisible) return this._lod.updateRenderers(timeSeconds, false);
    if (this._camera !== undefined) {
      const camPos = this._camera.entity.transform.worldPosition;
      const dx = this._x - camPos.x;
      const dz = this._z - camPos.z;
      return this._lod.updateRenderers(timeSeconds, dx * dx + dz * dz <= this._maxDistanceSq);
    }
    if (this._isInRange !== undefined) {
      return this._lod.updateRenderers(timeSeconds, this._isInRange());
    }
    return this._lod.updateRenderers(timeSeconds, true);
  }

  setAuthoringVisible(visible: boolean): void {
    this._lod.setAuthoringVisible(visible);
  }
}

/**
 * Creates one category-independent exact-Prefab entry backed by an authored LOD controller.
 * @param id Stable generated instance identifier.
 * @param category Semantic Prefab category used only for diagnostics.
 * @param entity Root entity containing every authored LOD renderer for the instance.
 * @param lod Existing authored per-instance LOD controller.
 * @param isInRange Optional additional visibility constraint evaluated during LOD updates.
 * @returns Immutable spatial entry whose mutable bounds are refreshed only through its synchronization callback.
 * @throws When the instance contains no MeshRenderer or exposes non-finite bounds.
 */
export function createSeedWorldExactInstanceLodEntry(
  id: string,
  category: SeedWorldExactInstanceCategory,
  entity: Entity,
  lod: TerrainLodGroupRendererRuntime,
  isInRange?: (() => boolean) | SeedWorldExactInstancePlanarRange
): SeedWorldExactInstanceSpatialEntry {
  const renderers = entity.getComponentsIncludeChildren(MeshRenderer, []);
  if (renderers.length === 0) throw new Error(`Seed World exact instance "${id}" has no authored MeshRenderer`);
  const bounds = new BoundingBox(
    new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
    new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
  );
  const refreshBounds = (): void => {
    bounds.min.set(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    bounds.max.set(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
    for (let i = 0; i < renderers.length; i++) BoundingBox.merge(bounds, renderers[i]!.bounds, bounds);
    if (!boundingBoxIsFinite(bounds)) throw new Error(`Seed World exact instance "${id}" has invalid world bounds`);
  };
  refreshBounds();
  const controller = new ExactInstanceLodController(lod, isInRange);
  return {
    id,
    category,
    bounds,
    controller,
    refreshBounds,
    visitRenderers(visitor: (renderer: MeshRenderer) => void): void {
      for (let i = 0; i < renderers.length; i++) {
        const renderer = renderers[i]!;
        if (renderer.enabled && renderer.entity.isActiveInHierarchy) visitor(renderer);
      }
    }
  };
}

/**
 * Reuses settled authored LOD results and optionally queries an XZ Cell index for visibility candidates.
 * Renderer submission, shadows, and final frustum culling remain engine-owned.
 */
export class SeedWorldExactInstanceCellRuntime {
  private readonly _cameraViewProjection = new Matrix();
  private readonly _cameraFrustum = new BoundingFrustum();
  private readonly _cameraState = new Float32Array(16);
  private _cameraStateValid = false;
  private _cells: readonly SeedWorldExactInstanceCell[] = [];
  private readonly _frustumVisibleCells: SeedWorldExactInstanceCell[] = [];
  private _frustumVisibleCellCount = 0;
  private _candidates: SeedWorldExactInstanceSpatialEntry[] = [];
  private _candidateCount = 0;
  private _candidateScratch: SeedWorldExactInstanceSpatialEntry[] = [];
  private readonly _candidateEpochs = new Map<SeedWorldExactInstanceSpatialEntry, number>();
  private _candidateEpoch = 0;
  private readonly _retiredCandidates: SeedWorldExactInstanceSpatialEntry[] = [];
  private _mode: SeedWorldExactInstanceSpatialMode = "cell";
  private _cellSizeMetres = DEFAULT_CELL_SIZE_METRES;
  private _invalidated = true;
  private _transitionActive = false;
  private _terrainOcclusionVisibilityRevision = -1;
  private _terrainOcclusionConfirmationFrames = 0;
  private _snapshot: SeedWorldExactInstanceSpatialState;

  /**
   * Builds the shared Cell index for all supplied exact Prefab categories.
   * @param camera Camera driving Cell-frustum queries and optional authored LOD projection.
   * @param _entries Exact Prefab instances whose bounds may be explicitly refreshed after Authoring transactions.
   * @param _terrainOcclusion Optional terrain visibility query.
   * @param _frustumCulling Disable to retain engine-owned visibility, including offscreen shadow casters.
   * @param _occlusionKeyPrefix Namespace prefix for Terrain Horizon occlusion keys so separate cell runtimes do not collide.
   */
  constructor(
    private readonly _camera: Camera,
    private _entries: readonly SeedWorldExactInstanceSpatialEntry[],
    private readonly _terrainOcclusion?: SeedWorldTerrainOcclusionReadPort,
    private readonly _frustumCulling = true,
    private readonly _occlusionKeyPrefix = "exact-prefab"
  ) {
    if (_frustumCulling) this._cells = buildCells(_entries, this._cellSizeMetres, this._occlusionKeyPrefix);
    this._snapshot = createSnapshotState(this._mode, this._cellSizeMetres, _entries.length, this._cells.length);
  }

  /** @returns Active exact-Prefab spatial A/B implementation. */
  get mode(): SeedWorldExactInstanceSpatialMode {
    return this._mode;
  }

  /** @returns Horizontal Cell edge length in metres. */
  get cellSizeMetres(): number {
    return this._cellSizeMetres;
  }

  /**
   * Switches between the unchanged per-frame linear baseline and the shared Cell scheduler.
   * @param mode Spatial scheduling implementation used by subsequent frames.
   * @returns Nothing.
   */
  setMode(mode: SeedWorldExactInstanceSpatialMode): void {
    if (mode === this._mode) return;
    if (mode === "cell" && this._frustumCulling) {
      // Linear mode marks every entry Cell-visible, so the next Cell query must retire
      // every entry that falls outside its candidate set, not only the old Cell candidates.
      const entries = this._entries;
      for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
        this._candidates[entryIndex] = entries[entryIndex]!;
      }
      this._candidateCount = entries.length;
    }
    this._mode = mode;
    this.invalidate();
  }

  /**
   * Rebuilds only the static broad-phase ownership grid with a new horizontal Cell size.
   * @param cellSizeMetres Finite positive Cell edge length in world metres.
   * @returns Nothing.
   * @throws {RangeError} When the Cell size is not finite and positive.
   */
  setCellSizeMetres(cellSizeMetres: number): void {
    if (!Number.isFinite(cellSizeMetres) || cellSizeMetres <= 0) {
      throw new RangeError("Seed World exact-instance Cell size must be finite and positive");
    }
    if (cellSizeMetres === this._cellSizeMetres) return;
    this._cellSizeMetres = cellSizeMetres;
    if (this._frustumCulling) this._cells = buildCells(this._entries, cellSizeMetres, this._occlusionKeyPrefix);
    this.invalidate();
  }

  /**
   * Refreshes moved instance bounds and rebuilds the shared broad-phase ownership grid.
   * This is the publication boundary used after local terrain grounding changes.
   */
  rebuildSpatialIndex(): void {
    if (this._frustumCulling) {
      for (const entry of this._entries) entry.refreshBounds?.();
      this._cells = buildCells(this._entries, this._cellSizeMetres, this._occlusionKeyPrefix);
    }
    this._snapshot = createSnapshotState(this._mode, this._cellSizeMetres, this._entries.length, this._cells.length);
    this.invalidate();
  }

  /**
   * Publishes changed membership. The owner is responsible for hiding or disposing removed entries.
   * @param entries New live instances, including any retained instances.
   */
  replaceEntries(entries: readonly SeedWorldExactInstanceSpatialEntry[]): void {
    if (this._frustumCulling) {
      const live = new Set(entries);
      let write = 0;
      for (let i = 0; i < this._candidateCount; i++) {
        const entry = this._candidates[i]!;
        if (live.has(entry)) this._candidates[write++] = entry;
      }
      for (let i = write; i < this._candidateCount; i++) this._candidates[i] = undefined!;
      this._candidateCount = write;
      this._candidateScratch.length = 0;
      this._retiredCandidates.length = 0;
      this._frustumVisibleCellCount = 0;
      this._frustumVisibleCells.length = 0;
      this._candidateEpochs.clear();
      this._candidateEpoch = 0;
    }
    this._entries = entries;
    this.rebuildSpatialIndex();
  }

  /** Forces the next Cell frame to refresh its camera query and all visible instance states. */
  invalidate(): void {
    this._invalidated = true;
    this._cameraStateValid = false;
  }

  /**
   * Advances exact Prefab spatial scheduling without changing any generated instance transform.
   * @param timeSeconds Monotonic absolute engine time in seconds.
   * @returns Nothing. Read detached scheduling evidence with `getSnapshot()`.
   */
  update(timeSeconds: number): void {
    const startedAt = performance.now();
    const snapshot = this._snapshot;
    if (this._mode === "linear") {
      this._transitionActive = updateEntries(this._entries, timeSeconds);
      snapshot.mode = this._mode;
      snapshot.cellSizeMetres = this._cellSizeMetres;
      snapshot.totalInstanceCount = this._entries.length;
      snapshot.occupiedCellCount = this._cells.length;
      snapshot.testedCellCount = 0;
      snapshot.visibleCellCount = 0;
      snapshot.candidateInstanceCount = this._entries.length;
      snapshot.terrainOcclusionTestedCellCount = 0;
      snapshot.terrainOccludedCellCount = 0;
      snapshot.terrainOcclusionTestedInstanceCount = 0;
      snapshot.terrainOccludedInstanceCount = 0;
      snapshot.instanceUpdateCount = this._entries.length;
      snapshot.reusedStaticCamera = false;
      snapshot.updateMilliseconds = performance.now() - startedAt;
      return;
    }

    Matrix.multiply(this._camera.projectionMatrix, this._camera.viewMatrix, this._cameraViewProjection);
    const cameraChanged = captureMatrixChange(
      this._cameraViewProjection.elements,
      this._cameraState,
      this._cameraStateValid
    );
    this._cameraStateValid = true;
    const invalidated = this._invalidated;
    const terrainOcclusion = this._terrainOcclusion;
    const terrainOcclusionVisibilityChanged =
      terrainOcclusion !== undefined &&
      terrainOcclusion.visibilityRevision !== this._terrainOcclusionVisibilityRevision;
    if (terrainOcclusionVisibilityChanged) {
      this._terrainOcclusionVisibilityRevision = terrainOcclusion.visibilityRevision;
      this._terrainOcclusionConfirmationFrames = 2;
    }
    if (cameraChanged || invalidated) this._terrainOcclusionConfirmationFrames = 2;
    let testedCellCount = 0;
    let visibleCellCount = snapshot.visibleCellCount;
    let retiredInstanceUpdateCount = 0;
    if (this._frustumCulling && (cameraChanged || invalidated)) {
      this._cameraFrustum.calculateFromMatrix(this._cameraViewProjection);
      const visibleCells = this._frustumVisibleCells;
      testedCellCount = this._cells.length;
      visibleCellCount = 0;
      for (let cellIndex = 0; cellIndex < this._cells.length; cellIndex++) {
        const cell = this._cells[cellIndex]!;
        if (!this._cameraFrustum.intersectsBox(cell.bounds)) continue;
        visibleCells[visibleCellCount++] = cell;
      }
      this._frustumVisibleCellCount = visibleCellCount;
    }

    let terrainOcclusionTestedCellCount = snapshot.terrainOcclusionTestedCellCount;
    let terrainOccludedCellCount = snapshot.terrainOccludedCellCount;
    let terrainOcclusionTestedInstanceCount = snapshot.terrainOcclusionTestedInstanceCount;
    let terrainOccludedInstanceCount = snapshot.terrainOccludedInstanceCount;
    let candidates = this._candidates;
    let candidateCount = this._candidateCount;
    const terrainOcclusionQueryable = terrainOcclusion?.horizonQueryableThisFrame === true;
    const confirmTerrainOcclusion = terrainOcclusionQueryable && this._terrainOcclusionConfirmationFrames > 0;
    const resolveCandidates =
      this._frustumCulling &&
      (cameraChanged || invalidated || terrainOcclusionVisibilityChanged || confirmTerrainOcclusion);
    if (resolveCandidates) {
      const nextCandidates = this._candidateScratch;
      let nextCount = 0;
      terrainOcclusionTestedCellCount = 0;
      terrainOccludedCellCount = 0;
      terrainOcclusionTestedInstanceCount = 0;
      terrainOccludedInstanceCount = 0;
      for (let cellIndex = 0; cellIndex < this._frustumVisibleCellCount; cellIndex++) {
        const cell = this._frustumVisibleCells[cellIndex]!;
        if (terrainOcclusionQueryable) {
          terrainOcclusionTestedCellCount++;
          terrainOcclusionTestedInstanceCount += cell.entries.length;
          if (terrainOcclusion.isBoundsOccluded(cell.occlusionKey, cell.bounds)) {
            terrainOccludedCellCount++;
            terrainOccludedInstanceCount += cell.entries.length;
            continue;
          }
        }
        const cellEntries = cell.entries;
        for (let entryIndex = 0; entryIndex < cellEntries.length; entryIndex++) {
          nextCandidates[nextCount++] = cellEntries[entryIndex]!;
        }
      }
      candidates = nextCandidates;
      candidateCount = nextCount;
      if (terrainOcclusionQueryable && this._terrainOcclusionConfirmationFrames > 0) {
        this._terrainOcclusionConfirmationFrames--;
      }
    }
    const candidatesChanged =
      candidates !== this._candidates &&
      !sameEntriesCounted(candidates, candidateCount, this._candidates, this._candidateCount);
    if (candidatesChanged) {
      const candidateEpochs = this._candidateEpochs;
      let epoch = ++this._candidateEpoch;
      if (epoch === 0x7fffffff) {
        candidateEpochs.clear();
        epoch = this._candidateEpoch = 1;
      }
      for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex++) {
        candidateEpochs.set(candidates[candidateIndex]!, epoch);
      }
      const retiredCandidates = this._retiredCandidates;
      let retiredCount = 0;
      for (let candidateIndex = 0; candidateIndex < this._candidateCount; candidateIndex++) {
        const candidate = this._candidates[candidateIndex]!;
        if (candidateEpochs.get(candidate) !== epoch) retiredCandidates[retiredCount++] = candidate;
      }
      if (retiredCount > 0) {
        updateEntriesCounted(retiredCandidates, retiredCount, timeSeconds, false);
        retiredInstanceUpdateCount = retiredCount;
      }
      const previousCandidates = this._candidates;
      this._candidates = candidates;
      this._candidateCount = candidateCount;
      this._candidateScratch = previousCandidates;
    }

    const activeEntries = this._frustumCulling ? this._candidates : this._entries;
    const activeCount = this._frustumCulling ? this._candidateCount : this._entries.length;
    const shouldUpdate = cameraChanged || invalidated || candidatesChanged || this._transitionActive;
    this._invalidated = false;
    const instanceUpdateCount = (shouldUpdate ? activeCount : 0) + retiredInstanceUpdateCount;
    if (shouldUpdate) this._transitionActive = updateEntriesCounted(activeEntries, activeCount, timeSeconds);
    snapshot.mode = this._mode;
    snapshot.cellSizeMetres = this._cellSizeMetres;
    snapshot.totalInstanceCount = this._entries.length;
    snapshot.occupiedCellCount = this._cells.length;
    snapshot.testedCellCount = testedCellCount;
    snapshot.visibleCellCount = visibleCellCount;
    snapshot.candidateInstanceCount = activeCount;
    snapshot.terrainOcclusionTestedCellCount = terrainOcclusionTestedCellCount;
    snapshot.terrainOccludedCellCount = terrainOccludedCellCount;
    snapshot.terrainOcclusionTestedInstanceCount = terrainOcclusionTestedInstanceCount;
    snapshot.terrainOccludedInstanceCount = terrainOccludedInstanceCount;
    snapshot.instanceUpdateCount = instanceUpdateCount;
    snapshot.reusedStaticCamera = !shouldUpdate;
    snapshot.updateMilliseconds = performance.now() - startedAt;
  }

  /** @returns Immutable latest exact-Prefab scheduling evidence. */
  getSnapshot(): Readonly<SeedWorldExactInstanceSpatialSnapshot> {
    return Object.freeze({ ...this._snapshot });
  }
}

function buildCells(
  entries: readonly SeedWorldExactInstanceSpatialEntry[],
  cellSizeMetres: number,
  occlusionKeyPrefix: string
): readonly SeedWorldExactInstanceCell[] {
  const cells = new Map<string, SeedWorldExactInstanceCell>();
  const center = new Vector3();
  for (const entry of entries) {
    entry.bounds.getCenter(center);
    const key = `${Math.floor(center.x / cellSizeMetres)}:${Math.floor(center.z / cellSizeMetres)}`;
    const existing = cells.get(key);
    if (existing) {
      existing.entries.push(entry);
      BoundingBox.merge(existing.bounds, entry.bounds, existing.bounds);
    } else {
      cells.set(key, {
        id: key,
        occlusionKey: `${occlusionKeyPrefix}:${key}`,
        bounds: entry.bounds.clone(),
        entries: [entry]
      });
    }
  }
  return Object.freeze([...cells.values()]);
}

function sameEntriesCounted(
  left: readonly SeedWorldExactInstanceSpatialEntry[],
  leftCount: number,
  right: readonly SeedWorldExactInstanceSpatialEntry[],
  rightCount: number
): boolean {
  if (leftCount !== rightCount) return false;
  for (let index = 0; index < leftCount; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function updateEntries(
  entries: readonly SeedWorldExactInstanceSpatialEntry[],
  timeSeconds: number,
  cellVisible = true
): boolean {
  return updateEntriesCounted(entries, entries.length, timeSeconds, cellVisible);
}

function updateEntriesCounted(
  entries: readonly SeedWorldExactInstanceSpatialEntry[],
  count: number,
  timeSeconds: number,
  cellVisible = true
): boolean {
  let transitionActive = false;
  for (let entryIndex = 0; entryIndex < count; entryIndex++) {
    const entry = entries[entryIndex]!;
    if (entry.controller.update(timeSeconds, cellVisible)) transitionActive = true;
  }
  return transitionActive;
}

function captureMatrixChange(current: ArrayLike<number>, previous: Float32Array, previousValid: boolean): boolean {
  let changed = !previousValid;
  for (let index = 0; index < 16; index++) {
    const value = current[index]!;
    if (value !== previous[index]) changed = true;
    previous[index] = value;
  }
  return changed;
}

function boundingBoxIsFinite(bounds: BoundingBox): boolean {
  return [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite);
}

function createSnapshotState(
  mode: SeedWorldExactInstanceSpatialMode,
  cellSizeMetres: number,
  totalInstanceCount: number,
  occupiedCellCount: number
): SeedWorldExactInstanceSpatialState {
  return {
    mode,
    cellSizeMetres,
    totalInstanceCount,
    occupiedCellCount,
    testedCellCount: 0,
    visibleCellCount: 0,
    candidateInstanceCount: 0,
    terrainOcclusionTestedCellCount: 0,
    terrainOccludedCellCount: 0,
    terrainOcclusionTestedInstanceCount: 0,
    terrainOccludedInstanceCount: 0,
    instanceUpdateCount: 0,
    reusedStaticCamera: false,
    updateMilliseconds: 0
  };
}
