/** Closed derivation DAG. Alternatives are OR inputs, never consumer ordering. */
import { WaterFieldSemantic as S } from "./WaterSurfaceFieldTypes";

export const WATER_FIELD_DERIVED_INPUTS: Readonly<Partial<Record<S, readonly S[]>>> = Object.freeze({
  [S.SceneEyeDepth]: Object.freeze([S.SceneRayDepth, S.VerticalDepth]),
  [S.SceneRayDepth]: Object.freeze([S.VerticalDepth]),
  [S.SurfaceNormalDepth]: Object.freeze([S.VerticalDepth]),
  [S.OpticalPath]: Object.freeze([S.SceneRayDepth, S.VerticalDepth])
});

/** Reports a dependency cycle, including its closing vertex; shared by validation and runtime diagnostics. */
export function findWaterFieldDependencyCycle(
  semantic: S,
  dependencies: Readonly<Partial<Record<S, readonly S[]>>>,
  path: readonly S[] = []
): readonly S[] | undefined {
  const index = path.indexOf(semantic);
  if (index >= 0) return Object.freeze([...path.slice(index), semantic]);
  for (const input of dependencies[semantic] ?? []) {
    const cycle = findWaterFieldDependencyCycle(input, dependencies, [...path, semantic]);
    if (cycle) return cycle;
  }
  return undefined;
}
