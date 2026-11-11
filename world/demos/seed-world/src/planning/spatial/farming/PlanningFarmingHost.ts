import type { FarmingSystem } from "@galacean/engine-farming/farming/native/index";
import type { RuntimeSceneProjection } from "@galacean/engine-runtime-editor/runtime-editor/scene/runtime-scene-projection";
import { planningFarmingStatePath } from "./PlanningFarmingAssets.ts";
import type { PlanningFarmingRuntime } from "./PlanningFarmingRuntime.ts";
import { PlanningFarmingSwitch } from "./PlanningFarmingSwitch.ts";

/** Owns the runtime consumer. Initialization and recovery facts belong to the
 * selected persisted farm, independently of Source/native component lifetime. */
export class PlanningFarmingHost {
  readonly switch = new PlanningFarmingSwitch(enabled => this.reconcile(enabled));
  private current?: PlanningFarmingRuntime;
  private retired?: PlanningFarmingRuntime;
  private disposed = false;
  private readonly systemEnabled = new WeakMap<FarmingSystem, boolean>();

  constructor(private readonly options: {
    projection: Pick<RuntimeSceneProjection, "queryComponents" | "resolveComponent" | "readComponent">;
    isPlannedEnabled(): boolean;
    create(system: FarmingSystem, statePath: string): PlanningFarmingRuntime;
    publish(runtime: PlanningFarmingRuntime): void;
  }) {}

  get runtime(): PlanningFarmingRuntime | undefined { return this.current; }

  private async retire(): Promise<void> {
    if (this.retired) {
      await this.retired.dispose();
      this.retired = undefined;
    }
    if (this.current) {
      this.retired = this.current;
      this.current = undefined;
      await this.retired.dispose();
      this.retired = undefined;
    }
  }

  private async reconcile(sessionEnabled: boolean): Promise<void> {
    if (this.disposed) return;
    const enabled = sessionEnabled && this.options.isPlannedEnabled();
    const projection = this.options.projection;
    const identities = projection.queryComponents({ type: "FarmingSystem" });
    for (const identity of identities) (projection.resolveComponent(identity) as FarmingSystem).assertScene();
    const identity = identities.find(value => !(projection.resolveComponent(value) as FarmingSystem).isDisposed);
    const system = identity ? projection.resolveComponent(identity) as FarmingSystem : undefined;
    const statePath = identity ? planningFarmingStatePath(projection.readComponent(identity)) : undefined;
    if (this.retired) await this.retire();
    if (this.disposed) return;
    if (system) {
      if (!enabled) {
        if (!this.systemEnabled.has(system)) this.systemEnabled.set(system, system.enabled);
        system.enabled = false;
      } else if (this.systemEnabled.has(system)) {
        system.enabled = this.systemEnabled.get(system)!;
        this.systemEnabled.delete(system);
      }
    }
    if (enabled && system && this.current &&
      this.current.system === system && this.current.usesAssets(system, statePath!)) {
      this.current.synchronizeStateResource();
      return;
    }
    await this.retire();
    if (!enabled || !system || this.disposed) return;
    this.current = this.options.create(system, statePath!);
    this.options.publish(this.current);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    // Join an in-flight reconciliation before releasing its last runtime owner.
    await this.switch.refresh();
    await this.retire();
  }
}
