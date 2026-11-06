import type { SeedWorldTerrainRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import type { PreparedSeedWorldAuthoritativeWaterSceneV1 } from "@galacean/engine-world-planning/runtime/SeedWorldWaterRuntime";
import type {
  ActiveSeedWorldVisibleGenerationV1,
  PreparedSeedWorldVisibleGenerationV1
} from "./SeedWorldGenerationPublisher.ts";

export interface SeedWorldPreparedVisibleGenerationInputV1 {
  readonly generationId: number;
  readonly terrain: SeedWorldTerrainRuntime;
  readonly waterScene: PreparedSeedWorldAuthoritativeWaterSceneV1;
  readonly reportRollbackError?: (error: unknown) => void;
}

/** Binds one invisible Terrain root and one prepared Water Scene into the Publisher's visible commit. */
export function createSeedWorldPreparedVisibleGenerationV1(
  input: Readonly<SeedWorldPreparedVisibleGenerationInputV1>
): PreparedSeedWorldVisibleGenerationV1 {
  if (input.waterScene.generationId !== input.generationId) {
    throw new Error("Seed World visible Candidate contains cross-generation Water Scene state.");
  }
  input.terrain.root.isActive = false;
  let prepared = true;
  return Object.freeze({
    generationId: input.generationId,
    ready: true,
    visible: false,
    commit: (previous?: ActiveSeedWorldVisibleGenerationV1) => {
      if (!prepared || !input.waterScene.active) {
        throw new Error(`Prepared Seed World visible generation ${input.generationId} is inactive.`);
      }
      // The Water commit performs no asynchronous work and checks staleness before mutating the active body set.
      const publishedWater = input.waterScene.commit();
      previous?.deactivateForReplacement(publishedWater.retiredCleanup);
      input.terrain.root.isActive = true;
      prepared = false;
      return createActiveVisibleGeneration(input.generationId, input.terrain);
    },
    rollback: () => {
      if (!prepared) return;
      prepared = false;
      input.terrain.root.isActive = false;
      void Promise.allSettled([input.waterScene.rollback(), input.terrain.destroy()]).then((results) => {
        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === "rejected")
          .map(({ reason }) => reason);
        if (failures.length === 0) return;
        const error = new AggregateError(
          failures,
          `Seed World visible Candidate ${input.generationId} rollback failed.`
        );
        input.reportRollbackError?.(error);
      });
    }
  });
}

function createActiveVisibleGeneration(
  generationId: number,
  terrain: SeedWorldTerrainRuntime
): ActiveSeedWorldVisibleGenerationV1 {
  let visible = true;
  let retiredWaterCleanup: Promise<void> = Promise.resolve();
  let retirePromise: Promise<void> | undefined;
  return Object.freeze({
    generationId,
    get visible() {
      return visible;
    },
    deactivateForReplacement: (cleanup: Promise<void>) => {
      retiredWaterCleanup = Promise.all([retiredWaterCleanup, cleanup]).then(() => undefined);
      if (!visible) return;
      visible = false;
      terrain.root.isActive = false;
    },
    retire: () => {
      if (retirePromise) return retirePromise;
      visible = false;
      terrain.root.isActive = false;
      retirePromise = Promise.all([terrain.destroy(), retiredWaterCleanup]).then(() => undefined);
      return retirePromise;
    }
  });
}
