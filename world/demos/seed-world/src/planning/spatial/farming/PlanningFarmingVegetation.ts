import type {
  FarmSnapshot,
  FarmingService,
  FarmingStorageDefinitions,
  GroundBounds
} from "@galacean/engine-farming/farming/api/index";
import { planningFarmLandBounds, planningFarmLandFootprint, planningFarmVegetationBounds } from "./PlanningFarmLandCoverage.ts";
import { farmingOperationBounds } from "@galacean/engine-farming/farming/application/FarmingStarter";
import type { PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { farmingBoundsOutline } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmingGround";

/** Domain snapshots provide occupancy; host vegetation owns the resulting rendering overlay. */
export class PlanningFarmingVegetation {
  private readonly owner: string;
  private readonly unsubscribe: () => void;
  private key = "";
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private cleanup?: Promise<void>;
  private state: "pending" | "ready" | "failed" = "pending";
  private error?: string;
  constructor(
    private readonly options: {
      service: FarmingService;
      definitions: FarmingStorageDefinitions;
      land?: { setBounds(bounds: readonly GroundBounds[], grass: readonly GroundBounds[]): void };
      groundCover: { setGroundCoverExclusions(owner: string, areas: readonly GroundBounds[]): Promise<void> };
      vegetation?: { setGroundExclusions(owner: string, outlines: readonly (readonly PlanPoint[])[]): void };
      isCurrent: () => boolean;
      isWorldCurrent?: () => boolean;
    }
  ) {
    this.owner = `${options.service.getSnapshot().farmId}/ground-cover`;
    this.unsubscribe = options.service.subscribe((change) => {
      this.publish(change.snapshot);
    });
    this.publish(options.service.getSnapshot());
  }
  get whenSettled(): Promise<void> {
    return this.queue;
  }
  get diagnostics() {
    return { state: this.state, error: this.error };
  }
  private publish(snapshot: FarmSnapshot): void {
    if (this.disposed || !this.options.isCurrent()) return;
    const footprint = planningFarmLandFootprint(snapshot, this.options.definitions);
    const operation = farmingOperationBounds(snapshot.grid, footprint.plots, footprint.grass);
    const bounds = planningFarmVegetationBounds(snapshot, operation);
    // Keep the grass carpet, but clear other plants/companion rocks across the farm's existing transition band.
    const naturalBounds = planningFarmLandBounds([...bounds, ...footprint.grass]);
    const key = JSON.stringify([bounds, footprint]);
    if (key === this.key) return;
    this.key = key;
    this.state = "pending";
    this.error = undefined;
    const current = () => !this.disposed && this.options.isCurrent() && key === this.key;
    this.queue = this.queue.then(async () => {
      if (!current()) return;
      try {
        // Keep the existing vegetation footprint: density masks already include interpolation support.
        // Expanding that mask again would create a new bare-grass halo outside the dirt layer.
        this.options.land?.setBounds(footprint.plots, footprint.grass);
        await this.options.groundCover.setGroundCoverExclusions(this.owner, bounds);
        if (!current()) return;
        this.options.vegetation?.setGroundExclusions(this.owner, naturalBounds.map(farmingBoundsOutline));
        this.state = "ready";
      } catch (error) {
        if (!current()) return;
        this.error = String(error);
        this.state = "failed";
      }
    });
  }
  dispose(): Promise<void> {
    if (this.cleanup) return this.cleanup;
    if (!this.disposed) this.unsubscribe();
    this.disposed = true;
    // Runtime cancellation must not suppress cleanup of the still-visible world's overlays.
    const isWorldCurrent = this.options.isWorldCurrent ?? this.options.isCurrent;
    this.queue = this.queue.catch(() => undefined).then(async () => {
      if (!isWorldCurrent()) return;
      this.options.vegetation?.setGroundExclusions(this.owner, []);
      await this.options.groundCover.setGroundCoverExclusions(this.owner, []);
    });
    this.cleanup = this.queue;
    void this.cleanup.catch(() => { this.cleanup = undefined; });
    return this.cleanup;
  }
}
