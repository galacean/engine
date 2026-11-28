import { DEFAULT_SOIL_VISUAL_CONFIG } from "./soil/SoilVisualConfig";
import { FARM_ACTION_INTERRUPT_PROGRESS } from "../config/FarmingActionConfig";
export { FARM_ACTION_INTERRUPT_PROGRESS } from "../config/FarmingActionConfig";
import { Camera, Entity, Ray, Script, Vector2, Vector3, type Shader } from "@galacean/engine";
import type { FarmingService } from "../application/FarmingService";
import { FarmItemPresentation } from "./FarmItemPresentation";
import type { FarmingPresentationPort } from "../application/FarmingActionCoordinator";
import { cancellable } from "../application/FarmingActionCoordinator";
import type { FarmingDefinitionSet } from "../domain/FarmDefinitions";
import type { FarmSnapshot, PlotState } from "../domain/FarmState";
import type { FarmChange } from "../domain/FarmCommands";
import type { FarmActionInput } from "../domain/FarmActions";
import {
  allocatePlotId,
  plotAtTarget,
  plotBounds,
  sameGroundCell,
  shapeSeedForId,
  targetAtPoint,
  type FarmingGroundProvider,
  type FarmingGroundView,
  type GroundTarget
} from "../domain/FarmingGround";
import { normalizeSoilMoisture } from "../domain/SoilMoisture";
import { PlantPresenter, PLANT_DISTANCE_CULLED, type PlantVisualLoadState } from "./PlantPresenter";
import { cropRenderState, type PlantRenderState } from "./PlantRenderState";
import { SoilVisualProvider, type SoilVisualTarget } from "./soil/SoilVisualProvider";
import { createFarmingPlotSurface } from "./soil/FarmingPlotSurface";
import type { SoilCell } from "./soil/SoilBoundary";
import { SoilBoundaryPreview } from "./soil/SoilBoundaryPreview";
import type { FarmingSoilWorkPresentation } from "./soil/SoilWorkReveal";
import { WateringPresenter } from "./watering/WateringPresenter";
import { FarmingPropAnimationPlayer } from "./props/FarmingPropAnimationPlayer";
import { FarmingPlotSelection } from "./FarmingPlotSelection";
import { FarmingGrowthVisibility } from "./FarmingGrowthVisibility";
import { plantGrowthRadius } from "../procedural/core/plantGrowthRadius";
import recipeMetadata from "../procedural/plant-recipe-metadata.json";
import { carriedItem } from "../domain/FarmItems";
import { resolveCarriedAction } from "../domain/ResolveCarriedAction";
import { FARM_WORK_REACH, farmWorkCandidates, isNearbyFarmTool } from "../application/FarmingWorkTarget";
import { WATERING_CONFIG } from "./watering/WateringConfig";
import type { FarmSelectionAction } from "./FarmingSelectionTexture";

export interface FarmWorkSelection {
  readonly plotId: string | null;
  readonly ground: GroundTarget;
  readonly position: readonly [number, number, number];
}
const workBlendSeconds = 0.3;
export const FARM_WORK_TARGET_REFRESH_MS = 100;
/** Ignore sub-centimetre grounding jitter; walking/jumping cancels from the start position. */
export const FARM_ACTION_MOVE_TOLERANCE_M = 0.03;
const ease = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

class FarmingPresentationFrame extends Script {
  tick: (seconds: number) => void = () => {};
  override onLateUpdate(): void {
    this.tick(this.engine.time.actualDeltaTime);
  }
}
type Surface = ReturnType<typeof createFarmingPlotSurface>;
interface SurfaceEntry {
  readonly id: string;
  readonly view: Surface;
  syncedGroundRevision: number;
  syncedMoisture: number;
  m0: number;
  m1: number;
  m2: number;
  m4: number;
  m5: number;
  m6: number;
  m8: number;
  m9: number;
  m10: number;
  stretch: number;
}
interface CachedCropRenderState {
  cropId: string;
  cropDefinitionVersion: number;
  cycleId: string;
  cycleRevision: number;
  plantDefinitionId: string;
  plantDefinitionRevision: number;
  recipeRevision: number;
  growthUnits: number;
  leafSpread: number;
  stemBend: number;
  fruitScale: number;
  state: PlantRenderState;
}
function hasCropRemovalChange(changes: readonly FarmChange[], cropId: string): boolean {
  for (let i = 0; i < changes.length; i++) {
    const change = changes[i];
    if ((change.kind === "crop-harvested" || change.kind === "crop-removed") && change.cropInstanceId === cropId)
      return true;
  }
  return false;
}
function collectAvailablePlots(plots: readonly PlotState[], out: PlotState[]): PlotState[] {
  out.length = 0;
  for (let i = 0; i < plots.length; i++) {
    const plot = plots[i];
    if (plot.ground.availability === "available") out.push(plot);
  }
  return out;
}

/** Reusable agriculture on a borrowed host camera and ground. No terrain, light, movement or Scene creation. */
export class FarmingWorldPresentation {
  readonly root: Entity;
  readonly items: FarmItemPresentation;
  readonly port: FarmingPresentationPort;
  private readonly surfaces = new Map<string, Surface>();
  private surfaceEntries = new Map<string, SurfaceEntry>();
  private surfaceEntryList: SurfaceEntry[] = [];
  private surfaceRenderers = new Map<string, SoilVisualTarget>();
  private previousPlotsMap = new Map<string, PlotState>();
  private availablePlots: PlotState[] = [];
  private validPlotIds = new Set<string>();
  private staleSurfaceIds: string[] = [];
  private cachedCropStates = new Map<string, CachedCropRenderState>();
  private syncCropInputs: PlantRenderState[] = [];
  private readonly loads = new Map<string, { state: PlantVisualLoadState; message?: string }>();
  private readonly soils: SoilVisualProvider;
  private readonly plants: PlantPresenter;
  private readonly watering: WateringPresenter;
  private readonly tool: FarmingPropAnimationPlayer;
  private readonly toolRoot: Entity;
  private readonly selection: FarmingPlotSelection;
  private readonly growthVisibility = new FarmingGrowthVisibility();
  private readonly cropRadii = new Map<string, number>();
  private readonly plotPriorities = new Map<string, number>();
  private readonly distanceHiddenPlots = new Set<string>();
  private readonly viewRay = new Ray();
  private readonly viewportCenter = new Vector2(0.5, 0.5);
  private readonly previousRay = new Float64Array(6).fill(NaN);
  private rayInput?: { origin: [number, number, number]; direction: [number, number, number] };
  private readonly readPlantVisibility = (id: string): number => {
    const plotId = this.snapshot.crops[id]?.anchorPlotId;
    return this.distanceHiddenPlots.has(plotId) ? PLANT_DISTANCE_CULLED : (this.plotPriorities.get(plotId) ?? -1);
  };
  private selectionSyncValid = false;
  private selectionSyncState?: {
    active: boolean;
    plotId: string | null;
    groundId: string | null;
    cellX: number;
    cellZ: number;
    groundRevision: number;
    actionHint: FarmSelectionAction | undefined;
    snapshot: FarmSnapshot | null;
  };
  private selectionGround?: FarmingGroundView;
  private selectionGroundId = "";
  private selectionPlotPos?: Vector3;
  private selectionWorkSurface?: Surface;
  private selectionTrianglesFn?: (
    bounds: Parameters<NonNullable<FarmingGroundView["surfaceTriangles"]>>[1]
  ) => ReturnType<NonNullable<FarmingGroundView["surfaceTriangles"]>>;
  private selectionWorkHeightAtFn?: (x: number, z: number) => number | null;
  private selectionGroundHeightAtFn?: (x: number, z: number) => number | null;
  private selectionSurface?: {
    groundId: string;
    revision: number;
    action: FarmSelectionAction;
    triangles: (
      bounds: Parameters<NonNullable<FarmingGroundView["surfaceTriangles"]>>[1]
    ) => ReturnType<NonNullable<FarmingGroundView["surfaceTriangles"]>>;
  };
  private manualTarget = false;
  private lockedTarget: { plotId: string | null; ground: GroundTarget | null } | null = null;
  private targetGroundRevision = -1;
  private playerOccluded?: (ray: Ray, distance: number, ignoredRoot?: Entity) => boolean;
  private preparePlayerOcclusion?: (ray: Ray, ignoredRoot?: Entity) => Promise<boolean>;
  private playerHintOccluded?: (ray: Ray, distance: number, target: string, ignoredRoot?: Entity) => boolean;
  private hintTargetKeyX = NaN;
  private hintTargetKeyY = NaN;
  private hintTargetKeyZ = NaN;
  private hintTargetKey = "";
  private playerActionTarget?: FarmWorkSelection;
  private playerTargetKey = "";
  private playerTargetHeldId = "";
  private playerTargetSnapshotRevision = -1;
  private playerTargetGroundRevision = -1;
  private playerTargetAspect = NaN;
  private playerTargetFov = NaN;
  private playerTargetCheckedAt = -Infinity;
  private playerTarget: FarmWorkSelection | null = null;
  private selectionAction?: {
    snapshot: FarmSnapshot;
    ground: FarmingGroundView;
    groundRevision: number;
    groundId: string;
    cellX: number;
    cellZ: number;
    action: FarmSelectionAction;
  };
  private hintOcclusion?: {
    ground: FarmingGroundView;
    groundRevision: number;
    eye: Vector3;
    point: Vector3;
    checkedAt: number;
    blocked: boolean;
  };
  private readonly workPoint = new Vector3();
  private readonly workScreen = new Vector3();
  private readonly workRay = new Ray();
  private preparedWatering?: string;
  private actionMotion?: {
    origin: Vector3;
    /** Last published progress; retained after the arc disappears until the attempt finishes. */
    progress: number;
    controller: AbortController;
    signal: AbortSignal;
    interrupt?: () => void;
  };
  private actionHint?: { target: GroundTarget; plotId: string | null; action: NonNullable<FarmSelectionAction> };
  private readonly unsubscribe: () => void;
  private readonly unsubscribeGround: () => void;
  private snapshot: FarmSnapshot;
  private active = true;
  private disposed = false;
  private error?: string;
  private readonly boundaryPreview = new SoilBoundaryPreview();
  private target: { plotId: string | null; ground: GroundTarget | null } = { plotId: null, ground: null };
  private work?: {
    view: Surface;
    plotId: string;
    type: "hoe";
    resolve: (result: boolean) => void;
    done: boolean;
    cropId?: string;
    previewStarted?: boolean;
    elapsed: number;
    contactStops: readonly number[];
    preview?: SoilCell;
  };

  constructor(
    parent: Entity,
    private readonly camera: Camera,
    private readonly service: FarmingService,
    private readonly ground: FarmingGroundProvider,
    private readonly definitions: FarmingDefinitionSet,
    private readonly cropScales: Readonly<Record<string, number>> = {},
    soilShader?: Shader,
    private readonly soilWork?: FarmingSoilWorkPresentation,
    deferOffscreenProps = false
  ) {
    this.snapshot = service.getSnapshot();
    for (const crop of definitions.catalog.crops) {
      const plant = definitions.catalog.getPlant(crop.appearance.plantId);
      const radius =
        "recipe" in plant
          ? plantGrowthRadius(plant.recipe)
          : recipeMetadata[plant.id as keyof typeof recipeMetadata].radius;
      this.cropRadii.set(crop.id, radius * Math.abs(cropScales[crop.id] ?? 1));
    }
    this.root = parent.createChild("Farming world presentation");
    this.selection = new FarmingPlotSelection(this.root, this.snapshot.grid.cellSize, camera, (point) =>
      this.hintOccluded(point)
    );
    this.soils = new SoilVisualProvider(parent.engine, this.snapshot.grid.cellSize, soilShader);
    this.watering = WateringPresenter.create(this.root);
    this.watering.showProp = false;
    this.toolRoot = this.root.createChild("Farming soil tool");
    this.toolRoot.isActive = false;
    this.tool = new FarmingPropAnimationPlayer(this.toolRoot);
    this.tool.loop = false;
    const load = (id: string, state: PlantVisualLoadState, message?: string) => {
      if (state === "empty") this.loads.delete(id);
      else this.loads.set(id, { state, message });
    };
    this.plants = new PlantPresenter(
      parent.engine,
      definitions.catalog,
      (state) => {
        const id = this.snapshot.crops[state.instanceId]?.anchorPlotId,
          anchor = id && this.surfaces.get(id)?.cropAnchor;
        const scale = this.cropScales[state.cropId] ?? 1;
        if (anchor) anchor.transform.setScale(scale, scale, scale);
        return anchor || undefined;
      },
      load,
      {
        isWithinDrawDistance: (position, wasVisible) =>
          this.growthVisibility.withinDrawDistance(position, this.camera.entity.transform.worldPosition, wasVisible)
      }
    );
    this.items = new FarmItemPresentation(
      this.root,
      camera,
      service,
      {},
      (work, phase, signal) => this.plants.preparePresentationWork(work, phase, signal!),
      deferOffscreenProps
    );
    this.port = {
      getTarget: () => ({ ...this.target }),
      prepare: (input, signal, interrupt) => this.prepareAction(input, signal, interrupt),
      canCommit: () => {
        if (this.cancelIfMoved()) return false;
        const motion = this.actionMotion;
        // After the cutoff, walking away must not turn into a late reach failure.
        // Terrain and obstruction checks still use the original work position.
        const origin = motion && motion.progress >= FARM_ACTION_INTERRUPT_PROGRESS ? motion.origin : undefined;
        return !this.playerActionTarget || this.playerTargetReachable(this.playerActionTarget, false, origin);
      },
      itemCommitted: async (input, _receipt, signal) => {
        if (input.type === "pickup-item" || input.type === "place-item") await this.items.waitForMotion(signal);
      },
      committed: (input, receipt) => {
        if (input.type === "irrigate" && this.preparedWatering !== input.plotId)
          this.showWatering(input.plotId, receipt.changes);
      },
      finish: () => {
        this.finishWork();
        this.actionMotion = undefined;
      },
      cancel: () => {
        this.actionMotion?.controller.abort();
        this.work?.resolve(false);
        this.finishWork();
      }
    };
    this.unsubscribe = service.subscribe(({ snapshot, changes }) => {
      try {
        this.sync(snapshot, changes);
      } catch (error) {
        this.error = String(error);
      }
    });
    this.unsubscribeGround = ground.subscribe(() => {
      this.finishWork();
      this.sync(service.getSnapshot(), [], true);
    });
    this.root.addComponent(FarmingPresentationFrame).tick = (dt) => this.update(dt);
    try {
      this.sync(this.snapshot, [], true);
    } catch (error) {
      // Failed initial surfaces must not leave a frame callback, subscriptions or GPU owners behind.
      this.dispose();
      throw error;
    }
  }

  /** Pause/resume asynchronous farm item shader compilation during critical first-screen reveal windows. */
  setBackgroundShaderWorkPaused(paused: boolean): void {
    this.plants.setShaderWorkPaused(paused);
  }

  /** Defer or release offscreen persistent farming tool loads (watering-can, hoe, basket, seed-bag). */
  setDeferOffscreenProps(defer: boolean): void {
    this.items.setDeferOffscreenLoads(defer);
  }

  /** Resolves once in-flight soil textures are bound so startup shader warmup sees final material macros. */
  whenSoilTexturesSettled(): Promise<void> {
    return this.soils.whenTexturesSettled();
  }

  /** Resolves once persistent farming item prefabs have instantiated so warmup sees their final shaders. */
  whenPropsSettled(): Promise<void> {
    return this.items.whenLoaded();
  }

  /** Synchronously flush pending soil batch geometry so renderers have valid meshes before shader warmup. */
  flushPendingVisuals(): void {
    if (!this.disposed) this.soils.update(0);
  }

  private async prepareAction(
    input: FarmActionInput,
    outerSignal: AbortSignal,
    interrupt?: () => void
  ): Promise<boolean> {
    outerSignal.throwIfAborted();
    if (!this.active || this.disposed) return false;
    const controller = new AbortController();
    const signal = AbortSignal.any([outerSignal, controller.signal]);
    const motion = {
      origin: this.camera.entity.transform.worldPosition.clone(),
      progress: 0,
      controller,
      signal,
      interrupt
    };
    this.actionMotion = motion;
    try {
      const prepared = await cancellable(this.prepareActionAnimation(input, signal), signal);
      if (prepared && this.playerActionTarget && this.preparePlayerOcclusion) {
        // Tool animations outlive a hint sample. Confirm the original work ray
        // again immediately before the coordinator's synchronous commit check.
        const ray = new Ray(motion.origin.clone(), new Vector3(...this.playerActionTarget.position));
        ray.direction.subtract(ray.origin).normalize();
        if (
          !(await this.preparePlayerOcclusion(ray, this.getGroundOcclusionRoot(this.playerActionTarget.ground))) ||
          signal.aborted
        )
          return false;
      }
      if (prepared) motion.progress = 1;
      return prepared && this.actionMotion === motion && !this.cancelIfMoved();
    } catch (error) {
      if (!signal.aborted) throw error;
      if (this.actionMotion === motion) this.finishWork();
      return false;
    }
  }

  private cancelIfMoved(): boolean {
    const motion = this.actionMotion;
    if (!motion) return false;
    if (
      !motion.signal.aborted &&
      motion.progress < FARM_ACTION_INTERRUPT_PROGRESS &&
      Vector3.distanceSquared(motion.origin, this.camera.entity.transform.worldPosition) >
        FARM_ACTION_MOVE_TOLERANCE_M ** 2
    ) {
      motion.controller.abort();
      motion.interrupt?.();
      this.finishWork();
    }
    return motion.signal.aborted;
  }

  private async prepareActionAnimation(input: FarmActionInput, signal: AbortSignal): Promise<boolean> {
    signal.throwIfAborted();
    if (!this.active || this.disposed) return false;
    if (!(await this.items.prepareHeld(signal))) return false;
    signal.throwIfAborted();
    const plot =
      input.type === "hoe"
        ? this.snapshot.plots.find(
            (p) =>
              p.groundId === input.target.groundId && p.cellX === input.target.cellX && p.cellZ === input.target.cellZ
          )
        : this.snapshot.plots.find((p) => p.plotId === input.plotId);
    const target = input.type === "hoe" ? input.target : plot;
    if (target) {
      const action: NonNullable<FarmSelectionAction> =
        input.type === "hoe"
          ? (resolveCarriedAction(this.snapshot, target)?.intent ?? "cultivate")
          : input.type === "delete-plot"
            ? "restore"
            : input.type;
      this.actionHint = { target, plotId: plot?.plotId ?? null, action };
    }
    this.items.setUsing(true);
    if (input.type === "hoe") return this.prepareWork(input, signal);
    if (input.type === "delete-plot" && carriedItem(this.snapshot.items)?.type === "hoe") {
      const plot = this.snapshot.plots.find((p) => p.plotId === input.plotId);
      return plot ? this.prepareWork({ type: "hoe", target: plot, expectedCropInstanceId: null }, signal) : false;
    }
    if (input.type === "irrigate") {
      if (!(await this.watering.whenReady()) || signal.aborted) return false;
      this.preparedWatering = input.plotId;
      this.showWatering(input.plotId, []);
      return this.items.prepareUse(WATERING_CONFIG.duration, signal);
    }
    return this.items.prepareUse(input.type === "plant" ? 0.45 : 0.35, signal);
  }

  setPlayerOcclusionQuery(
    query?: (ray: Ray, distance: number, ignoredRoot?: Entity) => boolean,
    hintQuery?: (ray: Ray, distance: number, target: string, ignoredRoot?: Entity) => boolean,
    prepare?: (ray: Ray, ignoredRoot?: Entity) => Promise<boolean>
  ): void {
    this.playerOccluded = query;
    this.playerHintOccluded = hintQuery;
    this.preparePlayerOcclusion = prepare;
    this.playerTargetKey = "";
    this.hintTargetKeyX = NaN;
    if (this.hintOcclusion) this.hintOcclusion.checkedAt = -Infinity;
  }
  private formatHintTargetKey(x: number, y: number, z: number): string {
    if (x === this.hintTargetKeyX && y === this.hintTargetKeyY && z === this.hintTargetKeyZ) {
      return this.hintTargetKey;
    }
    this.hintTargetKeyX = x;
    this.hintTargetKeyY = y;
    this.hintTargetKeyZ = z;
    this.hintTargetKey = `${x},${y},${z}`;
    return this.hintTargetKey;
  }
  private hintOccluded(point: Vector3): boolean {
    // The drawn ring is lifted above the surface. Share the work target's actual
    // endpoint so the hint and selection consume a single depth sample.
    if (this.playerHintOccluded) {
      const target = this.target.ground ?? this.snapshot.plots.find((plot) => plot.plotId === this.target.plotId);
      const work =
        this.playerActionTarget ??
        (isNearbyFarmTool(carriedItem(this.snapshot.items)?.type) ? this.playerTarget : null);
      const matches =
        work &&
        target &&
        work.ground.groundId === target.groundId &&
        work.ground.cellX === target.cellX &&
        work.ground.cellZ === target.cellZ;
      const position = matches ? work.position : undefined;
      this.workPoint.set(position?.[0] ?? point.x, position?.[1] ?? point.y, position?.[2] ?? point.z);
      this.workRay.origin.copyFrom(this.camera.entity.transform.worldPosition);
      this.workRay.direction.copyFrom(this.workPoint).subtract(this.workRay.origin);
      const distance = this.workRay.direction.length();
      if (distance < 0.001) return false;
      this.workRay.direction.scale(1 / distance);
      return this.playerHintOccluded(
        this.workRay,
        distance,
        this.formatHintTargetKey(this.workPoint.x, this.workPoint.y, this.workPoint.z),
        this.getGroundOcclusionRoot(target)
      );
    }
    const eye = this.camera.entity.transform.worldPosition;
    const ground = this.ground.capture();
    const now = performance.now();
    const cached = this.hintOcclusion;
    // Dynamic host occluders have no revision notification. Bound their staleness
    // while invalidating immediately when either ray endpoint or ground changes.
    if (
      cached &&
      cached.ground === ground &&
      cached.groundRevision === ground.revision &&
      cached.eye.x === eye.x &&
      cached.eye.y === eye.y &&
      cached.eye.z === eye.z &&
      cached.point.x === point.x &&
      cached.point.y === point.y &&
      cached.point.z === point.z &&
      now - cached.checkedAt < FARM_WORK_TARGET_REFRESH_MS
    )
      return cached.blocked;
    this.workRay.origin.copyFrom(eye);
    this.workRay.direction.copyFrom(point).subtract(this.workRay.origin);
    const distance = this.workRay.direction.length();
    if (distance < 0.001) return false;
    this.workRay.direction.scale(1 / distance);
    const hit = ground.raycast(this.fillRayInput(this.workRay.origin, this.workRay.direction), distance);
    const blocked = Boolean(
      (hit && hit.distance < distance - 0.08) || this.playerOccluded?.(this.workRay, Math.max(0, distance - 0.08))
    );
    const result = cached ?? {
      ground,
      groundRevision: ground.revision,
      eye: new Vector3(),
      point: new Vector3(),
      checkedAt: now,
      blocked
    };
    result.ground = ground;
    result.groundRevision = ground.revision;
    result.eye.copyFrom(eye);
    result.point.copyFrom(point);
    result.checkedAt = now;
    result.blocked = blocked;
    this.hintOcclusion = result;
    return blocked;
  }
  private playerTargetReachable(
    selected: FarmWorkSelection,
    selecting = true,
    origin?: Vector3,
    visibility: "strict" | "hint" | "none" = "strict"
  ): boolean {
    const eye = origin ?? this.camera.entity.transform.worldPosition;
    const rx = selected.position[0] - eye.x,
      rz = selected.position[2] - eye.z;
    const horizontalDistance = Math.hypot(rx, rz);
    if (horizontalDistance < FARM_WORK_REACH.minimum || horizontalDistance > FARM_WORK_REACH.maximum) return false;

    this.workPoint.set(selected.position[0], selected.position[1], selected.position[2]);
    if (selecting) {
      const forward = this.camera.entity.transform.worldForward;
      const length = Math.hypot(forward.x, forward.z);
      if (
        length < 0.001 ||
        (rx * forward.x + rz * forward.z) / length < FARM_WORK_REACH.minimum ||
        Math.abs(rx * forward.z - rz * forward.x) / length > FARM_WORK_REACH.lateral
      )
        return false;
      this.camera.worldToViewportPoint(this.workPoint, this.workScreen);
      if (
        this.workScreen.z <= 0 ||
        this.workScreen.x < 0 ||
        this.workScreen.x > 1 ||
        this.workScreen.y < 0 ||
        this.workScreen.y > 0.85
      )
        return false;
    }
    // Reject reach/screen/action failures before either cultivation inspection or GPU work.
    if (!this.service.inspectCultivation(selected.ground).canCultivate) return false;
    if (visibility === "none") return true;
    this.workRay.origin.copyFrom(eye);
    this.workRay.direction.copyFrom(this.workPoint).subtract(eye);
    const distance = this.workRay.direction.length();
    this.workRay.direction.normalize();
    if (visibility === "hint" && this.playerHintOccluded)
      return !this.playerHintOccluded(
        this.workRay,
        distance,
        this.formatHintTargetKey(selected.position[0], selected.position[1], selected.position[2]),
        this.getGroundOcclusionRoot(selected.ground)
      );
    return !this.playerOccluded?.(
      this.workRay,
      Math.max(0, distance - 0.06),
      this.getGroundOcclusionRoot(selected.ground)
    );
  }
  /** The operated crop belongs to the target; it cannot occlude its own ground. Other crops remain occluders. */
  getGroundOcclusionRoot(target: GroundTarget | null | undefined): Entity | undefined {
    const plot = target && plotAtTarget(this.snapshot.plots, target);
    const anchor = plot ? this.surfaces.get(plot.plotId)?.cropAnchor : undefined;
    // Empty anchors contain no crop geometry and need no distinct rendering policy.
    return anchor && anchor.childCount !== 0 ? anchor : undefined;
  }

  /** Candidate probes never replace the displayed target or its refresh cache. */
  getPlayerWorkCandidate(): FarmWorkSelection | null {
    return this.playerWorkCandidates().next().value ?? null;
  }

  /** Bounded by the neighbouring grid cells; only needed for a click without a confirmed target. */
  getPlayerWorkCandidates(): FarmWorkSelection[] {
    return Array.from(this.playerWorkCandidates());
  }

  /** Read the displayed identity without scheduling a new hint or replacing it during a click. */
  capturePlayerWorkTarget(): FarmWorkSelection | null {
    return (
      this.playerActionTarget ?? (isNearbyFarmTool(carriedItem(this.snapshot.items)?.type) ? this.playerTarget : null)
    );
  }

  getPlayerWorkTarget(): FarmWorkSelection | null {
    if (this.playerActionTarget) return this.playerActionTarget;
    const held = carriedItem(this.snapshot.items);
    if (!held || !isNearbyFarmTool(held.type)) {
      this.playerTargetKey = "";
      return (this.playerTarget = null);
    }
    const view = this.ground.capture();
    const snapshotRev = this.snapshot.revision;
    const groundRev = view.revision;
    const aspect = this.camera.aspectRatio;
    const fov = this.camera.fieldOfView;
    const now = performance.now();
    if (
      this.playerTargetKey === "cached" &&
      this.playerTargetHeldId === held.id &&
      this.playerTargetSnapshotRevision === snapshotRev &&
      this.playerTargetGroundRevision === groundRev &&
      this.playerTargetAspect === aspect &&
      this.playerTargetFov === fov &&
      now - this.playerTargetCheckedAt < FARM_WORK_TARGET_REFRESH_MS
    )
      return this.playerTarget;
    this.playerTargetKey = "cached";
    this.playerTargetHeldId = held.id;
    this.playerTargetSnapshotRevision = snapshotRev;
    this.playerTargetGroundRevision = groundRev;
    this.playerTargetAspect = aspect;
    this.playerTargetFov = fov;
    this.playerTargetCheckedAt = now;
    return (this.playerTarget = this.playerWorkCandidates("hint").next().value ?? null);
  }

  private *playerWorkCandidates(visibility: "hint" | "none" = "none"): Generator<FarmWorkSelection, void> {
    const held = carriedItem(this.snapshot.items);
    if (!isNearbyFarmTool(held?.type)) return;
    const eye = this.camera.entity.transform.worldPosition;
    const forward = this.camera.entity.transform.worldForward;
    const view = this.ground.capture();
    const previous = this.playerTarget;
    const candidates = farmWorkCandidates(
      this.snapshot.grid,
      held!.groundId,
      [eye.x, eye.y, eye.z],
      [forward.x, forward.y, forward.z]
    );
    // A small preference for the current cell prevents flicker at grid boundaries.
    candidates.sort((a, b) => {
      const score = (c: typeof a) =>
        c.score - (previous?.ground.cellX === c.target.cellX && previous.ground.cellZ === c.target.cellZ ? 0.08 : 0);
      return score(a) - score(b);
    });
    for (const { target, x, z } of candidates) {
      const plot = this.snapshot.plots.find(
        (p) => p.groundId === target.groundId && p.cellX === target.cellX && p.cellZ === target.cellZ
      );
      if (held!.type !== "hoe" && !plot) continue;
      if (plot && plot.ground.availability !== "available") continue;
      if (!resolveCarriedAction(this.snapshot, target)) continue;
      const sample = view.sample(target.groundId, x, z);
      if (!sample) continue;
      const selected = { ground: target, plotId: plot?.plotId ?? null, position: sample.position };
      if (!this.playerTargetReachable(selected, true, undefined, visibility)) continue;
      yield selected;
    }
  }
  beginPlayerWork(target: FarmWorkSelection): boolean {
    if (this.playerActionTarget || !this.playerTargetReachable(target)) return false;
    this.playerActionTarget = target;
    this.target = { plotId: target.plotId, ground: target.ground };
    this.manualTarget = false;
    this.refreshSelection();
    return true;
  }
  endPlayerWork(): void {
    this.playerActionTarget = undefined;
    this.playerTargetKey = "";
    this.targetGroundRevision = -1;
    if (this.lockedTarget) {
      this.target = { ...this.lockedTarget };
      // A locked override comes from explicit selection, including cells without a soil surface.
      this.manualTarget = true;
      this.refreshSelection();
    } else {
      this.updateViewTarget();
    }
  }
  /** Explicit UI selection can stay pinned while the camera moves; default callers retain aim selection. */
  setTarget(target: { plotId: string | null; ground: GroundTarget | null }, options: { lock?: boolean } = {}): void {
    this.lockedTarget = options.lock ? { ...target } : null;
    // Remember a new override without changing the target used by an in-progress action.
    if (this.playerActionTarget) return;
    this.target = { ...target };
    this.manualTarget = true;
    this.camera.viewportPointToRay(this.viewportCenter, this.viewRay);
    this.rememberRay();
    this.refreshSelection();
  }
  /** Resume camera targeting immediately, even when the camera has not moved. */
  releaseTargetOverride(): void {
    this.lockedTarget = null;
    this.manualTarget = false;
    this.targetGroundRevision = -1;
    this.updateViewTarget();
  }
  private rememberRay(): void {
    const { origin: o, direction: d } = this.viewRay;
    this.previousRay[0] = o.x;
    this.previousRay[1] = o.y;
    this.previousRay[2] = o.z;
    this.previousRay[3] = d.x;
    this.previousRay[4] = d.y;
    this.previousRay[5] = d.z;
  }
  private fillRayInput(
    origin: Vector3,
    direction: Vector3
  ): {
    origin: [number, number, number];
    direction: [number, number, number];
  } {
    const rayInput = (this.rayInput ??= { origin: [0, 0, 0], direction: [0, 0, 0] });
    rayInput.origin[0] = origin.x;
    rayInput.origin[1] = origin.y;
    rayInput.origin[2] = origin.z;
    rayInput.direction[0] = direction.x;
    rayInput.direction[1] = direction.y;
    rayInput.direction[2] = direction.z;
    return rayInput;
  }
  private needsSelectionRefresh(
    plotId: string | null,
    ground: GroundTarget | null,
    actionHint: FarmSelectionAction | undefined
  ): boolean {
    const s = this.selectionSyncState;
    if (!this.selectionSyncValid || !s) return true;
    const groundRevision = this.ground.capture().revision;
    return (
      s.active !== this.active ||
      s.plotId !== plotId ||
      s.groundId !== (ground?.groundId ?? null) ||
      (ground !== null && (s.cellX !== ground.cellX || s.cellZ !== ground.cellZ)) ||
      s.groundRevision !== groundRevision ||
      s.actionHint !== actionHint ||
      s.snapshot !== this.snapshot
    );
  }
  private updateViewTarget(): void {
    if (this.actionHint) {
      const plotId = this.actionHint.plotId;
      const ground = this.actionHint.target;
      if (this.target.plotId !== plotId || this.target.ground !== ground) this.target = { plotId, ground };
      if (this.needsSelectionRefresh(plotId, ground, this.actionHint.action)) this.refreshSelection();
      return;
    }
    // An active action owns its target; otherwise an explicit debug selection stays pinned.
    if (this.lockedTarget && !this.playerActionTarget) return;
    if (this.playerActionTarget || isNearbyFarmTool(carriedItem(this.snapshot.items)?.type)) {
      const selected = this.getPlayerWorkTarget();
      const plotId = selected?.plotId ?? null;
      const ground = selected?.ground ?? null;
      if (this.target.plotId !== plotId || this.target.ground !== ground) this.target = { plotId, ground };
      this.manualTarget = false;
      if (this.needsSelectionRefresh(plotId, ground, undefined)) this.refreshSelection();
      return;
    }
    this.playerTarget = null;
    this.playerTargetKey = "";
    this.camera.viewportPointToRay(this.viewportCenter, this.viewRay);
    const { origin: o, direction: d } = this.viewRay,
      previous = this.previousRay;
    const changed =
      previous[0] !== o.x ||
      previous[1] !== o.y ||
      previous[2] !== o.z ||
      previous[3] !== d.x ||
      previous[4] !== d.y ||
      previous[5] !== d.z;
    const view = this.ground.capture();
    if (this.manualTarget && !changed) return;
    if (!changed && this.targetGroundRevision === view.revision) return;
    this.manualTarget = false;
    this.rememberRay();
    this.targetGroundRevision = view.revision;
    const hit = view.raycast(this.fillRayInput(o, d), 8);
    const ground = hit && targetAtPoint(this.snapshot.grid, hit.groundId, hit.position[0], hit.position[2]);
    let plotId: string | null = null;
    if (ground) {
      const plots = this.snapshot.plots;
      for (let i = 0; i < plots.length; i++) {
        const p = plots[i];
        if (
          p.ground.availability === "available" &&
          p.groundId === ground.groundId &&
          p.cellX === ground.cellX &&
          p.cellZ === ground.cellZ
        ) {
          plotId = p.plotId;
          break;
        }
      }
    }
    this.target = { plotId, ground };
    this.refreshSelection();
  }
  /** UI-only cache; action execution still validates through the coordinator/service. */
  private availableSelectionAction(target: GroundTarget, ground: FarmingGroundView): FarmSelectionAction {
    const cached = this.selectionAction;
    if (
      cached &&
      cached.snapshot === this.snapshot &&
      cached.ground === ground &&
      cached.groundRevision === ground.revision &&
      cached.groundId === target.groundId &&
      cached.cellX === target.cellX &&
      cached.cellZ === target.cellZ
    )
      return cached.action;
    const intent = resolveCarriedAction(this.snapshot, target);
    const action =
      intent &&
      this.service
        .getAvailableActions(target)
        .some((available) => available.action === intent.input.type && available.enabled)
        ? intent.intent
        : null;
    this.selectionAction = {
      snapshot: this.snapshot,
      ground,
      groundRevision: ground.revision,
      groundId: target.groundId,
      cellX: target.cellX,
      cellZ: target.cellZ,
      action
    };
    return action;
  }
  private setSurface(id: string, view: Surface): SurfaceEntry {
    const surfaceEntries = (this.surfaceEntries ??= new Map());
    const surfaceEntryList = (this.surfaceEntryList ??= []);
    const surfaceRenderers = (this.surfaceRenderers ??= new Map());
    const existing = surfaceEntries.get(id);
    if (existing) {
      if (existing.view === view) return existing;
      this.removeSurface(id, false);
    }
    const entry: SurfaceEntry = {
      id,
      view,
      syncedGroundRevision: -1,
      syncedMoisture: NaN,
      m0: NaN,
      m1: NaN,
      m2: NaN,
      m4: NaN,
      m5: NaN,
      m6: NaN,
      m8: NaN,
      m9: NaN,
      m10: NaN,
      stretch: 1
    };
    this.surfaces.set(id, view);
    surfaceRenderers.set(id, view.renderer);
    surfaceEntries.set(id, entry);
    surfaceEntryList.push(entry);
    return entry;
  }

  private removeSurface(id: string, clearDistance = true): void {
    const surfaceEntries = this.surfaceEntries;
    const existing = surfaceEntries?.get(id);
    this.surfaces.delete(id);
    this.surfaceRenderers?.delete(id);
    surfaceEntries?.delete(id);
    if (clearDistance) this.distanceHiddenPlots.delete(id);
    if (existing && this.surfaceEntryList) {
      const index = this.surfaceEntryList.indexOf(existing);
      if (index >= 0) {
        const last = this.surfaceEntryList.pop()!;
        if (index < this.surfaceEntryList.length) this.surfaceEntryList[index] = last;
      }
    }
  }

  private refreshSelection(): void {
    const syncState = (this.selectionSyncState ??= {
      active: false,
      plotId: null,
      groundId: null,
      cellX: NaN,
      cellZ: NaN,
      groundRevision: -1,
      actionHint: undefined,
      snapshot: null
    });
    const ground = this.ground.capture();
    syncState.active = this.active;
    syncState.plotId = this.target.plotId;
    syncState.groundId = this.target.ground?.groundId ?? null;
    syncState.cellX = this.target.ground?.cellX ?? NaN;
    syncState.cellZ = this.target.ground?.cellZ ?? NaN;
    syncState.groundRevision = ground.revision;
    syncState.actionHint = this.actionHint?.action;
    syncState.snapshot = this.snapshot;
    this.selectionSyncValid = true;
    if (!this.active) {
      this.selection.hide();
      return;
    }
    let target: GroundTarget | undefined = this.target.ground ?? undefined;
    if (!target && this.target.plotId) {
      const plots = this.snapshot.plots;
      for (let i = 0; i < plots.length; i++) {
        if (plots[i].plotId === this.target.plotId) {
          target = plots[i];
          break;
        }
      }
    }
    if (!target) {
      this.selection.hide();
      return;
    }
    const action = this.actionHint?.action ?? this.availableSelectionAction(target, ground);
    if (!action) {
      this.selection.hide();
      return;
    }
    this.selectionGround = ground;
    this.selectionGroundId = target.groundId;
    const selectionSurface = (this.selectionSurface ??= {
      groundId: "",
      revision: -1,
      action: null,
      triangles: (this.selectionTrianglesFn ??= (bounds) =>
        this.selectionGround?.surfaceTriangles?.(this.selectionGroundId, bounds) ?? [])
    });
    selectionSurface.groundId = target.groundId;
    selectionSurface.revision = ground.revision;
    selectionSurface.action = action;
    const surface = this.target.plotId ? this.surfaces.get(this.target.plotId) : undefined;
    if (surface && surface.root.isActiveInHierarchy) {
      const p = surface.root.transform.worldPosition;
      this.selectionPlotPos = p;
      this.selectionWorkSurface = surface;
      const workHeightAt = (this.selectionWorkHeightAtFn ??= (x: number, z: number) => {
        const pos = this.selectionPlotPos;
        const workSurface = this.selectionWorkSurface;
        return pos && workSurface ? pos.y + workSurface.work.heightAt(x - pos.x, z - pos.z) : null;
      });
      this.selection.show(p.x, p.z, workHeightAt, selectionSurface);
      return;
    }
    // Uncultivated cells use the same exact terrain footprint and range material.
    if (
      !target ||
      this.target.plotId ||
      (!this.manualTarget && !isNearbyFarmTool(carriedItem(this.snapshot.items)?.type))
    ) {
      this.selection.hide();
      return;
    }
    const { originX, originZ, cellSize } = this.snapshot.grid;
    const x = originX + (target.cellX + 0.5) * cellSize;
    const z = originZ + (target.cellZ + 0.5) * cellSize;
    this.selectionPlotPos = undefined;
    this.selectionWorkSurface = undefined;
    const groundHeightAt = (this.selectionGroundHeightAtFn ??= (gx: number, gz: number) =>
      this.selectionGround?.sample(this.selectionGroundId, gx, gz)?.position[1] ?? null);
    this.selection.show(x, z, groundHeightAt, selectionSurface);
  }
  getSowingSurface(plotId: string) {
    const view = this.surfaces.get(plotId);
    if (!view || !view.root.isActiveInHierarchy) return null;
    const p = view.root.transform.worldPosition;
    return {
      center: [p.x, p.z] as const,
      heightAt: (x: number, z: number) => p.y + view.work.heightAt(x - p.x, z - p.z)
    };
  }
  setActive(active: boolean): void {
    this.active = active;
    this.items.setActive(active);
    this.root.isActive = active;
    if (active) this.refreshSelection();
    else this.selection.hide();
    if (!active) {
      this.actionMotion?.controller.abort();
      this.work?.resolve(false);
      this.finishWork();
    }
  }
  private sync(snapshot: FarmSnapshot, changes: readonly FarmChange[], groundChanged = false): void {
    if (this.disposed) return;
    const cachedCropStates = (this.cachedCropStates ??= new Map());
    const previousPlots = (this.previousPlotsMap ??= new Map());
    const availablePlots = (this.availablePlots ??= []);
    const valid = (this.validPlotIds ??= new Set());
    const staleIds = (this.staleSurfaceIds ??= []);
    const surfaceEntries = (this.surfaceEntries ??= new Map());
    const surfaceEntryList = (this.surfaceEntryList ??= []);
    const surfaceRenderers = (this.surfaceRenderers ??= new Map());
    const cropInputs = (this.syncCropInputs ??= []);
    if (snapshot.items.carried?.itemId !== this.snapshot.items.carried?.itemId) {
      this.playerTarget = null;
      this.playerTargetKey = "";
    }
    for (const id in this.snapshot.crops)
      if (!snapshot.crops[id]) {
        cachedCropStates.delete(id);
        if (hasCropRemovalChange(changes, id)) this.plants.harvest(id);
        else this.plants.remove(id);
      }
    previousPlots.clear();
    const prevPlotList = this.snapshot.plots;
    for (let i = 0; i < prevPlotList.length; i++) previousPlots.set(prevPlotList[i].plotId, prevPlotList[i]);
    this.snapshot = snapshot;
    const plots = collectAvailablePlots(snapshot.plots, availablePlots);
    const work = this.work;
    if (work) {
      let matchedPlot: PlotState | undefined;
      for (let i = 0; i < plots.length; i++) {
        if (plots[i].plotId === work.plotId) {
          matchedPlot = plots[i];
          break;
        }
      }
      if (matchedPlot ? !sameGroundCell(work.view.placement, matchedPlot) : previousPlots.has(work.plotId)) {
        this.actionMotion?.controller.abort();
        this.finishWork();
      }
    }
    valid.clear();
    for (let i = 0; i < plots.length; i++) valid.add(plots[i].plotId);
    staleIds.length = 0;
    for (let i = 0; i < surfaceEntryList.length; i++) {
      const entry = surfaceEntryList[i];
      if (!valid.has(entry.id) && this.work?.view !== entry.view) staleIds.push(entry.id);
    }
    for (let i = 0; i < staleIds.length; i++) {
      const id = staleIds[i];
      const view = this.surfaces.get(id);
      if (view) {
        view.work.dispose();
        view.root.destroy();
      }
      this.removeSurface(id);
    }
    staleIds.length = 0;
    const groundView = this.ground.capture();
    const groundRevision = groundView.revision;
    const { originX, originZ, cellSize } = snapshot.grid;
    try {
      const soilProfile = plots.length ? this.definitions.soilProfile : undefined;
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        let entry = surfaceEntries.get(plot.plotId);
        let view = entry?.view;
        const sameSurface = Boolean(view && sameGroundCell(view.placement, plot));
        const moisture = normalizeSoilMoisture(soilProfile!, plot.soil.moistureUnits);
        if (!view || !entry || !sameSurface) {
          const previous = view;
          if (previous) {
            // A relocation must fit even when all atlas slots are already in use.
            previous.work.dispose();
            this.removeSurface(plot.plotId, false);
          }
          try {
            view = createFarmingPlotSurface(
              this.root,
              snapshot.grid,
              this.ground,
              plot,
              this.soils,
              moisture,
              previous?.cropAnchor
            );
          } catch (error) {
            const occupant = previousPlots.get(plot.plotId)?.occupantId;
            if (previous && occupant) this.plants.remove(occupant);
            throw error;
          } finally {
            previous?.root.destroy();
          }
          entry = this.setSurface(plot.plotId, view);
        }
        if (!sameSurface || groundChanged || entry.syncedGroundRevision !== groundRevision) {
          const x = originX + (plot.cellX + 0.5) * cellSize;
          const z = originZ + (plot.cellZ + 0.5) * cellSize;
          const sample = groundView.sample(plot.groundId, x, z);
          if (sample) view.root.transform.setWorldPosition(sample.position[0], sample.position[1], sample.position[2]);
          view.root.isActive = Boolean(sample);
          entry.syncedGroundRevision = groundRevision;
        }
        if (
          sameSurface &&
          this.work?.view !== view &&
          previousPlots.get(plot.plotId)?.soil.preparation !== plot.soil.preparation
        )
          view.work.setPreparation(plot.soil.preparation);
        if (!sameSurface || entry.syncedMoisture !== moisture) {
          view.work.setMoisture(moisture);
          entry.syncedMoisture = moisture;
        }
      }
    } finally {
      previousPlots.clear();
    }
    this.boundaryPreview.refresh(plots, this.surfaces, this.work?.preview, groundChanged);
    this.soils.setField(snapshot, surfaceRenderers, this.work?.preview);
    cropInputs.length = 0;
    const crops = snapshot.crops;
    for (const id in crops) {
      const crop = crops[id];
      if (!valid.has(crop.anchorPlotId)) continue;
      let cached = cachedCropStates.get(id);
      if (
        cached &&
        cached.cropId === crop.cropId &&
        cached.cropDefinitionVersion === crop.cropDefinitionVersion &&
        cached.cycleId === crop.cycleId &&
        cached.cycleRevision === crop.cycleRevision &&
        cached.plantDefinitionId === crop.plantDefinitionId &&
        cached.plantDefinitionRevision === crop.plantDefinitionRevision &&
        cached.recipeRevision === crop.recipeRevision &&
        cached.growthUnits === crop.growthUnits &&
        cached.leafSpread === crop.shape.leafSpread &&
        cached.stemBend === crop.shape.stemBend &&
        cached.fruitScale === crop.shape.fruitScale
      ) {
        cropInputs.push(cached.state);
      } else {
        const renderState = cropRenderState(this.definitions.catalog, crop);
        if (!cached) {
          cached = {
            cropId: crop.cropId,
            cropDefinitionVersion: crop.cropDefinitionVersion,
            cycleId: crop.cycleId,
            cycleRevision: crop.cycleRevision,
            plantDefinitionId: crop.plantDefinitionId,
            plantDefinitionRevision: crop.plantDefinitionRevision,
            recipeRevision: crop.recipeRevision,
            growthUnits: crop.growthUnits,
            leafSpread: crop.shape.leafSpread,
            stemBend: crop.shape.stemBend,
            fruitScale: crop.shape.fruitScale,
            state: renderState
          };
          cachedCropStates.set(id, cached);
        } else {
          cached.cropId = crop.cropId;
          cached.cropDefinitionVersion = crop.cropDefinitionVersion;
          cached.cycleId = crop.cycleId;
          cached.cycleRevision = crop.cycleRevision;
          cached.plantDefinitionId = crop.plantDefinitionId;
          cached.plantDefinitionRevision = crop.plantDefinitionRevision;
          cached.recipeRevision = crop.recipeRevision;
          cached.growthUnits = crop.growthUnits;
          cached.leafSpread = crop.shape.leafSpread;
          cached.stemBend = crop.shape.stemBend;
          cached.fruitScale = crop.shape.fruitScale;
          cached.state = renderState;
        }
        cropInputs.push(renderState);
      }
    }
    this.plants.sync(cropInputs);
    cropInputs.length = 0;
    this.targetGroundRevision = -1;
    this.refreshSelection();
  }
  private update(dt: number): void {
    if (this.disposed || !this.active) return;
    this.cancelIfMoved();
    this.updateViewTarget();
    this.items.update(dt);
    if (this.work && !this.work.done) {
      this.work.elapsed += dt;
      let playbackTime = Math.max(0, this.work.elapsed - workBlendSeconds);
      // Brief resistance at blade contact; tool and soil all share this stopped clock.
      const stops = this.work.contactStops;
      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        if (playbackTime <= stop) break;
        playbackTime -= Math.min(0.05, playbackTime - stop);
      }
      this.tool.seek(playbackTime);
      if (this.work.type === "hoe") {
        const progress = this.work.view.work.seek(this.tool.elapsed);
        this.boundaryPreview.seek(progress);
        if (this.work.preview) this.soilWork?.seek(progress);
        this.soils.setPreviewProgress(progress);
      }
      this.tool.playing = playbackTime < this.tool.duration;
      const duration = this.tool.duration + workBlendSeconds * 2 + this.work.contactStops.length * 0.05;
      const weight =
        ease(this.work.elapsed / workBlendSeconds) * ease((duration - this.work.elapsed) / workBlendSeconds);
      if (this.tool.entity) this.items.followWork(this.tool.entity, weight);
      if (this.work.cropId && this.tool.elapsed >= this.work.view.work.firstContactTime) {
        if (!this.work.previewStarted) {
          this.work.previewStarted = true;
          this.plants.beginHarvestPreview(this.work.cropId, this.tool.duration - this.work.view.work.firstContactTime);
        }
        this.plants.seekHarvestPreview(this.work.cropId, this.tool.elapsed - this.work.view.work.firstContactTime);
      }
      if (this.work.elapsed >= duration) {
        this.work.done = true;
        this.work.resolve(true);
      }
      this.refreshSelection();
    }
    this.soils.update(dt);
    const water = this.watering.workPose;
    this.selection.setProgress(this.actionProgress());
    this.selection.update(dt);
    if (water) {
      const weight = ease(water.elapsed / 0.3) * ease((WATERING_CONFIG.duration - water.elapsed) / 0.3);
      this.items.followWork(water.model, weight);
    }
    if (!document.hidden) {
      this.growthVisibility.update(this.camera);
      this.plotPriorities.clear();
      const cameraPosition = this.camera.entity.transform.worldPosition;
      const plots = this.snapshot.plots;
      const crops = this.snapshot.crops;
      const cellSize = this.snapshot.grid.cellSize;
      for (let i = 0; i < plots.length; i++) {
        const plot = plots[i];
        const entry = this.surfaceEntries.get(plot.plotId);
        if (!entry) continue;
        const plotPos = entry.view.root.transform.worldPosition;
        if (
          !this.growthVisibility.withinDrawDistance(plotPos, cameraPosition, !this.distanceHiddenPlots.has(plot.plotId))
        ) {
          this.distanceHiddenPlots.add(plot.plotId);
          continue;
        }
        this.distanceHiddenPlots.delete(plot.plotId);
        if (!plot.occupantId) continue;
        const crop = crops[plot.occupantId];
        const matrix = entry.view.root.transform.worldMatrix.elements;
        const m0 = matrix[0],
          m1 = matrix[1],
          m2 = matrix[2],
          m4 = matrix[4],
          m5 = matrix[5],
          m6 = matrix[6],
          m8 = matrix[8],
          m9 = matrix[9],
          m10 = matrix[10];
        let stretch = entry.stretch;
        if (
          entry.m0 !== m0 ||
          entry.m1 !== m1 ||
          entry.m2 !== m2 ||
          entry.m4 !== m4 ||
          entry.m5 !== m5 ||
          entry.m6 !== m6 ||
          entry.m8 !== m8 ||
          entry.m9 !== m9 ||
          entry.m10 !== m10
        ) {
          entry.m0 = m0;
          entry.m1 = m1;
          entry.m2 = m2;
          entry.m4 = m4;
          entry.m5 = m5;
          entry.m6 = m6;
          entry.m8 = m8;
          entry.m9 = m9;
          entry.m10 = m10;
          stretch = entry.stretch = Math.max(Math.hypot(m0, m4, m8), Math.hypot(m1, m5, m9), Math.hypot(m2, m6, m10));
        }
        const radius = (Math.max(cellSize, crop ? (this.cropRadii.get(crop.cropId) ?? 0) : 0) + 0.06) * stretch;
        this.plotPriorities.set(
          plot.plotId,
          this.growthVisibility.priority(plotPos, radius, cameraPosition, plot.plotId === this.target.plotId)
        );
      }
    }
    const now = performance.now();
    this.plants.update(now, this.readPlantVisibility, document.hidden);
  }
  /** The arc and movement interruption share this value; no independent UI timer. */
  private actionProgress(): number | null {
    const water = this.watering.workPose;
    const progress = !this.actionHint
      ? null
      : this.work
        ? this.work.done
          ? 1
          : this.work.elapsed / (this.tool.duration + workBlendSeconds * 2 + this.work.contactStops.length * 0.05)
        : water
          ? water.elapsed / WATERING_CONFIG.duration
          : (this.items.useProgress ?? null);
    if (progress !== null && this.actionMotion)
      this.actionMotion.progress = Math.max(this.actionMotion.progress, Math.min(1, progress));
    return progress;
  }

  private async prepareWork(input: Extract<FarmActionInput, { type: "hoe" }>, signal: AbortSignal): Promise<boolean> {
    const target = input.target;
    if (!target) return false;
    if (!(await this.tool.select(input.type)) || this.disposed || !this.active || signal.aborted) return false;
    const plot = plotAtTarget(this.snapshot.plots, target);
    const id = plot?.plotId ?? allocatePlotId(this.snapshot.plots, target);
    const bounds = plotBounds(this.snapshot.grid, target),
      x = (bounds.minimumX + bounds.maximumX) / 2,
      z = (bounds.minimumZ + bounds.maximumZ) / 2;
    // Sample before creating a preview. The new surface is visible immediately,
    // and a failed prepare used to leave it until the next sync.
    const sample = this.ground.capture().sample(target.groundId, x, z);
    if (!sample) return false;
    const preview: PlotState = plot ?? {
      ...target,
      plotId: id,
      label: "开垦预览",
      shapeSeed: shapeSeedForId(id),
      occupantId: null,
      ground: {
        availability: "available",
        reason: null,
        checkedAtSystemTimeMs: 0,
        groundRevision: this.ground.capture().revision
      },
      soil: {
        preparation: "leveled",
        moistureUnits: this.definitions.soilProfile.initialMoistureUnits,
        lastIrrigatedSimulationMs: null,
        phTenths: this.definitions.soilProfile.initialPhTenths
      }
    };
    let view = this.surfaces.get(id);
    if (!view) {
      view = createFarmingPlotSurface(
        this.root,
        this.snapshot.grid,
        this.ground,
        preview,
        this.soils,
        normalizeSoilMoisture(this.definitions.soilProfile, preview.soil.moistureUnits)
      );
      this.setSurface(id, view);
    }
    this.toolRoot.isActive = false;
    this.toolRoot.transform.setWorldPosition(
      x,
      sample.position[1] + DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset,
      z
    );
    const camera = this.camera.entity.transform.worldPosition,
      normal = new Vector3(...sample.normal),
      forward = new Vector3(x - camera.x, 0, z - camera.z);
    forward.subtract(normal.clone().scale(Vector3.dot(forward, normal))).normalize();
    // Authored tools work along local -Z, which is the front axis used by lookAt.
    this.toolRoot.transform.lookAt(this.toolRoot.transform.worldPosition.clone().add(forward), normal);
    view.work.setPreparation(plot?.soil.preparation ?? "raw");
    view.work.prepare(this.tool, input.type, this.toolRoot);
    const completed = new Promise<boolean>((resolve) => {
      this.work = {
        view: view!,
        plotId: id,
        type: input.type,
        done: false,
        resolve,
        cropId: input.type === "hoe" ? (plot?.occupantId ?? undefined) : undefined,
        elapsed: 0,
        preview: !plot ? preview : undefined,
        contactStops: view!.work.contactSamples
          .filter((sample, i, samples) => !i || sample.time - samples[i - 1].time > 0.15)
          .map((sample) => sample.time)
      };
    });
    if (!plot) this.soilWork?.begin(bounds);
    const availablePlots = collectAvailablePlots(this.snapshot.plots, this.availablePlots);
    this.boundaryPreview.refresh(availablePlots, this.surfaces, this.work?.preview);
    this.soils.setField(this.snapshot, this.surfaceRenderers, this.work?.preview);
    this.tool.play();
    return completed;
  }
  private finishWork(): void {
    const work = this.work;
    this.actionHint = undefined;
    this.selection.setProgress(null);
    this.items.setUsing(false);
    this.preparedWatering = undefined;
    this.watering.cancel();
    this.work = undefined;
    this.tool.playing = false;
    this.toolRoot.isActive = false;
    if (!work) {
      this.targetGroundRevision = -1;
      if (this.lockedTarget && !this.playerActionTarget) this.target = { ...this.lockedTarget };
      this.refreshSelection();
      return;
    }
    work.resolve(false);
    if (work.cropId) this.plants.cancelHarvestPreview(work.cropId);
    // The committed snapshot already synchronized neighbours and occupancy.
    // Restore/confirm only the preview; cancellation may have no stored plot.
    const stored = this.service.getSnapshot().plots.find((plot) => plot.plotId === work.plotId);
    if (work.preview) this.soilWork?.end(Boolean(stored));
    if (stored?.ground.availability === "available") {
      work.view.work.setPreparation(stored.soil.preparation);
    } else {
      work.view.work.dispose();
      work.view.root.destroy();
      this.removeSurface(work.plotId);
    }
    const availablePlots = collectAvailablePlots(this.snapshot.plots, this.availablePlots);
    this.boundaryPreview.refresh(availablePlots, this.surfaces);
    this.soils.setField(this.snapshot, this.surfaceRenderers);
    this.targetGroundRevision = -1;
    this.refreshSelection();
  }
  private showWatering(plotId: string, changes: readonly FarmChange[]): void {
    const view = this.surfaces.get(plotId);
    if (!view) return;
    const position = view.root.transform.worldPosition,
      camera = this.camera.entity.transform.worldPosition;
    const hold = {},
      affected = changes.flatMap((change) =>
        change.kind === "soil-moisture-changed" ? [this.surfaces.get(change.plotId)?.renderer].filter(Boolean) : []
      );
    affected.forEach((renderer) => this.soils.holdTransition(renderer!, true, hold));
    this.watering.request({
      id: plotId,
      position: [position.x, position.y + 0.035, position.z],
      yaw: (Math.atan2(camera.x - position.x, camera.z - position.z) * 180) / Math.PI + 180,
      releaseSoil: () => affected.forEach((renderer) => this.soils.holdTransition(renderer!, false, hold))
    });
  }
  /** Lightweight debug sampling; active counts are hierarchy/distance state, not GPU submissions. */
  getPerformanceDiagnostics() {
    let activePlots = 0;
    for (let i = 0; i < this.surfaceEntryList.length; i++) {
      const renderer = this.surfaceEntryList[i].view.renderer;
      if (renderer.enabled && renderer.entity.isActiveInHierarchy) activePlots++;
    }
    return {
      sourceId: this.root.instanceId,
      plots: this.surfaces.size,
      activePlots,
      soil: this.soils.batchPerformanceDiagnostics,
      crops: this.plants.getPerformanceDiagnostics()
    };
  }
  getDiagnostics() {
    const errors = [...this.loads]
      .filter(([, load]) => load.state === "error")
      .map(([id, load]) => `${id}: ${load.message}`);
    errors.push(...this.items.diagnostics.errors);
    if (this.error) errors.push(this.error);
    if (this.soils.loadError) errors.push(this.soils.loadError);
    if (this.watering.diagnostics.error) errors.push(this.watering.diagnostics.error);
    return {
      // Presenters explicitly report off-camera creation as deferred; visible loading and all errors still block.
      ready: this.soils.ready && !errors.length && ![...this.loads.values()].some((load) => load.state === "loading"),
      errors,
      plotCount: this.surfaces.size,
      soil: this.soils.batchDiagnostics,
      cropCount: Object.keys(this.snapshot.crops).length,
      growth: this.plants.growthDiagnostics,
      items: this.items.diagnostics,
      selection: {
        plotId: this.target.plotId,
        ground: this.target.ground,
        locked: this.lockedTarget !== null,
        visible: this.selection.root.isActiveInHierarchy,
        segmentCount: 0,
        style: "target-cue",
        outlineVisible: this.selection.outlineVisible
      }
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.actionMotion?.controller.abort();
    this.work?.resolve(false);
    this.finishWork();
    this.disposed = true;
    this.items.dispose();
    this.unsubscribe();
    this.unsubscribeGround();
    this.selection.dispose();
    this.tool.dispose();
    this.plants.dispose();
    for (let i = 0; i < this.surfaceEntryList.length; i++) this.surfaceEntryList[i].view.work.dispose();
    this.surfaces.clear();
    this.surfaceEntries.clear();
    this.surfaceEntryList.length = 0;
    this.surfaceRenderers.clear();
    this.previousPlotsMap.clear();
    this.availablePlots.length = 0;
    this.validPlotIds.clear();
    this.staleSurfaceIds.length = 0;
    this.cachedCropStates.clear();
    this.syncCropInputs.length = 0;
    this.selectionGround = undefined;
    this.selectionWorkSurface = undefined;
    this.selectionPlotPos = undefined;
    this.distanceHiddenPlots.clear();
    this.root.destroy();
    this.soils.dispose();
  }
}
