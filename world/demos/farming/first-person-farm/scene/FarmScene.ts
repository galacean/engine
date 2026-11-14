import { createFarmingPlotSurface } from "@galacean/engine-farming/farming/presentation/soil/FarmingPlotSurface";
import { FarmGround, FARM_GROUND_ID, FARM_GROUND_MESH } from "./FarmGround.ts";
import { FARM_GRID } from "../config/demo-config.ts";
import {
  inspectGround,
  plotBounds,
  plotIdForTarget,
  targetAtPoint,
  boundsIntersect,
  shapeSeedForId,
  type GroundTarget,
  type GroundBounds
} from "@galacean/engine-farming/farming/domain/FarmingGround";
import { normalizeSoilMoisture } from "@galacean/engine-farming/farming/domain/SoilMoisture";
import type { PlotState } from "@galacean/engine-farming/farming/domain/FarmState";
import type { FarmChange } from "@galacean/engine-farming/farming/domain/FarmCommands";
import { FarmingPropAnimationPlayer } from "@galacean/engine-farming/farming/presentation/props/FarmingPropAnimationPlayer";
import { SoilWorkPresenter } from "@galacean/engine-farming/farming/presentation/soil/SoilWorkPresenter";
import type { SoilWorkKind } from "@galacean/engine-farming/farming/domain/SoilCultivation";
import {
  BoundingBox,
  BoundingFrustum,
  Camera,
  Color,
  DirectLight,
  Engine,
  Entity,
  Matrix,
  MeshRenderer,
  ModelMesh,
  MeshTopology,
  PBRMaterial,
  PrimitiveMesh,
  Ray,
  Script,
  ShadowType,
  Vector3,
  Vector2
} from "@galacean/engine";
import { cropRenderState } from "@galacean/engine-farming/farming/presentation/PlantRenderState";
import { FARM_CROP_SCALES } from "../config/demo-config.ts";
import type { FarmSnapshot, FarmingDefinitionSet, PlotStatusView } from "@galacean/engine-farming/farming/domain/index";
import { getCropState, getFarmStatus } from "@galacean/engine-farming/farming/domain/index";
import { PlantPresenter, type PlantVisualLoadState } from "@galacean/engine-farming/farming/presentation/PlantPresenter";
import { FARM_EYE_HEIGHT, FARM_HALF_DEPTH, FARM_HALF_WIDTH, FARM_SOIL_SIZE, FARM_SOIL_Y } from "../config/demo-config.ts";
import { SoilVisualProvider, type SoilVisualTarget } from "@galacean/engine-farming/farming/presentation/soil/SoilVisualProvider";
import { SoilBoundary } from "@galacean/engine-farming/farming/presentation/soil/SoilBoundary";
import { SoilBoundaryPreview } from "@galacean/engine-farming/farming/presentation/soil/SoilBoundaryPreview";
import { DEFAULT_SOIL_VISUAL_CONFIG } from "@galacean/engine-farming/farming/presentation/soil/SoilVisualConfig";
import type { FarmItemPresentation } from "@galacean/engine-farming/farming/presentation/FarmItemPresentation";
import { WateringPresenter } from "@galacean/engine-farming/farming/presentation/watering/WateringPresenter";
import { DEFAULT_HARVEST_SECONDS } from "@galacean/engine-farming/farming/presentation/PlantHarvestEffect";

interface PlotLayout {
  readonly id: string;
  readonly worldX: number;
  readonly worldY: number;
  readonly worldZ: number;
}

interface PlotView {
  readonly root: Entity;
  readonly cropAnchor: Entity;
  readonly renderer: SoilVisualTarget;
  readonly work: SoilWorkPresenter;
  readonly boundary: SoilBoundary;
  readonly target: GroundTarget;
  /** Recomputed on creation and relevant terrain notifications, never in frame queries. */
  layout: PlotLayout | undefined;
  occupied: boolean;
  seeded: boolean;
  /** Local terrain/contour changes, independent of the provider's global evidence revision. */
  surfaceRevision: number;
}

function coordinates(vector: Vector3): readonly [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

export interface FarmSceneDiagnostics {
  readonly terrain: {
    readonly minimum: readonly number[];
    readonly maximum: readonly number[];
    readonly inCameraFrustum: boolean;
  };
  readonly watering: WateringPresenter["diagnostics"];
  readonly cultivation: { active: boolean; kind: SoilWorkKind | null; elapsed: number; temporary: boolean };
  readonly plots: readonly {
    plotId: string;
    position: readonly number[];
    cropPosition: readonly number[];
    minimum: readonly number[];
    maximum: readonly number[];
    preparation: string;
    uploads: number;
  }[];
  readonly growth: PlantPresenter["growthDiagnostics"];
  readonly harvestingCrops: PlantPresenter["harvestDiagnostics"];
  readonly selectedPlotId: string | null;
  readonly loadedPlantInstances: number;
  readonly loadedCropTriangles: number;
  readonly loadedCropRendererCount: number;
  readonly loadedCropShadowCasterCount: number;
  readonly plotCount: number;
  readonly rendererCount: number;
  readonly gpuMemoryBytes: number;
  readonly soilTexturesReady: boolean;
  readonly soilTextureCount: number;
  readonly soilMeshVertexCount: number;
  readonly seededPlotCount: number;
  readonly soilTextureError: string | null;
  readonly soilAppearance: readonly ({ readonly plotId: string } & NonNullable<
    ReturnType<SoilVisualProvider["getAppearance"]>
  >)[];
  readonly selectionSegmentCount: number;
  readonly selectionVisible: boolean;
  readonly plantingPreviewActive: boolean;
  readonly plantingPreviewPlotId: string | null;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraFieldOfView: number;
  readonly cameraAspectRatio: number;
  readonly cameraForward: readonly [number, number, number];
}

interface SceneOccluder {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

class FarmGrowthDriver extends Script {
  updateGrowth: () => void = () => undefined;
  override onLateUpdate(): void {
    this.updateGrowth();
  }
}

export class FarmScene {
  readonly camera: Camera;
  private readonly root: Entity;
  private readonly plotViews = new Map<string, PlotView>();
  private readonly plantPlots = new Map<string, string>();
  private readonly presenter: PlantPresenter;
  private readonly soilVisuals: SoilVisualProvider;
  private readonly watering: WateringPresenter;
  items?: FarmItemPresentation;
  private readonly selectedFrame: Entity;
  private readonly selectionRenderers: readonly MeshRenderer[];
  private readonly selectionMaterial: PBRMaterial;
  private readonly irrigationMaterial: PBRMaterial;
  private readonly plantingPreview: Entity;
  private readonly occluders: SceneOccluder[] = [];
  private readonly labelVisibilityRay = new Ray();
  private readonly labelVisibilityDirection = new Vector3();
  private selectionFeedbackTimer: number | null = null;
  private snapshot: FarmSnapshot | null = null;
  private terrainMesh!: ModelMesh;
  private terrainPositions: Vector3[] = [];
  private terrainColors: Color[] = [];
  private unsubscribeGround: (() => void) | null = null;
  private readonly toolRoot: Entity;
  private readonly toolPlayer: FarmingPropAnimationPlayer;
  private workGeneration = 0;
  private readonly boundaryPreview = new SoilBoundaryPreview();
  private activeWork: {
    cropId?: string;
    dissolveRequested?: boolean;
    view: PlotView;
    kind: SoilWorkKind;
    temporary: boolean;
    resolve: (done: boolean) => void;
    ended: boolean;
  } | null = null;
  private selectedPlotId: string | null = null;
  private plantingPreviewPlotId: string | null = null;
  private disposed = false;
  private readonly growthFrustum = new BoundingFrustum();
  private readonly growthViewProjection = new Matrix();
  private readonly growthBounds = new BoundingBox();
  private readonly growthPriority = (instanceId: string): number =>
    this.plotGrowthPriority(this.snapshot?.crops[instanceId]?.anchorPlotId ?? "");
  private readonly plotGrowthPriority = (plotId: string): number => {
    const plot = this.layout(plotId);
    if (!plot) return -1;
    // Conservative plot envelope: current farm crops fit within two metres above their anchor.
    this.growthBounds.min.set(plot.worldX - FARM_SOIL_SIZE, plot.worldY, plot.worldZ - FARM_SOIL_SIZE);
    this.growthBounds.max.set(plot.worldX + FARM_SOIL_SIZE, plot.worldY + 2, plot.worldZ + FARM_SOIL_SIZE);
    if (!this.growthFrustum.intersectsBox(this.growthBounds)) return -1;
    if (plotId === this.selectedPlotId) return 2;
    const camera = this.camera.entity.transform.worldPosition;
    return Math.hypot(plot.worldX - camera.x, plot.worldZ - camera.z) < 6 ? 1 : 0;
  };

  constructor(
    private readonly engine: Engine,
    private readonly definitions: FarmingDefinitionSet,
    onLoadState: (plotId: string, state: PlantVisualLoadState, message?: string) => void,
    readonly ground: FarmGround
  ) {
    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.54, 0.69, 0.78, 1);
    scene.ambientLight.diffuseSolidColor = new Color(0.74, 0.72, 0.58, 1);
    scene.ambientLight.diffuseIntensity = 0.72;
    scene.castShadows = true;
    scene.shadowDistance = 24;
    this.root = scene.createRootEntity("first-person-farm");

    const cameraEntity = this.root.createChild("farm-camera");
    cameraEntity.transform.setPosition(-2, FARM_EYE_HEIGHT, 7);
    cameraEntity.transform.lookAt(new Vector3(-2, 0.4, 0));
    this.camera = cameraEntity.addComponent(Camera);
    this.camera.fieldOfView = 65;
    this.camera.nearClipPlane = 0.05;
    this.camera.farClipPlane = 80;

    const light = this.root.createChild("morning-sun");
    light.transform.setRotation(-46, -28, 0);
    const sun = light.addComponent(DirectLight);
    sun.color = new Color(0.94, 0.85, 0.66, 1);
    sun.shadowType = ShadowType.SoftLow;
    scene.sun = sun;

    this.soilVisuals = new SoilVisualProvider(engine, FARM_SOIL_SIZE);
    this.watering = WateringPresenter.create(this.root);
    this.watering.showProp = false;
    this.toolRoot = this.root.createChild("soil-tool-action");
    this.toolPlayer = new FarmingPropAnimationPlayer(this.toolRoot);
    this.toolPlayer.loop = false;
    this.toolRoot.isActive = false;
    this.createTerrain();
    const selection = this.createFarmPlots();
    this.selectedFrame = selection.root;
    this.selectionRenderers = selection.renderers;
    this.selectionMaterial = selection.material;
    this.irrigationMaterial = createMaterial(this.engine, "irrigation-selection", new Color(0.37, 0.67, 0.78, 1), 0.72);
    this.plantingPreview = this.createPlantingPreview();
    this.createFieldDetails();
    this.unsubscribeGround = ground.subscribe((change) => {
      this.cancelSoilWork();
      this.updateTerrain();
      this.refreshGroundViews(change.bounds);
    });
    this.presenter = new PlantPresenter(
      engine,
      definitions.catalog,
      (state) => {
        const plotId = this.snapshot?.crops[state.instanceId]?.anchorPlotId;
        const anchor = plotId ? this.plotViews.get(plotId)?.cropAnchor : undefined;
        const scale = FARM_CROP_SCALES[state.cropId];
        anchor?.transform.setScale(scale, scale, scale);
        return anchor;
      },
      (id, state, message) => {
        const plotId = this.plantPlots.get(id);
        if (plotId) onLoadState(plotId, state, message);
      },
      {
        maximumShadowTrianglesPerInstance: 5_000,
        schedule: { budgetMs: 0.75, selectedHz: 20, nearHz: 10, farHz: 2 }
      }
    );
    this.root.addComponent(FarmGrowthDriver).updateGrowth = () => {
      if (this.disposed) return;
      // Presentation follows real time even when the engine caps simulation deltas at low FPS.
      this.items?.update(this.engine.time.actualDeltaTime);
      if (this.activeWork && !this.activeWork.ended) {
        this.toolPlayer.update(this.engine.time.actualDeltaTime);
        const work = this.activeWork;
        if (work.kind === "hoe") {
          const progress = work.view.work.seek(this.toolPlayer.elapsed);
          this.boundaryPreview.seek(progress);
          this.soilVisuals.setPreviewProgress(progress);
        }
        if (work.cropId && this.toolPlayer.elapsed >= work.view.work.firstContactTime) {
          if (!work.dissolveRequested) {
            work.dissolveRequested = true;
            this.presenter.beginHarvestPreview(
              work.cropId,
              Math.min(DEFAULT_HARVEST_SECONDS, this.toolPlayer.duration - work.view.work.firstContactTime)
            );
          }
          this.presenter.seekHarvestPreview(work.cropId, this.toolPlayer.elapsed - work.view.work.firstContactTime);
        }
        if (!this.toolPlayer.playing && this.toolPlayer.elapsed >= this.toolPlayer.duration) {
          this.activeWork.ended = true;
          this.activeWork.resolve(true);
        }
      }
      this.soilVisuals.update(this.engine.time.actualDeltaTime);
      if (!document.hidden) {
        Matrix.multiply(this.camera.projectionMatrix, this.camera.viewMatrix, this.growthViewProjection);
        this.growthFrustum.calculateFromMatrix(this.growthViewProjection);
      }
      this.presenter.update(performance.now(), this.growthPriority, document.hidden);
    };
  }

  sync(
    snapshot: FarmSnapshot,
    snap = false,
    changes: readonly FarmChange[] = [],
    statuses: readonly PlotStatusView[] = getFarmStatus(snapshot, this.definitions)
  ): void {
    const statusByPlot = new Map(statuses.map((status) => [status.plotId, status]));
    const activePlotIds = new Set(snapshot.plots.map((plot) => plot.plotId));
    // Confirmed harvest and hoe removal share the dissolve; plot deletion removes the visual directly.
    // Run before reconciliation so the original visual is still available.
    if (this.snapshot)
      for (const id of Object.keys(this.snapshot.crops)) {
        if (!snapshot.crops[id]) {
          if (
            [
              ...changes,
              ...snapshot.recentReceipts
                .filter((r) => r.committedRevision > this.snapshot!.revision)
                .flatMap((r) => r.changes)
            ].some(
              (c) =>
                (c.kind === "crop-harvested" || (c.kind === "crop-removed" && c.reason === "hoe")) &&
                c.cropInstanceId === id
            )
          )
            this.presenter.harvest(id);
          else this.presenter.remove(id);
        }
      }
    this.snapshot = snapshot;
    for (const crop of Object.values(snapshot.crops)) this.plantPlots.set(crop.instanceId, crop.anchorPlotId);
    for (const plot of snapshot.plots) {
      const view = this.plotViews.get(plot.plotId) ?? this.createPlotView(plot);
      const status = statusByPlot.get(plot.plotId)!;
      view.occupied = Boolean(status.crop);
      view.seeded = status.crop?.stageId === "seeded";
      if (this.activeWork?.view !== view && view.work.field.summary().preparation !== plot.soil.preparation)
        view.work.setPreparation(plot.soil.preparation);
      view.work.setMoisture(normalizeSoilMoisture(this.definitions.soilProfile, plot.soil.moistureUnits));
      view.root.isActive = plot.ground.availability !== "unloaded";
      this.positionPlot(view);
    }
    for (const [id, view] of this.plotViews) {
      if (!activePlotIds.has(id) && this.activeWork?.view !== view) {
        view.work.dispose();
        view.root.destroy();
        this.plotViews.delete(id);
      }
    }
    this.refreshSoilBoundaries();
    this.presenter.sync(
      Object.values(snapshot.crops).map((c) => cropRenderState(this.definitions.catalog, c)),
      snap
    );
    // Removed instances still need their previous plot while sync emits the empty state.
    for (const id of this.plantPlots.keys()) if (!snapshot.crops[id]) this.plantPlots.delete(id);
  }

  setSelectedPlot(plotId: string | null): void {
    this.selectedPlotId = plotId;
    this.selectionMaterial.baseColor.set(0.8, 0.73, 0.48, 1);
    const plot = plotId ? this.layout(plotId) : undefined;
    this.selectedFrame.isActive = Boolean(plot);
    if (plot) this.conformIndicator(this.selectedFrame, plot.worldX, plot.worldZ, FARM_SOIL_Y);
  }

  flashIrrigation(plotId: string, affectedIds: readonly string[] = [plotId]): void {
    const plot = this.layout(plotId);
    const view = this.plotViews.get(plotId);
    if (plot && view) {
      const affected = affectedIds.flatMap((id) => {
        const v = this.plotViews.get(id);
        return v ? [v.renderer] : [];
      });
      const hold = {};
      affected.forEach((renderer) => this.soilVisuals.holdTransition(renderer, true, hold));
      const camera = this.camera.entity.transform.worldPosition;
      this.watering.request({
        id: plotId,
        position: [plot.worldX, plot.worldY + 0.035, plot.worldZ],
        // Orient the authored right-hand pose relative to the viewer, not the world axes.
        yaw: (Math.atan2(camera.x - plot.worldX, camera.z - plot.worldZ) * 180) / Math.PI + 180,
        releaseSoil: () => affected.forEach((renderer) => this.soilVisuals.holdTransition(renderer, false, hold))
      });
    }
    if (plotId !== this.selectedPlotId) return;
    if (this.selectionFeedbackTimer !== null) window.clearTimeout(this.selectionFeedbackTimer);
    for (const renderer of this.selectionRenderers) renderer.setMaterial(this.irrigationMaterial);
    this.selectionFeedbackTimer = window.setTimeout(() => {
      this.selectionFeedbackTimer = null;
      if (this.disposed) return;
      for (const renderer of this.selectionRenderers) renderer.setMaterial(this.selectionMaterial);
    }, 520);
  }

  setPlantingPreview(plotId: string | null): void {
    const plot = plotId ? this.layout(plotId) : undefined;
    this.plantingPreviewPlotId = plot?.id ?? null;
    this.plantingPreview.isActive = Boolean(plot);
    if (plot) this.conformIndicator(this.plantingPreview, plot.worldX, plot.worldZ, 0.1);
  }

  retryCropVisual(plotId: string): void {
    const id = this.snapshot?.plots.find((p) => p.plotId === plotId)?.occupantId;
    if (id) this.presenter.retry(id);
  }

  isCropLabelVisible(plotId: string, worldPoint: Vector3): boolean {
    const cameraPosition = this.camera.entity.transform.worldPosition;
    const direction = this.labelVisibilityDirection.copyFrom(worldPoint).subtract(cameraPosition);
    const targetDistance = direction.length();
    if (targetDistance <= 1e-4) return true;
    direction.normalize();
    this.labelVisibilityRay.origin.copyFrom(cameraPosition);
    this.labelVisibilityRay.direction.copyFrom(direction);
    const maximumDistance = targetDistance - 0.08;
    for (const occluder of this.occluders) {
      if (intersectAabb(this.labelVisibilityRay, occluder.min, occluder.max, maximumDistance) !== null) return false;
    }
    for (const plot of this.snapshot?.plots ?? []) {
      if (!plot.occupantId || plot.plotId === plotId) continue;
      const layout = this.layout(plot.plotId);
      const crop = getCropState(this.snapshot!, plot);
      if (!layout || !crop) continue;
      const height = 1.02;
      if (
        intersectAabb(
          this.labelVisibilityRay,
          [layout.worldX - 0.38, layout.worldY, layout.worldZ - 0.38],
          [layout.worldX + 0.38, layout.worldY + height, layout.worldZ + 0.38],
          maximumDistance
        ) !== null
      ) {
        return false;
      }
    }
    return true;
  }

  resolveInteractionTarget(
    ray: Ray,
    maximumDistance: number
  ): {
    plotId: string | null;
    distance: number | null;
    ground: GroundTarget | null;
  } {
    const hit = this.ground.capture().raycast(
      {
        origin: [ray.origin.x, ray.origin.y, ray.origin.z],
        direction: [ray.direction.x, ray.direction.y, ray.direction.z]
      },
      maximumDistance
    );
    let target = hit ? targetAtPoint(FARM_GRID, hit.groundId, hit.position[0], hit.position[2]) : null;
    let plotId = target
      ? (this.snapshot?.plots.find(
          (p) => p.groundId === target!.groundId && p.cellX === target!.cellX && p.cellZ === target!.cellZ
        )?.plotId ?? null)
      : null;
    let distance = hit?.distance ?? Infinity;
    for (const plot of this.snapshot?.plots ?? []) {
      if (!plot.occupantId || plot.ground.availability === "unloaded") continue;
      const layout = this.layout(plot.plotId);
      if (!layout) continue;
      const cropDistance = intersectAabb(
        ray,
        [layout.worldX - 0.38, layout.worldY, layout.worldZ - 0.38],
        [layout.worldX + 0.38, layout.worldY + 0.92, layout.worldZ + 0.38],
        maximumDistance
      );
      if (cropDistance !== null && cropDistance < distance) {
        plotId = plot.plotId;
        distance = cropDistance;
        target = plot;
      }
    }
    for (const occluder of this.occluders) {
      const d = intersectAabb(ray, occluder.min, occluder.max, maximumDistance);
      if (d !== null && d < distance) {
        this.selectedFrame.isActive = false;
        return { plotId: null, distance: d, ground: null };
      }
    }
    if (!plotId && target) this.showGroundTarget(target);
    else if (!plotId) this.selectedFrame.isActive = false;
    return {
      plotId,
      distance: Number.isFinite(distance) ? distance : null,
      ground: target
    };
  }

  showGroundTarget(target: GroundTarget): void {
    const adjacent = this.snapshot?.plots.some(
      (plot) =>
        plot.groundId === target.groundId &&
        plot.ground.availability !== "unloaded" &&
        Math.abs(plot.cellX - target.cellX) + Math.abs(plot.cellZ - target.cellZ) <= 1
    );
    this.selectedFrame.isActive = Boolean(adjacent);
    if (!adjacent) return;
    const bounds = plotBounds(FARM_GRID, target);
    const valid = inspectGround(this.ground.capture(), FARM_GRID, target).canCultivate;
    this.selectionMaterial.baseColor.set(valid ? 0.66 : 0.94, valid ? 0.83 : 0.36, valid ? 0.45 : 0.25, 1);
    this.selectedFrame.isActive = true;
    this.conformIndicator(
      this.selectedFrame,
      (bounds.minimumX + bounds.maximumX) / 2,
      (bounds.minimumZ + bounds.maximumZ) / 2,
      FARM_SOIL_Y
    );
  }

  getPlotPosition(plotId: string): readonly [number, number, number] | null {
    const p = this.layout(plotId);
    return p ? [p.worldX, p.worldY, p.worldZ] : null;
  }

  getSowingSurface(plotId: string) {
    const view = this.plotViews.get(plotId);
    if (!view?.root.isActive || !view.layout) return null;
    const p = view.root.transform.worldPosition;
    const center: readonly [number, number] = [p.x, p.z];
    return {
      center,
      heightAt: (x: number, z: number) => p.y + view.work.heightAt(x - p.x, z - p.z)
    };
  }

  async playSoilWork(target: GroundTarget, kind: SoilWorkKind): Promise<boolean> {
    this.cancelSoilWork();
    const generation = ++this.workGeneration;
    const plot = this.snapshot?.plots.find(
      (p) => p.groundId === target.groundId && p.cellX === target.cellX && p.cellZ === target.cellZ
    );
    const bounds = plotBounds(FARM_GRID, target),
      x = (bounds.minimumX + bounds.maximumX) / 2,
      z = (bounds.minimumZ + bounds.maximumZ) / 2;
    const sample = this.ground.capture().sample(target.groundId, x, z);
    if (!sample) return false;
    try {
      if (
        !(await this.toolPlayer.select(kind)) ||
        generation !== this.workGeneration ||
        this.disposed
      )
        return false;
      const view = plot
        ? this.plotViews.get(plot.plotId)!
        : this.createPlotView({
            ...target,
            plotId: plotIdForTarget(target),
            label: "开垦预览",
            shapeSeed: shapeSeedForId(plotIdForTarget(target)),
            occupantId: null,
            ground: {
              availability: "available",
              reason: null,
              groundRevision: this.ground.capture().revision,
              checkedAtSystemTimeMs: 0
            },
            soil: {
              preparation: "leveled",
              moistureUnits: this.definitions.soilProfile.initialMoistureUnits,
              lastIrrigatedSimulationMs: null,
              phTenths: this.definitions.soilProfile.initialPhTenths
            }
          });
      view.work.setPreparation(plot?.soil.preparation ?? "raw");
      this.toolRoot.isActive = false;
      this.toolRoot.transform.setWorldPosition(x, sample.position[1] + DEFAULT_SOIL_VISUAL_CONFIG.soil.edge.surfaceOffset, z);
      const normal = new Vector3(...sample.normal),
        forward = new Vector3(
          x - this.camera.entity.transform.worldPosition.x,
          0,
          z - this.camera.entity.transform.worldPosition.z
        );
      forward.subtract(normal.clone().scale(Vector3.dot(forward, normal))).normalize();
      this.toolRoot.transform.lookAt(this.toolRoot.transform.worldPosition.clone().add(forward), normal);
      let resolve!: (done: boolean) => void;
      const completed = new Promise<boolean>((done) => {
        resolve = done;
      });
      this.activeWork = {
        view,
        kind,
        temporary: !plot,
        resolve,
        ended: false,
        cropId: kind === "hoe" ? (plot?.occupantId ?? undefined) : undefined
      };
      this.refreshSoilBoundaries();
      view.work.prepare(this.toolPlayer, kind, this.toolRoot);
      this.toolPlayer.play();
      return await completed;
    } catch (error) {
      this.finishSoilWork();
      throw error;
    }
  }

  cancelSoilWork(): void {
    this.workGeneration++;
    this.activeWork?.resolve(false);
    this.finishSoilWork();
  }
  finishSoilWork(): void {
    const active = this.activeWork;
    this.activeWork = null;
    this.toolPlayer.playing = false;
    this.toolRoot.isActive = false;
    if (!active) return;
    if (active.cropId) this.presenter.cancelHarvestPreview(active.cropId);
    const stored = this.snapshot?.plots.find((p) => p.plotId === active.view.root.name);
    if (stored) {
      active.view.work.setPreparation(stored.soil.preparation);
    } else {
      active.view.work.dispose();
      active.view.root.destroy();
      for (const [id, v] of this.plotViews) if (v === active.view) this.plotViews.delete(id);
    }
    this.refreshSoilBoundaries();
  }

  focusPlot(plotId: string): boolean {
    const plot = this.layout(plotId);
    if (!plot) return false;
    this.camera.entity.transform.setWorldPosition(plot.worldX, plot.worldY + FARM_EYE_HEIGHT, plot.worldZ + 2.7);
    this.camera.entity.transform.lookAt(new Vector3(plot.worldX, plot.worldY, plot.worldZ));
    return true;
  }

  getDiagnostics(): Readonly<FarmSceneDiagnostics> {
    const position = this.camera.entity.transform.worldPosition;
    const forward = this.camera.entity.transform.worldForward;
    const viewProjection = new Matrix();
    Matrix.multiply(this.camera.projectionMatrix, this.camera.viewMatrix, viewProjection);
    const frustum = new BoundingFrustum(viewProjection);
    return Object.freeze({
      terrain: {
        minimum: coordinates(this.terrainMesh.bounds.min),
        maximum: coordinates(this.terrainMesh.bounds.max),
        inCameraFrustum: frustum.intersectsBox(this.terrainMesh.bounds)
      },
      watering: this.watering.diagnostics,
      cultivation: {
        active: Boolean(this.activeWork),
        kind: this.activeWork?.kind ?? null,
        elapsed: this.toolPlayer.elapsed,
        temporary: this.activeWork?.temporary ?? false
      },
      plots: [...this.plotViews].map(([plotId, view]) => ({
        plotId,
        position: [
          view.root.transform.worldPosition.x,
          view.root.transform.worldPosition.y,
          view.root.transform.worldPosition.z
        ],
        cropPosition: [
          view.cropAnchor.transform.worldPosition.x,
          view.cropAnchor.transform.worldPosition.y,
          view.cropAnchor.transform.worldPosition.z
        ],
        minimum: coordinates(view.renderer.bounds.min),
        maximum: coordinates(view.renderer.bounds.max),
        preparation: view.work.field.summary().preparation,
        uploads: view.work.summary().uploads
      })),
      growth: {
        ...this.presenter.growthDiagnostics,
        plants: this.presenter.growthDiagnostics.plants.map((p) => ({
          ...p,
          plotId: this.snapshot?.crops[p.instanceId]?.anchorPlotId
        }))
      },
      harvestingCrops: this.presenter.harvestDiagnostics,
      selectedPlotId: this.selectedPlotId,
      loadedPlantInstances: this.presenter.loadedInstanceCount,
      loadedCropTriangles: this.presenter.loadedTriangleCount,
      loadedCropRendererCount: this.presenter.loadedRendererCount,
      loadedCropShadowCasterCount: this.presenter.loadedShadowCasterCount,
      plotCount: this.plotViews.size,
      rendererCount: this.root.getComponentsIncludeChildren(MeshRenderer, []).length,
      gpuMemoryBytes: this.engine.renderingStatistics.totalMemory,
      soilTexturesReady: this.soilVisuals.ready,
      soilTextureCount: this.soilVisuals.loadedTextureCount,
      soilMeshVertexCount: this.soilVisuals.vertexCount,
      seededPlotCount: [...this.plotViews.values()].filter((view) => view.seeded).length,
      soilTextureError: this.soilVisuals.loadError,
      soilAppearance: [...this.plotViews].flatMap(([plotId, view]) => {
        const appearance = this.soilVisuals.getAppearance(view.renderer);
        return appearance ? [{ plotId, ...appearance }] : [];
      }),
      selectionSegmentCount: this.selectionRenderers.length,
      selectionVisible: this.selectedFrame.isActive,
      plantingPreviewActive: this.plantingPreviewPlotId !== null,
      plantingPreviewPlotId: this.plantingPreviewPlotId,
      cameraPosition: Object.freeze([position.x, position.y, position.z] as const),
      cameraFieldOfView: this.camera.fieldOfView,
      cameraAspectRatio: this.camera.aspectRatio,
      cameraForward: Object.freeze([forward.x, forward.y, forward.z] as const)
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.selectionFeedbackTimer !== null) window.clearTimeout(this.selectionFeedbackTimer);
    this.cancelSoilWork();
    this.unsubscribeGround?.();
    this.toolPlayer.dispose();
    this.items?.dispose();
    for (const view of this.plotViews.values()) view.work.dispose();
    this.plotViews.clear();
    this.watering.entity.destroy();
    this.presenter.dispose();
    this.plantPlots.clear();
    if (!this.root.destroyed) this.root.destroy();
    this.terrainMesh.destroy();
    this.soilVisuals.dispose();
  }

  private createTerrain(): void {
    const terrain = this.root.createChild("continuous-terrain");
    const renderer = terrain.addComponent(MeshRenderer);
    const { stride, half, step } = FARM_GROUND_MESH;
    this.terrainMesh = new ModelMesh(this.engine, "Farm canonical ground");
    const indices: number[] = [],
      uvs = [];
    for (let row = 0; row < stride; row++)
      for (let col = 0; col < stride; col++) {
        this.terrainPositions.push(new Vector3(-half + col * step, 0, -half + row * step));
        this.terrainColors.push(new Color(1, 1, 1, 1));
        uvs.push(new Vector2(col / (stride - 1), row / (stride - 1)));
        if (row < stride - 1 && col < stride - 1) {
          const a = row * stride + col,
            b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    this.terrainMesh.setPositions(this.terrainPositions);
    this.terrainMesh.setUVs(uvs);
    this.terrainMesh.setIndices(new Uint16Array(indices));
    this.terrainMesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
    renderer.mesh = this.terrainMesh;
    this.soilVisuals.applyPerimeter(renderer);
    renderer.enableVertexColor = true;
    renderer.castShadows = false;
    renderer.receiveShadows = true;
    this.updateTerrain();
  }

  private updateTerrain(): void {
    const view = this.ground.capture(),
      normals: Vector3[] = [];
    let minimumY = Infinity,
      maximumY = -Infinity;
    for (let i = 0; i < this.terrainPositions.length; i++) {
      const p = this.terrainPositions[i],
        sample = view.sample(FARM_GROUND_ID, p.x, p.z)!;
      p.y = sample.position[1];
      minimumY = Math.min(minimumY, p.y);
      maximumY = Math.max(maximumY, p.y);
      normals.push(new Vector3(...sample.normal));
      this.terrainColors[i].set(
        sample.surface === "rock" ? 0.62 : 1,
        sample.surface === "rock" ? 0.63 : 1,
        sample.surface === "rock" ? 0.6 : 1,
        1
      );
    }
    this.terrainMesh.setPositions(this.terrainPositions);
    this.terrainMesh.setNormals(normals);
    this.terrainMesh.setColors(this.terrainColors);
    // ModelMesh does not derive bounds from positions; keep culling in sync with the heightfield.
    const { half } = FARM_GROUND_MESH;
    this.terrainMesh.bounds.min.set(-half, minimumY, -half);
    this.terrainMesh.bounds.max.set(half, maximumY, half);
    this.terrainMesh.calculateTangents();
    this.terrainMesh.uploadData(false);
  }

  private layout(plotId: string): PlotLayout | undefined {
    return this.plotViews.get(plotId)?.layout;
  }
  private createPlotView(plot: PlotState): PlotView {
    const { root, renderer, cropAnchor, work, boundary } = createFarmingPlotSurface(
      this.root,
      FARM_GRID,
      this.ground,
      plot,
      this.soilVisuals,
      normalizeSoilMoisture(this.definitions.soilProfile, plot.soil.moistureUnits)
    );
    const view: PlotView = {
      root,
      renderer,
      cropAnchor,
      work,
      boundary,
      target: plot,
      layout: undefined,
      occupied: false,
      seeded: false,
      surfaceRevision: 0
    };
    this.positionPlot(view, true);
    this.plotViews.set(plot.plotId, view);
    return view;
  }
  private refreshSoilBoundaries(): void {
    const cells = [...this.plotViews]
      .filter(([id, view]) => view.root.isActive && view.layout && this.snapshot?.plots.some(plot => plot.plotId === id))
      .map(([plotId, view]) => ({ plotId, ...view.target }));
    const work = this.activeWork;
    const preview = work?.temporary ? { plotId: work.view.root.name, ...work.view.target } : undefined;
    for (const id of this.boundaryPreview.refresh(cells, this.plotViews, preview))
      this.plotViews.get(id)!.surfaceRevision++;
    if (this.snapshot)
      this.soilVisuals.setField(
        this.snapshot,
        new Map([...this.plotViews].map(([id, view]) => [id, view.renderer])),
        preview
      );
  }

  private positionPlot(view: PlotView, refresh = false): void {
    if (refresh) {
      const inspection = inspectGround(this.ground.capture(), FARM_GRID, view.target);
      const position = inspection.reason === "GROUND_MISSING" ? null : inspection.position;
      view.layout = position
        ? {
            id: view.root.name,
            worldX: position[0],
            worldY: position[1],
            worldZ: position[2]
          }
        : undefined;
    }
    const layout = view.layout;
    if (!layout) {
      view.root.isActive = false;
      return;
    }
    view.root.transform.setWorldPosition(layout.worldX, layout.worldY, layout.worldZ);
  }
  private refreshGroundViews(bounds?: GroundBounds): void {
    for (const view of this.plotViews.values())
      if (!bounds || boundsIntersect(plotBounds(FARM_GRID, view.target), bounds)) {
        this.positionPlot(view, true);
        view.work.refreshSurface(true);
        view.surfaceRevision++;
      }
    this.refreshSoilBoundaries();
    if (this.selectedPlotId) this.setSelectedPlot(this.selectedPlotId);
    if (this.plantingPreviewPlotId) this.setPlantingPreview(this.plantingPreviewPlotId);
  }
  private conformIndicator(root: Entity, x: number, z: number, offset: number): void {
    const view = this.ground.capture(),
      center = view.sample(FARM_GROUND_ID, x, z);
    if (!center) {
      root.isActive = false;
      return;
    }
    root.transform.setWorldPosition(x, center.position[1], z);
    for (const child of root.children) {
      const p = child.transform.position,
        sample = view.sample(FARM_GROUND_ID, x + p.x, z + p.z);
      child.transform.setPosition(p.x, (sample?.position[1] ?? center.position[1]) - center.position[1] + offset, p.z);
    }
  }

  private createFarmPlots(): Readonly<{
    root: Entity;
    renderers: readonly MeshRenderer[];
    material: PBRMaterial;
  }> {
    const selection = this.root.createChild("selected-plot-frame");
    const material = createMaterial(this.engine, "selected-plot", new Color(0.8, 0.73, 0.48, 1), 0.76);
    const thickness = 0.028;
    const cornerLength = 0.2;
    const half = FARM_GRID.cellSize / 2 + 0.03;
    const center = half - cornerLength / 2;
    for (const xSign of [-1, 1]) {
      for (const zSign of [-1, 1]) {
        createCuboid(
          this.engine,
          selection,
          `corner-x-${xSign}-${zSign}`,
          [xSign * center, 0, zSign * half],
          [cornerLength, 0.018, thickness],
          material
        );
        createCuboid(
          this.engine,
          selection,
          `corner-z-${xSign}-${zSign}`,
          [xSign * half, 0, zSign * center],
          [thickness, 0.018, cornerLength],
          material
        );
      }
    }
    selection.isActive = false;
    return Object.freeze({
      root: selection,
      renderers: selection.getComponentsIncludeChildren(MeshRenderer, []),
      material
    });
  }

  private createFieldDetails(): void {
    const fenceMaterial = createMaterial(this.engine, "sun-aged-timber", new Color(0.36, 0.24, 0.13, 1), 0.88);
    const postMesh = PrimitiveMesh.createCuboid(this.engine, 0.12, 0.72, 0.12);
    const fenceX = FARM_HALF_WIDTH + 0.7;
    const fenceZ = FARM_HALF_DEPTH + 0.7;
    for (const x of [-fenceX, fenceX]) {
      for (const z of [-fenceZ, 0, fenceZ]) {
        const post = this.root.createChild("field-post");
        post.transform.setPosition(x, 0.32, z);
        const renderer = post.addComponent(MeshRenderer);
        renderer.mesh = postMesh;
        renderer.setMaterial(fenceMaterial);
        renderer.castShadows = true;
        this.occluders.push({
          min: [x - 0.06, -0.04, z - 0.06],
          max: [x + 0.06, 0.68, z + 0.06]
        });
      }
    }
    const crateMaterial = createMaterial(this.engine, "harvest-crate", new Color(0.48, 0.3, 0.12, 1), 0.82);
    const crateX = FARM_HALF_WIDTH + 1.1;
    const crateZ = FARM_HALF_DEPTH + 0.4;
    createCuboid(this.engine, this.root, "harvest-crate", [crateX, 0.3, crateZ], [1.3, 0.6, 1], crateMaterial);
    this.occluders.push({
      min: [crateX - 0.65, 0, crateZ - 0.5],
      max: [crateX + 0.65, 0.6, crateZ + 0.5]
    });
  }

  private createPlantingPreview(): Entity {
    const preview = this.root.createChild("planting-preview");
    const pointMesh = PrimitiveMesh.createSphere(this.engine, 0.055, 10);
    const pointMaterial = createMaterial(this.engine, "valid-planting-preview", new Color(0.42, 0.72, 0.3, 1), 0.76);
    for (const [index, position] of [
      [0, 0.025, 0],
      [-0.18, 0.02, -0.12],
      [0.18, 0.02, -0.12],
      [-0.18, 0.02, 0.12],
      [0.18, 0.02, 0.12]
    ].entries()) {
      const point = preview.createChild(`planting-point-${index + 1}`);
      point.transform.setPosition(...(position as [number, number, number]));
      const renderer = point.addComponent(MeshRenderer);
      renderer.mesh = pointMesh;
      renderer.setMaterial(pointMaterial);
      renderer.castShadows = false;
      renderer.receiveShadows = true;
    }
    preview.isActive = false;
    return preview;
  }
}

function intersectAabb(
  ray: Ray,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  maximumDistance: number
): number | null {
  const origin = [ray.origin.x, ray.origin.y, ray.origin.z];
  const direction = [ray.direction.x, ray.direction.y, ray.direction.z];
  let near = 0;
  let far = maximumDistance;
  for (let axis = 0; axis < 3; axis++) {
    if (Math.abs(direction[axis]) < 1e-8) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }
    let first = (min[axis] - origin[axis]) / direction[axis];
    let second = (max[axis] - origin[axis]) / direction[axis];
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return near <= maximumDistance && far >= 0 ? near : null;
}

function createMaterial(engine: Engine, name: string, color: Color, roughness: number): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = name;
  material.baseColor = color;
  material.metallic = 0;
  material.roughness = roughness;
  return material;
}

function createCuboid(
  engine: Engine,
  parent: Entity,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: PBRMaterial
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(...position);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, ...size);
  renderer.setMaterial(material);
  renderer.castShadows = true;
  renderer.receiveShadows = true;
  return entity;
}
