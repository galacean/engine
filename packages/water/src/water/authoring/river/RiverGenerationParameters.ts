import { RIVER_LIMITS } from "./RiverAuthoringLimits";

export const RIVER_GENERATION_MAX_POINT_COUNT = 512;

export const RIVER_GENERATOR_VERSION = "parametric-river-v1";

/** Body-local metres; seed varies shape, never endpoints or the requested constraints. */
export interface RiverGenerationParameters {
  seed: number;
  source: [number, number, number];
  mouth: [number, number, number];
  bounds: { min: [number, number]; max: [number, number] };
  meanderAmplitude: number;
  bendCount: number;
  pointCount: number;
  width: number;
  flowSpeed: number;
}

export interface RiverGenerationSource {
  generatorVersion: string;
  parameters: RiverGenerationParameters;
  generatedPointsHash: string;
}

export class RiverGenerationInputError extends Error {
  constructor(
    readonly path: string,
    message: string
  ) {
    super(message);
  }
}

/** Decode and copy external parameters before generation or history retention. */
export function validateRiverGenerationParameters(input: unknown): RiverGenerationParameters {
  const fail = (path: string, message: string): never => {
    throw new RiverGenerationInputError(path, message);
  };
  const record = (value: unknown, keys: readonly string[], path: string): Record<string, unknown> => {
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).some((k) => !keys.includes(k))
    )
      return fail(path, `${path} 格式无效`);
    return value as Record<string, unknown>;
  };
  const number = (value: unknown, min: number, max: number, path: string, integer = false): number => {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      return fail(path, `${path} 须为 ${min}–${max} 的${integer ? "整数" : "有限数值"}`);
    return value;
  };
  const tuple = (value: unknown, size: number, path: string): number[] => {
    if (!Array.isArray(value) || value.length !== size) return fail(path, `${path} 坐标格式无效`);
    return Array.from(value, (v, i) => number(v, -100000, 100000, `${path}[${i}]`));
  };
  const p = record(
    input,
    ["seed", "source", "mouth", "bounds", "meanderAmplitude", "bendCount", "pointCount", "width", "flowSpeed"],
    "生成参数"
  );
  const b = record(p.bounds, ["min", "max"], "bounds");
  const bounds = {
    min: tuple(b.min, 2, "bounds.min") as [number, number],
    max: tuple(b.max, 2, "bounds.max") as [number, number]
  };
  if (bounds.min.some((v, i) => v >= bounds.max[i])) fail("bounds", "允许范围须有正的宽度和长度");
  // A conservative lateral amplitude independent of source-to-mouth orientation.
  const maxMeanderAmplitude = Math.min(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1]) / 2;
  return {
    seed: number(p.seed, 0, 0xffffffff, "seed", true),
    source: tuple(p.source, 3, "source") as [number, number, number],
    mouth: tuple(p.mouth, 3, "mouth") as [number, number, number],
    bounds,
    meanderAmplitude: Math.min(
      number(p.meanderAmplitude, 0, Number.MAX_VALUE, "meanderAmplitude"),
      maxMeanderAmplitude
    ),
    bendCount: number(p.bendCount, 1, 3, "bendCount", true),
    pointCount: number(p.pointCount, 9, RIVER_GENERATION_MAX_POINT_COUNT, "pointCount", true),
    width: number(p.width, RIVER_LIMITS.minWidth, RIVER_LIMITS.maxWidth, "width"),
    flowSpeed: number(p.flowSpeed, RIVER_LIMITS.minFlowSpeed, RIVER_LIMITS.maxFlowSpeed, "flowSpeed")
  };
}
