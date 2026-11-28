/** Shared geometric limits for the solver, component commands and Inspector. */
export interface CanyonConfig {
  lengthM: number;
  floorWidthM: number;
  bankWidthM: number;
  heightM: number;
  bend: number;
  riverWidthM: number;
  widthVariation: number;
}
/** Keep the widest river section strictly inside the valley, with four metres of bank clearance. */
export function canyonFieldLimits(values: Record<string, unknown>): Record<string, { min?: number; max?: number }> {
  const floor = Number(values.floorWidthM),
    river = Number(values.riverWidthM),
    variation = Number(values.widthVariation);
  if (![floor, river, variation].every(Number.isFinite)) return {};
  const down = (n: number, step: number) => (Math.ceil((n - 1e-8) / step) - 1) * step;
  return {
    floorWidthM: { min: Math.max(12, Math.floor(river * (1 + variation) + 4) + 1) },
    riverWidthM: { max: Math.min(30, down((floor - 4) / (1 + variation), 0.5)) },
    widthVariation: { max: Math.max(0, Math.min(1, down((floor - 4) / river - 1, 0.01))) }
  };
}
/** Partial writes are checked after resolving all component bases; geometric conflicts name their inputs. */
export function validateCanyonParameters(values: Record<string, unknown>): void {
  const limits: Record<string, [number, number]> = {
    lengthM: [40, 300],
    floorWidthM: [8, 80],
    bankWidthM: [4, 40],
    heightM: [8, 100],
    bend: [0, 1],
    riverWidthM: [2, 30],
    widthVariation: [0, 1]
  };
  for (const [key, [min, max]] of Object.entries(limits))
    if (
      values[key] !== undefined &&
      (!Number.isFinite(values[key]) || Number(values[key]) < min || Number(values[key]) > max)
    )
      throw new Error(`峡谷参数 ${key} 须在 ${min}–${max} 之间`);
  const floor = Number(values.floorWidthM),
    river = Number(values.riverWidthM),
    variation = Number(values.widthVariation);
  if ([floor, river, variation].every(Number.isFinite) && river * (1 + variation) >= floor - 4)
    throw new Error(
      `河流最宽处 ${(river * (1 + variation)).toFixed(2)} m + 两岸净空 4 m 必须小于谷底宽度 ${floor} m；请先加宽谷底，或减小河宽/河宽变化`
    );
}
