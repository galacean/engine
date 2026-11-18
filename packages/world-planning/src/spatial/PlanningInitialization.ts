import { SEMANTIC_DEFAULTS } from "../semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "../semantic-study/PoiDistribution";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { importPlanningDocument, type PlanningDocument } from "./PlanningDocument";
import profile from "./layout/space-rules.json";
import {
  initializePlanningPopulation,
  preparePlanningPopulation,
  type PlanningPopulationOptions
} from "./PlanningPopulationInitialization";
export {
  initializePlanningPopulation,
  type PlanningPopulationOptions,
  type PlanningPopulationReceipt
} from "./PlanningPopulationInitialization";

/** Create a first-visit recipe and realize its one-time editable initial population.
 * @param seed World identity; named streams and a pinned profile version make initialization reproducible.
 * @param options Initial world population targets; later explicit parameter changes can replan them.
 * @returns Ordinary author inputs with the completed initialization receipt.
 * @throws For invalid population options or an unrealizable initialization budget.
 */
export function createSeedPlanningDocument(seed: number, options?: PlanningPopulationOptions): PlanningDocument {
  return initializePlanningPopulation(createSeedPlanningInputs(seed), options);
}

/** Prepare first-visit authoring together with its validated structural result for worker-local reuse.
 * @param seed World identity.
 * @param options Initial population ranges.
 * @returns Author document and generated structural result; only the document is persisted.
 */
export function prepareSeedPlanningDocument(
  seed: number,
  options?: PlanningPopulationOptions
): ReturnType<typeof preparePlanningPopulation> {
  return preparePlanningPopulation(createSeedPlanningInputs(seed), options);
}

/** Sample unpopulated world inputs before applying a template or an explicit initial population request.
 * @param seed Deterministic world identity.
 * @returns Author inputs only; no content budget has been applied.
 */
export function createSeedPlanningInputs(seed: number): PlanningDocument {
  const poiLayout = defaultPoiLayout();
  const sample = <T extends Record<string, number[]>>(component: string, ranges: T) =>
    Object.fromEntries(
      Object.entries(ranges).map(([key, [a, b]]) => [
        key,
        a + (b - a) * settlementRandom(seed, `initial:${profile.version}:${component}:${key}`)
      ])
    ) as { [K in keyof T]: number };
  const { count, ...terrain } = sample("terrain", profile.initial.terrain);
  const terrainCount = Math.round(count);
  Object.assign(poiLayout.network, sample("network", profile.initial.network));
  Object.assign(poiLayout.landscape, sample("landscape", profile.initial.landscape));
  const document = importPlanningDocument({
    version: 2,
    parameters: {
      ...SEMANTIC_DEFAULTS,
      seed,
      poiLayout,
      terrainSkeleton: { ...terrain, countMin: terrainCount, countMax: terrainCount }
    },
    edits: {}
  });
  document.samplingVersion = profile.version;
  document.waterAuthoringVersion = 1;
  return document;
}
