import { PlanningWindRuntime } from "../spatial/runtime/PlanningWindRuntime";
import { PlanningWaterRuntime, type PreparedPlanningWater } from "../spatial/runtime/PlanningWaterRuntime";
import { PlanningProductionRuntime } from "../spatial/runtime/PlanningProductionRuntime";
import { PLANNING_RUNTIME_OPTIONS } from "../spatial/runtime/RuntimeOptions";
import { DirectorSemanticView } from "../spatial/director/DirectorSemanticView";
import { pickPlanningGround } from "./PlanningGroundPick";
import { PlanningRasterClient } from "./PlanningRasterClient";
import { PlanningTerrainView } from "./PlanningTerrainView";
import { planningFocusPose, type FocusBounds } from "./PlanningFocus";
import { PlanningPresentation, type PresentationComponents } from "../spatial/PlanningPresentation";
import { poiMemberIds } from "./PoiContents";
import { planningHeightmap } from "./PlanningHeightmap";
import { PLANNING_CAMERA_METRICS } from "../landforms/PlanningLandform";
import whiteboxShader from "./PlanningWhitebox.shader?raw";
import { planningAlphamap, PLANNING_SURFACES } from "./PlanningAlphamap";
import { PLANNING_OBJECT_CSS, planningColor } from "./PlanningSurfacePalette";
import { PlanningWalk, WALK_METRICS, WALK_SPEED_LIMITS } from "./PlanningWalk";
import { thirdPersonCamera } from "./PlanningThirdPerson";
import {
  WebGLEngine,
  WebGLMode,
  Camera,
  DirectLight,
  BlinnPhongMaterial,
  PBRMaterial,
  UnlitMaterial,
  Color,
  Vector3,
  Vector2,
  Ray,
  RenderFace,
  Script,
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  Shader,
  PrimitiveMesh,
  MeshRenderer,
  type ModelMesh,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import {
  addV2Surface,
  addV2Lines,
  destroyV2ViewResources,
  type V2ViewResources
} from "@galacean/engine-modify/rendering/V2ViewGeometry";
import { compilePlanningScene, pickPlanningScene, type PlanningScenePart } from "./WorldPlanningScene";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";

class PlanningLabelsUpdate extends Script {
  updateLabels: (delta: number) => void = () => {};
  onLateUpdate(delta: number): void {
    this.updateLabels(delta);
  }
}

/** Real WebGL depth-buffer renderer adapting the planning snapshot to existing V2 meshes.
 * Camera state is independent of layout generation and preserved across local edits.
 */
export class WorldPlanning3DView {
  readonly canvas = document.createElement("canvas");
  private engine!: WebGLEngine;
  private presentation?: PlanningPresentation;
  private terrain?: PlanningTerrainView;
  private productionRuntime?: PlanningProductionRuntime;
  private productionWater?: PlanningWaterRuntime;
  private productionWind?: PlanningWindRuntime;
  private windSeed?: number;
  private diagnosticsSeconds = 0;
  private production = false;
  private semantic?: DirectorSemanticView;
  private raster = new PlanningRasterClient();
  private prepareEpoch = 0;
  private publicationAbort?: AbortController;
  private publishQueue: Promise<void> = Promise.resolve();
  private requestedPublication = 0;
  private requestedProduction = false;
  private disposed = false;
  private disposePromise?: Promise<void>;
  setPresentation(components: PresentationComponents): void {
    this.presentation?.apply(components, (update) => {
      if (this.semantic) this.semantic.updatePresentation(update);
      else update();
    });
  }
  private camera!: Camera;
  private orbit!: OrbitControl;
  private root!: Entity;
  private resources: V2ViewResources | null = null;
  private retained = new Map<string, { resources: V2ViewResources; entry: WorldPlanning3DView["entities"][number] }>();
  private surfaceMap: ReturnType<typeof planningAlphamap> | null = null;
  private parts: PlanningScenePart[] = [];
  private entities: {
    part: PlanningScenePart;
    entity: Entity;
    material: BlinnPhongMaterial | PBRMaterial | UnlitMaterial;
  }[] = [];
  private layers: Record<string, boolean> = {};
  private orbitHeight = 100;
  private selectedId: string | null = null;
  private labels: { element: HTMLButtonElement; point: Vector3; layer: string }[] = [];
  private labelRoot = document.createElement("div");
  private active = false;
  private directorControlled = false;
  private directorDiagnostics = false;
  private resize!: ResizeObserver;
  private abort = new AbortController();
  private plan: IslandPlan | null = null;
  private surfaceTexture: Texture2D | null = null;
  private walker: PlanningWalk | null = null;
  private actor: Entity | null = null;
  private actorMesh: ModelMesh | null = null;
  private actorMaterial: BlinnPhongMaterial | null = null;
  private actorSize = "";
  private walkSpeed = WALK_METRICS.walk;
  private walking = false;
  private keys = new Set<string>();
  private jumpPressed = false;
  private yaw = 0;
  private pitch = 0;
  private lastTime = 0;
  private lookDrag: { pointerId: number; x: number; y: number } | null = null;
  private walkPanel = document.createElement("div");
  private meter = document.createElement("pre");
  private gridLegend = document.createElement("span");
  private modeBar = document.createElement("div");
  private orbitButton = document.createElement("button");
  private roamButton = document.createElement("button");
  private walkStatus = document.createElement("span");

  private groundPick: ((point: PlanPoint | undefined) => void) | null = null;
  private start: { x: number; y: number } | null = null;
  private directorPlaying = false;
  private highlightedMaterials = new WeakSet<object>();
  private contextElements = new Set<string>();
  private contextPaths = new Set<string>();
  private constructor(
    private host: HTMLElement,
    private onSelect: (id: string | null) => void
  ) {
    this.canvas.className = "wp-world-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-label", "三维空间规划：拖动旋转，右键平移，滚轮缩放，点击选择模块");
    this.canvas.dataset.renderer = "galacean-webgl-depth";
    Object.assign(this.canvas.style, {
      position: "absolute",
      inset: "0",
      width: "100%",
      height: "100%",
      touchAction: "none"
    });
    Object.assign(this.labelRoot.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      overflow: "hidden"
    });
    this.labelRoot.className = "wp-world-labels";
    host.append(this.canvas, this.labelRoot);
    this.setupWalkUI();
    this.syncVisibility();
  }
  /** Initialize lazily so the ordinary 2D editor does not pay the WebGL startup cost. */
  static async create(host: HTMLElement, onSelect: (id: string | null) => void): Promise<WorldPlanning3DView> {
    const view = new WorldPlanning3DView(host, onSelect);
    try {
      await view.initialize();
      return view;
    } catch (error) {
      await view.dispose();
      throw error;
    }
  }
  private async initialize(): Promise<void> {
    this.engine = await WebGLEngine.create({
      canvas: this.canvas,
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
    });
    const scene = this.engine.sceneManager.activeScene!;
    scene.background.solidColor.set(...planningColor(PLANNING_OBJECT_CSS.ocean), 1);

    this.root = scene.createRootEntity("Published planning snapshot");
    const sun = this.root.createChild("Sun").addComponent(DirectLight);
    const eye = this.root.createChild("Planning camera");
    this.camera = eye.addComponent(Camera);
    this.camera.nearClipPlane = 2;
    this.camera.farClipPlane = 12000;
    this.camera.fieldOfView = 45;
    this.camera.isOrthographic = false;
    this.presentation = new PlanningPresentation(this.root, scene, sun, this.camera, this.canvas);
    this.orbit = eye.addComponent(OrbitControl);
    this.orbit.enableKeys = false;
    this.orbit.enableDamping = false;
    this.orbit.minDistance = 20;
    this.orbit.maxDistance = 8000;
    this.orbit.maxPolarAngle = Math.PI * 0.49;
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(this.host);
    this.resizeCanvas();
    const events = { signal: this.abort.signal };
    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        this.start = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
      },
      events
    );
    this.canvas.addEventListener(
      "pointerup",
      (e) => {
        const start = this.start;
        this.start = null;
        if (
          this.walking ||
          !start ||
          e.button !== 0 ||
          Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4 ||
          (this.directorPlaying && !this.groundPick)
        )
          return;
        const rect = this.canvas.getBoundingClientRect(),
          ray = new Ray();
        this.camera.screenPointToRay(
          new Vector2(
            ((e.clientX - rect.left) * this.canvas.width) / rect.width,
            ((e.clientY - rect.top) * this.canvas.height) / rect.height
          ),
          ray
        );
        if (this.groundPick) {
          const callback = this.groundPick;
          this.groundPick = null;
          this.canvas.style.cursor = "";
          this.orbit.enabled = false;
          callback(this.plan ? pickPlanningGround(this.plan, ray.origin, ray.direction) : undefined);
        } else this.onSelect(pickPlanningScene(this.parts, ray.origin, ray.direction, this.layers));
        this.start = null;
      },
      events
    );
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault(), events);
    eye.addComponent(PlanningLabelsUpdate).updateLabels = (delta) => {
      this.updateLabels();
      this.updateWalk();
      if (this.production) {
        this.productionRuntime?.update(delta);
        this.diagnosticsSeconds += delta;
        if (this.diagnosticsSeconds >= 1) {
          this.diagnosticsSeconds = 0;
          const d = this.productionRuntime?.getDiagnostics();
          this.canvas.dataset.populationRuntime = JSON.stringify(d?.population ?? {});
          this.canvas.dataset.waterRuntime = JSON.stringify(d?.water ?? {});
        }
      }
    };
    this.terrain = await PlanningTerrainView.create(this.engine, this.root, this.camera);
    this.semantic = new DirectorSemanticView(this.engine, this.camera, this.root, this.canvas);
    this.engine.run();
  }
  /** Measurements may only consume the geometry snapshot currently published by all render adapters. */
  isPlanReady(plan: IslandPlan): boolean {
    return this.plan === plan && this.canvas.dataset.terrainStatus === "ready";
  }
  /** Query the native published Scene, including while a replacement is preparing. */
  sampleWater(x: number, z: number, id?: string) {
    if (!this.productionWater) throw new Error("MISSING_DEPENDENCY: 尚未发布原生水体场景");
    return this.productionWater.system.sample(x, z, id);
  }
  sampleDrops(x: number, y: number, z: number, id?: string) {
    if (!this.productionWater) throw new Error("MISSING_DEPENDENCY: 尚未发布原生水体场景");
    return this.productionWater.system.sampleDrops(x, y, z, id);
  }
  private resizeCanvas(): void {
    const r = this.host.getBoundingClientRect(),
      dpr = window.devicePixelRatio || 1;
    this.engine.canvas.setResolution(Math.max(1, Math.round(r.width * dpr)), Math.max(1, Math.round(r.height * dpr)));
  }
  /** Publish metre geometry. Does not reposition the camera or alter world extents. */
  setPlan(
    plan: IslandPlan,
    production = this.requestedProduction,
    acceptance?: { signal: AbortSignal; accept: () => void }
  ): Promise<void> {
    this.requestedProduction = production;
    this.prepareEpoch++;
    this.publicationAbort?.abort();
    const request = ++this.requestedPublication;
    const operation = this.publishQueue
      .catch(() => {})
      .then(async () => {
        if (this.disposed || request !== this.requestedPublication) return;
        acceptance?.signal.throwIfAborted();
        await this.publishPlan(plan, production, acceptance);
      });
    this.publishQueue = operation;
    return operation;
  }
  private configureProductionWind(plan: IslandPlan, production: boolean): void {
    this.productionWind?.setActive(false);
    if (!production) return;
    if (this.windSeed !== plan.parameters.seed) {
      this.productionWind?.dispose();
      this.productionWind = new PlanningWindRuntime(this.engine, this.root, this.camera, plan.parameters.seed);
      this.windSeed = plan.parameters.seed;
    }
    this.productionWind!.bindTerrain({
      heightSource: () => this.terrain!.heightSamplingSource,
      revision: () => plan.planning?.revision ?? 0,
      sampleHeight: (x, z) => planningHeightmap(plan).sample({ x, z })
    });
  }
  private async publishPlan(
    plan: IslandPlan,
    production: boolean,
    acceptance?: { signal: AbortSignal; accept: () => void }
  ): Promise<void> {
    if (this.plan === plan && this.production === production && this.canvas.dataset.terrainStatus === "ready") {
      acceptance?.accept();
      return;
    }
    let candidate: PlanningProductionRuntime | undefined;
    let candidateTerrain: PlanningTerrainView | undefined;
    let candidateWater: PreparedPlanningWater | undefined;
    let accepted = false;
    let discardGeometry: (() => void) | undefined;
    const controller = (this.publicationAbort = new AbortController());
    const cancel = () => controller.abort();
    acceptance?.signal.addEventListener("abort", cancel, { once: true });
    if (acceptance?.signal.aborted) controller.abort();
    const epoch = ++this.prepareEpoch;
    this.canvas.dataset.terrainStatus = "preparing";
    delete this.canvas.dataset.terrainError;
    const prepareStarted = performance.now();
    const resources = production ? PlanningProductionRuntime.prepareResources(this.engine) : Promise.resolve();
    void resources.catch(() => {});
    try {
      const elapsed = await this.raster.run(plan, production);
      if (elapsed === undefined || epoch !== this.prepareEpoch) return;
      this.canvas.dataset.rasterMs = String(elapsed);
      candidateTerrain = await PlanningTerrainView.create(this.engine, this.root, this.camera, this.terrain);
      candidateTerrain.setVisible(false);
      await candidateTerrain.setProduction(production, plan.parameters.seed);
      controller.signal.throwIfAborted();
      candidateTerrain.setPlan(plan, this.layers);
      this.productionWater ??= new PlanningWaterRuntime({ engine: this.engine, root: this.root, camera: this.camera });
      await resources;
      candidate = production
        ? await PlanningProductionRuntime.create(
            this.engine,
            this.root,
            this.camera,
            plan,
            candidateTerrain,
            this.productionWater!
          )
        : undefined;
      controller.signal.throwIfAborted();
      candidateWater = await this.productionWater.prepare(plan, controller.signal, {
        ocean: production && this.layers.ocean !== false,
        rivers: production && this.layers.water !== false && this.layers["surface-water"] !== false
      });
      if (epoch !== this.prepareEpoch) return;
      const parts = compilePlanningScene(plan),
        map = plan.poiDistribution ? untexturedSurface : planningAlphamap(plan);
      let texture = this.surfaceTexture;
      if (!texture || map !== this.surfaceMap) {
        texture = new Texture2D(this.engine, map.resolution, map.resolution, TextureFormat.R8G8B8A8, true, false);
        texture.filterMode = TextureFilterMode.Trilinear;
        texture.anisoLevel = 8;
        texture.setPixelBuffer(map.sdf);
        texture.generateMipmaps();
      }
      const next: WorldPlanning3DView["retained"] = new Map(),
        entities: WorldPlanning3DView["entities"] = [];
      const allocated: V2ViewResources[] = [];
      const occurrences = new Map<string, number>();
      try {
        for (const part of parts) {
          if (part.pickOnly || part.layer === "land") continue;
          if (plan.routes.some((r) => r.id === part.id) || (plan.plazas ?? []).some((p) => p.id === part.id))
            part.selectionOnly = true;
          const owner = part.id + ":" + part.layer,
            index = occurrences.get(owner) ?? 0;
          occurrences.set(owner, index + 1);
          const key = owner + ":" + index;
          const previous = this.retained.get(key);
          const unchanged =
            previous &&
            (previous.entry.part.mesh === part.mesh ||
              JSON.stringify([previous.entry.part.mesh, previous.entry.part.lines]) ===
                JSON.stringify([part.mesh, part.lines]));
          if (unchanged) {
            const retained = { resources: previous.resources, entry: { ...previous.entry, part } };
            next.set(key, retained);
            entities.push(retained.entry);
            continue;
          }
          const resources: V2ViewResources = { root: this.root.createChild(key), meshes: [], materials: [] };
          resources.root.isActive = false;
          allocated.push(resources);
          const material = part.lines ? new UnlitMaterial(this.engine) : new PBRMaterial(this.engine);
          resources.materials.push(material);
          if (material instanceof PBRMaterial) {
            material.roughness = 0.88;
            material.metallic = 0;
          }
          material.baseColor = whiteboxColor(part.color);
          material.renderFace = RenderFace.Double;
          if (!part.lines) {
            material.shader = Shader.find("Planning/MetreWhitebox") ?? Shader.create(whiteboxShader);
            material.shaderData.setFloat("planning_SurfaceGrid", part.boxes ? 0 : 1);
            material.shaderData.setFloat(
              "planning_Unlit",
              part.layer === "ocean" || part.layer === "surface-water" ? 1 : 0
            );
            material.shaderData.setFloat("planning_Textured", part.layer === "land" && !plan.poiDistribution ? 1 : 0);
            material.shaderData.setVector2(
              "planning_WorldSize",
              new Vector2(plan.parameters.width, plan.parameters.depth)
            );
            material.shaderData.setTexture("planning_Surface", texture);
            material.shaderData.setFloat("planning_SurfaceResolution", map.resolution);
          }
          const entry = {
            part,
            material,
            entity: part.lines
              ? addV2Lines(
                  this.engine,
                  resources,
                  part.id,
                  Array.from(
                    { length: part.lines.length / 3 },
                    (_, i) => new Vector3(part.lines![i * 3], part.lines![i * 3 + 1], part.lines![i * 3 + 2])
                  ),
                  material
                )
              : addV2Surface(this.engine, resources, part.id, part.mesh, material, {
                  upward: !part.boxes,
                  shadows: part.layer !== "ocean" && part.layer !== "surface-water"
                })
          };
          next.set(key, { resources, entry });
          entities.push(entry);
        }
      } catch (error) {
        for (const resources of allocated) destroyV2ViewResources(resources);
        if (texture !== this.surfaceTexture) texture.destroy();
        throw error;
      }
      discardGeometry = () => {
        for (const resources of allocated) destroyV2ViewResources(resources);
        if (texture !== this.surfaceTexture) texture.destroy();
      };
      const nextWalker = new PlanningWalk(plan, planningHeightmap(plan).sample);
      nextWalker.setSpeed(this.walkSpeed);
      controller.signal.throwIfAborted();
      // All candidates remain hidden and queries remain on the previous version until here.
      const previousRuntime = this.productionRuntime,
        previousTerrain = this.terrain,
        previousRetained = this.retained;
      const publication = candidateWater.commit();
      this.terrain = candidateTerrain;
      this.productionRuntime = candidate;
      this.production = production;
      this.plan = plan;
      this.parts = parts;
      this.entities = entities;
      this.retained = next;
      acceptance?.accept();
      accepted = true;
      if (this.walking) this.stopWalk();
      this.walker = nextWalker;
      previousTerrain?.setVisible(false);
      candidateTerrain.setVisible(this.layers.land !== false);
      for (const value of next.values()) {
        value.resources.root.isActive = true;
        value.entry.material.shaderData.setTexture("planning_Surface", texture);
      }
      void publication.retiredCleanup.catch((error) => console.error("Planning Water retirement", error));
      for (const [key, value] of previousRetained)
        if (value.resources !== next.get(key)?.resources) destroyV2ViewResources(value.resources);
      void previousRuntime?.dispose().catch((error) => console.error("Planning population retirement", error));
      previousTerrain?.dispose();
      this.configureProductionWind(plan, production);
      if (!production) this.productionWater?.setVisible(false, false);
      this.gridLegend.hidden = production;
      this.productionWind?.setActive(production && this.active);
      this.canvas.dataset.renderMode = production ? "production" : "whitebox";
      this.canvas.dataset.shaderPrecompile = String(PLANNING_RUNTIME_OPTIONS.precompileShaders);
      this.canvas.dataset.oceanRenderer = production ? "Water/Ocean" : "Whitebox/grid";
      this.canvas.dataset.waterRuntime = JSON.stringify({
        presentation: "Whitebox/grid",
        ...this.productionWater.getDiagnostics()
      });
      this.retained = next;
      if (this.surfaceTexture !== texture) this.surfaceTexture?.destroy();
      this.surfaceTexture = texture;
      this.surfaceMap = map;
      this.plan = plan;
      this.parts = parts;
      this.entities = entities;
      this.semantic?.bind(entities);
      this.setLayers(this.layers);
      this.rebuildLabels(plan);
      this.setSelection(this.selectedId, true);
      if (this.productionRuntime)
        this.canvas.dataset.waterRuntime = JSON.stringify(this.productionRuntime.getDiagnostics().water);
      this.canvas.dataset.terrainStatus = "ready";
      this.canvas.dataset.prepareMs = String(performance.now() - prepareStarted);
      this.canvas.dataset.worldWidth = String(plan.parameters.width);
      this.canvas.dataset.worldDepth = String(plan.parameters.depth);
      this.canvas.dataset.revision = String(plan.planning?.revision ?? 0);
      this.canvas.dataset.parts = String(parts.length);
      this.canvas.dataset.terrainRenderer = "Terrain/Clipmap";
      this.canvas.dataset.alphamapResolution = String(planningAlphamap(plan).resolution);
      this.canvas.dataset.gridMetres = production ? "none" : "1";
      this.canvas.dataset.heightmapResolution = String(planningHeightmap(plan).resolution);
      this.canvas.dataset.heightmapSpacing = String(planningHeightmap(plan).spacingX);
    } catch (error) {
      if (!accepted && epoch === this.prepareEpoch) {
        this.canvas.dataset.terrainStatus = "failed";
        this.canvas.dataset.terrainError = String(error);
      }
      if (accepted) console.error("Planning post-publication diagnostics", error);
      else throw error;
    } finally {
      if (!accepted) {
        discardGeometry?.();
        await candidateWater?.rollback();
        await candidate?.dispose();
        candidateTerrain?.dispose();
      }
      acceptance?.signal.removeEventListener("abort", cancel);
      if (this.publicationAbort === controller) this.publicationAbort = undefined;
    }
  }
  /** Establish a 45-degree perspective camera using the existing planar focus in metres. */
  frame(box: { x: number; z: number; width: number; depth: number }): void {
    const target = new Vector3(box.x + box.width / 2, 0, box.z + box.depth / 2);
    if (this.plan) target.y = planningHeightmap(this.plan).sample({ x: target.x, z: target.z });
    const aspect = this.canvas.width / this.canvas.height;
    const span = Math.max(box.depth, box.width / Math.max(0.1, aspect));
    const distance = (span / (2 * Math.tan((this.camera.fieldOfView * Math.PI) / 360))) * 1.12;
    // Keep the initial whitebox camera over the map so vertical descent has ground beneath it.
    const height = this.plan?.settlementLayout
      ? distance * Math.SQRT1_2
      : Math.min(distance * Math.SQRT1_2, box.depth * 0.45);
    this.orbit.target.copyFrom(target);
    this.camera.entity.transform.setPosition(target.x, target.y + height, target.z + height);
    this.camera.entity.transform.lookAt(target);
    this.canvas.dataset.cameraPitch = "45";
    this.canvas.dataset.focus = JSON.stringify(box);
  }
  /** Frame a selected module without changing its geometry. */
  focus(points: PlanPoint[]): void {
    if (!points.length) return;
    if (this.walking) this.stopWalk();
    const bounds: FocusBounds = {
      min: { x: Infinity, y: Infinity, z: Infinity },
      max: { x: -Infinity, y: -Infinity, z: -Infinity }
    };
    const include = (x: number, y: number, z: number) => {
      bounds.min.x = Math.min(bounds.min.x, x);
      bounds.min.y = Math.min(bounds.min.y, y);
      bounds.min.z = Math.min(bounds.min.z, z);
      bounds.max.x = Math.max(bounds.max.x, x);
      bounds.max.y = Math.max(bounds.max.y, y);
      bounds.max.z = Math.max(bounds.max.z, z);
    };
    const poi = this.plan?.poiDistribution?.sites.find((p) => p.id === this.selectedId);
    const members = new Set(
      poi
        ? poiMemberIds(this.plan!, poi)
        : (this.plan?.planning?.modules.find((m) => m.id === this.selectedId)?.memberIds ?? [])
    );
    for (const part of this.parts) {
      if (
        part.pickOnly ||
        part.selectionOnly ||
        part.lines ||
        !(
          part.id === this.selectedId ||
          members.has(part.id) ||
          part.owners?.some((owner) => owner === this.selectedId || members.has(owner))
        )
      )
        continue;
      const vertices = part.mesh.positions;
      for (let i = 0; i < vertices.length; i += 3) include(vertices[i], vertices[i + 1], vertices[i + 2]);
    }
    if (!Number.isFinite(bounds.min.x))
      for (const p of points) include(p.x, this.plan ? planningHeightmap(this.plan).sample(p) : 0, p.z);
    this.resizeCanvas();
    const pose = planningFocusPose(bounds, this.canvas.width / this.canvas.height, this.camera.fieldOfView);
    const target = new Vector3(pose.target.x, pose.target.y, pose.target.z);
    this.orbit.target.copyFrom(target);
    this.camera.entity.transform.setPosition(pose.position.x, pose.position.y, pose.position.z);
    this.camera.entity.transform.lookAt(target);
    this.canvas.dataset.cameraPitch = "45";
    this.canvas.dataset.focus = JSON.stringify({
      x: bounds.min.x,
      z: bounds.min.z,
      width: bounds.max.x - bounds.min.x,
      depth: bounds.max.z - bounds.min.z
    });
    this.canvas.dataset.focusTarget = JSON.stringify(pose.target);
  }

  zoom(factor: number): void {
    const p = this.camera.entity.transform.position,
      t = this.orbit.target;
    this.camera.entity.transform.setPosition(
      t.x + (p.x - t.x) / factor,
      t.y + (p.y - t.y) / factor,
      t.z + (p.z - t.z) / factor
    );
  }
  setLayers(layers: Record<string, boolean>): void {
    this.layers = { ...layers };
    this.productionRuntime?.setLayers(layers, this.production);
    this.terrain?.setVisible(layers.land !== false);
    if (this.plan) this.terrain?.setPlan(this.plan, layers);
    for (const e of this.entities) {
      e.entity.isActive =
        !(
          this.production &&
          (["ocean", "surface-water"].includes(e.part.layer) ||
            this.plan?.landscapes?.some((p) => p.id === e.part.id && p.kind === "tree"))
        ) &&
        layers[e.part.layer] !== false &&
        layers[`object:${e.part.id}`] !== false &&
        (!e.part.owners?.length || e.part.owners.some((owner) => this.layers[`object:${owner}`] !== false)) &&
        (!e.part.selectionOnly ||
          e.part.id === this.selectedId ||
          !!e.part.owners?.includes(this.selectedId ?? "") ||
          this.contextPaths.has(e.part.id) ||
          !!e.part.owners?.some((owner) => this.contextPaths.has(owner))) &&
        !(this.walking && ["spawn", "entrance", "ports", "teleport", "sight"].includes(e.part.layer));
      for (let i = 0; i < 3; i++) {
        const surface = PLANNING_SURFACES[i],
          color = layers["surface-" + surface.id] === false ? [185, 185, 185] : surface.color;
        e.material.shaderData.setVector3(
          ["planning_Grass", "planning_Soil", "planning_Water"][i],
          new Vector3(
            Color.gammaToLinearSpace(color[0] / 255),
            Color.gammaToLinearSpace(color[1] / 255),
            Color.gammaToLinearSpace(color[2] / 255)
          )
        );
      }
    }
  }
  /** Reuse the published surfaces and materials; highlighting never rebuilds the scene. */
  setContextHighlights(elements: readonly string[], paths: readonly string[]): void {
    this.contextElements = new Set(elements);
    this.contextPaths = new Set(paths);
    this.setSelection(this.selectedId, true);
  }
  /** Highlight only; camera framing and movement are unaffected. */
  setSelection(id: string | null, refresh = false): void {
    if (id === this.selectedId && !refresh) return;
    this.selectedId = id;
    const poi = this.plan?.poiDistribution?.sites.find((p) => p.id === id),
      members = new Set(
        poi ? poiMemberIds(this.plan!, poi) : (this.plan?.planning?.modules.find((m) => m.id === id)?.memberIds ?? [])
      );
    for (const e of this.entities) {
      if (e.part.selectionOnly)
        e.entity.isActive =
          (e.part.id === id ||
            !!e.part.owners?.includes(id ?? "") ||
            this.contextPaths.has(e.part.id) ||
            !!e.part.owners?.some((owner) => this.contextPaths.has(owner))) &&
          this.layers[e.part.layer] !== false &&
          this.layers[`object:${e.part.id}`] !== false &&
          (!e.part.owners?.length || e.part.owners.some((owner) => this.layers[`object:${owner}`] !== false)) &&
          !(this.walking && ["spawn", "entrance", "ports", "teleport", "sight"].includes(e.part.layer));
      const highlighted =
        e.part.id === id ||
        !!e.part.owners?.includes(id ?? "") ||
        members.has(e.part.id) ||
        !!e.part.owners?.some((owner) => members.has(owner));
      if (refresh || highlighted !== this.highlightedMaterials.has(e.material)) {
        const color = highlighted
          ? [0.95, 0.66, 0.27]
          : this.contextElements.has(e.part.id)
            ? [173 / 255, 105 / 255, 213 / 255]
            : this.contextPaths.has(e.part.id) || !!e.part.owners?.some((owner) => this.contextPaths.has(owner))
              ? [69 / 255, 181 / 255, 197 / 255]
              : e.part.color;
        e.material.baseColor = whiteboxColor(color);
        if (highlighted) this.highlightedMaterials.add(e.material);
        else this.highlightedMaterials.delete(e.material);
      }
    }
  }
  setActive(active: boolean): void {
    this.active = active;
    this.productionWind?.setActive(active && this.production);
    if (!active) this.stopWalk();
    this.syncVisibility();
    if (active) {
      this.resizeCanvas();
      this.engine.resume();
    } else this.engine.pause();
  }
  /** All 3D overlays share the view lifecycle; ending diagnostics cannot reveal an inactive view. */
  private syncVisibility(): void {
    this.canvas.hidden = !this.active;
    this.labelRoot.hidden = !this.active || this.directorDiagnostics;
    this.modeBar.hidden = !this.active || this.directorControlled;
    this.modeBar.style.display = this.modeBar.hidden ? "none" : "flex";
  }
  /** Update test capabilities without altering world scale. */
  setWalkMetric(key: keyof PlanningWalk["metrics"], value: number): void {
    if (key === "walk") {
      if (!Number.isFinite(value) || value < WALK_SPEED_LIMITS.min || value > WALK_SPEED_LIMITS.max)
        throw new Error("无效行走速度");
      this.walker?.setSpeed(value);
      this.walkSpeed = value;
      return;
    }
    if (this.walker) {
      this.walker.metrics[key] = value;
      this.walker.metrics.eye = Math.min(this.walker.metrics.eye, this.walker.metrics.height - 0.1);
    }
  }
  /** Toggle same-frame semantic rendering without changing the lighting or planning snapshot. */
  setDirectorDiagnostics(
    enabled: boolean,
    roles: import("../spatial/director/DirectorMask").ColorAssignments = {}
  ): void {
    this.semantic?.setRoles(roles);
    this.semantic?.setEnabled(enabled);
    this.directorDiagnostics = enabled;
    this.syncVisibility();
  }
  sampleDirectorDiagnostics(signal?: AbortSignal) {
    if (!this.semantic) throw Error("语义渲染尚未就绪");
    return this.semantic.sample(signal);
  }
  getDirectorDiagnostics() {
    return { report: this.semantic?.report, error: this.semantic?.error };
  }
  captureTerrainDepth(
    observer: import("../spatial/guidance/VisibilityQuery").Observer,
    width: number,
    height: number
  ): Uint8Array {
    if (!this.terrain) throw new Error("Terrain 尚未就绪");
    const pixels = this.terrain.captureDepth(observer, width, height);
    let valid = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2]) valid++;
    this.canvas.dataset.terrainDiagnostic = JSON.stringify({
      renderer: "Terrain/Clipmap",
      width,
      height,
      coveredPixels: valid,
      pixels: width * height
    });
    return pixels;
  }
  /** Director owns camera input while playing or seeking; manual mode can explicitly restore orbit control. */
  beginGroundPick(callback: (point: PlanPoint | undefined) => void): void {
    if (!this.plan) return;
    this.groundPick = callback;
    this.canvas.style.cursor = "crosshair";
    this.orbit.enabled = true;
    this.frame({ x: 0, z: 0, width: this.plan.parameters.width, depth: this.plan.parameters.depth });
  }
  cancelGroundPick(): void {
    this.groundPick = null;
    this.canvas.style.cursor = "";
  }
  getSelection(): string | null {
    return this.selectedId;
  }
  getActorPosition(): PlanPoint | undefined {
    return this.walker ? { x: this.walker.position.x, z: this.walker.position.z } : undefined;
  }
  /** Playback owns viewport clicks; explicit endpoint picking remains available. */
  setDirectorPlaying(playing: boolean): void {
    this.directorPlaying = playing;
    this.start = null;
  }
  setDirectorControl(active: boolean): void {
    this.cancelGroundPick();
    if (this.walking) this.stopWalk();
    this.directorControlled = active;
    this.orbit.enabled = !active;
    this.syncVisibility();
  }
  /** Start metric third-person movement in this same published planning scene. */
  startWalk(position?: PlanPoint): void {
    if (!this.walker || !this.plan || this.walking) return;
    const camera = this.camera.entity.transform.position,
      p = position ?? { x: this.orbit.target.x, z: this.orbit.target.z };
    if (!this.walker.resetOnGround(p) && !(position === undefined && this.walker.resetOnGround(this.plan.spawn))) {
      this.walkStatus.textContent = "当前位置与实体相交，请平移到空地后切换。";
      return;
    }
    this.yaw = Math.atan2(camera.x - this.orbit.target.x, camera.z - this.orbit.target.z);
    this.pitch = -0.22;
    this.orbitHeight = Math.max(10, camera.y - this.walker.position.y);
    this.walkStatus.textContent = "";
    this.orbitButton.setAttribute("aria-pressed", "false");
    this.roamButton.setAttribute("aria-pressed", "true");
    this.walking = true;
    this.setLayers(this.layers);
    this.orbit.enabled = false;
    this.camera.fieldOfView = PLANNING_CAMERA_METRICS.verticalFovDegrees;
    this.camera.nearClipPlane = 0.05;
    this.walkPanel.hidden = false;
    this.keys.clear();
    this.lastTime = performance.now();
    this.canvas.focus({ preventScroll: true });
  }
  /** Set a reproducible observation camera without changing scene geometry or looking at a target automatically. */
  observe(
    position: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    verticalFovDegrees = 45
  ): void {
    if (this.walking) this.stopWalk();
    this.camera.fieldOfView = verticalFovDegrees;
    this.camera.nearClipPlane = 0.1;
    this.camera.entity.transform.setPosition(position.x, position.y, position.z);
    this.orbit.target.set(position.x + forward.x * 30, position.y + forward.y * 30, position.z + forward.z * 30);
    this.camera.entity.transform.lookAt(this.orbit.target);
    this.canvas.dataset.observer = JSON.stringify({ position, forward, verticalFovDegrees });
  }
  /** Preserve current XZ when lifting the camera back into orbit. */
  stopWalk(): void {
    const wasWalking = this.walking;
    this.walking = false;
    if (this.actor) this.actor.isActive = false;
    this.setLayers(this.layers);
    this.keys.clear();
    this.jumpPressed = false;
    this.lookDrag = null;
    this.walkPanel.hidden = true;
    if (this.orbit) {
      if (wasWalking && this.walker) {
        const p = this.walker.position,
          h = this.orbitHeight;
        this.camera.entity.transform.setPosition(p.x, p.y + h, p.z);
        this.orbit.target.set(p.x - h * Math.sin(this.yaw), p.y, p.z - h * Math.cos(this.yaw));
        this.camera.entity.transform.lookAt(this.orbit.target);
      }
      this.orbit.enabled = true;
      this.camera.fieldOfView = 45;
      this.camera.nearClipPlane = 2;
    }
    this.orbitButton.setAttribute("aria-pressed", "true");
    this.roamButton.setAttribute("aria-pressed", "false");
  }
  private setupWalkUI(): void {
    Object.assign(this.modeBar.style, {
      position: "absolute",
      right: "12px",
      top: "12px",
      zIndex: "6",
      display: "flex",
      gap: "8px",
      alignItems: "center",
      padding: "8px",
      background: "#eef0e3ee",
      color: "#40594f",
      borderRadius: "6px"
    });
    this.modeBar.setAttribute("aria-label", "白盒测试模式");
    this.orbitButton.textContent = "45°俯瞰";
    this.roamButton.textContent = "第三人称漫游";
    this.orbitButton.setAttribute("aria-pressed", "true");
    this.roamButton.setAttribute("aria-pressed", "false");
    this.orbitButton.onclick = () => this.stopWalk();
    this.roamButton.onclick = () => this.startWalk();
    const gridLegend = this.gridLegend;
    gridLegend.textContent = "细格 1 m · 粗格 10 m";
    gridLegend.style.fontSize = "11px";
    const speedLabel = document.createElement("label"),
      speed = document.createElement("input");
    speedLabel.textContent = "WASD m/s ";
    speed.type = "number";
    speed.setAttribute("aria-label", "漫游行走速度");
    speed.min = String(WALK_SPEED_LIMITS.min);
    speed.max = String(WALK_SPEED_LIMITS.max);
    speed.step = ".5";
    speed.value = String(this.walkSpeed);
    speed.style.width = "54px";
    speed.oninput = () => {
      if (
        Number.isFinite(speed.valueAsNumber) &&
        speed.valueAsNumber >= WALK_SPEED_LIMITS.min &&
        speed.valueAsNumber <= WALK_SPEED_LIMITS.max
      ) {
        this.setWalkMetric("walk", speed.valueAsNumber);
      }
    };
    speed.onchange = () => {
      if (!speed.checkValidity() || !Number.isFinite(speed.valueAsNumber)) {
        speed.reportValidity();
        speed.value = String(this.walkSpeed);
        return;
      }
      speed.oninput?.call(speed, new Event("input"));
      this.keys.clear();
      if (this.walking) this.canvas.focus({ preventScroll: true });
    };
    speed.title = "控制WASD行走；Shift按比例加速，不改变俯瞰相机拖动速度";
    speedLabel.append(speed);
    this.modeBar.append(this.orbitButton, this.roamButton, gridLegend, speedLabel, this.walkStatus);
    this.host.append(this.modeBar);
    Object.assign(this.walkPanel.style, {
      position: "absolute",
      left: "12px",
      bottom: "12px",
      zIndex: "5",
      background: "#eef0e3ee",
      color: "#40594f",
      padding: "12px",
      borderRadius: "6px",
      font: "12px monospace"
    });
    this.walkPanel.hidden = true;
    const hint = document.createElement("div");
    hint.textContent = "WASD 行走 · Shift 跑步 · 空格跳跃 · 按住鼠标拖动视角";
    this.walkPanel.append(hint, this.meter);
    this.host.append(this.walkPanel);
    const events = { signal: this.abort.signal };
    this.canvas.addEventListener(
      "pointerdown",
      (e) => {
        if (!this.walking || (e.button !== 0 && e.button !== 2)) return;
        this.canvas.focus({ preventScroll: true });
        this.lookDrag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY };
      },
      events
    );
    this.canvas.addEventListener(
      "pointermove",
      (e) => {
        const drag = this.lookDrag;
        if (!this.walking || !drag || drag.pointerId !== e.pointerId) return;
        if (!(e.buttons & 3)) {
          this.lookDrag = null;
          return;
        }
        this.yaw -= (e.clientX - drag.x) * 0.002;
        this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - (e.clientY - drag.y) * 0.002));
        drag.x = e.clientX;
        drag.y = e.clientY;
      },
      events
    );
    const endLook = () => {
      this.lookDrag = null;
    };
    this.canvas.addEventListener("pointerup", endLook, events);
    this.canvas.addEventListener("pointercancel", endLook, events);
    this.canvas.addEventListener("pointerleave", endLook, events);
    this.canvas.addEventListener(
      "keydown",
      (e) => {
        if (!this.walking) return;
        if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight", "Space"].includes(e.code)) {
          e.preventDefault();
          this.keys.add(e.code);
          if (e.code === "Space" && !e.repeat) this.jumpPressed = true;
        }
      },
      events
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), events);
    const clearInput = () => {
      this.keys.clear();
      this.jumpPressed = false;
      endLook();
    };
    this.canvas.addEventListener("blur", clearInput, events);
    window.addEventListener("blur", clearInput, events);
  }
  private updateWalk(): void {
    if (!this.walking || !this.walker) return;
    const now = performance.now(),
      dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const forward = Number(this.keys.has("KeyW")) - Number(this.keys.has("KeyS")),
      right = Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA"));
    this.walker.advance(
      dt,
      right * Math.cos(this.yaw) - forward * Math.sin(this.yaw),
      -right * Math.sin(this.yaw) - forward * Math.cos(this.yaw),
      this.keys.has("ShiftLeft") || this.keys.has("ShiftRight"),
      this.jumpPressed
    );
    this.jumpPressed = false;
    const p = this.walker.position,
      m = this.walker.metrics,
      size = `${m.height}:${m.radius}`;
    if (!this.actor) {
      this.actor = this.root.createChild("米制角色");
      this.actorMaterial = new BlinnPhongMaterial(this.engine);
      this.actorMaterial.baseColor = whiteboxColor(planningColor(PLANNING_OBJECT_CSS.actor));
      this.actor.addComponent(MeshRenderer).setMaterial(this.actorMaterial);
    }
    if (size !== this.actorSize) {
      this.actorMesh?.destroy();
      this.actorMesh = PrimitiveMesh.createCapsule(
        this.engine,
        m.radius,
        Math.max(0.001, m.height - 2 * m.radius),
        24,
        1
      );
      this.actor.getComponent(MeshRenderer)!.mesh = this.actorMesh;
      this.actorSize = size;
    }
    this.actor.isActive = true;
    this.actor.transform.setPosition(p.x, p.y + m.height / 2, p.z);
    const pose = thirdPersonCamera(p, m.height, this.yaw, this.pitch, this.walker.boxes, this.walker.ground);
    this.camera.entity.transform.setPosition(pose.position.x, pose.position.y, pose.position.z);
    this.camera.entity.transform.lookAt(new Vector3(pose.target.x, pose.target.y, pose.target.z));
    this.canvas.dataset.actor = JSON.stringify({
      position: p,
      height: m.height,
      diameter: m.radius * 2,
      cameraDistance: pose.distance,
      collisionModel: "conservative-cylinder"
    });
    const r = this.walker.report();
    this.meter.textContent = `角色高 ${r.metrics.height} m / 碰撞直径 ${r.metrics.radius * 2} m · 胶囊外观 / 圆柱碰撞\n速度 ${r.speedMps.toFixed(2)} m/s · 路程 ${r.distanceM.toFixed(2)} m · 时间 ${r.elapsedSeconds.toFixed(1)} s\n坐标 ${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)} · ${r.grounded ? "着地" : "腾空"}\n上次跳高 ${r.lastJumpHeightM.toFixed(2)} m / 跳远 ${r.lastJumpDistanceM.toFixed(2)} m · 阻挡 ${r.blockedSubsteps}`;
    this.canvas.dataset.walkReport = JSON.stringify(r);
  }
  private rebuildLabels(plan: IslandPlan): void {
    this.labelRoot.replaceChildren();
    this.labels = [];
    const sample = planningHeightmap(plan).sample;
    const add = (id: string, title: string, p: PlanPoint, layer: string, height = 0) => {
      const element = document.createElement("button");
      element.dataset.ownerId = id;
      element.textContent = title;
      element.title = title;
      Object.assign(element.style, {
        position: "absolute",
        pointerEvents: "auto",
        whiteSpace: "nowrap",
        font: "400 10px sans-serif",
        color: "#173b50",
        background: "#ffffffbb",
        border: "0",
        borderRadius: "3px",
        padding: "2px 4px",
        transform: "translate(-50%,-100%)"
      });
      element.onclick = () => {
        if (!this.directorPlaying) this.onSelect(id);
      };
      this.labelRoot.append(element);
      this.labels.push({ element, point: new Vector3(p.x, sample(p) + height + 3, p.z), layer });
    };
    const center = (ps: PlanPoint[]) => ({
      x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
      z: ps.reduce((s, p) => s + p.z, 0) / ps.length
    });
    for (const m of plan.mountains)
      add(
        m.id,
        m.label,
        center(m.outline),
        "rock",
        Math.max(0, ...plan.rocks.filter((r) => r.groupId === m.id).map((r) => r.height))
      );
    for (const r of plan.regions)
      if (r.kind === "village" || r.kind === "teleport")
        add(r.id, r.label, center(r.outline), plan.poiDistribution ? "building" : r.kind, 12);
    for (const [i, c] of (plan.courtyards ?? []).entries())
      add(c.id, `院落 ${i + 1}`, center(c.outline), "building", 2);
    if (plan.settlementLayout && !plan.poiDistribution) {
      const module = plan.planning?.modules.find((m) => m.id === "landscape");
      if (module && plan.landscapes?.length)
        add(module.id, "沿路景观", plan.landscapes[0].center, "landscape", plan.landscapes[0].height);
    }
    add("spawn", "出生点", plan.spawn, "spawn", plan.villageStudy || plan.settlementLayout ? 1.8 : 6);
    this.updateLabels();
  }
  private updateLabels(): void {
    const eye = this.camera.entity.transform.position;
    this.canvas.dataset.cameraPosition = JSON.stringify({ x: eye.x, y: eye.y, z: eye.z });
    this.canvas.dataset.cameraMode = this.walking ? "walk" : "orbit";
    const p = new Vector3(),
      dpr = this.canvas.width / Math.max(1, this.canvas.clientWidth);
    for (const label of this.labels) {
      this.camera.worldToScreenPoint(label.point, p);
      label.element.hidden =
        !!this.groundPick ||
        this.layers[`object:${label.element.dataset.ownerId}`] === false ||
        this.walking ||
        this.layers.labels === false ||
        this.layers[label.layer] === false ||
        p.z <= 0 ||
        p.x < 0 ||
        p.y < 0 ||
        p.x > this.canvas.width ||
        p.y > this.canvas.height;
      label.element.style.left = `${p.x / dpr}px`;
      label.element.style.top = `${p.y / dpr}px`;
    }
  }
  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.requestedPublication++;
    this.prepareEpoch++;
    this.publicationAbort?.abort();
    this.raster.dispose();
    this.engine?.pause();
    this.abort.abort();
    this.resize?.disconnect();
    this.modeBar.remove();
    this.walkPanel.remove();
    this.canvas.remove();
    this.labelRoot.remove();
    // Water reflection services release asynchronous GPU resources before their engine is destroyed.
    this.disposePromise = (async () => {
      await this.publishQueue.catch(() => {});
      try {
        await this.productionRuntime?.dispose();
        await this.productionWater?.destroy();
      } finally {
        this.productionWind?.dispose();
        this.semantic?.dispose();
        this.terrain?.dispose();
        this.presentation?.dispose();
        this.actorMesh?.destroy();
        this.actorMaterial?.destroy();
        for (const value of this.retained.values()) destroyV2ViewResources(value.resources);
        this.retained.clear();
        if (this.resources) destroyV2ViewResources(this.resources);
        this.resources = null;
        this.surfaceTexture?.destroy();
        this.engine?.destroy();
      }
    })();
    return this.disposePromise;
  }
}

// The OBB/vector whitebox shader does not sample terrain weights. Bind one neutral
// texel instead of rasterizing a full alphamap that is never displayed.
const untexturedSurface = {
  resolution: 1,
  width: 1,
  depth: 1,
  weights: new Uint8Array(4),
  coverage: new Uint8Array(1),
  sdf: new Uint8Array([255, 255, 0, 255])
};

/** Palette swatches are sRGB; physically lit materials consume linear albedo. */
function whiteboxColor(rgb: readonly number[]): Color {
  const color = new Color(rgb[0], rgb[1], rgb[2], 1);
  return color.toLinear(color);
}
