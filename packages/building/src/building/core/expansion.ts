import { multiply, type Vec3 } from "./math";
import { deriveSeed, Random } from "./random";
import {
  bindSurfaces,
  EffectiveGeometry,
  type BuildingEnvironment,
  type BuildingGeometry,
  type Frame
} from "./geometry";
import { stretchIssue, unitMatrix, unitStretch, type AssetRef, type BuildingUnit } from "./unit";
import type { LaidUnitSpec, LayingContext } from "./algorithms";
import type { BuildingRegistry } from "./builtins";
import type { GeometryModification } from "./geometry";

/** One laid unit, computed on demand from a part's layout. Nothing stores it. */
export interface LaidUnit {
  readonly key: string;
  readonly seed: number;
  readonly source: AssetRef;
  /** The laying frame the algorithm chose. */
  readonly frame: Frame;
  /** Laid size per unit-local axis, when the algorithm resized the unit. */
  readonly size?: Vec3;
  /** Normalized stretch per unit-local axis, inside the prototype's range. */
  readonly stretch: Vec3;
  /** Column-major part-local transform: laying frame · unit local pose (stretched). */
  readonly matrix: readonly number[];
  /** Opaque renderer values from the algorithm. */
  readonly params?: Readonly<Record<string, unknown>>;
}
/** What a part keeps after design so that its units can be laid again. */
export interface PartLayout {
  /** Algorithm parameters with group-shared values already resolved. */
  readonly params: Readonly<Record<string, unknown>>;
  readonly count: number;
  readonly data: unknown;
}
/** The parts of a resolved part that expansion reads. */
export interface ExpandablePart {
  readonly seed: number;
  readonly original: BuildingGeometry;
  readonly modifications: readonly GeometryModification[];
  readonly algorithm: { readonly type: string };
  readonly unit?: BuildingUnit;
  readonly layout?: PartLayout;
}
export interface ExpansionOptions {
  /** Must be the environment the design ran with. */
  readonly environment?: BuildingEnvironment;
}

export function frameMatrix(f: Frame): number[] {
  return [...f.x, 0, ...f.y, 0, ...f.z, 0, ...f.origin, 1];
}
export function layingContext(
  part: Omit<ExpandablePart, "layout">,
  unit: BuildingUnit,
  params: Readonly<Record<string, unknown>>,
  registry: BuildingRegistry,
  environment: BuildingEnvironment
): LayingContext {
  const geometry = new EffectiveGeometry(
    part.original,
    part.modifications,
    bindSurfaces(registry.surfaces, environment)
  );
  const seed = (key: string, channel?: string) =>
    channel === undefined
      ? deriveSeed(part.seed, unit.seed ?? 0, key)
      : deriveSeed(part.seed, unit.seed ?? 0, key, channel);
  return { geometry, unit, params, seed, random: (key, channel) => new Random(seed(key, channel)) };
}
/** Checks one algorithm output and completes it. Throws when the algorithm broke its contract. */
export function laidUnit(context: LayingContext, spec: LaidUnitSpec): LaidUnit {
  if (typeof spec.key !== "string") throw Error("Laid unit keys must be strings");
  const unit = context.unit;
  const size: Vec3 | undefined = spec.size && [spec.size[0], spec.size[1], spec.size[2]];
  const stretch: Vec3 = size ? unitStretch(unit, size) : [1, 1, 1];
  const issue = stretchIssue(unit, stretch);
  if (issue) throw Error(`${issue}: ${spec.key}`);
  return {
    key: spec.key,
    seed: context.seed(spec.key),
    source: unit.source,
    frame: spec.frame,
    ...(size && { size }),
    stretch,
    matrix: multiply(frameMatrix(spec.frame), unitMatrix(unit, stretch)),
    ...(spec.params && { params: spec.params })
  };
}
/** Lays a part's units again from its layout, one at a time, in slot order. */
export function* expandPart(
  part: ExpandablePart,
  registry: BuildingRegistry,
  options: ExpansionOptions = {}
): Generator<LaidUnit> {
  if (!part.unit || !part.layout) return;
  const algorithm = registry.algorithms.get(part.algorithm.type);
  if (!algorithm) throw Error(`Unknown laying algorithm "${part.algorithm.type}"`);
  const context = layingContext(part, part.unit, part.layout.params, registry, options.environment ?? {});
  for (let i = 0; i < part.layout.count; i++) {
    const spec = algorithm.unitAt(context, part.layout.data, i);
    if (spec) yield laidUnit(context, spec);
  }
}
/** All laid units of a part as an array. Use it for checks and queries, not for rendering. */
export function expandUnits(part: ExpandablePart, registry: BuildingRegistry, options: ExpansionOptions = {}) {
  return [...expandPart(part, registry, options)];
}
