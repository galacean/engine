import { SEMANTIC_DEFAULTS } from "../semantic-study/WorldPlanningContract";
import { defaultPoiLayout } from "../semantic-study/PoiDistribution";
import { settlementRandom } from "../semantic-study/SettlementGeometry";
import { importPlanningDocument, type PlanningDocument } from "./PlanningDocument";
import profile from "./layout/space-rules.json";

/** Create a first-visit recipe. Explicit imported projects bypass this sampler and keep their authored values.
 * @param seed World identity; named streams and a pinned profile version make initialization reproducible.
 */
export function createSeedPlanningDocument(seed: number): PlanningDocument {
  const poiLayout = defaultPoiLayout();
  const sample = (component: string, ranges: Record<string, number[]>) =>
    Object.fromEntries(
      Object.entries(ranges).map(([key, [a, b]]) => [
        key,
        a + (b - a) * settlementRandom(seed, `initial:${profile.version}:${component}:${key}`)
      ])
    );
  const terrain = sample("terrain", profile.initial.terrain);
  terrain.count = Math.round(terrain.count);
  Object.assign(poiLayout.network, sample("network", profile.initial.network));
  Object.assign(poiLayout.landscape, sample("landscape", profile.initial.landscape));
  const document = importPlanningDocument({
    version: 2,
    parameters: {
      ...SEMANTIC_DEFAULTS,
      seed,
      poiLayout,
      terrainSkeleton: terrain as unknown as NonNullable<typeof SEMANTIC_DEFAULTS.terrainSkeleton>
    },
    edits: {}
  });
  document.samplingVersion = profile.version;
  document.waterAuthoringVersion = 1;
  return document;
}
