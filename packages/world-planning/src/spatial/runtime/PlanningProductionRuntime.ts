import { type Camera, type Entity, type WebGLEngine } from "@galacean/engine";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import { planningAlphamap } from "../../semantic-study/PlanningAlphamap";
import { planningHeightmap } from "../../semantic-study/PlanningHeightmap";
import type { PlanningTerrainView } from "../../semantic-study/PlanningTerrainView";
import { warmupSeedWorldRendererVariants } from "../../world/SeedWorldShaderWarmup";
import { PlanningPopulationRuntime } from "./PlanningPopulationRuntime";
import { PlanningWaterRuntime } from "./PlanningWaterRuntime";
import { PLANNING_RUNTIME_OPTIONS } from "./RuntimeOptions";
import { WorldTemplateRuntime } from "./WorldTemplateRuntime";

/** Production renderers for a published layout. This owner never invokes a world generator. */
export class PlanningProductionRuntime {
  private population?: PlanningPopulationRuntime;
  private template?: WorldTemplateRuntime;
  private constructor(
    private root: Entity,
    private readonly water: PlanningWaterRuntime
  ) {}
  /** Fetch reusable Seed assets while the raster worker prepares the same plan. */
  static prepareResources(engine: WebGLEngine): Promise<void> {
    return PlanningPopulationRuntime.prepareResources(engine);
  }
  /** Prepare a hidden candidate, then let the view publish it together with its terrain.
   * @param plan Immutable layout shared with the planner and whitebox.
   * @returns Fully initialized, caller-owned renderer set.
   */
  static async create(
    engine: WebGLEngine,
    parent: Entity,
    camera: Camera,
    plan: IslandPlan,
    terrain: PlanningTerrainView,
    water: PlanningWaterRuntime
  ): Promise<PlanningProductionRuntime> {
    const root = parent.createChild("Seed production appearance");
    root.isActive = false;
    const runtime = new PlanningProductionRuntime(root, water);
    try {
      runtime.population = await PlanningPopulationRuntime.create(engine, root, camera, plan, {
        height: planningHeightmap(plan),
        alpha: planningAlphamap(plan),
        terrainMaterial: terrain.productionMaterial,
        grassColorField: terrain.grassColorField
      });
      runtime.template = await WorldTemplateRuntime.create(root, plan, (x, z) =>
        planningHeightmap(plan).sample({ x, z })
      );

      if (PLANNING_RUNTIME_OPTIONS.precompileShaders) runtime.population.warmup();
      await warmupSeedWorldRendererVariants(engine, engine.sceneManager.activeScene!, camera, [parent], {
        enabled: PLANNING_RUNTIME_OPTIONS.precompileShaders,
        includeGpuInstancing: true,
        strict: true
      });
      return runtime;
    } catch (error) {
      await runtime.dispose();
      throw error;
    }
  }
  /** Advance production streaming and water animation using the shared scene camera. */
  update(deltaSeconds: number): void {
    this.population?.update(deltaSeconds);
    this.water.update(deltaSeconds);
  }
  /** Render-layer switches affect presentation only, never the authoring parameters. */
  setLayers(layers: Readonly<Record<string, boolean>>, active: boolean): void {
    this.root.isActive = active;
    this.population?.setLayers(layers, active);
    this.water.setVisible(
      active && layers.ocean !== false,
      active && layers.water !== false && layers["surface-water"] !== false
    );
  }
  /** Diagnostics describe the actually mounted engine systems. */
  getDiagnostics() {
    return {
      population: this.population?.getDiagnostics(),

      precompileShaders: PLANNING_RUNTIME_OPTIONS.precompileShaders
    };
  }
  /** Release candidate population only; the view owns its one camera-bound Water host across replacements. */
  async dispose(): Promise<void> {
    this.population?.dispose();
    this.template?.dispose();
    this.root.destroy();
  }
}
