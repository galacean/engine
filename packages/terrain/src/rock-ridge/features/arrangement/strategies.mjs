import { generateRidgeScene } from "./ridge.mjs";
import { assembleGrowthScene } from "./growth/assemble.mjs";

// Register algorithms here or inject a registry. The feature coordinator and
// shaping stage know neither shape families nor arrangement implementation.
export function createArrangementRouter(strategies = { ridge: generateRidgeScene, growth: assembleGrowthScene }) {
  return (source, geometries, seed, options = {}) => {
    const method = options.method ?? "ridge",
      arrange = strategies[method];
    if (!arrange) throw new RangeError("Unknown arrangement method: " + method);
    return arrange(source, geometries, seed, options);
  };
}
export const arrangeRockStructure = createArrangementRouter();
