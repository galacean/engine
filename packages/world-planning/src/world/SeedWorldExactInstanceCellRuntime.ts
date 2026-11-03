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

/**
 * Creates one category-independent exact-Prefab entry backed by an authored LOD controller.
 * @param id Stable generated instance identifier.
 * @param category Semantic Prefab category used only for diagnostics.
 * @param entity Root entity containing every authored LOD renderer for the instance.
 * @param lod Existing authored per-instance LOD controller.
 * @returns Immutable spatial entry whose mutable bounds are refreshed only through its synchronization callback.
 * @throws When the instance contains no MeshRenderer or exposes non-finite bounds.
 */
export function createSeedWorldExactInstanceLodEntry(
  id: string,
  category: SeedWorldExactInstanceCategory,
  entity: Entity,
  lod: TerrainLodGroupRendererRuntime
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
    for (const renderer of renderers) BoundingBox.merge(bounds, renderer.bounds, bounds);
    if (!boundingBoxIsFinite(bounds)) throw new Error(`Seed World exact instance "${id}" has invalid world bounds`);
  };
  refreshBounds();
  const controller: SeedWorldExactInstanceSpatialController = {
    update: (timeSeconds, cellVisible) => lod.updateRenderers(timeSeconds, cellVisible),
    setAuthoringVisible: (visible) => lod.setAuthoringVisible(visible)
  };
  return Object.freeze({
    id,
    category,
    bounds,
    controller: Object.freeze(controller),
    refreshBounds,
    visitRenderers: function visitRenderers(visitor: (renderer: MeshRenderer) => void): void {
      for (let i = 0; i < renderers.length; i++) {
        const renderer = renderers[i]!;
        if (renderer.enabled && renderer.entity.isActiveInHierarchy) visitor(renderer);
      }
    }
  });
}

/**
 * Schedules visibility and optional authored LOD work for every exact generated Prefab through one XZ Cell index.
 * Cells are a CPU broad phase only: renderer submission, shadows, and final frustum culling remain engine-owned.
 */
export class SeedWorldExactInstanceCellRuntime {
  private readonly _cameraViewProjection = new Matrix();
  private readonly _cameraFrustum = new BoundingFrustum();
  private readonly _cameraState = new Float32Array(16);
  private _cameraStateValid = false;
  private _cells: readonly SeedWorldExactInstanceCell[] = [];
  private readonly _frustumVisibleCells: SeedWorldExactInstanceCell[] = [];
  private _candidates: SeedWorldExactInstanceSpatialEntry[] = [];
  private _candidateScratch: SeedWorldExactInstanceSpatialEntry[] = [];
  private readonly _candidateSet = new Set<SeedWorldExactInstanceSpatialEntry>();
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
   * @param entries Exact Prefab instances whose bounds may be explicitly refreshed after Authoring transactions.
   */
  constructor(
    private readonly _camera: Camera,
    private readonly _entries: readonly SeedWorldExactInstanceSpatialEntry[],
    private readonly _terrainOcclusion?: SeedWorldTerrainOcclusionReadPort
  ) {
    this._cells = buildCells(_entries, this._cellSizeMetres);
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
    if (mode === "cell") {
      // Linear mode marks every entry Cell-visible, so the next Cell query must retire
      // every entry that falls outside its candidate set, not only the old Cell candidates.
      this._candidates.length = 0;
      for (let entryIndex = 0; entryIndex < this._entries.length; entryIndex++) {
        this._candidates.push(this._entries[entryIndex]!);
      }
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
    this._cells = buildCells(this._entries, cellSizeMetres);
    this.invalidate();
  }

  /**
   * Refreshes moved instance bounds and rebuilds the shared broad-phase ownership grid.
   * This is the publication boundary used after local terrain grounding changes.
   */
  rebuildSpatialIndex(): void {
    for (const entry of this._entries) entry.refreshBounds?.();
    this._cells = buildCells(this._entries, this._cellSizeMetres);
    this._snapshot = createSnapshotState(this._mode, this._cellSizeMetres, this._entries.length, this._cells.length);
    this.invalidate();
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
    if (cameraChanged || invalidated) {
      this._cameraFrustum.calculateFromMatrix(this._cameraViewProjection);
      const visibleCells = this._frustumVisibleCells;
      visibleCells.length = 0;
      testedCellCount = this._cells.length;
      visibleCellCount = 0;
      for (let cellIndex = 0; cellIndex < this._cells.length; cellIndex++) {
        const cell = this._cells[cellIndex]!;
        if (!this._cameraFrustum.intersectsBox(cell.bounds)) continue;
        visibleCellCount++;
        visibleCells.push(cell);
      }
    }

    let terrainOcclusionTestedCellCount = snapshot.terrainOcclusionTestedCellCount;
    let terrainOccludedCellCount = snapshot.terrainOccludedCellCount;
    let terrainOcclusionTestedInstanceCount = snapshot.terrainOcclusionTestedInstanceCount;
    let terrainOccludedInstanceCount = snapshot.terrainOccludedInstanceCount;
    let candidates = this._candidates;
    const terrainOcclusionQueryable = terrainOcclusion?.horizonQueryableThisFrame === true;
    const confirmTerrainOcclusion = terrainOcclusionQueryable && this._terrainOcclusionConfirmationFrames > 0;
    const resolveCandidates =
      cameraChanged || invalidated || terrainOcclusionVisibilityChanged || confirmTerrainOcclusion;
    if (resolveCandidates) {
      const nextCandidates = this._candidateScratch;
      nextCandidates.length = 0;
      terrainOcclusionTestedCellCount = 0;
      terrainOccludedCellCount = 0;
      terrainOcclusionTestedInstanceCount = 0;
      terrainOccludedInstanceCount = 0;
      for (let cellIndex = 0; cellIndex < this._frustumVisibleCells.length; cellIndex++) {
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
        for (let entryIndex = 0; entryIndex < cell.entries.length; entryIndex++) {
          nextCandidates.push(cell.entries[entryIndex]!);
        }
      }
      candidates = nextCandidates;
      if (terrainOcclusionQueryable && this._terrainOcclusionConfirmationFrames > 0) {
        this._terrainOcclusionConfirmationFrames--;
      }
    }
    const candidatesChanged = candidates !== this._candidates && !sameEntries(candidates, this._candidates);
    if (candidatesChanged) {
      const candidateSet = this._candidateSet;
      candidateSet.clear();
      for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
        candidateSet.add(candidates[candidateIndex]!);
      }
      const retiredCandidates = this._retiredCandidates;
      retiredCandidates.length = 0;
      for (let candidateIndex = 0; candidateIndex < this._candidates.length; candidateIndex++) {
        const candidate = this._candidates[candidateIndex]!;
        if (!candidateSet.has(candidate)) retiredCandidates.push(candidate);
      }
      if (retiredCandidates.length > 0) {
        updateEntries(retiredCandidates, timeSeconds, false);
        retiredInstanceUpdateCount = retiredCandidates.length;
      }
      retiredCandidates.length = 0;
      candidateSet.clear();
      const previousCandidates = this._candidates;
      this._candidates = candidates;
      this._candidateScratch = previousCandidates;
    }

    const shouldUpdate = cameraChanged || invalidated || candidatesChanged || this._transitionActive;
    this._invalidated = false;
    const instanceUpdateCount = (shouldUpdate ? this._candidates.length : 0) + retiredInstanceUpdateCount;
    if (shouldUpdate) this._transitionActive = updateEntries(this._candidates, timeSeconds);
    snapshot.mode = this._mode;
    snapshot.cellSizeMetres = this._cellSizeMetres;
    snapshot.totalInstanceCount = this._entries.length;
    snapshot.occupiedCellCount = this._cells.length;
    snapshot.testedCellCount = testedCellCount;
    snapshot.visibleCellCount = visibleCellCount;
    snapshot.candidateInstanceCount = this._candidates.length;
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
  cellSizeMetres: number
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
      cells.set(key, { id: key, occlusionKey: `exact-prefab:${key}`, bounds: entry.bounds.clone(), entries: [entry] });
    }
  }
  return Object.freeze([...cells.values()]);
}

function sameEntries(
  left: readonly SeedWorldExactInstanceSpatialEntry[],
  right: readonly SeedWorldExactInstanceSpatialEntry[]
): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function updateEntries(
  entries: readonly SeedWorldExactInstanceSpatialEntry[],
  timeSeconds: number,
  cellVisible = true
): boolean {
  let transitionActive = false;
  for (let entryIndex = 0; entryIndex < entries.length; entryIndex++) {
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
