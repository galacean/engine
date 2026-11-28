import type { IslandPlan } from "../semantic-study/IslandPlanModel";
import type { ConstructionTerrainGrid } from "@galacean/engine-building/building/runtime/TerrainField";
import type { BuildingUnitAssets } from "@galacean/engine-building/building/runtime/BuildingUnitAssets";
import { initialBuildingDrafts } from "./BuildingInitialDraft";
import {
  designInitialBuildingGroup,
  type InitialBuildingGroupOutput
} from "@galacean/engine-building/building/parts/architecture/BuildingInitialGroup";
import { BuildingCpuClient } from "@galacean/engine-building/building/parts/architecture/BuildingCpuClient";

/** Returns true only when the plan yields at least one authored building group. */
export function hasInitialBuildings(plan: IslandPlan): boolean {
  return initialBuildingDrafts(plan).length > 0;
}

/** One-shot creation from published planning intent. Style builders publish parts
 * directly; mounted parts that the design does not lay, such as a window inside a
 * neighbouring house, are never saved as objects. */
export async function initialBuildingSource(
  plan: IslandPlan,
  terrain: ConstructionTerrainGrid,
  assets: BuildingUnitAssets,
  library: string,
  signal?: AbortSignal,
  layoutKey?: string,
  compiler?: BuildingCpuClient
): Promise<InitialBuildingGroupOutput> {
  const result: InitialBuildingGroupOutput = { rootEntities: [], entities: [], components: [] };
  const groups = initialBuildingDrafts(plan);
  if (groups.length === 0) return result;
  signal?.throwIfAborted();

  // Fan out independent building groups across the multi-worker BuildingWorker pool in browser
  // runtimes so initial masonry design never stalls water/vegetation creation on the main thread.
  if (typeof Worker === "function") {
    const ownedCompiler = compiler ? undefined : new BuildingCpuClient();
    const activeCompiler = compiler ?? ownedCompiler!;
    const effectiveSignal = signal ?? new AbortController().signal;
    try {
      const fragments = await Promise.all(
        groups.map((group) =>
          activeCompiler.designInitialGroup(
            { id: group.id, draft: group.draft, position: group.position },
            terrain,
            assets,
            library,
            layoutKey,
            effectiveSignal
          )
        )
      );
      signal?.throwIfAborted();
      for (const source of fragments) {
        result.rootEntities.push(...source.rootEntities);
        result.entities.push(...source.entities);
        result.components.push(...source.components);
      }
      return result;
    } finally {
      ownedCompiler?.dispose();
    }
  }

  let sliceStart = performance.now();
  for (const group of groups) {
    signal?.throwIfAborted();
    const source = designInitialBuildingGroup(group, terrain, assets, library, layoutKey);
    result.rootEntities.push(...source.rootEntities);
    result.entities.push(...source.entities);
    result.components.push(...source.components);
    if (performance.now() - sliceStart >= 16) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  signal?.throwIfAborted();
  return result;
}
