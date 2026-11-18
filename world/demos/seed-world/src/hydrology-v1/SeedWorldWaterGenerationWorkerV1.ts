import {
  collectWaterGenerationPreparedTransferablesV1,
  WaterGenerationPreparerV1,
  type WaterGenerationPreparedTransferV1
} from "@galacean/engine-water/water/runtime/index";
import type { SeedWorldAuthoritativeGenerationBuildResultV1 } from "./SeedWorldAuthoritativeGenerationBuilderV1.ts";
import { SeedWorldWaterBackendSourceCompilerV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldWaterBackendSourceCompiler";
import { adaptSeedWorldHydrologyToWaterPcgV1 } from "@galacean/engine-world-planning/runtime/hydrology-v1/SeedWorldWaterPcgAdapter";

const workerPreparer = new WaterGenerationPreparerV1({
  // Backend routing is an Engine/runtime concern. The Worker only compiles the
  // deterministic Seed World source compiler selected below.
  requireBackendRoute: () => undefined,
  bodySourceCompilers: [new SeedWorldWaterBackendSourceCompilerV1()]
});

/** Compiles CPU-only Water artifacts while the authoritative build still lives in its Worker. */
export function compileSeedWorldWaterGenerationInWorkerV1(
  build: Readonly<SeedWorldAuthoritativeGenerationBuildResultV1>,
  generationId: number
): Readonly<WaterGenerationPreparedTransferV1> {
  const abort = new AbortController();
  const adapted = adaptSeedWorldHydrologyToWaterPcgV1({
    generationId,
    artifact: build.artifact,
    hfinalSnapshot: build.hfinalSnapshot,
    hydrologyWaterBodies: build.plannedHydrologyWaterBodies,
    renderErrorBudget: build.errorBudget.render,
    signal: abort.signal
  });
  return workerPreparer.compileGenerationForTransfer(adapted.assetSet, adapted.compileContext);
}

/** Collects unique ArrayBuffers so Worker publication transfers rather than clones large rasters. */
export function seedWorldWaterGenerationTransferablesV1(
  transferred: Readonly<WaterGenerationPreparedTransferV1>
): Transferable[] {
  return collectWaterGenerationPreparedTransferablesV1(transferred);
}
