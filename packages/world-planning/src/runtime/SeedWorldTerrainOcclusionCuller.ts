import type { BoundingBox } from "@galacean/engine";
import { sampleSeedWorldHeight, type SeedWorldFields } from "./SeedWorldFields.ts";

const OCCLUSION_SECTOR_COUNT = 256;
const OCCLUSION_BUILD_TARGET_MILLISECONDS = 0.3;
const OCCLUSION_MINIMUM_SECTORS_PER_FRAME = 8;
const OCCLUSION_MAXIMUM_SECTORS_PER_FRAME = 32;
const OCCLUSION_INITIAL_MINIMUM_SECTORS = 16;
const OCCLUSION_INITIAL_MAXIMUM_SECTORS = 24;
const OCCLUSION_SECTOR_COST_EMA_ALPHA = 0.2;
// 96 / 256 sectors cover 135 degrees: a typical horizontal FOV plus a turn guard band.
const OCCLUSION_MOVING_VIEW_SECTOR_COUNT = 96;
const OCCLUSION_FULL_BUILD_SETTLE_SECONDS = 0.15;
const OCCLUSION_CAMERA_MOVEMENT_EPSILON_METRES = 0.01;
const OCCLUSION_RADIAL_STEP_METRES = 48;
const OCCLUSION_MINIMUM_TARGET_DISTANCE_METRES = 144;
const OCCLUSION_ORIGIN_REBUILD_DISTANCE_METRES = 8;
const OCCLUSION_ORIGIN_REBUILD_HEIGHT_METRES = 2;
// At the 32-sector ceiling, the moving view window needs three slices. Bypass when the
// current frame already consumes one third of either origin-validity range.
const OCCLUSION_EXTREME_HORIZONTAL_STEP_METRES = OCCLUSION_ORIGIN_REBUILD_DISTANCE_METRES / 3;
const OCCLUSION_EXTREME_VERTICAL_STEP_METRES = OCCLUSION_ORIGIN_REBUILD_HEIGHT_METRES / 3;
const OCCLUSION_TERRAIN_CLEARANCE_METRES = 1;
const OCCLUSION_TARGET_CLEARANCE_METRES = 1;
const OCCLUSION_ANGLE_CLEARANCE_TANGENT = Math.tan((1 * Math.PI) / 180);
const OCCLUSION_NEIGHBOUR_SECTORS = 2;
const OCCLUSION_CONFIRMATION_FRAMES = 2;
const OCCLUSION_STATE_IDLE_FRAMES = 240;
const OCCLUSION_STATE_SWEEP_INTERVAL_FRAMES = 120;
const DEFAULT_HORIZON_FORWARD = Object.freeze({ x: 1, z: 0 });
const PREDICTION_VISIBLE_UNCACHEABLE = 0;
const PREDICTION_VISIBLE_CACHEABLE = 1;
const PREDICTION_OCCLUDED_CACHEABLE = 2;

export type SeedWorldTerrainHorizonBuildMode =
  | "inactive"
  | "bypassed"
  | "view-building"
  | "view-ready"
  | "full-building"
  | "ready";

/** World Horizon build state plus frame-local Population attribution counters. */
export interface SeedWorldTerrainOcclusionDiagnostics {
  readonly frame: number;
  readonly testedCellCount: number;
  readonly occludedCellCount: number;
  readonly retainedVisibleCellCount: number;
  readonly testedSubCellCount: number;
  readonly occludedSubCellCount: number;
  readonly testedRendererCount: number;
  readonly occludedRendererCount: number;
  readonly parentOccludedRendererCount: number;
  readonly subCellTestedRendererCount: number;
  readonly subCellOccludedRendererCount: number;
  readonly retainedVisibleRendererCount: number;
  readonly visibilityEvaluationMilliseconds: number;
  readonly parentEvaluationMilliseconds: number;
  readonly subCellEvaluationMilliseconds: number;
  readonly horizonRebuilt: boolean;
  readonly horizonReady: boolean;
  readonly horizonBuildPending: boolean;
  readonly horizonBuildProgress: number;
  readonly horizonRebuildCount: number;
  readonly horizonSampleCount: number;
  /** CPU milliseconds spent by the Horizon build slice in the current frame. */
  readonly horizonBuildMilliseconds: number;
  readonly horizonPeakBuildMilliseconds: number;
  readonly horizonPeakBuildSectorCount: number;
  /** Direction count completed by the Horizon build slice in the current frame. */
  readonly horizonBuildSectorCount: number;
  /** CPU milliseconds spent by the latest completed Horizon build slice. */
  readonly horizonLatestBuildMilliseconds: number;
  /** Direction count completed by the latest Horizon build slice. */
  readonly horizonLatestBuildSectorCount: number;
  readonly horizonEstimatedSectorMilliseconds: number;
  readonly horizonBuildBudgetMilliseconds: number;
  readonly horizonBuildMode: SeedWorldTerrainHorizonBuildMode;
  readonly horizonMovingViewSectorCount: number;
  readonly cameraTranslationMetresPerSecond: number;
  readonly retainedStateCount: number;
  readonly horizonRevision: number;
  readonly queryCount: number;
  readonly queryCacheHitCount: number;
  readonly queryEvaluationCount: number;
  readonly queryEvaluationMilliseconds: number;
}

interface CellOcclusionState {
  consecutiveOccludedFrames: number;
  occluded: boolean;
  lastSeenFrame: number;
  horizonRevision: number;
  predictedOccluded: boolean;
  cacheable: boolean;
  minimumX: number;
  minimumY: number;
  minimumZ: number;
  maximumX: number;
  maximumY: number;
  maximumZ: number;
}

type PopulationVisibilityConsumer = "tree" | "shrub";

interface PopulationVisibilityStatistics {
  testedCellCount: number;
  occludedCellCount: number;
  retainedVisibleCellCount: number;
  testedSubCellCount: number;
  occludedSubCellCount: number;
  testedRendererCount: number;
  occludedRendererCount: number;
  parentOccludedRendererCount: number;
  subCellTestedRendererCount: number;
  subCellOccludedRendererCount: number;
  retainedVisibleRendererCount: number;
  visibilityEvaluationMilliseconds: number;
  parentEvaluationMilliseconds: number;
  subCellEvaluationMilliseconds: number;
}

/** Read-only World-level Horizon query shared by renderer systems. */
export interface SeedWorldTerrainOcclusionReadPort {
  /** Whether one complete Horizon is currently safe to query. */
  readonly horizonReady: boolean;
  /** Whether a new Horizon is still filling direction-prioritized sectors. */
  readonly horizonBuildPending: boolean;
  /** Whether consumers should issue conservative Horizon queries in the current frame. */
  readonly horizonQueryableThisFrame: boolean;
  /** Changes whenever the Horizon origin or height source invalidates cached visibility. */
  readonly revision: number;
  /** Changes whenever a consumer should resample otherwise unchanged bounds. */
  readonly visibilityRevision: number;
  /** Tests one stable world-space candidate without changing Population-specific counters. */
  isBoundsOccluded(candidateId: string, bounds: BoundingBox): boolean;
}

/**
 * Conservative CPU heightfield culler for distant World-space renderer groups.
 *
 * The horizon is rebuilt over multiple frames only after meaningful camera translation. Sectors
 * nearest the current view direction are filled first and become independently queryable; the
 * complete buffer is still published atomically. A Cell is hidden only when its elevated centre
 * and four elevated corners all sit behind the lowered terrain horizon in five neighbouring
 * angular sectors for two consecutive frames.
 */
export class SeedWorldTerrainOcclusionCuller {
  /** Enables query timings while a diagnostic consumer is actively sampling. */
  profilingEnabled = false;

  private readonly _directionsX = new Float64Array(OCCLUSION_SECTOR_COUNT);
  private readonly _directionsZ = new Float64Array(OCCLUSION_SECTOR_COUNT);
  private readonly _radialStepCount: number;
  private _activeHorizon: Float32Array;
  private _stagingHorizon: Float32Array;
  private readonly _stagingSectorReady = new Uint8Array(OCCLUSION_SECTOR_COUNT);
  private readonly _nearestUnbuiltSectors = new Int16Array(OCCLUSION_MAXIMUM_SECTORS_PER_FRAME);
  private readonly _parentCellStates = new Map<string, CellOcclusionState>();
  private readonly _subCellStates = new Map<string, CellOcclusionState>();
  private readonly _worldStates = new Map<string, CellOcclusionState>();
  private readonly _populationVisibilityStatistics: Record<
    PopulationVisibilityConsumer,
    PopulationVisibilityStatistics
  > = {
    tree: createPopulationVisibilityStatistics(),
    shrub: createPopulationVisibilityStatistics()
  };
  private _activePopulationVisibilityConsumer: PopulationVisibilityConsumer | undefined;
  private _originX = Number.NaN;
  private _originY = Number.NaN;
  private _originZ = Number.NaN;
  private _stagingOriginX = Number.NaN;
  private _stagingOriginY = Number.NaN;
  private _stagingOriginZ = Number.NaN;
  private _activeHorizonReady = false;
  private _horizonBuildPending = false;
  private _stagingBuiltSectorCount = 0;
  private _stagingPrioritySector = 0;
  private _horizonRevision = 0;
  private _visibilityRevision = 0;
  private _frame = 0;
  private _visibilityStatisticsFrame = -1;
  private _testedCellCount = 0;
  private _occludedCellCount = 0;
  private _retainedVisibleCellCount = 0;
  private _testedSubCellCount = 0;
  private _occludedSubCellCount = 0;
  private _testedRendererCount = 0;
  private _occludedRendererCount = 0;
  private _parentOccludedRendererCount = 0;
  private _subCellTestedRendererCount = 0;
  private _subCellOccludedRendererCount = 0;
  private _retainedVisibleRendererCount = 0;
  private _visibilityEvaluationMilliseconds = 0;
  private _parentEvaluationMilliseconds = 0;
  private _subCellEvaluationMilliseconds = 0;
  private _horizonRebuilt = false;
  private _horizonRebuildCount = 0;
  private _horizonSampleCount = 0;
  private _horizonBuildMilliseconds = 0;
  private _currentHorizonPeakBuildMilliseconds = 0;
  private _lastHorizonPeakBuildMilliseconds = 0;
  private _currentHorizonPeakBuildSectorCount = 0;
  private _lastHorizonPeakBuildSectorCount = 0;
  private _horizonBuildSectorCount = 0;
  private _horizonLatestBuildMilliseconds = 0;
  private _horizonLatestBuildSectorCount = 0;
  private _estimatedSectorBuildMilliseconds = Number.NaN;
  private _horizonBuildMode: SeedWorldTerrainHorizonBuildMode = "inactive";
  private _lastCameraX = Number.NaN;
  private _lastCameraY = Number.NaN;
  private _lastCameraZ = Number.NaN;
  private _stationarySeconds = 0;
  private _cameraTranslationMetresPerSecond = 0;
  private _occlusionBypassedThisFrame = false;
  private _queryCount = 0;
  private _queryCacheHitCount = 0;
  private _queryEvaluationCount = 0;
  private _queryEvaluationMilliseconds = 0;

  constructor(private readonly _fields: SeedWorldFields) {
    this._radialStepCount = Math.ceil((_fields.sizeMetres * Math.SQRT2) / OCCLUSION_RADIAL_STEP_METRES);
    const horizonLength = OCCLUSION_SECTOR_COUNT * this._radialStepCount;
    this._activeHorizon = new Float32Array(horizonLength);
    this._stagingHorizon = new Float32Array(horizonLength);
    for (let sector = 0; sector < OCCLUSION_SECTOR_COUNT; sector++) {
      const angle = (sector / OCCLUSION_SECTOR_COUNT) * Math.PI * 2 - Math.PI;
      this._directionsX[sector] = Math.cos(angle);
      this._directionsZ[sector] = Math.sin(angle);
    }
  }

  /** Starts one visibility frame and advances a motion-aware, budgeted Horizon slice. */
  beginFrame(
    cameraPosition: Readonly<{ x: number; y: number; z: number }>,
    cameraForward: Readonly<{ x: number; z: number }> = DEFAULT_HORIZON_FORWARD,
    deltaTimeSeconds = 1 / 60
  ): void {
    const wasHorizonQueryable = this.horizonQueryableThisFrame;
    this._frame++;
    this._horizonRebuilt = false;
    this._horizonSampleCount = 0;
    this._horizonBuildMilliseconds = 0;
    this._horizonBuildSectorCount = 0;
    this._queryCount = 0;
    this._queryCacheHitCount = 0;
    this._queryEvaluationCount = 0;
    this._queryEvaluationMilliseconds = 0;
    this._updateCameraMotion(cameraPosition, deltaTimeSeconds);
    const referenceX = this._horizonBuildPending ? this._stagingOriginX : this._originX;
    const referenceY = this._horizonBuildPending ? this._stagingOriginY : this._originY;
    const referenceZ = this._horizonBuildPending ? this._stagingOriginZ : this._originZ;
    const horizontalDelta = Math.hypot(cameraPosition.x - referenceX, cameraPosition.z - referenceZ);
    if (
      !Number.isFinite(referenceX) ||
      horizontalDelta >= OCCLUSION_ORIGIN_REBUILD_DISTANCE_METRES ||
      Math.abs(cameraPosition.y - referenceY) >= OCCLUSION_ORIGIN_REBUILD_HEIGHT_METRES
    ) {
      this._startHorizonBuild(cameraPosition, cameraForward);
    }
    if (this._occlusionBypassedThisFrame) {
      this._horizonBuildMode = "bypassed";
      this.clearPopulationVisibility();
    } else if (this._horizonBuildPending) {
      this._advanceHorizonBuild(cameraForward, this._stationarySeconds >= OCCLUSION_FULL_BUILD_SETTLE_SECONDS);
    } else {
      this._horizonBuildMode = this._activeHorizonReady ? "ready" : "inactive";
    }
    if (this._horizonBuildSectorCount > 0 || wasHorizonQueryable !== this.horizonQueryableThisFrame) {
      this._visibilityRevision++;
    }
    if (this._frame % OCCLUSION_STATE_SWEEP_INTERVAL_FRAMES === 0) this._sweepCellStates();
  }

  /** Starts replacing one Population consumer's currently applied visibility snapshot. */
  beginPopulationVisibilityPass(consumer: PopulationVisibilityConsumer): void {
    if (this._activePopulationVisibilityConsumer !== undefined) {
      throw new Error("Terrain occlusion Population visibility passes cannot overlap.");
    }
    this._activePopulationVisibilityConsumer = consumer;
    this._visibilityStatisticsFrame = this._frame;
    this._resetVisibilityStatistics();
  }

  /** Publishes the active Population consumer's visibility snapshot without discarding the other consumer. */
  endPopulationVisibilityPass(): void {
    const consumer = this._activePopulationVisibilityConsumer;
    if (consumer === undefined) throw new Error("No terrain occlusion Population visibility pass is active.");
    this._capturePopulationVisibilityStatistics(this._populationVisibilityStatistics[consumer]);
    this._activePopulationVisibilityConsumer = undefined;
    this._publishPopulationVisibilityStatistics();
  }

  /** Clears applied Population visibility when its render hierarchy is disabled or invalidated. */
  clearPopulationVisibility(): void {
    if (this._activePopulationVisibilityConsumer !== undefined) {
      throw new Error("Cannot clear terrain occlusion visibility during an active Population pass.");
    }
    resetPopulationVisibilityStatistics(this._populationVisibilityStatistics.tree);
    resetPopulationVisibilityStatistics(this._populationVisibilityStatistics.shrub);
    this._resetVisibilityStatistics();
    this._visibilityStatisticsFrame = this._frame;
  }

  /** Returns whether one frustum-visible parent Cell can be omitted from batch construction. */
  isOccluded(cellId: string, bounds: BoundingBox, candidateRendererCount: number): boolean {
    this._ensureVisibilityStatisticsFrame();
    const state = this._parentCellStates.get(cellId);
    let occluded: boolean;
    if (state?.lastSeenFrame === this._frame) {
      occluded = state.occluded;
    } else {
      this._testedCellCount++;
      const startedAt = this.profilingEnabled ? performance.now() : 0;
      occluded = this._evaluateOcclusionState(cellId, bounds, this._parentCellStates);
      if (this.profilingEnabled) {
        const elapsedMilliseconds = performance.now() - startedAt;
        this._visibilityEvaluationMilliseconds += elapsedMilliseconds;
        this._parentEvaluationMilliseconds += elapsedMilliseconds;
      }
      if (occluded) this._occludedCellCount++;
      else this._retainedVisibleCellCount++;
    }
    this._testedRendererCount += candidateRendererCount;
    if (occluded) {
      this._occludedRendererCount += candidateRendererCount;
      this._parentOccludedRendererCount += candidateRendererCount;
    }
    return occluded;
  }

  /** Tests a non-Population World consumer against the shared Horizon and temporal state. */
  isBoundsOccluded(candidateId: string, bounds: BoundingBox): boolean {
    if (!candidateId) throw new TypeError("Terrain occlusion candidate id must be non-empty.");
    const state = this._worldStates.get(candidateId);
    return state?.lastSeenFrame === this._frame
      ? state.occluded
      : this._evaluateOcclusionState(candidateId, bounds, this._worldStates);
  }
  /** Returns whether one child SubCell of a retained parent can be omitted from batch construction. */
  isSubCellOccluded(subCellId: string, bounds: BoundingBox, candidateRendererCount: number): boolean {
    this._ensureVisibilityStatisticsFrame();
    const state = this._subCellStates.get(subCellId);
    let occluded: boolean;
    if (state?.lastSeenFrame === this._frame) {
      occluded = state.occluded;
    } else {
      this._testedSubCellCount++;
      const startedAt = this.profilingEnabled ? performance.now() : 0;
      occluded = this._evaluateOcclusionState(subCellId, bounds, this._subCellStates);
      if (this.profilingEnabled) {
        const elapsedMilliseconds = performance.now() - startedAt;
        this._visibilityEvaluationMilliseconds += elapsedMilliseconds;
        this._subCellEvaluationMilliseconds += elapsedMilliseconds;
      }
      if (occluded) this._occludedSubCellCount++;
    }
    this._subCellTestedRendererCount += candidateRendererCount;
    if (occluded) {
      this._occludedRendererCount += candidateRendererCount;
      this._subCellOccludedRendererCount += candidateRendererCount;
    } else {
      this._retainedVisibleRendererCount += candidateRendererCount;
    }
    return occluded;
  }

  /** Records retained parent candidates which deliberately bypass the second-level test. */
  retainVisibleRenderers(candidateRendererCount: number): void {
    this._ensureVisibilityStatisticsFrame();
    this._retainedVisibleRendererCount += candidateRendererCount;
  }

  get diagnostics(): Readonly<SeedWorldTerrainOcclusionDiagnostics> {
    return Object.freeze({
      frame: this._frame,
      testedCellCount: this._testedCellCount,
      occludedCellCount: this._occludedCellCount,
      retainedVisibleCellCount: this._retainedVisibleCellCount,
      testedSubCellCount: this._testedSubCellCount,
      occludedSubCellCount: this._occludedSubCellCount,
      testedRendererCount: this._testedRendererCount,
      occludedRendererCount: this._occludedRendererCount,
      parentOccludedRendererCount: this._parentOccludedRendererCount,
      subCellTestedRendererCount: this._subCellTestedRendererCount,
      subCellOccludedRendererCount: this._subCellOccludedRendererCount,
      retainedVisibleRendererCount: this._retainedVisibleRendererCount,
      visibilityEvaluationMilliseconds: this._visibilityEvaluationMilliseconds,
      parentEvaluationMilliseconds: this._parentEvaluationMilliseconds,
      subCellEvaluationMilliseconds: this._subCellEvaluationMilliseconds,
      horizonRebuilt: this._horizonRebuilt,
      horizonReady: this._activeHorizonReady,
      horizonBuildPending: this._horizonBuildPending,
      horizonBuildProgress: this._horizonBuildPending
        ? this._stagingBuiltSectorCount / OCCLUSION_SECTOR_COUNT
        : this._activeHorizonReady
          ? 1
          : 0,
      horizonRebuildCount: this._horizonRebuildCount,
      horizonSampleCount: this._horizonSampleCount,
      horizonBuildMilliseconds: this._horizonBuildMilliseconds,
      horizonPeakBuildMilliseconds: this._horizonBuildPending
        ? this._currentHorizonPeakBuildMilliseconds
        : this._lastHorizonPeakBuildMilliseconds,
      horizonPeakBuildSectorCount: this._horizonBuildPending
        ? this._currentHorizonPeakBuildSectorCount
        : this._lastHorizonPeakBuildSectorCount,
      horizonBuildSectorCount: this._horizonBuildSectorCount,
      horizonLatestBuildMilliseconds: this._horizonLatestBuildMilliseconds,
      horizonLatestBuildSectorCount: this._horizonLatestBuildSectorCount,
      horizonEstimatedSectorMilliseconds: Number.isFinite(this._estimatedSectorBuildMilliseconds)
        ? this._estimatedSectorBuildMilliseconds
        : 0,
      horizonBuildBudgetMilliseconds: OCCLUSION_BUILD_TARGET_MILLISECONDS,
      horizonBuildMode: this._horizonBuildMode,
      horizonMovingViewSectorCount: OCCLUSION_MOVING_VIEW_SECTOR_COUNT,
      cameraTranslationMetresPerSecond: this._cameraTranslationMetresPerSecond,
      retainedStateCount: this._parentCellStates.size + this._subCellStates.size + this._worldStates.size,
      horizonRevision: this._horizonRevision,
      queryCount: this._queryCount,
      queryCacheHitCount: this._queryCacheHitCount,
      queryEvaluationCount: this._queryEvaluationCount,
      queryEvaluationMilliseconds: this._queryEvaluationMilliseconds
    });
  }

  /** Whether a complete Horizon is available for conservative shared queries. */
  get horizonReady(): boolean {
    return this._activeHorizonReady;
  }

  get horizonBuildPending(): boolean {
    return this._horizonBuildPending;
  }

  /** Partial and complete Horizons are queryable unless camera motion invalidates this frame. */
  get horizonQueryableThisFrame(): boolean {
    return !this._occlusionBypassedThisFrame && (this._activeHorizonReady || this._horizonBuildPending);
  }

  get revision(): number {
    return this._horizonRevision;
  }

  get visibilityRevision(): number {
    return this._visibilityRevision;
  }

  /** Whether a complete staging Horizon became active during the current World frame. */
  get horizonPublishedThisFrame(): boolean {
    return this._horizonRebuilt;
  }

  /** Invalidates height-derived state after an Authoring height patch. */
  invalidate(): void {
    this._activeHorizonReady = false;
    this._horizonBuildPending = false;
    this._originX = Number.NaN;
    this._originY = Number.NaN;
    this._originZ = Number.NaN;
    this._stagingOriginX = Number.NaN;
    this._stagingOriginY = Number.NaN;
    this._stagingOriginZ = Number.NaN;
    this._stagingBuiltSectorCount = 0;
    this._stagingSectorReady.fill(0);
    this._horizonBuildMode = "inactive";
    this._occlusionBypassedThisFrame = false;
    this._visibilityRevision++;
    this.clearPopulationVisibility();
    this._horizonRevision++;
    this._parentCellStates.clear();
    this._subCellStates.clear();
    this._worldStates.clear();
  }

  private _ensureVisibilityStatisticsFrame(): void {
    if (this._visibilityStatisticsFrame === this._frame) return;
    this._visibilityStatisticsFrame = this._frame;
    this._resetVisibilityStatistics();
  }

  private _resetVisibilityStatistics(): void {
    this._testedCellCount = 0;
    this._occludedCellCount = 0;
    this._retainedVisibleCellCount = 0;
    this._testedSubCellCount = 0;
    this._occludedSubCellCount = 0;
    this._testedRendererCount = 0;
    this._occludedRendererCount = 0;
    this._parentOccludedRendererCount = 0;
    this._subCellTestedRendererCount = 0;
    this._subCellOccludedRendererCount = 0;
    this._retainedVisibleRendererCount = 0;
    this._visibilityEvaluationMilliseconds = 0;
    this._parentEvaluationMilliseconds = 0;
    this._subCellEvaluationMilliseconds = 0;
  }

  private _capturePopulationVisibilityStatistics(target: PopulationVisibilityStatistics): void {
    target.testedCellCount = this._testedCellCount;
    target.occludedCellCount = this._occludedCellCount;
    target.retainedVisibleCellCount = this._retainedVisibleCellCount;
    target.testedSubCellCount = this._testedSubCellCount;
    target.occludedSubCellCount = this._occludedSubCellCount;
    target.testedRendererCount = this._testedRendererCount;
    target.occludedRendererCount = this._occludedRendererCount;
    target.parentOccludedRendererCount = this._parentOccludedRendererCount;
    target.subCellTestedRendererCount = this._subCellTestedRendererCount;
    target.subCellOccludedRendererCount = this._subCellOccludedRendererCount;
    target.retainedVisibleRendererCount = this._retainedVisibleRendererCount;
    target.visibilityEvaluationMilliseconds = this._visibilityEvaluationMilliseconds;
    target.parentEvaluationMilliseconds = this._parentEvaluationMilliseconds;
    target.subCellEvaluationMilliseconds = this._subCellEvaluationMilliseconds;
  }

  private _publishPopulationVisibilityStatistics(): void {
    const tree = this._populationVisibilityStatistics.tree;
    const shrub = this._populationVisibilityStatistics.shrub;
    this._testedCellCount = tree.testedCellCount + shrub.testedCellCount;
    this._occludedCellCount = tree.occludedCellCount + shrub.occludedCellCount;
    this._retainedVisibleCellCount = tree.retainedVisibleCellCount + shrub.retainedVisibleCellCount;
    this._testedSubCellCount = tree.testedSubCellCount + shrub.testedSubCellCount;
    this._occludedSubCellCount = tree.occludedSubCellCount + shrub.occludedSubCellCount;
    this._testedRendererCount = tree.testedRendererCount + shrub.testedRendererCount;
    this._occludedRendererCount = tree.occludedRendererCount + shrub.occludedRendererCount;
    this._parentOccludedRendererCount = tree.parentOccludedRendererCount + shrub.parentOccludedRendererCount;
    this._subCellTestedRendererCount = tree.subCellTestedRendererCount + shrub.subCellTestedRendererCount;
    this._subCellOccludedRendererCount = tree.subCellOccludedRendererCount + shrub.subCellOccludedRendererCount;
    this._retainedVisibleRendererCount = tree.retainedVisibleRendererCount + shrub.retainedVisibleRendererCount;
    this._visibilityEvaluationMilliseconds =
      tree.visibilityEvaluationMilliseconds + shrub.visibilityEvaluationMilliseconds;
    this._parentEvaluationMilliseconds = tree.parentEvaluationMilliseconds + shrub.parentEvaluationMilliseconds;
    this._subCellEvaluationMilliseconds = tree.subCellEvaluationMilliseconds + shrub.subCellEvaluationMilliseconds;
  }

  private _evaluateOcclusionState(
    stateId: string,
    bounds: BoundingBox,
    states: Map<string, CellOcclusionState>
  ): boolean {
    this._queryCount++;
    if (this._occlusionBypassedThisFrame) {
      return false;
    }
    let state = states.get(stateId);
    const inputsMatch =
      state !== undefined && state.horizonRevision === this._horizonRevision && occlusionBoundsMatch(state, bounds);
    if (state && inputsMatch && state.cacheable) {
      this._queryCacheHitCount++;
      state.lastSeenFrame = this._frame;
      if (
        state.predictedOccluded &&
        !state.occluded &&
        state.consecutiveOccludedFrames < OCCLUSION_CONFIRMATION_FRAMES
      ) {
        state.consecutiveOccludedFrames++;
        if (state.consecutiveOccludedFrames >= OCCLUSION_CONFIRMATION_FRAMES) state.occluded = true;
      }
      return state.occluded;
    }

    const startedAt = this.profilingEnabled ? performance.now() : 0;
    const prediction = this._predictBoundsOcclusion(bounds);
    if (this.profilingEnabled) {
      this._queryEvaluationMilliseconds += performance.now() - startedAt;
    }
    this._queryEvaluationCount++;
    if (!state) {
      state = createCellOcclusionState(this._horizonRevision, bounds);
      states.set(stateId, state);
    } else {
      copyOcclusionBounds(state, bounds);
    }
    state.horizonRevision = this._horizonRevision;
    state.lastSeenFrame = this._frame;
    state.predictedOccluded = prediction === PREDICTION_OCCLUDED_CACHEABLE;
    state.cacheable = prediction !== PREDICTION_VISIBLE_UNCACHEABLE;
    state.consecutiveOccludedFrames = state.predictedOccluded ? 1 : 0;
    state.occluded = false;
    return state.occluded;
  }

  private _startHorizonBuild(
    cameraPosition: Readonly<{ x: number; y: number; z: number }>,
    cameraForward: Readonly<{ x: number; z: number }>
  ): void {
    this._stagingOriginX = cameraPosition.x;
    this._stagingOriginY = cameraPosition.y;
    this._stagingOriginZ = cameraPosition.z;
    this._stagingBuiltSectorCount = 0;
    this._stagingSectorReady.fill(0);
    this._stagingPrioritySector = horizontalSector(cameraForward.x, cameraForward.z, this._stagingPrioritySector);
    this._horizonBuildPending = true;
    this._currentHorizonPeakBuildMilliseconds = 0;
    this._currentHorizonPeakBuildSectorCount = 0;
    this._horizonRevision++;
    // A Horizon built for a meaningfully different origin is not conservative for the new camera.
    // Retire it immediately; only individually complete staging sectors may answer new queries.
    this._activeHorizonReady = false;
  }

  private _advanceHorizonBuild(cameraForward: Readonly<{ x: number; z: number }>, allowFullBuild: boolean): void {
    const startedAt = performance.now();
    const horizon = this._stagingHorizon;
    const radialSteps = this._radialStepCount;
    this._stagingPrioritySector = horizontalSector(cameraForward.x, cameraForward.z, this._stagingPrioritySector);
    const initialSlice = this._stagingBuiltSectorCount === 0;
    const minimumSectorCount = initialSlice ? OCCLUSION_INITIAL_MINIMUM_SECTORS : OCCLUSION_MINIMUM_SECTORS_PER_FRAME;
    const maximumSectorCount = initialSlice ? OCCLUSION_INITIAL_MAXIMUM_SECTORS : OCCLUSION_MAXIMUM_SECTORS_PER_FRAME;
    const estimatedSectorLimit = Number.isFinite(this._estimatedSectorBuildMilliseconds)
      ? Math.floor(OCCLUSION_BUILD_TARGET_MILLISECONDS / Math.max(this._estimatedSectorBuildMilliseconds, 1e-6))
      : initialSlice
        ? OCCLUSION_INITIAL_MINIMUM_SECTORS
        : OCCLUSION_MAXIMUM_SECTORS_PER_FRAME;
    const sectorLimit = Math.max(minimumSectorCount, Math.min(maximumSectorCount, estimatedSectorLimit));
    const searchSectorCount = allowFullBuild ? OCCLUSION_SECTOR_COUNT : OCCLUSION_MOVING_VIEW_SECTOR_COUNT;
    const sectors = this._nearestUnbuiltSectors;
    const sectorCount = selectNearestUnbuiltSectorsInto(
      this._stagingPrioritySector,
      this._stagingSectorReady,
      sectorLimit,
      searchSectorCount,
      sectors
    );
    const requiredSectorCount = Math.min(minimumSectorCount, sectorCount);
    if (sectorCount === 0) {
      this._horizonBuildMode = allowFullBuild ? "full-building" : "view-ready";
      return;
    }
    this._horizonBuildMode = allowFullBuild ? "full-building" : "view-building";
    let sampled = 0;
    let builtSectorCount = 0;
    for (let sectorIndex = 0; sectorIndex < sectorCount; sectorIndex++) {
      const sector = sectors[sectorIndex]!;
      const directionX = this._directionsX[sector]!;
      const directionZ = this._directionsZ[sector]!;
      let maximumSlope = Number.NEGATIVE_INFINITY;
      const sectorOffset = sector * radialSteps;
      for (let step = 0; step < radialSteps; step++) {
        const distance = (step + 1) * OCCLUSION_RADIAL_STEP_METRES;
        const height = this._sampleHeight(
          this._stagingOriginX + directionX * distance,
          this._stagingOriginZ + directionZ * distance
        );
        if (height !== undefined) {
          sampled++;
          const slope = (height - OCCLUSION_TERRAIN_CLEARANCE_METRES - this._stagingOriginY) / distance;
          if (slope > maximumSlope) maximumSlope = slope;
        }
        horizon[sectorOffset + step] = applyAngularClearanceToSlope(maximumSlope);
      }
      this._stagingSectorReady[sector] = 1;
      builtSectorCount++;
      if (
        builtSectorCount >= requiredSectorCount &&
        builtSectorCount < sectorCount &&
        performance.now() - startedAt >= OCCLUSION_BUILD_TARGET_MILLISECONDS
      ) {
        break;
      }
    }
    this._stagingBuiltSectorCount += builtSectorCount;
    this._horizonSampleCount = sampled;
    this._horizonBuildMilliseconds = performance.now() - startedAt;
    this._horizonBuildSectorCount = builtSectorCount;
    this._horizonLatestBuildMilliseconds = this._horizonBuildMilliseconds;
    this._horizonLatestBuildSectorCount = builtSectorCount;
    if (builtSectorCount > 0) {
      const measuredSectorMilliseconds = this._horizonBuildMilliseconds / builtSectorCount;
      this._estimatedSectorBuildMilliseconds = Number.isFinite(this._estimatedSectorBuildMilliseconds)
        ? this._estimatedSectorBuildMilliseconds +
          (measuredSectorMilliseconds - this._estimatedSectorBuildMilliseconds) * OCCLUSION_SECTOR_COST_EMA_ALPHA
        : measuredSectorMilliseconds;
    }
    if (this._horizonBuildMilliseconds > this._currentHorizonPeakBuildMilliseconds) {
      this._currentHorizonPeakBuildMilliseconds = this._horizonBuildMilliseconds;
      this._currentHorizonPeakBuildSectorCount = builtSectorCount;
    }
    if (this._stagingBuiltSectorCount < OCCLUSION_SECTOR_COUNT) {
      if (
        !allowFullBuild &&
        selectNearestUnbuiltSectorsInto(
          this._stagingPrioritySector,
          this._stagingSectorReady,
          1,
          OCCLUSION_MOVING_VIEW_SECTOR_COUNT,
          sectors
        ) === 0
      ) {
        this._horizonBuildMode = "view-ready";
      }
      return;
    }

    const previousActiveHorizon = this._activeHorizon;
    this._activeHorizon = this._stagingHorizon;
    this._stagingHorizon = previousActiveHorizon;
    this._originX = this._stagingOriginX;
    this._originY = this._stagingOriginY;
    this._originZ = this._stagingOriginZ;
    this._activeHorizonReady = true;
    this._horizonBuildPending = false;
    this._horizonRebuilt = true;
    this._horizonBuildMode = "ready";
    this._horizonRebuildCount++;
    this._lastHorizonPeakBuildMilliseconds = this._currentHorizonPeakBuildMilliseconds;
    this._lastHorizonPeakBuildSectorCount = this._currentHorizonPeakBuildSectorCount;
  }

  private _updateCameraMotion(
    cameraPosition: Readonly<{ x: number; y: number; z: number }>,
    deltaTimeSeconds: number
  ): void {
    const hasPreviousPosition = Number.isFinite(this._lastCameraX);
    const horizontalStep = hasPreviousPosition
      ? Math.hypot(cameraPosition.x - this._lastCameraX, cameraPosition.z - this._lastCameraZ)
      : 0;
    const verticalStep = hasPreviousPosition ? Math.abs(cameraPosition.y - this._lastCameraY) : 0;
    const translation = Math.hypot(horizontalStep, verticalStep);
    const safeDeltaTimeSeconds = Number.isFinite(deltaTimeSeconds) && deltaTimeSeconds > 0 ? deltaTimeSeconds : 0;
    this._cameraTranslationMetresPerSecond = safeDeltaTimeSeconds > 0 ? translation / safeDeltaTimeSeconds : 0;
    const moving =
      horizontalStep > OCCLUSION_CAMERA_MOVEMENT_EPSILON_METRES ||
      verticalStep > OCCLUSION_CAMERA_MOVEMENT_EPSILON_METRES;
    this._stationarySeconds = moving ? 0 : this._stationarySeconds + safeDeltaTimeSeconds;
    this._occlusionBypassedThisFrame =
      horizontalStep >= OCCLUSION_EXTREME_HORIZONTAL_STEP_METRES ||
      verticalStep >= OCCLUSION_EXTREME_VERTICAL_STEP_METRES;
    this._lastCameraX = cameraPosition.x;
    this._lastCameraY = cameraPosition.y;
    this._lastCameraZ = cameraPosition.z;
  }

  private _predictBoundsOcclusion(bounds: BoundingBox): number {
    let horizon: Float32Array;
    let originX: number;
    let originY: number;
    let originZ: number;
    let sectorReady: Uint8Array | undefined;
    if (this._activeHorizonReady) {
      horizon = this._activeHorizon;
      originX = this._originX;
      originY = this._originY;
      originZ = this._originZ;
    } else if (this._horizonBuildPending) {
      horizon = this._stagingHorizon;
      originX = this._stagingOriginX;
      originY = this._stagingOriginY;
      originZ = this._stagingOriginZ;
      sectorReady = this._stagingSectorReady;
    } else {
      return PREDICTION_VISIBLE_UNCACHEABLE;
    }
    const nearestX = Math.max(bounds.min.x - originX, 0, originX - bounds.max.x);
    const nearestZ = Math.max(bounds.min.z - originZ, 0, originZ - bounds.max.z);
    if (Math.hypot(nearestX, nearestZ) < OCCLUSION_MINIMUM_TARGET_DISTANCE_METRES) {
      return PREDICTION_VISIBLE_CACHEABLE;
    }
    const centerX = (bounds.min.x + bounds.max.x) * 0.5;
    const centerZ = (bounds.min.z + bounds.max.z) * 0.5;
    const targetY = bounds.max.y + OCCLUSION_TARGET_CLEARANCE_METRES;
    let pointOccluded = this._isPointBehindHorizon(
      centerX,
      targetY,
      centerZ,
      horizon,
      originX,
      originY,
      originZ,
      sectorReady
    );
    if (pointOccluded === undefined) return PREDICTION_VISIBLE_UNCACHEABLE;
    if (!pointOccluded) return PREDICTION_VISIBLE_CACHEABLE;
    pointOccluded = this._isPointBehindHorizon(
      bounds.min.x,
      targetY,
      bounds.min.z,
      horizon,
      originX,
      originY,
      originZ,
      sectorReady
    );
    if (pointOccluded === undefined) return PREDICTION_VISIBLE_UNCACHEABLE;
    if (!pointOccluded) return PREDICTION_VISIBLE_CACHEABLE;
    pointOccluded = this._isPointBehindHorizon(
      bounds.max.x,
      targetY,
      bounds.min.z,
      horizon,
      originX,
      originY,
      originZ,
      sectorReady
    );
    if (pointOccluded === undefined) return PREDICTION_VISIBLE_UNCACHEABLE;
    if (!pointOccluded) return PREDICTION_VISIBLE_CACHEABLE;
    pointOccluded = this._isPointBehindHorizon(
      bounds.min.x,
      targetY,
      bounds.max.z,
      horizon,
      originX,
      originY,
      originZ,
      sectorReady
    );
    if (pointOccluded === undefined) return PREDICTION_VISIBLE_UNCACHEABLE;
    if (!pointOccluded) return PREDICTION_VISIBLE_CACHEABLE;
    pointOccluded = this._isPointBehindHorizon(
      bounds.max.x,
      targetY,
      bounds.max.z,
      horizon,
      originX,
      originY,
      originZ,
      sectorReady
    );
    if (pointOccluded === undefined) return PREDICTION_VISIBLE_UNCACHEABLE;
    return pointOccluded ? PREDICTION_OCCLUDED_CACHEABLE : PREDICTION_VISIBLE_CACHEABLE;
  }

  private _isPointBehindHorizon(
    targetX: number,
    targetY: number,
    targetZ: number,
    horizon: Float32Array,
    originX: number,
    originY: number,
    originZ: number,
    sectorReady: Uint8Array | undefined
  ): boolean | undefined {
    const offsetX = targetX - originX;
    const offsetZ = targetZ - originZ;
    const distance = Math.hypot(offsetX, offsetZ);
    if (distance < OCCLUSION_MINIMUM_TARGET_DISTANCE_METRES) return false;
    const maximumOccluderDistance = distance - OCCLUSION_RADIAL_STEP_METRES;
    const radialStep = Math.floor(maximumOccluderDistance / OCCLUSION_RADIAL_STEP_METRES) - 1;
    if (radialStep < 0) return false;
    const clampedStep = Math.min(this._radialStepCount - 1, radialStep);
    const angle = Math.atan2(offsetZ, offsetX);
    const sector = Math.floor(((angle + Math.PI) / (Math.PI * 2)) * OCCLUSION_SECTOR_COUNT) % OCCLUSION_SECTOR_COUNT;
    let conservativeHorizonSlope = Number.POSITIVE_INFINITY;
    for (let offset = -OCCLUSION_NEIGHBOUR_SECTORS; offset <= OCCLUSION_NEIGHBOUR_SECTORS; offset++) {
      const neighbour = (sector + offset + OCCLUSION_SECTOR_COUNT) % OCCLUSION_SECTOR_COUNT;
      if (sectorReady && sectorReady[neighbour] === 0) return undefined;
      conservativeHorizonSlope = Math.min(
        conservativeHorizonSlope,
        horizon[neighbour * this._radialStepCount + clampedStep]!
      );
    }
    const targetSlope = (targetY - originY) / distance;
    return conservativeHorizonSlope > targetSlope;
  }

  private _sampleHeight(worldX: number, worldZ: number): number | undefined {
    return sampleSeedWorldHeight(this._fields, worldX, worldZ);
  }

  private _sweepCellStates(): void {
    this._parentCellStates.forEach(this._sweepCellState, this);
    this._subCellStates.forEach(this._sweepCellState, this);
    this._worldStates.forEach(this._sweepCellState, this);
  }

  private _sweepCellState(state: CellOcclusionState, stateId: string, states: Map<string, CellOcclusionState>): void {
    if (this._frame - state.lastSeenFrame > OCCLUSION_STATE_IDLE_FRAMES) states.delete(stateId);
  }
}

function horizontalSector(x: number, z: number, fallback: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z) || Math.hypot(x, z) <= 1e-6) return fallback;
  const angle = Math.atan2(z, x);
  return Math.floor(((angle + Math.PI) / (Math.PI * 2)) * OCCLUSION_SECTOR_COUNT) % OCCLUSION_SECTOR_COUNT;
}

function selectNearestUnbuiltSectorsInto(
  centerSector: number,
  sectorReady: Uint8Array,
  maximumCount: number,
  searchSectorCount: number,
  sectors: Int16Array
): number {
  let sectorCount = 0;
  let searchedSectorCount = 0;
  if (sectorReady[centerSector] === 0 && sectorCount < maximumCount) sectors[sectorCount++] = centerSector;
  searchedSectorCount++;
  for (let distance = 1; distance <= OCCLUSION_SECTOR_COUNT / 2; distance++) {
    if (sectorCount >= maximumCount || searchedSectorCount >= searchSectorCount) break;
    const left = (centerSector - distance + OCCLUSION_SECTOR_COUNT) % OCCLUSION_SECTOR_COUNT;
    searchedSectorCount++;
    if (sectorReady[left] === 0) sectors[sectorCount++] = left;
    if (sectorCount >= maximumCount || searchedSectorCount >= searchSectorCount) break;
    const right = (centerSector + distance) % OCCLUSION_SECTOR_COUNT;
    searchedSectorCount++;
    if (right !== left && sectorReady[right] === 0) sectors[sectorCount++] = right;
  }
  return sectorCount;
}

function applyAngularClearanceToSlope(slope: number): number {
  if (!Number.isFinite(slope)) return slope;
  const denominator = 1 + slope * OCCLUSION_ANGLE_CLEARANCE_TANGENT;
  if (denominator <= 0) return Number.NEGATIVE_INFINITY;
  return (slope - OCCLUSION_ANGLE_CLEARANCE_TANGENT) / denominator;
}

function createPopulationVisibilityStatistics(): PopulationVisibilityStatistics {
  return {
    testedCellCount: 0,
    occludedCellCount: 0,
    retainedVisibleCellCount: 0,
    testedSubCellCount: 0,
    occludedSubCellCount: 0,
    testedRendererCount: 0,
    occludedRendererCount: 0,
    parentOccludedRendererCount: 0,
    subCellTestedRendererCount: 0,
    subCellOccludedRendererCount: 0,
    retainedVisibleRendererCount: 0,
    visibilityEvaluationMilliseconds: 0,
    parentEvaluationMilliseconds: 0,
    subCellEvaluationMilliseconds: 0
  };
}

function resetPopulationVisibilityStatistics(statistics: PopulationVisibilityStatistics): void {
  statistics.testedCellCount = 0;
  statistics.occludedCellCount = 0;
  statistics.retainedVisibleCellCount = 0;
  statistics.testedSubCellCount = 0;
  statistics.occludedSubCellCount = 0;
  statistics.testedRendererCount = 0;
  statistics.occludedRendererCount = 0;
  statistics.parentOccludedRendererCount = 0;
  statistics.subCellTestedRendererCount = 0;
  statistics.subCellOccludedRendererCount = 0;
  statistics.retainedVisibleRendererCount = 0;
  statistics.visibilityEvaluationMilliseconds = 0;
  statistics.parentEvaluationMilliseconds = 0;
  statistics.subCellEvaluationMilliseconds = 0;
}

function createCellOcclusionState(horizonRevision: number, bounds: BoundingBox): CellOcclusionState {
  const state: CellOcclusionState = {
    consecutiveOccludedFrames: 0,
    occluded: false,
    lastSeenFrame: 0,
    horizonRevision,
    predictedOccluded: false,
    cacheable: false,
    minimumX: 0,
    minimumY: 0,
    minimumZ: 0,
    maximumX: 0,
    maximumY: 0,
    maximumZ: 0
  };
  copyOcclusionBounds(state, bounds);
  return state;
}

function occlusionBoundsMatch(state: CellOcclusionState, bounds: BoundingBox): boolean {
  return (
    state.minimumX === bounds.min.x &&
    state.minimumY === bounds.min.y &&
    state.minimumZ === bounds.min.z &&
    state.maximumX === bounds.max.x &&
    state.maximumY === bounds.max.y &&
    state.maximumZ === bounds.max.z
  );
}

function copyOcclusionBounds(state: CellOcclusionState, bounds: BoundingBox): void {
  state.minimumX = bounds.min.x;
  state.minimumY = bounds.min.y;
  state.minimumZ = bounds.min.z;
  state.maximumX = bounds.max.x;
  state.maximumY = bounds.max.y;
  state.maximumZ = bounds.max.z;
}
