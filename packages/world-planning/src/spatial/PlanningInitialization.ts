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
  addInitialBackdrop(document, seed);
  document.samplingVersion = profile.version;
  document.waterAuthoringVersion = 1;
  return document;
}

/** One-time composition, persisted as ordinary editable solids and generator parameters.
 * Neither a visibility constraint nor a separate mountain renderer participates in replay.
 */
function addInitialBackdrop(document: PlanningDocument, seed: number): void {
  const halfMap = 512;
  for (const [layer, band] of profile.initial.backdrop.entries()) {
    for (let i = 0; i < band.count; i++) {
      const id = `backdrop-${layer}-${i}`;
      const sample = (key: string, range: number[]) =>
        range[0] + (range[1] - range[0]) * settlementRandom(seed, `${id}:${key}`);
      // Two overlapping long solids form an uneven ridge; leave broad gaps between the three ranges.
      const group = Math.floor(i / 2),
        offset = ((i % 2) - 0.5) * 0.24;
      const angle = ((group + band.phase + offset + sample("spacing", [-0.02, 0.02])) * Math.PI * 2) / (band.count / 2);
      const width = sample("width", band.width),
        depth = sample("depth", band.depth);
      const radius = halfMap / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))) + band.gapM + depth / 2;
      document.entities[id] = {
        id,
        name: `远山 ${i + 1}`,
        parent: "world",
        origin: "authored",
        components: {
          solid: {
            values: {
              x: halfMap + Math.cos(angle) * radius,
              z: halfMap + Math.sin(angle) * radius,
              width,
              depth,
              height: sample("height", band.height),
              elevation: -35,
              yawDegrees: (angle * 180) / Math.PI + 90 + sample("heading", [-15, 15])
            }
          },
          rockFormation: {
            base: { entity: "world", component: "rockFormation" },
            values: {
              topScale: sample("top", band.topScale),
              bottomScale: 1,
              shoulderScale: sample("shoulder", [0.65, 0.78]),
              shoulderHeight: sample("shoulderHeight", [0.4, 0.55]),
              topRoughness: sample("relief", [0.55, 0.85]),
              topSlope: sample("slope", band.topSlope),
              topDirection: sample("direction", [15, 35]) + (i % 2) * 180,
              variation: 0,
              wallCount: 10,
              wallLength: 2.3,
              wallOverlap: 0.7,
              wallProtrusion: 0.5,
              wallStrength: 0.65,
              wallTilt: sample("tilt", [-25, 25]),
              outlineIrregularity: 0.75
            }
          }
        }
      };
    }
  }
}
