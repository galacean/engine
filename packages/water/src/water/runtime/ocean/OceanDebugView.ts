/** Diagnostic modes shared by Ocean near/far materials and their consumers. */
export enum OceanDebugView {
  Final = 0,
  MacroNormal = 1,
  DetailNormal = 2,
  DepthDensity = 3,
  ShoreDistance = 4,
  Refraction = 5,
  EnvironmentReflection = 6,
  Foam = 7,
  Caustics = 8,
  Lighting = 9,
  Coverage = 10
}

export function assertOceanDebugView(view: number): asserts view is OceanDebugView {
  if (!Number.isInteger(view) || view < OceanDebugView.Final || view > OceanDebugView.Coverage) {
    throw new RangeError(`Unsupported Ocean debug view '${view}'.`);
  }
}
