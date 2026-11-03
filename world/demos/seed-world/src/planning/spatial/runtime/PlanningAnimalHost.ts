import { querySeedAnimalCatalog } from "./PlanningAnimalCatalog.ts";
import type { PlanningAnimalSurfaceData } from "./PlanningAnimalSurface.ts";
import type { Entity } from "@galacean/engine";
import type { AnimalPopulationConfig } from "@galacean/engine-animals/gameplay/animal/AnimalPopulation";
import type { AnimalWorldEvent } from "@galacean/engine-animals/gameplay/animal/AnimalTaskController";
import type {
  SeedWorldAnimalSpawn,
  SeedWorldAnimalCommand,
  SeedWorldAnimalQuery,
  SeedWorldAnimalReceipt,
  SeedWorldAnimalService
} from "../../../../agent-adapter/ports/SeedWorldAnimalService.ts";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { PlanningAnimalNavigation } from "./PlanningAnimalHabitat.ts";
import type { PlanningAnimalPanelSnapshot } from "./PlanningAnimalPanel.ts";
import type { PlanningAnimalRuntime, PlanningAnimalInteractions } from "./PlanningAnimalRuntime.ts";

type Runtime = Pick<
  PlanningAnimalRuntime,
  | "spawn"
  | "synchronize"
  | "update"
  | "dispose"
  | "query"
  | "describe"
  | "command"
  | "receipt"
  | "commandFromPanel"
  | "notify"
  | "position"
  | "observationPosition"
  | "inspect"
  | "shoo"
>;
type RuntimeModule = {
  PlanningAnimalRuntime: new (
    parent: Entity,
    observer: () => Readonly<{ x: number; z: number; y?: number }>,
    interactions?: PlanningAnimalInteractions
  ) => Runtime;
};
type PopulationInput = {
  plan: IslandPlan;
  config: AnimalPopulationConfig;
  navigation: PlanningAnimalNavigation;
  preservePopulation: boolean;
  surface?: PlanningAnimalSurfaceData;
};

/** Lightweight scene boundary: disabled animals import no runtime content, build no habitat and install no frame callback. */
export class PlanningAnimalHost implements SeedWorldAnimalService {
  /** Called by the scene only after its main publication is ready; absent while disabled. */
  advance?: (seconds: number) => void;
  private enabled = false;
  private disposed = false;
  private pending?: PopulationInput;
  private runtime?: Runtime;
  private module?: RuntimeModule;
  private loading = false;
  private attempted = false;
  private errors: string[] = [];
  private readonly cleanups = new Set<Promise<void>>();

  constructor(
    private readonly parent: Entity,
    private readonly observer: () => Readonly<{ x: number; z: number; y?: number }>,
    private readonly load: () => Promise<RuntimeModule> = () => import("./PlanningAnimalRuntime.ts"),
    private readonly interactions: PlanningAnimalInteractions = {}
  ) {}

  /** Publication only records the latest demand. Model loading never participates in the world's publication promise. */
  synchronize(
    plan: IslandPlan,
    config: AnimalPopulationConfig,
    navigation: PlanningAnimalNavigation,
    options: { preservePopulation?: boolean; surface?: PlanningAnimalSurfaceData } = {}
  ): void {
    if (this.disposed) return;
    this.enabled = config.enabled;
    this.errors = [];
    this.attempted = false;
    if (!config.enabled) {
      this.pending = undefined;
      this.advance = undefined;
      this.release();
      return;
    }
    // A queued full publication must still rebuild even if a content edit arrives before the next frame.
    const preservePopulation = !!options.preservePopulation && (this.pending?.preservePopulation ?? true);
    this.pending = { plan, config: structuredClone(config), navigation, preservePopulation, surface: options.surface };
    this.advance = (seconds) => this.update(seconds);
  }

  private update(seconds: number): void {
    if (!this.enabled || this.disposed) return;
    if (!this.runtime) {
      if (this.module) {
        try {
          this.runtime = new this.module.PlanningAnimalRuntime(this.parent, this.observer, this.interactions);
        } catch (error) {
          this.fail(error);
          return;
        }
      } else {
        if (!this.loading && !this.attempted) {
          this.loading = this.attempted = true;
          try {
            void this.load()
              .then((module) => {
                // Importing cannot be aborted; construction and resource loading remain guarded by current demand.
                if (!this.disposed) this.module = module;
              })
              .catch((error) => {
                if (this.enabled && !this.disposed) this.fail(error);
              })
              .finally(() => {
                this.loading = false;
              });
          } catch (error) {
            this.loading = false;
            this.fail(error);
          }
        }
        return;
      }
    }
    try {
      if (this.pending) {
        const input = this.pending;
        this.pending = undefined;
        if (input.surface || input.preservePopulation)
          this.runtime.synchronize(input.plan, input.config, input.navigation, {
            ...(input.preservePopulation ? { preservePopulation: true } : {}),
            ...(input.surface ? { surface: input.surface } : {})
          });
        else this.runtime.synchronize(input.plan, input.config, input.navigation);
      }
      this.runtime.update(seconds);
    } catch (error) {
      this.fail(error);
    }
  }

  private fail(error: unknown): void {
    this.errors = [String(error)];
    this.advance = undefined;
    this.release();
  }

  catalog = querySeedAnimalCatalog;

  spawn(input: SeedWorldAnimalSpawn) {
    return (
      this.runtime?.spawn(input) ?? {
        requestId: input.requestId,
        status: "rejected" as const,
        reason: this.unavailable()
      }
    );
  }

  query(input: SeedWorldAnimalQuery) {
    return (
      this.runtime?.query(input) ?? { enabled: this.enabled, animals: [], matchedCount: 0, offset: input.offset ?? 0 }
    );
  }

  describe(input: { id: string }) {
    return (
      this.runtime?.describe(input) ?? {
        ...input,
        available: false,
        reason: this.unavailable(),
        skills: [],
        targets: []
      }
    );
  }

  command(input: SeedWorldAnimalCommand): SeedWorldAnimalReceipt {
    return this.runtime?.command(input) ?? { ...input, status: "rejected", reason: this.unavailable() };
  }

  receipt(input: { id: string; requestId: string }): SeedWorldAnimalReceipt {
    return this.runtime?.receipt(input) ?? { ...input, status: "not_found", reason: this.unavailable() };
  }

  commandFromPanel(id: string, skillId: "idle" | "startle" | "eat"): void {
    this.runtime?.commandFromPanel(id, skillId);
  }
  /** Broadcast a real environmental event without importing or loading disabled animal content. */
  notify(event: AnimalWorldEvent): number {
    return this.enabled && !this.disposed ? this.runtime?.notify(event) ?? 0 : 0;
  }
  /** Dispatch a range-limited physical player click without loading disabled animal resources. */
  shoo(...args: Parameters<PlanningAnimalRuntime["shoo"]>): boolean {
    return this.enabled && !this.disposed ? this.runtime?.shoo(...args) ?? false : false;
  }
  position(id: string) {
    return this.runtime?.position(id);
  }
  observationPosition(id: string, eyeHeight: number) {
    return this.runtime?.observationPosition(id, eyeHeight);
  }

  inspect(evidence = false): PlanningAnimalPanelSnapshot & Record<string, unknown> {
    if (this.runtime) return this.runtime.inspect(evidence);
    return {
      seed: this.pending?.plan.parameters.seed ?? 0,
      loading: this.enabled && !this.errors.length,
      total: 0,
      loaded: 0,
      visible: 0,
      sharedResources: 0,
      origin: null,
      range: null,
      errors: this.errors.slice(),
      animals: [],
      ...(evidence ? { enabled: this.enabled, runtimeInitialized: false, pendingLoads: 0 } : {})
    };
  }

  private unavailable(): string {
    return this.enabled ? "not_ready" : "disabled";
  }

  private release(): void {
    const runtime = this.runtime;
    this.runtime = undefined;
    if (!runtime) return;
    const cleanup = runtime
      .dispose()
      .catch((error) => {
        this.errors.push(String(error));
      })
      .finally(() => this.cleanups.delete(cleanup));
    this.cleanups.add(cleanup);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.enabled = false;
    this.pending = undefined;
    this.advance = undefined;
    this.release();
    await Promise.allSettled([...this.cleanups]);
  }
}
