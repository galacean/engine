import type { Engine } from "@galacean/engine";
import { fitRockVariant, pickRockVariant, prepareRockVariant, rockVariantFit, rockVariantPools } from "./Variants";
import { planningGroundSurface } from "../../../semantic-study/PlanningHeightmap.ts";
import type { IslandPlan } from "../../../semantic-study/IslandPlanModel.ts";
import { rockFormationJobs } from "./Jobs.ts";
import type { RockFormationMesh } from "@galacean/engine-terrain/rock-formation/types";

/** Fit catalog assets to the plan's existing envelopes. */
export class RockFormationClient {
  private disposed = false;
  private readonly resultKeys = new WeakMap<RockFormationMesh, string>();
  preparationMetrics = { totalMs: 0, fitted: 0, cached: 0 };

  constructor(private readonly engine: () => Engine) {}

  async prepare(
    plan: IslandPlan,
    signal: AbortSignal,
    resident: readonly RockFormationMesh[] = []
  ): Promise<readonly RockFormationMesh[]> {
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Rock formation client disposed");
    const started = performance.now();
    const pools = rockVariantPools(plan);
    if (!pools) {
      this.preparationMetrics = { totalMs: performance.now() - started, fitted: 0, cached: 0 };
      return [];
    }
    const jobs = rockFormationJobs(plan, planningGroundSurface(plan));
    const engine = this.engine();
    const live = new Map(resident.map((formation) => [formation.id, formation]));
    const tasks = new Map<string, ReturnType<typeof prepareRockVariant>>();
    const results = await Promise.all(
      jobs.map(async (job) => {
        const grass = job.surfaceGrass !== false;
        const entry = pickRockVariant(grass ? pools.mountains : pools.stones, job.seed);
        if (!entry) throw Error(`Missing rock variants for ${job.id}`);
        const key = JSON.stringify([job, entry]);
        const previous = live.get(job.id);
        if (previous && this.resultKeys.get(previous) === key) return previous;
        let task = tasks.get(entry.id);
        if (!task) tasks.set(entry.id, (task = prepareRockVariant(engine, entry)));
        const asset = await task;
        signal.throwIfAborted();
        const matrix = rockVariantFit(job, asset);
        const formation = fitRockVariant(job, asset, matrix, grass);
        this.resultKeys.set(formation, key);
        return formation;
      })
    );
    signal.throwIfAborted();
    if (this.disposed) throw new Error("Rock formation client disposed");
    const cached = results.filter((formation) => live.get(formation.id) === formation).length;
    this.preparationMetrics = { totalMs: performance.now() - started, fitted: results.length - cached, cached };
    return results;
  }

  dispose(): void {
    this.disposed = true;
  }
}
