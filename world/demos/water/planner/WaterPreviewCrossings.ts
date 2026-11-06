import { type Engine, type Entity } from "@galacean/engine";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { SuspensionBridgeView } from "@galacean/engine-water/bridges/SuspensionBridgeView";

/** Shared Planner bridge/approach geometry, owned by the same hidden candidate as Terrain. */
export class WaterPreviewCrossings {
  private bridges?: SuspensionBridgeView;
  private readonly root: Entity;
  private readonly dependency: string;
  matches(plan: IslandPlan): boolean {
    return this.dependency === WaterPreviewCrossings.key(plan);
  }
  private static key(plan: IslandPlan): string {
    return JSON.stringify([plan.bridges, plan.roadApproaches]);
  }
  /** Called only inside the synchronous joint commit. Preparation leaves the old parent untouched. */
  reparent(parent: Entity): void {
    parent.addChild(this.root);
  }
  static async create(engine: Engine, parent: Entity, plan: IslandPlan, signal?: AbortSignal): Promise<WaterPreviewCrossings> {
    const result = new WaterPreviewCrossings(parent, plan);
    try {
      result.bridges = await SuspensionBridgeView.create(engine, result.root, plan.bridges, signal); return result;
    }
    catch (error) { result.dispose(); throw error; }
  }
  private constructor(parent: Entity, plan: IslandPlan) {
    this.dependency = WaterPreviewCrossings.key(plan);
    this.root = parent.createChild("River crossings");
  }
  setVisible(visible: boolean): void {
    this.root.isActive = visible;
  }
  dispose(): void {
    this.bridges?.dispose(); this.bridges = undefined;
    this.root.destroy();
  }
}
