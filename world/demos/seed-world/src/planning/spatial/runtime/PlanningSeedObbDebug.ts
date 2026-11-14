import {
  Color, PBRMaterial, RenderFace, Shader,
  Texture2D, TextureFormat, Vector2, type Camera, type Engine, type Entity
} from "@galacean/engine";
import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { PlanningTerrainView } from "@galacean/engine-world-planning/semantic-study/PlanningTerrainView";
import { planningGroundSurface } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import { compilePlanningScene } from "@galacean/engine-world-planning/semantic-study/WorldPlanningScene";
import { PLANNING_OBJECT_CSS, planningColor } from "@galacean/engine-world-planning/semantic-study/PlanningSurfacePalette";
import { whiteboxGeometry } from "@galacean/engine-world-planning/geometry/V2WhiteboxGeometry";
import { addV2Surface, destroyV2ViewResources, type V2ViewResources } from "@galacean/engine-modify/rendering/V2ViewGeometry";
import type { V2Mesh } from "@galacean/engine-world-planning/spatial/V2Model";
import whiteboxShader from "@galacean/engine-world-planning/semantic-study/PlanningWhitebox.shader?raw";

export interface PlanningSeedObbDebugOptions {
  readonly engine: Engine;
  readonly root: Entity;
  readonly camera: Camera;
  /** Current native owner, including replacements published by parameter edits. */
  readonly getWorld: () => SeedWorldTerrainRuntime | undefined;
  /** Hide/show the native Water bodies, whose roots are separate from the native terrain. */
  readonly setWaterVisible: (visible: boolean) => void;
  /** Notify HUD consumers without changing navigation or camera ownership. */
  readonly onRepresentationChanged?: (enabled: boolean) => void;
}

/** One debug-only representation switch in the existing Seed scene; never generates a layout or Engine. */
export class PlanningSeedObbDebug {
  readonly button = document.createElement("button");
  private readonly abort = new AbortController();
  private readonly root: Entity;
  private terrain?: PlanningTerrainView;
  private resources?: V2ViewResources;
  private texture?: Texture2D;
  private plan?: IslandPlan;
  private preparedPlan?: IslandPlan;
  private hiddenWorld?: { world: SeedWorldTerrainRuntime; active: boolean };
  private enabled = false;
  private publishedEnabled = false;
  private disposed = false;
  private pending = false;
  private requestEpoch = 0;
  private poseElapsed = 0;
  private counts = { trees: 0, rocks: 0, buildings: 0, landscapeRocks: 0 };
  private queue: Promise<void> = Promise.resolve();
  private destroyPromise?: Promise<void>;

  constructor(private readonly options: PlanningSeedObbDebugOptions) {
    this.root = options.root.createChild("Planning OBB comparison");
    this.root.isActive = false;
    this.button.type = "button";
    this.button.textContent = "OBB 对照";
    this.button.setAttribute("aria-pressed", "false");
    this.button.disabled = true;
    this.button.dataset.action = "obb-comparison";
    Object.assign(this.button.style, {
      padding: "9px 14px",
      border: "1px solid #bdc8b1", borderRadius: "7px", background: "#f1efdf", color: "#344b42",
      font: "14px system-ui", cursor: "pointer", pointerEvents: "auto"
    });
    this.button.addEventListener("click", () => {
      void this.setEnabled(!this.enabled).catch((error) => {
        this.button.dataset.error = String(error);
        console.error("Seed OBB comparison", error);
      });
    }, { signal: this.abort.signal });
    // The sidebar owns mounting; construction during loading must not expose a standalone control.
  }

  /** Publish a reference only until comparison is requested; startup pays no duplicate terrain/material cost. */
  synchronize(plan: IslandPlan): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("OBB comparison has been disposed"));
    if (this.plan !== plan) {
      this.plan = plan;
      this.counts = {
        trees: plan.landscapes?.filter((p) => p.kind === "tree").length ?? 0,
        landscapeRocks: plan.landscapes?.filter((p) => p.kind !== "tree").length ?? 0,
        rocks: plan.rocks.length,
        buildings: plan.buildings.length
      };
    }
    this.button.disabled = this.pending;
    if (!this.enabled) return Promise.resolve();
    return this.enqueue(async () => { await this.prepare(); this.applyVisibility(); });
  }

  /** Toggles representation only; camera and locomotion remain owned by their existing controllers. */
  setEnabled(enabled: boolean): Promise<void> {
    const epoch = ++this.requestEpoch;
    return this.enqueue(async () => {
      if (enabled) {
        await this.prepare();
        if (this.disposed || epoch !== this.requestEpoch) return;
      }
      if (epoch !== this.requestEpoch) return;
      this.enabled = enabled;
      this.applyVisibility();
    });
  }

  /** Native page frame hook. Movement remains owned by native navigation's input dispatch. */
  update(deltaTime: number): void {
    if (this.disposed) return;
    if (this.enabled && this.hiddenWorld?.world !== this.options.getWorld()) this.applyVisibility();
    this.poseElapsed += Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    if (this.poseElapsed >= .1) {
      this.poseElapsed %= .1;
      this.button.dataset.debugPose = JSON.stringify({ ...this.snapshot(), counts: this.counts });
    }
  }

  /** Recorded state for automated comparison; no diagnostic controls are added to the user panel. */
  snapshot() {
    const p = this.options.camera.entity.transform.worldPosition;
    const forward = this.options.camera.entity.transform.worldForward;
    return {
      enabled: this.enabled, pending: this.pending, seed: this.plan?.parameters.seed,
      preparedSeed: this.preparedPlan?.parameters.seed,
      camera: { x: p.x, y: p.y, z: p.z, forward: { x: forward.x, y: forward.y, z: forward.z } }
    };
  }

  /** Await before destroying the shared native scene/Engine. */
  destroy(): Promise<void> {
    if (this.destroyPromise) return this.destroyPromise;
    this.disposed = true;
    this.abort.abort();
    this.button.remove();
    this.requestEpoch++;
    this.enabled = false;
    this.applyVisibility();
    this.destroyPromise = this.queue.catch(() => {}).then(() => {
      if (this.resources) destroyV2ViewResources(this.resources);
      this.terrain?.dispose();
      this.texture?.destroy();
      this.root.destroy();
    });
    return this.destroyPromise;
  }

  private enqueue(action: () => Promise<void>): Promise<void> {
    if (this.disposed) return Promise.reject(new Error("OBB comparison has been disposed"));
    this.pending = true;
    this.button.disabled = true;
    const operation = this.queue.catch(() => {}).then(async () => {
      if (this.disposed) return;
      await action();
    });
    this.queue = operation;
    void operation.finally(() => {
      if (this.queue !== operation) return;
      this.pending = false;
      if (!this.disposed) this.button.disabled = !this.plan;
    }).catch(() => {});
    return operation;
  }

  private async prepare(): Promise<void> {
    if (!this.plan) throw new Error("No published plan for OBB comparison");
    if (this.preparedPlan === this.plan) return;
    this.terrain ??= await PlanningTerrainView.create(this.options.engine, this.root, this.options.camera);
    if (this.disposed) return;
    const plan = this.plan;
    const next = this.createSolids(plan);
    try { this.terrain.setPlan(plan); }
    catch (error) { destroyV2ViewResources(next); throw error; }
    if (this.resources) destroyV2ViewResources(this.resources);
    this.resources = next;
    this.preparedPlan = plan;
  }

  private createSolids(plan: IslandPlan): V2ViewResources {
    const { engine } = this.options;
    const resources: V2ViewResources = { root: this.root.createChild("Published OBBs and water"), meshes: [], materials: [] };
    this.texture ??= new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false);
    this.texture.setPixelBuffer(new Uint8Array([255, 255, 255, 255]));
    const material = (color: readonly number[], water = false) => {
      const m = new PBRMaterial(engine);
      resources.materials.push(m);
      m.shader = Shader.find("Planning/MetreWhitebox") ?? Shader.create(whiteboxShader);
      m.baseColor = new Color(color[0], color[1], color[2], 1).toLinear(new Color());
      m.roughness = .88; m.metallic = 0; m.renderFace = RenderFace.Double;
      m.shaderData.setFloat("planning_SurfaceGrid", water ? 1 : 0);
      m.shaderData.setFloat("planning_Unlit", water ? 1 : 0);
      m.shaderData.setFloat("planning_Textured", 0);
      m.shaderData.setFloat("planning_SurfaceResolution", 1);
      m.shaderData.setVector2("planning_WorldSize", new Vector2(plan.parameters.width, plan.parameters.depth));
      m.shaderData.setTexture("planning_Surface", this.texture!);
      return m;
    };
    try {
      const ground = planningGroundSurface(plan).sample;
      const parts = planningWhiteboxes(plan, ground);
      for (const layer of ["tree", "rock", "building", "landscape-rock", "bridge"] as const) {
        const boxes = parts.filter((p) => p.layer === layer).flatMap((p) => p.boxes);
        if (!boxes.length) continue;
        const color = planningColor(PLANNING_OBJECT_CSS[layer === "tree" ? "tree" : layer === "building" ? "building" : "rock"]);
        const geometry = whiteboxGeometry(boxes.map((b) => {
          const baseY = b.elevation ?? ground(b.center);
          return { ...b, baseY, y: baseY + b.sizeY / 2 };
        }));
        addV2Surface(engine, resources, layer, geometry, material(color), { upward: false, shadows: true });
      }
      // These are the same water polygons/profile heights as the planning whitebox, not a second river builder.
      const sceneParts = compilePlanningScene(plan);
      for (const layer of ["ocean", "surface-water"] as const) {
        const parts = sceneParts.filter((p) => p.layer === layer);
        if (!parts.length) continue;
        const combined: V2Mesh = { positions: [], indices: [] };
        for (const part of parts) {
          const offset = combined.positions.length / 3;
          for (const p of part.mesh.positions) combined.positions.push(p);
          for (const i of part.mesh.indices) combined.indices.push(offset + i);
        }
        addV2Surface(engine, resources, layer, combined, material(parts[0].color, true), { shadows: false });
      }
      return resources;
    } catch (error) { destroyV2ViewResources(resources); throw error; }
  }


  private applyVisibility(): void {
    const world = this.options.getWorld();
    if (this.enabled && world) {
      if (this.hiddenWorld?.world !== world) this.hiddenWorld = { world, active: world.root.isActive };
      world.root.isActive = false;
    } else if (this.hiddenWorld) {
      if (!this.hiddenWorld.world.root.destroyed) this.hiddenWorld.world.root.isActive = this.hiddenWorld.active;
      this.hiddenWorld = undefined;
    }
    this.root.isActive = this.enabled;
    this.options.setWaterVisible(!this.enabled);
    this.button.setAttribute("aria-pressed", String(this.enabled));
    this.button.style.background = this.enabled ? "#c6dded" : "#f1efdf";
    this.button.style.borderColor = this.enabled ? "#6897b9" : "#bdc8b1";
    this.button.dataset.mode = this.enabled ? "obb" : "native";
    if (this.publishedEnabled !== this.enabled) {
      this.publishedEnabled = this.enabled;
      if (!this.disposed) this.options.onRepresentationChanged?.(this.enabled);
    }
  }
}
