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

interface CachedPlotLayout {
  cellX: number;
  cellZ: number;
  availability: string;
  preparation: string;
}
interface CachedContainerLayout {
  typeId: string;
  x: number;
  z: number;
  yaw: number;
}

/** Domain snapshots provide occupancy; host vegetation owns the resulting rendering overlay. */
export class PlanningFarmingVegetation {
  private readonly owner: string;
  private readonly unsubscribe: () => void;
  private key = "";
  private hasInputSnapshot = false;
  private cachedOriginX = NaN;
  private cachedOriginZ = NaN;
  private cachedCellSize = NaN;
  private readonly cachedPlots: CachedPlotLayout[] = [];
  private cachedPlotCount = 0;
  private readonly cachedContainers: CachedContainerLayout[] = [];
  private cachedContainerCount = 0;
  private queue: Promise<void> = Promise.resolve();
  private disposed = false;
  private cleanup?: Promise<void>;
  private state: "pending" | "ready" | "failed" = "pending";
  private error?: string;
  constructor(
    private readonly options: {
      service: FarmingService;
      definitions: FarmingStorageDefinitions;
      land?: {
        setBounds(
          bounds: readonly GroundBounds[],
          grass: readonly GroundBounds[],
          opaquePlots?: readonly GroundBounds[]
        ): void;
      };
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
  private inputsUnchanged(snapshot: FarmSnapshot): boolean {
    if (!this.hasInputSnapshot) return false;
    const grid = snapshot.grid;
    if (grid.originX !== this.cachedOriginX || grid.originZ !== this.cachedOriginZ || grid.cellSize !== this.cachedCellSize)
      return false;
    const plots = snapshot.plots;
    if (plots.length !== this.cachedPlotCount) return false;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      const prev = this.cachedPlots[i];
      if (
        plot.cellX !== prev.cellX ||
        plot.cellZ !== prev.cellZ ||
        plot.ground.availability !== prev.availability ||
        plot.soil.preparation !== prev.preparation
      )
        return false;
    }
    const containers = snapshot.storage.containers;
    if (containers.length !== this.cachedContainerCount) return false;
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const prev = this.cachedContainers[i];
      if (
        container.typeId !== prev.typeId ||
        container.position[0] !== prev.x ||
        container.position[2] !== prev.z ||
        container.yaw !== prev.yaw
      )
        return false;
    }
    return true;
  }
  private rememberInputs(snapshot: FarmSnapshot): void {
    const grid = snapshot.grid;
    this.cachedOriginX = grid.originX;
    this.cachedOriginZ = grid.originZ;
    this.cachedCellSize = grid.cellSize;
    const plots = snapshot.plots;
    this.cachedPlotCount = plots.length;
    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i];
      const entry = this.cachedPlots[i];
      if (entry) {
        entry.cellX = plot.cellX;
        entry.cellZ = plot.cellZ;
        entry.availability = plot.ground.availability;
        entry.preparation = plot.soil.preparation;
      } else {
        this.cachedPlots.push({
          cellX: plot.cellX,
          cellZ: plot.cellZ,
          availability: plot.ground.availability,
          preparation: plot.soil.preparation
        });
      }
    }
    const containers = snapshot.storage.containers;
    this.cachedContainerCount = containers.length;
    for (let i = 0; i < containers.length; i++) {
      const container = containers[i];
      const entry = this.cachedContainers[i];
      if (entry) {
        entry.typeId = container.typeId;
        entry.x = container.position[0];
        entry.z = container.position[2];
        entry.yaw = container.yaw;
      } else {
        this.cachedContainers.push({
          typeId: container.typeId,
          x: container.position[0],
          z: container.position[2],
          yaw: container.yaw
        });
      }
    }
    this.hasInputSnapshot = true;
  }
  private publish(snapshot: FarmSnapshot): void {
    if (this.disposed || !this.options.isCurrent()) return;
    if (this.inputsUnchanged(snapshot)) return;
    const footprint = planningFarmLandFootprint(snapshot, this.options.definitions);
    const operation = farmingOperationBounds(snapshot.grid, footprint.plots, footprint.grass);
    const bounds = planningFarmVegetationBounds(snapshot, operation);
    // Keep the grass carpet, but clear other plants/companion rocks across the farm's existing transition band.
    const naturalBounds = planningFarmLandBounds([...bounds, ...footprint.grass]);
    this.rememberInputs(snapshot);
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
        this.options.land?.setBounds(footprint.plots, footprint.grass, footprint.opaquePlots);
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
